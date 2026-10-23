import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import tinyfish from "../extensions/tinyfish.ts";

function load(key) {
  const previous = process.env.TINYFISH_API_KEY;
  const servers = [];
  const handlers = new Map();
  try {
    if (key === undefined) delete process.env.TINYFISH_API_KEY;
    else process.env.TINYFISH_API_KEY = key;
    tinyfish({
      registerMcpServer: (name, config) => servers.push({ name, config }),
      on: (event, handler) => handlers.set(event, handler),
    });
  } finally {
    if (previous === undefined) delete process.env.TINYFISH_API_KEY;
    else process.env.TINYFISH_API_KEY = previous;
  }
  assert.equal(servers.length, 1);
  return { ...servers[0], handlers };
}

test("registers the official HTTPS endpoint without embedding credentials", () => {
  const { name, config, handlers } = load("test-secret-never-persist");
  assert.equal(name, "tinyfish");
  assert.equal(config.url, "https://agent.tinyfish.ai/mcp");
  assert.deepEqual(config.headers, { "X-API-Key": "${TINYFISH_API_KEY}" });
  assert.equal(config.enabled, true);
  assert.equal(config.timeout, 150);
  assert.ok(!JSON.stringify(config).includes("test-secret-never-persist"));
  assert.equal(handlers.size, 0);
});

test("allows only the two read tools, with no wildcard or direct exposure", () => {
  const { config } = load("test-key");
  assert.equal(config.exposure, "hidden");
  assert.deepEqual(config.toolExposure, {
    search: "codemode",
    fetch_content: "codemode",
  });
});

for (const key of [undefined, "", " \t\n "]) {
  test(`missing or blank key disables the connection: ${JSON.stringify(key)}`, () => {
    const { config, handlers } = load(key);
    assert.equal(config.enabled, false);
    const notifications = [];
    const onStart = handlers.get("session_start");
    assert.equal(typeof onStart, "function");
    onStart({}, {
      hasUI: true,
      ui: { notify: (...args) => notifications.push(args) },
    });
    assert.equal(notifications.length, 1);
    assert.match(notifications[0][0], /TINYFISH_API_KEY/);
    assert.equal(notifications[0][1], "warning");
    assert.doesNotThrow(() => onStart({}, { hasUI: false }));
  });
}

test("manifest ships only the small extension and skill, with no runtime dependencies", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
  assert.deepEqual(manifest.pi, {
    extensions: ["./extensions/tinyfish.ts"],
    skills: ["./skills"],
  });
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
  assert.equal(manifest.scripts.postinstall, undefined);
});
