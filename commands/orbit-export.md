---
description: Export a finished Orbit project's results to disk as markdown notes, JSON, or CSV.
argument-hint: <projectId> [md|json|csv] [output-dir]
---

Export an Orbit project's results to local files.

Parse `$ARGUMENTS` as: `<projectId> [format] [output-dir]`.

- **projectId** (required) — the project to export (from a prior
  `/orbit-search` or `orbit_search` call).
- **format** — `md` (default), `json`, or `csv`.
- **output-dir** — default `./market-map` for `md`, else the current dir.

Steps:

1. Fetch every result: call the `orbit_results` MCP tool with
   `{ projectId: "<projectId>", limit: 200, offset: 0 }`, then again with
   `offset` raised by 200 until you hold `total` results — one call returns at
   most 200, so a single call silently drops everyone past the first page.
   Combine the pages into one `{ projectId, total, results }` object.
   (The tool is on this plugin's bundled `orbit` server.) If it reports the
   server needs authentication, tell the user to run `/mcp` → **orbit** →
   **Authenticate**, then retry. If there's no such project, say so plainly
   (don't guess another id).
2. `Write` the combined object to a temporary file **outside** the output
   dir, e.g. `${TMPDIR:-/tmp}/orbit-results.json` — `buildVault.mjs` reads
   `{ results, ... }` and carries the rest as JSON-export `meta`, so JSON
   exports have a stable envelope.
3. Run, via Bash:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/buildVault.mjs" \
     --input "${TMPDIR:-/tmp}/orbit-results.json" \
     --out "<output-dir>" \
     --format "<format>" \
     --brief "<brief if known, else omit>"
   ```

   - `md` → one `<name>.md` per person + `_index.md`, and opens Obsidian when
     installed.
   - `json` → `results.json` (`{ meta, results }`).
   - `csv` → `results.csv` (formula-injection-safe).

4. Delete the temporary results file.
5. Report the files written and the path. For `md`, relay the Obsidian status
   line the script printed.

Do not name any data provider (Orbit's results are provider-anonymous).
