---
description: Search Orbit for people from a natural-language brief and summarize the results inline.
argument-hint: <who to find>
---

Run an Orbit people search for: **$ARGUMENTS**

1. Call the `orbit_search` MCP tool (this plugin's bundled `orbit` server)
   with `{ brief: "$ARGUMENTS" }`. It submits the brief and polls to
   completion within its own time budget. If a count is named in the brief
   ("find 30 …"), Orbit treats it as the target — keep it in the brief.
2. If the tool reports the server needs authentication, tell the user to run
   `/mcp`, select **orbit**, and choose **Authenticate** (a browser opens
   once), then retry.
3. When results come back (`done: true`), summarize them as a compact list:
   name — title @ company · location, with the LinkedIn link when present.
   Note the total count and how many are verified.
4. If the search is still running (`done: false`, an async open-web search),
   report the current count and the `projectId`, and tell the user they can
   check back with the `orbit_status` tool or fetch results later with
   `/orbit-export <projectId>`.
5. Offer the next step: run `/orbit:market-map "$ARGUMENTS"` to write these
   people to a folder of markdown notes and open them in Obsidian as a graph.

Do not name any data provider — Orbit's results are provider-anonymous
(`surfacedBy` is the search-strategy label, not a vendor).
