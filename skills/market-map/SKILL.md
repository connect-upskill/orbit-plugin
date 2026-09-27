---
name: market-map
description: Build a market map from an Orbit people search — run the search, write one markdown note per person into a folder, and open it in Obsidian as a graph. Use when the user wants to "map a market", "find people and visualize them", "build a market map", or turn an Orbit search into an Obsidian vault.
argument-hint: "<who to find> [output-dir]"
allowed-tools: Bash Write Read
---

# Market map

Turn one Orbit people-search into an Obsidian vault: a folder of per-person
markdown notes plus an `_index.md` hub whose `[[wikilinks]]` render as a
connected graph of the market, clustered by company.

The Orbit MCP server (this plugin's bundled `orbit` server) does the search;
this skill writes the files locally with the bundled `buildVault.mjs` script.
Authentication is handled by the MCP server's OAuth flow — if a tool call says
the server needs authentication, tell the user to run `/mcp`, pick **orbit**,
and choose **Authenticate** (a browser opens once), then retry.

## Inputs

- **Brief** — everything before an optional trailing path in `$ARGUMENTS`
  (e.g. `senior ML engineers at fintech startups in Berlin`). If the user
  named a count ("find 30 …"), keep it in the brief — Orbit reads it as the
  target.
- **Output dir** — a trailing path in `$ARGUMENTS` if given, else default to
  `./market-map`.

## Steps

1. **Search.** Call the `orbit_search` MCP tool with `{ brief: "<the brief>" }`.
   It submits the brief and polls to completion within its own time budget,
   returning `structuredContent` with `projectId`, `done`, `total`, and a
   `results` array (one entry per person).

2. **Handle a still-running search.** If `done` is `false`, the search is an
   async (open-web) one that ran past the tool's poll window. Tell the user
   the current count and the `projectId`, then either:
   - wait and fetch the results with `orbit_results` once ready (step 3), or
   - stop here and let them re-run later with `/orbit-export <projectId> md <dir>`.
     Only continue once the search is done.

3. **Fetch every result.** `orbit_search` returns at most the first 100
   people. If `total` is larger than the `results` you hold, call
   the `orbit_results` MCP tool with `{ projectId: "<projectId>", limit: 200, offset: 0 }`, then again with
   `offset` raised by 200 until you hold `total` results — one call returns at
   most 200, so a single call silently drops everyone past the first page.
   Combine the pages into one `{ projectId, total, results }` object.

4. **Stage the results.** `Write` every result you hold (the combined pages,
   if you paged) to a temporary
   file **outside** the output dir (e.g. `${TMPDIR:-/tmp}/orbit-results.json`),
   so the scratch file never lands in the Obsidian vault. Write the whole
   object (it has `{ results, ... }`) — `buildVault.mjs` accepts either the
   object or a bare results array.

5. **Build the vault.** Run, via Bash:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/buildVault.mjs" \
     --input "${TMPDIR:-/tmp}/orbit-results.json" \
     --out "<output-dir>" \
     --brief "<the brief>"
   ```

   It writes one `<name>.md` per person + `_index.md`, then opens the vault in
   Obsidian when it's installed (pass `--no-open` to skip). It prints a summary
   and, on markdown, an Obsidian status line — relay both.

6. **Clean up.** Delete the temporary results file from step 4.

7. **Report.** Tell the user how many notes were written, the folder path, and
   the Obsidian outcome (opened, or the install hint + deep link the script
   printed). Suggest opening the **graph view** to see the market.

## Notes

- **Provider-anonymous.** Orbit's results never name a data provider; the
  `surfacedBy` field is the search-strategy label. Don't add provider names.
- **One folder = one market.** Re-running into the same dir overwrites notes
  for people with the same name-slug; use a fresh dir per market to keep maps
  separate.
- For raw JSON or CSV instead of a vault, use the `/orbit-export` command.
