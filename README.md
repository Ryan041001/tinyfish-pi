# tinyfish-pi

TinyFish web search and page reading for **Pi's built-in MCP**.

One small extension, one skill, zero runtime dependencies. No TinyFish SDK, CLI,
MCP adapter, custom tools, build step, or background process of its own.
Unofficial; not affiliated with TinyFish.

## Install

Requires **Pi 1.4.0+** with its built-in MCP enabled.

```sh
pi install git:github.com/Ryan041001/tinyfish-pi
```

Create an API key at <https://agent.tinyfish.ai/api-keys> and make
`TINYFISH_API_KEY` available to the process that starts Pi. For a temporary
terminal session, enter it without echoing it or adding its value to shell history:

```sh
# bash or zsh
printf 'TinyFish API key: '
read -rs TINYFISH_API_KEY
printf '\n'
export TINYFISH_API_KEY
pi
```

For persistent use, inject the variable through your preferred secret manager.
Do not put the key in chat, this repository, or a committed config file.

Already running Pi? Restart after setting the environment variable. Use `/mcp`
to inspect the `tinyfish` connection, then ask Pi to search or read a URL.
The `tinyfish-web` skill loads when relevant; invoke it explicitly with
`/skill:tinyfish-web`.

## Deliberately small

- Calls the official `https://agent.tinyfish.ai/mcp` endpoint over HTTPS.
- Exposes **only `search` and `fetch_content`**, through native codemode discovery.
- Defaults every other tool, including future additions, to `hidden`.
- Leaves tool schemas, transport, cancellation, errors, and output handling to Pi.
- Uses a 150-second request timeout for rendered pages.
- Adds no always-declared TinyFish tool schemas; Pi lists a short server summary.
- Keeps only an environment-variable reference in the registered header config.
- Without a nonblank key, registers a disabled server and makes no TinyFish connection.

The integration currently targets the upstream tool names `search` and
`fetch_content`. If they change, it fails closed rather than exposing more tools.

TinyFish currently advertises search and fetch as free; its pricing and usage
limits still apply. Hiding paid tools is a client-side exposure policy, **not**
a sandbox, an account spending cap, or a guarantee about server-side behavior.
Pi and user-installed code still have the permissions of the local user.

## Troubleshooting

- **Disabled:** set `TINYFISH_API_KEY` before starting Pi; restart.
- **Unauthorized / OAuth wording:** verify the API key. This package uses
  `X-API-Key`, not interactive OAuth.
- **No server entry:** confirm the package and Pi's built-in MCP are enabled.
  An extension such as `pi-mcp-adapter` can replace the built-in implementation;
  this package is designed for the built-in, not that replacement.
- **Unexpected settings/tools:** a native `mcp.json` server named `tinyfish`
  takes precedence over this registration. Inspect `/mcp`; remove or rename the
  conflicting entry if you want this package's two-tool policy.
- **`pi mcp list` does not show it:** expected. Shell MCP commands do not load
  extensions; inspect `/mcp` in a running Pi session instead.

This package does not read local files, load `.env`, or add telemetry. Queries
and requested URLs go to TinyFish; see its
[privacy policy](https://www.tinyfish.ai/privacy-policy).

## Develop

```sh
npm ci
npm run check
npm pack --dry-run
pi -e .
```

No build step. The development dependency on Pi is for type checking and native
integration tests, not bundled runtime code. Tests use fake credentials and an
in-memory MCP transport: no API key, network calls, or model requests.

Live TinyFish search/fetch needs a real key and is separate from offline tests.
To remove the installed package:

```sh
pi remove git:github.com/Ryan041001/tinyfish-pi
```

MIT.
