---
name: orbit-usage
description: How to use Orbit well — write an effective people-search brief, interpret the results (fields, verdicts, starred, statuses), and iterate. Load this when using the Orbit MCP tools (orbit_search / orbit_status / orbit_results) or the /orbit-search and market-map commands, or when the user asks how to search, what a result means, or how to refine a search.
---

# Using Orbit

Orbit is people search for agents. You describe **who to find** in plain
language; Orbit's strategist turns that into several search angles, runs them
across its sources, verifies each person against your criteria, and streams
back a ranked, de-duplicated list. This plugin exposes it three ways — pick by
intent:

| You want…                                               | Use                               |
| ------------------------------------------------------- | --------------------------------- |
| a vault of per-person markdown + an Obsidian graph      | the **`/orbit:market-map`** skill |
| a quick search summarized in chat                       | the **`/orbit-search`** command   |
| results written to disk as md/json/csv                  | the **`/orbit-export`** command   |
| fine control / multi-step research inside your own flow | the raw MCP tools (below)         |

The tools (the `orbit` MCP server, OAuth — run `/mcp` → **orbit** →
**Authenticate** on first use):

- **`orbit_search(brief, waitMs?)`** — submit a brief, wait briefly, return the
  people found. If still running when the wait elapses, returns a `projectId`.
- **`orbit_status(projectId)`** — counts + whether it's done + any clarification.
- **`orbit_results(projectId, limit?, offset?)`** — a page of results.

## Writing a good brief

The brief is natural language — but the strategist works best when it carries
**structure** it can filter on. Include the attributes that matter:

- **Role / seniority** — "senior ML engineers", "VP of Sales", "founding
  designers".
- **Industry / domain** — "at fintech startups", "in climate hardware".
- **Geography** — "in Berlin", "US remote".
- **Company stage / size** — "Series A–B", "<200 people".
- **Tools / skills used** — "who have used Ramp", "shipped with Rust". (Orbit
  treats this as _experience with X_, not _employed at X_.)
- **A count** — "find 30 …". Orbit reads the number as a target and keeps
  searching until it has that many verified people (or exhausts its angles).

Good: _"30 senior ML engineers at Series A–B fintech startups in Europe who've
worked on fraud or risk models."_

What Orbit does with it: it **fans out** across plausible interpretations
rather than asking you to disambiguate up front (e.g. IC vs. manager, or two
readings of an industry) — you react to real people instead of abstract
questions. So a slightly broad-but-structured brief is fine; it becomes several
strategies, each committing to one interpretation.

The one time it asks back: a brief with **no structural content at all**
("find good people", "anyone interesting"). Then the status comes back
`awaiting_input` with a `clarificationQuestion` — answer it by re-running
`orbit_search` with a sharper brief.

## Interpreting results

Each person (`orbit_results` / the `results` array) carries:

- **Canonical fields** — `fullName` (plus `firstName` / `lastName`), `title`,
  `company`, `location`, `linkedinUrl`, `primaryEmail`, `primaryPhone`. Some may
  be null (not every source returns contact info; ask to "enrich with email" to
  fill gaps).
- **`fields`** — label-keyed enrichments specific to the search (e.g.
  `Seniority`, `Years in role`). These are the extra facts Orbit pulled.
- **`verdicts`** — label-keyed per-criterion verification: `"yes"` / `"no"`. A
  criterion Orbit couldn't confirm is simply **omitted** from the map (no entry,
  not an "unknown" value). This is _why_ a person matched — e.g. `"Has fintech
experience": "yes"`. Verdicts are how Orbit shows its work; trust a `"yes"`
  over a name that merely looks right.
- **`surfacedBy`** — which search strategy/strategies found them. (It's a
  strategy label, never a data-provider name — Orbit is provider-anonymous.)
- **`starred`** — the user marked this person as a good match (feedback that
  sharpens later searches).

Status (`orbit_status` / the search result):

- **`status`** — `running` (working), `done` (target met or all angles
  exhausted), or `awaiting_input` (needs a `clarificationQuestion` answered).
- **`done`** — true once it hit `requestedTarget` or ran every angle dry.
- **`totalResults`** vs **`verifiedResults`** — found vs. confirmed-against-
  criteria. Prefer verified.
- **`requestedTarget`** — the count from your brief, if any.
- **`error`** — a pre-classified status string (e.g. "source unavailable"),
  never a raw provider error.

Async note: open-web searches can run past the inline wait. If `orbit_search`
returns `done: false` with a `projectId`, poll `orbit_status` and fetch with
`orbit_results` once enough have landed (or it's `done`).

## Iterating

Searching is cheap and reactive — refine rather than agonize over the perfect
brief:

- **Too few / too broad** — re-run `orbit_search` with tighter or looser
  criteria. A new brief is a new search; it doesn't mutate the old one.
- **Right shape, want more** — re-run the same brief with a higher count
  ("find 50 …"); Orbit broadens its angles to reach it.
- **Wrong interpretation dominating** — name the disambiguator explicitly ("ICs,
  not managers"; "the payments company Stripe, the people who _used_ it").
- **Missing contact info** — ask to enrich (e.g. "enrich these with email").
- **Found keepers** — starring good matches teaches the next search; mention
  the people who are spot-on.

When to use which surface: start with **`/orbit-search`** to see who's out
there; switch to **`/orbit:market-map`** once you want the whole set laid out
as a navigable graph; drop to the **raw MCP tools** when you're orchestrating
Orbit inside a larger multi-step task and want to page through results or check
status yourself.
