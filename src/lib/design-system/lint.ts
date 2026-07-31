// PANTHER-01..06 design-system enforcement.
// Re-derived per AGENTS.md §First Principles: the forbidden colour
// pairings guard posture discipline at the layer where it is decided
// (the .posture-* classes, per Design System §15.3). Text-ink use of
// --panther-resting-hex on light backgrounds is sanctioned by §3.3 and
// is therefore NOT a violation.

export type PantherRule =
  | "PANTHER-01"
  | "PANTHER-02"
  | "PANTHER-03"
  | "PANTHER-04"
  | "PANTHER-05"
  | "PANTHER-06";

export interface Violation {
  rule: PantherRule;
  file: string;
  message: string;
  line?: number;
}

interface Oklch {
  l: number; // 0..1
  c: number;
  h: number;
}

const OKLCH_RE = /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/;

export function parseOklch(value: string): Oklch | null {
  const m = value.match(OKLCH_RE);
  if (!m) return null;
  return { l: Number(m[1]) / 100, c: Number(m[2]), h: Number(m[3]) };
}

export const LOCKED_TOKENS: Record<string, Oklch> = {
  "--panther-resting-oklch": { l: 0.2, c: 0.02, h: 30 },
  "--panther-walking-oklch": { l: 0.62, c: 0.08, h: 210 },
  "--panther-eyes-oklch": { l: 0.45, c: 0.03, h: 225 },
  "--panther-roaring-oklch": { l: 0.5, c: 0.18, h: 30 },
};

export const TOKEN_HEX: Record<string, string> = {
  "--panther-resting-hex": "#34312E",
  "--panther-walking-hex": "#9BAEBF",
  "--panther-eyes-hex": "#6F767D",
  "--panther-roaring-hex": "#CB823F",
};

// ── Token range checks (PANTHER-02/03/04) ────────────────────

export function checkOklchToken(
  rule: PantherRule,
  token: string,
  actual: Oklch,
  ok: (t: Oklch) => boolean,
  file: string,
): Violation[] {
  const violations: Violation[] = [];
  if (!ok(actual)) {
    violations.push({
      rule,
      file,
      message: `${token} = oklch(${actual.l * 100}% ${actual.c} ${actual.h}) is out of the locked range`,
    });
  }
  return violations;
}

export function lintOklchTokens(css: string, file: string): Violation[] {
  const violations: Violation[] = [];
  for (const token of Object.keys(LOCKED_TOKENS)) {
    const re = new RegExp(`${token.replace(/-/g, "\\-")}:\\s*(oklch\\([^)]*\\))`);
    const m = css.match(re);
    if (!m) continue;
    const parsed = parseOklch(m[1]);
    if (!parsed) continue;
    switch (token) {
      case "--panther-resting-oklch":
        // PANTHER-02: Resting Lightness 0.18–0.22
        violations.push(...checkOklchToken("PANTHER-02", token, parsed, (t) => t.l >= 0.18 && t.l <= 0.22, file));
        break;
      case "--panther-walking-oklch":
        // PANTHER-03: Walking Chroma 0.07–0.09
        violations.push(...checkOklchToken("PANTHER-03", token, parsed, (t) => t.c >= 0.07 && t.c <= 0.09, file));
        break;
      case "--panther-roaring-oklch":
        // PANTHER-04: Roaring Hue 28°–32°
        violations.push(...checkOklchToken("PANTHER-04", token, parsed, (t) => t.h >= 28 && t.h <= 32, file));
        break;
    }
  }
  return violations;
}

// ── Declaration block helpers ─────────────────────────────────

export interface DeclBlock {
  selector: string;
  decls: Record<string, string>;
}

const BLOCK_RE = /([^{}]+)\{([^{}]*)\}/g;

export function extractDeclBlocks(source: string): DeclBlock[] {
  const blocks: DeclBlock[] = [];
  const m = source.matchAll(BLOCK_RE);
  for (const match of m) {
    const decls: Record<string, string> = {};
    const declRe = /([\w-]+)\s*:\s*([^;]+);?/g;
    const declsSrc = match[2];
    const dm = declsSrc.matchAll(declRe);
    for (const d of dm) {
      decls[d[1].trim()] = d[2].trim();
    }
    blocks.push({ selector: match[1].trim(), decls });
  }
  return blocks;
}

// ── Inline style extraction (Astro style="...") ───────────────

const INLINE_STYLE_RE = /style="([^"]+)"/g;

