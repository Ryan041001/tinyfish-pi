import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function tinyfish(pi: ExtensionAPI) {
  const hasKey = Boolean(process.env.TINYFISH_API_KEY?.trim());

  pi.registerMcpServer("tinyfish", {
    url: "https://agent.tinyfish.ai/mcp",
    headers: { "X-API-Key": "${TINYFISH_API_KEY}" },
    enabled: hasKey,
    // Fail closed: paid tools and future additions stay unreachable.
    exposure: "hidden",
    toolExposure: {
      search: "codemode",
      fetch_content: "codemode",
    },
    description: "TinyFish web search and rendered page reading. Only search and fetch_content are exposed.",
    timeout: 150,
  });

  if (!hasKey) {
    pi.on("session_start", (_event, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.notify(
          "TinyFish is disabled. Set TINYFISH_API_KEY before starting Pi.",
          "warning",
        );
      }
    });
  }
}
