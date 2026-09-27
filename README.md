# Orbit — Claude Code plugin

People search from your agent, packaged as a one-command Claude Code plugin.
Install it and you get Orbit's whole workflow inside any Claude Code session:
search for people, and **build a market map** as a folder of markdown notes you
can drop straight into [Obsidian](https://obsidian.md) for a graph view of the
market.

The plugin doesn't ship a server: it points Claude Code at Orbit's hosted MCP
endpoint, `https://api.orbitpeople.ai/mcp`, and adds the slash commands and the
market-map skill on top.

## Install

```
/plugin marketplace add connect-upskill/orbit-plugin
/plugin install orbit
```

On first use the `orbit` MCP server asks you to **authenticate in the browser**
(OAuth) — no API key to paste. If a tool ever reports the server needs
authentication, run `/mcp`, select **orbit**, and choose **Authenticate**.

You need an Orbit account — sign up at [orbitpeople.ai](https://orbitpeople.ai).
There is nothing to configure.

## What you get

**Slash commands**

- `/orbit-search <who to find>` — run a people search and summarize the results
  inline.
- `/orbit-export <projectId> [md|json|csv] [dir]` — write a finished project's
  results to disk (markdown vault, JSON, or CSV).

**Skills**

- `/orbit:market-map <who to find> [dir]` — the headliner. Searches, writes one
  markdown note per person + an `_index.md` hub into a folder, and opens
  Obsidian on top so the market renders as a graph clustered by company.
- `orbit-usage` — a how-to-use-Orbit guide the agent loads on demand: writing an
  effective brief, reading results (fields, verdicts, starred, statuses), and
  iterating. Not something you invoke directly; it sharpens how the agent drives
  the tools.

**MCP tools** (available to the agent directly): `orbit_search`, `orbit_status`, `orbit_results`, plus `orbit_feedback` so the agent can send Orbit a bug report or feature request for you.

## 2-minute demo: build a market map

```text
You:    /orbit:market-map senior ML engineers at fintech startups in Berlin ./berlin-ml

Claude: [calls orbit_search → writes one note per person + _index.md into
         ./berlin-ml → opens Obsidian on the vault]

You:    [Obsidian → graph view] — the whole market, clustered by company.
```

## How it works

- The plugin connects to Orbit's hosted server (`https://api.orbitpeople.ai/mcp`) over the web, so Claude Code handles sign-in in your browser — nothing runs locally and no key sits in your config.
- File-writing is done **locally by the plugin**, not the server: the
  market-map skill takes the results the agent fetched over MCP and runs the
  bundled, dependency-free [`scripts/buildVault.mjs`](scripts/buildVault.mjs)
  to format the per-person markdown + `_index.md`. (Byte-compatible with the
  standalone stdio server,
  [`@orbitpeople/mcp`](https://www.npmjs.com/package/@orbitpeople/mcp).)
- Results never name the data source they came from; `surfacedBy` says how
  Orbit found the person.

Node ≥ 20 is required for the local vault script. Opening the graph needs
[Obsidian](https://obsidian.md) installed; without it you still get the folder
of notes.

## License

MIT — see [LICENSE](LICENSE). Docs: [orbitpeople.ai/docs](https://orbitpeople.ai/docs).
