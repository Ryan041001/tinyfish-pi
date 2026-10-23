# tinyfish-pi

[![CI](https://github.com/Ryan041001/tinyfish-pi/actions/workflows/ci.yml/badge.svg)](https://github.com/Ryan041001/tinyfish-pi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Read-only TinyFish web search and page extraction for the built-in MCP client in
[Pi](https://pi.dev). The package provides one extension and one skill, with no runtime
dependencies, SDK, CLI, MCP adapter, build step, or background process.

This is an unofficial integration and is not affiliated with TinyFish.

## Overview

`tinyfish-pi` connects Pi to the official TinyFish MCP endpoint and exposes two capabilities:

| Capability | Upstream tool | Description |
| --- | --- | --- |
| Web search | `search` | Ranked results with titles, snippets, and URLs |
| Page extraction | `fetch_content` | Rendered page content as Markdown, HTML, or JSON |

Tool discovery, transport, cancellation, error handling, and output truncation are delegated to
Pi's built-in MCP client. The extension only supplies connection metadata and an exposure policy.

## Requirements

- Pi 1.4.0 or later, with the built-in MCP client enabled.
- A TinyFish API key, created at <https://agent.tinyfish.ai/api-keys>.

An extension such as `pi-mcp-adapter` replaces Pi's built-in MCP implementation. This package is
designed for the built-in client and does not require or support the adapter.

## Installation

```sh
pi install git:github.com/Ryan041001/tinyfish-pi
```

To pin a specific release:

```sh
pi install git:github.com/Ryan041001/tinyfish-pi@v0.1.1
```

## Authentication

The extension reads `TINYFISH_API_KEY` from the environment of the process that starts Pi. The
credential is not stored by the package.

For a temporary shell session, enter the key without echoing it:

```sh
printf 'TinyFish API key: '
read -rs TINYFISH_API_KEY
printf '\n'
export TINYFISH_API_KEY
pi
```

For persistent use, inject the variable through a secret manager or the equivalent mechanism for
your platform. Do not commit the key, paste it into a chat, or write it to a configuration file
that is stored in plain text.

A nonblank key enables the connection. If the variable is missing or blank, the extension
registers a disabled server and Pi makes no TinyFish connection.

## Usage

After installing the package and restarting Pi with the key available, ask Pi to search the web or
read a URL. The `tinyfish-web` skill is loaded when the task calls for web access, and can be
invoked explicitly:

```text
/skill:tinyfish-web
```

Inspect the connection and the effective tool exposure with `/mcp` inside a Pi session.

## Scope and design

- Uses the official `https://agent.tinyfish.ai/mcp` endpoint over HTTPS.
- Exposes only `search` and `fetch_content`, reached through Pi's native codemode discovery.
- Sets the server exposure to `hidden` and enables the two read tools individually, so other
  tools — including tools added upstream in the future — remain unreachable.
- Applies a 150-second request timeout for rendered pages.
- Declares no always-visible TinyFish tool schemas; Pi lists only a short server summary.
- Keeps the API key as an environment-variable reference in the registered header configuration.
- Requires no build step and adds no runtime dependencies.

The exposure policy targets the current upstream tool names `search` and `fetch_content`. If
TinyFish renames or removes either tool, the integration fails closed rather than exposing a
broader tool set.

## Security considerations

Hiding tools that incur charges is a client-side exposure policy. It is **not** a sandbox, an
account-level spending limit, or a guarantee about server-side behavior. TinyFish pricing and
usage limits continue to apply. Pi and any user-installed code retain the permissions of the local
user.

Page content, snippets, and links returned by TinyFish are untrusted input. The bundled skill
instructs the model to treat them as data rather than instructions, and to avoid including
credentials or private local content in requests.

## Troubleshooting

| Symptom | Cause and resolution |
| --- | --- |
| TinyFish tools are unavailable | `TINYFISH_API_KEY` is missing or blank. Set it and restart Pi. |
| Authorization error, including OAuth wording | Verify the API key. This package authenticates with `X-API-Key`, not interactive OAuth. |
| No `tinyfish` entry in `/mcp` | Confirm the package is installed and Pi's built-in MCP client is enabled. |
| Unexpected tools or settings | A `mcp.json` server named `tinyfish` takes precedence over this registration. Inspect `/mcp` and remove or rename the conflicting entry to apply the two-tool policy. |
| `pi mcp list` does not show the server | Expected. Shell MCP commands do not load extensions; inspect `/mcp` in a running Pi session. |

## Privacy

The package does not read local files, load `.env` files, or add telemetry. Queries and requested
URLs are sent to TinyFish. See the [TinyFish privacy policy](https://www.tinyfish.ai/privacy-policy).

## Development

```sh
npm ci
npm run check
npm pack --dry-run
pi -e .
```

The development dependency on Pi is used for type checking and native integration tests; it is not
included in runtime code. The test suite uses a fake API key and an in-memory MCP transport, so it
requires no credentials, network access, or model requests. Live TinyFish requests require a real
key and are separate from the offline suite.

Verification status: the package passed type checking and eight offline tests on Node.js 22.19.0
and 24, and was exercised against the official TinyFish MCP endpoint on 2026-10-23. Both `search`
and `fetch_content` completed successfully.

To remove the package:

```sh
pi remove git:github.com/Ryan041001/tinyfish-pi
```

## License

MIT. See [LICENSE](LICENSE).
