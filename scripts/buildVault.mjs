#!/usr/bin/env node
// Plan 080 — the market-map vault builder. A dependency-free Node ESM
// script the `market-map` skill runs on the user's machine: it takes the
// JSON results the agent fetched from Orbit's remote MCP (`orbit_search` /
// `orbit_results`) and writes one markdown note per person plus an
// `_index.md` hub, ready for Obsidian's graph view.
//
// Why a script, not agent-authored markdown: deterministic, testable, and
// byte-compatible with the stdio MCP server's output (plan 058 —
// `personMarkdown` / `indexNote` / `slug`), so the two on-ramps produce
// identical vaults. It ships as runnable `.mjs` (no build step) because a
// plugin is copied to the user's machine as source and can't build there.
//
// Auth + provider anonymity are upstream concerns: the MCP server already
// returns only customer-audience fields (R26), so this script never sees a
// provider name. Input is the agent's own data; `outputDir` is the agent's
// own CWD — containment isn't this layer's job (slugs are `[a-z0-9-]`, so
// file names can't escape the dir).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform as osPlatform } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_CONNECTIONS = 12;

// --- slug -----------------------------------------------------------------

/**
 * Name → filesystem- and Obsidian-friendly slug. Slugs double as graph node
 * identity (Obsidian resolves `[[wikilinks]]` by note name), so they must be
 * unique within an export; collisions get a numeric suffix.
 */
export function slugify(name, taken) {
  const base =
    name
      ?.normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "person";

  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}

// --- per-person markdown --------------------------------------------------

/** One person → Obsidian note: YAML frontmatter + readable body. */
export function personMarkdown(row, connections = []) {
  const front = {
    fullName: row.fullName ?? null,
    title: row.title ?? null,
    company: row.company ?? null,
    location: row.location ?? null,
    linkedinUrl: row.linkedinUrl ?? null,
    primaryEmail: row.primaryEmail ?? null,
    primaryPhone: row.primaryPhone ?? null,
    starred: Boolean(row.starred),
    surfacedBy: splitSurfacedBy(row.surfacedBy),
  };
  for (const [label, value] of Object.entries(row.fields ?? {})) {
    front[`field_${label}`] = toFrontValue(value);
  }
  for (const [criterion, verdict] of Object.entries(row.verdicts ?? {})) {
    front[`verdict_${criterion}`] = verdict;
  }

  const heading = row.fullName ?? "Unknown person";
  const titleLine = [
    [row.title, row.company].filter(Boolean).join(" @ "),
    row.location,
  ]
    .filter(Boolean)
    .join(" · ");

  const contacts = [
    row.linkedinUrl ? `[LinkedIn](${row.linkedinUrl})` : null,
    row.primaryEmail ? `<${row.primaryEmail}>` : null,
    row.primaryPhone,
  ].filter(Boolean);

  const body = [`# ${heading}`];
  if (titleLine) body.push("", `**${titleLine}**`);
  if (contacts.length) body.push("", contacts.join(" · "));

  const criteria = Object.entries(row.verdicts ?? {});
  if (criteria.length) {
    body.push("", "## Criteria");
    for (const [criterion, verdict] of criteria) {
      body.push(`- ${verdictMark(verdict)} ${criterion}`);
    }
  }

  if (connections.length) {
    body.push("", "## Connections");
    for (const c of connections) body.push(`- ${c.label}: [[${c.slug}]]`);
  }

  body.push("", "## Notes");
  const surfaced = splitSurfacedBy(row.surfacedBy);
  body.push(
    surfaced.length
      ? `_Surfaced by: ${surfaced.join(", ")}_`
      : "_Surfaced by Orbit._",
  );

  return `${toFrontmatter(front)}\n${body.join("\n")}\n`;
}

function verdictMark(verdict) {
  if (verdict === "yes") return "✅";
  if (verdict === "no") return "❌";
  return "❓";
}

function splitSurfacedBy(surfacedBy) {
  return String(surfacedBy ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toFrontValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => String(v));
  return JSON.stringify(value);
}