export function extractInlineStyles(source: string): Record<string, string>[] {
  const styles: Record<string, string>[] = [];
  const m = source.matchAll(INLINE_STYLE_RE);
  for (const match of m) {
    const decls: Record<string, string> = {};
    const declRe = /([\w-]+)\s*:\s*([^;]+);?/g;
    const dm = match[1].matchAll(declRe);
    for (const d of dm) {
      decls[d[1].trim()] = d[2].trim();
    }
    styles.push(decls);
  }
  return styles;
}

function resolveHex(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("var(")) {
    const inner = trimmed.match(/var\((--[\w-]+)/);
    if (inner) return TOKEN_HEX[inner[1]] ?? null;
  }
  const hex = trimmed.match(/^#([0-9A-Fa-f]{6})$/);
  if (hex) return `#${hex[1].toUpperCase()}`;
  return null;
}

function isEyesPalette(value: string): boolean {
  const hex = resolveHex(value);
  return hex === TOKEN_HEX["--panther-eyes-hex"];
}

function isRestingPalette(value: string): boolean {
  const hex = resolveHex(value);
  return hex === TOKEN_HEX["--panther-resting-hex"];
}

// ── Posture-class pairing checks (PANTHER-05/06, §15.3 scope) ─

export function lintPostureClasses(source: string, file: string): Violation[] {
  const violations: Violation[] = [];
  for (const block of extractDeclBlocks(source)) {
    const selector = block.selector;
    const postureSelector = selector
      .split(",")
      .map((s) => s.trim())
      .find((s) => /^\.posture-(roaring|walking|eyes|resting)$/.test(s));
    if (!postureSelector) continue;

    const accent = block.decls["--posture-accent"];
    const border = block.decls["--posture-border"];
    const font = block.decls["--posture-font"];
    const isSerif = font?.includes("--font-serif");
    const isSans = font?.includes("--font-sans");

    if (isSerif) {
      if (accent && isEyesPalette(accent)) {
        violations.push({
          rule: "PANTHER-05",
          file,
          message: `${postureSelector}: serif track must not pair --posture-accent with the Eyes-Forward palette (${accent})`,
        });
      }
      if (border && isEyesPalette(border)) {
        violations.push({
          rule: "PANTHER-05",
          file,
          message: `${postureSelector}: serif track must not pair --posture-border with the Eyes-Forward palette (${border})`,
        });
      }
    }

    if (isSans) {
      if (accent && isRestingPalette(accent)) {
        violations.push({
          rule: "PANTHER-06",
          file,
          message: `${postureSelector}: sans track must not pair --posture-accent with the Resting palette (${accent})`,
        });
      }
      if (border && isRestingPalette(border)) {
        violations.push({
          rule: "PANTHER-06",
          file,
          message: `${postureSelector}: sans track must not pair --posture-border with the Resting palette (${border})`,
        });
      }
    }
  }
  return violations;
}

// ── Same-rule serif/eyes pairing (PANTHER-05) ────────────────

export function lintSameRuleFontColour(source: string, file: string): Violation[] {
  const violations: Violation[] = [];
  const blocks = [
    ...extractDeclBlocks(source).map((b) => b.decls),
    ...extractInlineStyles(source),
  ];
  for (const block of blocks) {
    const font = block["font-family"] ?? "";
    const colour = block["color"] ?? "";
    if (font.includes("--font-serif") && isEyesPalette(colour)) {
      violations.push({
        rule: "PANTHER-05",
        file,
        message: `serif font-family paired with Eyes-Forward colour (${colour}) in the same declaration`,
      });
    }
  }
  return violations;
}

// ── SVG resting-fill scope (PANTHER-01) ──────────────────────

export function isTerminalPage(file: string): boolean {
  return file.includes("switchboard") || file.includes("checkout");
}

export function lintSvgFills(source: string, file: string): Violation[] {
  if (isTerminalPage(file)) return [];
  const violations: Violation[] = [];
  const re = /fill="(var\(--panther-resting-[\w-]*\))"/g;
  const m = source.matchAll(re);
  for (const match of m) {
    violations.push({
      rule: "PANTHER-01",
      file,
      message: `fill="${match[1]}" used on non-terminal page — Resting palette is reserved for checkout/switchboard`,
    });
  }
  return violations;
}

// ── Dispatcher ───────────────────────────────────────────────

export function lintSource(source: string, file: string): Violation[] {
  const violations: Violation[] = [];
  if (file.endsWith(".css") || file.endsWith(".astro")) {
    violations.push(...lintOklchTokens(source, file));
    violations.push(...lintPostureClasses(source, file));
    violations.push(...lintSameRuleFontColour(source, file));
  }
  if (file.endsWith(".astro") || file.endsWith(".ts") || file.endsWith(".tsx")) {
    violations.push(...lintSvgFills(source, file));
  }
  return violations;
}
