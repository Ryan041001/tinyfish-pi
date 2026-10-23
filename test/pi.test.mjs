import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// The native MCP client still performs its handshake and validates tool calls.
// Only the transport is in memory; no model or TinyFish requests are made.
function fixture() {
  const calls = [];
  const requests = [];
  const messages = new Set();
  const closes = new Set();
  let connections = 0;
  const names = ["search", "fetch_content", "run_web_automation", "create_monitor", "future_tool"];
  return {
    calls,
    requests,
    get connections() { return connections; },
    transport(entry) {
      connections++;
      assert.equal(entry.name, "tinyfish");
      assert.equal(entry.config.url, "https://agent.tinyfish.ai/mcp");
      return {
        async start() {},
        async send(message) {
          requests.push(message);
          if (!("id" in message) || !("method" in message)) return;
          let result;
          switch (message.method) {
            case "initialize":
              result = {
                protocolVersion: message.params.protocolVersion,
                capabilities: { tools: {} },
                serverInfo: { name: "offline-tinyfish", version: "1.0.0" },
              };
              break;
            case "tools/list":
              result = {
                tools: names.map((name) => ({
                  name,
                  description: `Offline fixture: ${name}`,
                  inputSchema: {
                    type: "object",
                    properties: { query: { type: "string" } },
                  },
                })),
              };
              break;
            case "tools/call":
              calls.push(message.params);
              result = { content: [{ type: "text", text: `fixture:${message.params.name}` }] };
              break;
            default:
              throw new Error(`Unexpected MCP request: ${message.method}`);
          }
          queueMicrotask(() => {
            for (const listener of messages) {
              listener({ jsonrpc: "2.0", id: message.id, result });
            }
          });
        },
        async close() { for (const listener of closes) listener(); },
        onMessage(listener) { messages.add(listener); return () => messages.delete(listener); },
        onError() { return () => {}; },
        onClose(listener) { closes.add(listener); return () => closes.delete(listener); },
      };
    },
  };
}

async function setup(t, key) {
  const dir = await mkdtemp(join(tmpdir(), "tinyfish-pi-"));
  const previous = process.env.TINYFISH_API_KEY;
  if (key === undefined) delete process.env.TINYFISH_API_KEY;
  else process.env.TINYFISH_API_KEY = key;
  let session;
  t.after(async () => {
    try {
      if (session) {
        await session.extensionRunner.emit({ type: "session_shutdown" });
        session.dispose();
      }
    } finally {
      if (previous === undefined) delete process.env.TINYFISH_API_KEY;
      else process.env.TINYFISH_API_KEY = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });

  const mock = fixture();
  const settingsManager = SettingsManager.inMemory({ packages: [root] });
  const resourceLoader = new DefaultResourceLoader({
    cwd: dir,
    agentDir: join(dir, "agent"),
    settingsManager,
    noContextFiles: true,
    noPromptTemplates: true,
    noThemes: true,
    extensionFactories: [
      createCodemodeExtension(),
      createMcpExtension({
        loadConfig: () => ({ servers: [], errors: [] }),
        createTransport: (entry) => mock.transport(entry),
        logPath: join(dir, "mcp.log"),
      }),
    ],
  });
  await resourceLoader.reload();
  assert.deepEqual(resourceLoader.getExtensions().errors, []);
  assert.deepEqual(resourceLoader.getSkills().diagnostics, []);
  assert.deepEqual(resourceLoader.getSkills().skills.map((skill) => skill.name), ["tinyfish-web"]);
  ({ session } = await createAgentSession({
    cwd: dir,
    agentDir: join(dir, "agent"),
    settingsManager,
    resourceLoader,
    sessionManager: SessionManager.inMemory(dir),
  }));
  await session.bindExtensions({});
  return { session, mock };
}

test("native Pi discovers the package, connects, and enforces the read-only allowlist", async (t) => {
  const { session, mock } = await setup(t, "offline-test-key");
  const deadline = Date.now() + 5_000;
  while (!session.getCallableToolNames().includes("mcp__tinyfish__search")) {
    assert.ok(Date.now() < deadline, `native MCP tools should register within 5 seconds (connections: ${mock.connections}; requests: ${mock.requests.map((request) => request.method).join(", ")})`);
    await delay(10);
  }
  const readTools = ["mcp__tinyfish__fetch_content", "mcp__tinyfish__search"];
  assert.equal(mock.connections, 1);
  assert.deepEqual(session.getCallableToolNames().filter((name) => name.startsWith("mcp__tinyfish__")).sort(), readTools);
  assert.ok(session.getActiveToolNames().includes("codemode"), "native MCP auto-enables codemode");
  assert.ok(!session.getActiveToolNames().some((name) => name.startsWith("mcp__tinyfish__")));
  assert.match(session.systemPrompt, /tinyfish-web/);

  // Nested tool calls require an issuing assistant message; seed one without an LLM.
  const assistant = {
    role: "assistant",
    content: [{ type: "toolCall", id: "offline-smoke", name: "codemode", arguments: {} }],
    api: "openai-responses",
    provider: "offline",
    model: "offline",
    stopReason: "toolUse",
    timestamp: Date.now(),
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
  session.sessionManager.appendMessage(assistant);
  session.agent.state.messages = [assistant];
  const ctx = session.extensionRunner.createToolContext("offline-smoke", undefined);
  // Codemode is model-only, so invoke its definition with the real tool context.
  const discovery = await session.getToolDefinition("codemode").execute(
    "offline-smoke",
    { code: 'text(await searchTools("search fetch_content", { namespace: "tinyfish" }));' },
    undefined,
    undefined,
    ctx,
  );
  assert.ok(!discovery.isError, JSON.stringify(discovery));
  assert.match(JSON.stringify(discovery), /mcp__tinyfish__search/);
  assert.match(JSON.stringify(discovery), /mcp__tinyfish__fetch_content/);
  assert.doesNotMatch(JSON.stringify(discovery), /run_web_automation|create_monitor|future_tool/);

  const reads = await session.getToolDefinition("codemode").execute(
    "offline-smoke",
    { code: readTools.map((name) => `text(await tools.${name}({ query: "test" }));`).join("\n") },
    undefined,
    undefined,
    ctx,
  );
  assert.ok(!reads.isError, JSON.stringify(reads));
  assert.match(JSON.stringify(reads), /fixture:fetch_content/);
  assert.match(JSON.stringify(reads), /fixture:search/);
  assert.deepEqual(mock.calls.map((call) => call.name), ["fetch_content", "search"]);

  for (const name of ["run_web_automation", "create_monitor", "future_tool"]) {
    const outcome = await ctx.executeTool(`mcp__tinyfish__${name}`, {});
    assert.equal(outcome.isError, true, `${name} must be unreachable`);
  }
  assert.equal(mock.calls.length, 2, "hidden tools must not reach the transport");
  session.setActiveToolsByName(["mcp__tinyfish__run_web_automation"]);
  assert.ok(!session.getActiveToolNames().includes("mcp__tinyfish__run_web_automation"));
});

test("native Pi loads without a key and never creates a TinyFish transport", async (t) => {
  const { session, mock } = await setup(t, undefined);
  assert.equal(mock.connections, 0);
  assert.ok(!session.getCallableToolNames().some((name) => name.startsWith("mcp__tinyfish__")));
});