function toFrontmatter(front) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(front)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
      }
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function yamlScalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
  return `"${escaped}"`;
}

// --- index hub ------------------------------------------------------------

/** `_index.md` — links every note, grouped by company, to seed the graph. */
export function indexNote(entries, brief) {
  const lines = ["# Market map", ""];
  if (brief) lines.push(`> ${brief}`, "");
  lines.push(
    `${entries.length} ${entries.length === 1 ? "person" : "people"}.`,
    "",
  );

  const byCompany = new Map();
  for (const entry of entries) {
    const company = entry.row.company?.trim() || "Unknown company";
    const bucket = byCompany.get(company);
    if (bucket) bucket.push(entry);
    else byCompany.set(company, [entry]);
  }

  for (const company of [...byCompany.keys()].sort()) {
    lines.push(`## ${company}`, "");
    for (const entry of byCompany.get(company)) {
      const label = entry.row.fullName ?? entry.slug;
      const star = entry.row.starred ? " ⭐" : "";
      lines.push(`- [[${entry.slug}|${label}]]${star}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function sameCompanyConnections(entries, index) {
  const company = entries[index].row.company?.trim().toLowerCase();
  if (!company) return [];
  const connections = [];
  for (
    let j = 0;
    j < entries.length && connections.length < MAX_CONNECTIONS;
    j += 1
  ) {
    if (j === index) continue;
    if (entries[j].row.company?.trim().toLowerCase() === company) {
      connections.push({
        label: entries[j].row.fullName ?? entries[j].slug,
        slug: entries[j].slug,
      });
    }
  }
  return connections;
}

// --- vault assembly (pure) ------------------------------------------------

/**
 * Builds the in-memory file set for a markdown vault — `{ name, content }`
 * for each person note plus `_index.md`. Pure (no IO) so it's snapshot-
 * testable; the CLI writes the result to disk.
 */
export function buildVault(rows, { brief } = {}) {
  const taken = new Set();
  const entries = rows.map((row) => ({
    row,
    slug: slugify(row.fullName, taken),
  }));
  const files = entries.map((entry, i) => ({
    name: `${entry.slug}.md`,
    content: personMarkdown(entry.row, sameCompanyConnections(entries, i)),
  }));
  files.push({ name: "_index.md", content: indexNote(entries, brief) });
  return { files, entries };
}

// --- json + csv (pure) ----------------------------------------------------

export function resultsJson(rows, meta = {}) {
  return `${JSON.stringify({ meta, results: rows }, null, 2)}\n`;
}

const CSV_BASE = [
  "fullName",
  "firstName",
  "lastName",
  "title",
  "company",
  "location",
  "linkedinUrl",
  "primaryEmail",
  "primaryPhone",
  "surfacedBy",
  "starred",
];

/** Minimal, formula-injection-safe CSV from the customer-audience rows. */
export function resultsCsv(rows) {
  const fieldLabels = unionKeys(rows, "fields");
  const verdictLabels = unionKeys(rows, "verdicts");
  const header = [...CSV_BASE, ...fieldLabels, ...verdictLabels];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    const cells = [
      row.fullName,
      row.firstName,
      row.lastName,
      row.title,
      row.company,
      row.location,
      row.linkedinUrl,
      row.primaryEmail,
      row.primaryPhone,
      row.surfacedBy,
      row.starred ? "yes" : "",
      ...fieldLabels.map((l) => row.fields?.[l]),
      ...verdictLabels.map((l) => row.verdicts?.[l]),
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function unionKeys(rows, prop) {
  const keys = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row[prop] ?? {})) keys.add(k);
  }
  return [...keys];
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// --- Obsidian open --------------------------------------------------------

export function openObsidian(outputDir, deps = realObsidianDeps) {
  const indexPath = resolve(outputDir, "_index.md");
  const uri = `obsidian://open?path=${encodeURIComponent(indexPath)}`;
  if (!deps.isInstalled()) {
    return {
      opened: false,
      uri,
      message:
        `Obsidian not detected. Install it from https://obsidian.md, then ` +
        `open ${outputDir} as a vault to see the graph. Deep link: ${uri}`,
    };
  }
  const opened = deps.open(uri);
  return {
    opened,
    uri,
    message: opened
      ? `Opened Obsidian on ${outputDir} (graph hub: _index.md).`
      : `Wrote the vault to ${outputDir}. Open it in Obsidian: ${uri}`,
  };
}

const realObsidianDeps = {
  isInstalled: () => {
    switch (osPlatform()) {
      case "darwin":
        return (
          existsSync("/Applications/Obsidian.app") ||
          existsSync(resolve(homedir(), "Applications/Obsidian.app"))
        );
      case "win32":
        return existsSync(
          resolve(
            process.env.LOCALAPPDATA ?? resolve(homedir(), "AppData/Local"),
            "Obsidian/Obsidian.exe",
          ),
        );
      default:
        return true;
    }
  },
  open: (target) => {
    const [command, args] =
      osPlatform() === "darwin"
        ? ["open", [target]]
        : osPlatform() === "win32"
          ? ["cmd", ["/c", "start", "", target]]
          : ["xdg-open", [target]];
    try {
      const child = spawn(command, args, { stdio: "ignore", detached: true });
      child.unref();
      return true;
    } catch {
      return false;
    }
  },
};

// --- input parsing --------------------------------------------------------

/** Normalize the agent-supplied JSON to `{ rows, meta }`. Accepts a bare
 * ResultRow[], the `orbit_search`/`orbit_results` structuredContent object
 * (`{ results, ...meta }`), or a `{ results, meta }` envelope. */
export function normalizeInput(parsed) {
  if (Array.isArray(parsed)) return { rows: parsed, meta: {} };
  if (parsed && Array.isArray(parsed.results)) {
    const { results, ...rest } = parsed;
    const meta = rest.meta && typeof rest.meta === "object" ? rest.meta : rest;
    return { rows: results, meta };
  }
  throw new Error(
    "Input JSON must be a results array or an object with a `results` array.",
  );
}

// --- CLI ------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    format: "md",
    out: process.cwd(),
    open: true,
    brief: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--input" || a === "-i") opts.input = argv[++i];
    else if (a === "--out" || a === "-o") opts.out = argv[++i];
    else if (a === "--format" || a === "-f") opts.format = argv[++i];
    else if (a === "--brief" || a === "-b") opts.brief = argv[++i];
    else if (a === "--no-open") opts.open = false;
    else if (!opts.input) opts.input = a;
    else if (opts.out === process.cwd()) opts.out = a;
  }
  return opts;
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (!opts.input) {
    throw new Error(
      "Usage: buildVault.mjs --input <results.json> --out <dir> " +
        "[--format md|json|csv] [--brief <text>] [--no-open]",
    );
  }
  const { rows, meta } = normalizeInput(
    JSON.parse(readFileSync(opts.input, "utf8")),
  );
  mkdirSync(opts.out, { recursive: true });

  if (opts.format === "json") {
    writeFileSync(join(opts.out, "results.json"), resultsJson(rows, meta));
    return {
      format: "json",
      files: ["results.json"],
      outputDir: opts.out,
      message: null,
    };
  }
  if (opts.format === "csv") {
    writeFileSync(join(opts.out, "results.csv"), resultsCsv(rows));
    return {
      format: "csv",
      files: ["results.csv"],
      outputDir: opts.out,
      message: null,
    };
  }

  const { files } = buildVault(rows, { brief: opts.brief });
  for (const f of files) writeFileSync(join(opts.out, f.name), f.content);
  const obsidian = opts.open ? openObsidian(opts.out) : null;
  return {
    format: "md",
    files: files.map((f) => f.name),
    outputDir: opts.out,
    message: obsidian?.message ?? null,
  };
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = main();
    const count = result.files.filter((f) => f !== "_index.md").length;
    console.log(
      `Wrote ${result.files.length} file(s) to ${result.outputDir}` +
        (result.format === "md" ? ` (${count} people + _index.md).` : "."),
    );
    if (result.message) console.log(result.message);
  } catch (err) {
    console.error(`buildVault: ${err.message}`);
    process.exit(1);
  }
}
