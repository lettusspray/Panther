// design:lint — runs PANTHER-01..06 against src/ and the design token layer.
// Usage: npm run design:lint [-- <path>]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { lintSource, type Violation } from "../src/lib/design-system/lint.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const EXTS = new Set([".css", ".astro", ".ts", ".tsx"]);

const targets = process.argv.slice(2);
const files: string[] = [];

function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (EXTS.has("." + entry.split(".").pop()!)) files.push(full);
  }
}

if (targets.length > 0) {
  for (const t of targets) {
    const full = t.startsWith("/") ? t : join(process.cwd(), t);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
} else {
  walk(SRC);
}

const violations: Violation[] = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  violations.push(...lintSource(source, file));
}

const byRule = new Map<string, Violation[]>();
for (const v of violations) {
  byRule.set(v.rule, [...(byRule.get(v.rule) ?? []), v]);
}

for (const [rule, list] of byRule) {
  console.log(`\n\x1b[31m${rule}\x1b[0m (${list.length})`);
  for (const v of list) {
    console.log(`  ${v.file}: ${v.message}`);
  }
}

const total = violations.length;
console.log(`\n${total === 0 ? "\x1b[32m" : "\x1b[31m"}${total} violation(s)\x1b[0m`);
process.exit(total === 0 ? 0 : 1);
