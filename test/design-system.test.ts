import { describe, it, expect } from "vitest";
import {
  parseOklch,
  lintOklchTokens,
  lintPostureClasses,
  lintSameRuleFontColour,
  lintSvgFills,
  lintSource,
} from "../src/lib/design-system/lint";

// ── PANTHER-02/03/04: OKLCH token ranges ─────────────────────

describe("lintOklchTokens", () => {
  const base = `
    :root {
      --panther-resting-oklch: oklch(20% 0.02 30);
      --panther-walking-oklch: oklch(62% 0.08 210);
      --panther-eyes-oklch: oklch(45% 0.03 225);
      --panther-roaring-oklch: oklch(50% 0.18 30);
    }
  `;

  it("accepts the locked token values", () => {
    expect(lintOklchTokens(base, "global.css")).toHaveLength(0);
  });

  it("PANTHER-02 rejects resting lightness outside 0.18–0.22", () => {
    const bad = base.replace("oklch(20% 0.02 30)", "oklch(30% 0.02 30)");
    const violations = lintOklchTokens(bad, "global.css");
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("PANTHER-02");
  });

  it("PANTHER-03 rejects walking chroma outside 0.07–0.09", () => {
    const bad = base.replace("oklch(62% 0.08 210)", "oklch(62% 0.15 210)");
    const violations = lintOklchTokens(bad, "global.css");
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("PANTHER-03");
  });

  it("PANTHER-04 rejects roaring hue outside 28°–32°", () => {
    const bad = base.replace("oklch(50% 0.18 30)", "oklch(50% 0.18 60)");
    const violations = lintOklchTokens(bad, "global.css");
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("PANTHER-04");
  });

  it("tolerates missing tokens", () => {
    expect(lintOklchTokens(":root { color: red; }", "x.css")).toHaveLength(0);
  });
});

describe("parseOklch", () => {
  it("parses percentage lightness", () => {
    expect(parseOklch("oklch(20% 0.02 30)")).toEqual({ l: 0.2, c: 0.02, h: 30 });
  });
  it("returns null for non-oklch input", () => {
    expect(parseOklch("rgb(0 0 0)")).toBeNull();
  });
});

// ── PANTHER-05/06: posture-class colour pairings ──────────────

describe("lintPostureClasses", () => {
  it("PANTHER-05 rejects serif track accent from the Eyes palette", () => {
    const css = `.posture-resting {
      --posture-font: var(--font-serif);
      --posture-accent: var(--panther-eyes-hex);
    }`;
    const violations = lintPostureClasses(css, "postures.css");
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("PANTHER-05");
  });

  it("PANTHER-05 rejects serif track border from the Eyes palette", () => {
    const css = `.posture-roaring {
      --posture-font: var(--font-serif);
      --posture-border: var(--panther-eyes-hex);
    }`;
    const violations = lintPostureClasses(css, "postures.css");
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("PANTHER-05");
  });

  it("PANTHER-06 rejects sans track accent from the Resting palette", () => {
    const css = `.posture-walking {
      --posture-font: var(--font-sans);
      --posture-accent: var(--panther-resting-hex);
    }`;
    const violations = lintPostureClasses(css, "postures.css");
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("PANTHER-06");
  });

  it("accepts the four sanctioned posture blocks", () => {
    const css = `
      .posture-roaring { --posture-font: var(--font-serif); --posture-accent: var(--panther-roaring-hex); --posture-border: var(--panther-roaring-hex); }
      .posture-walking { --posture-font: var(--font-sans); --posture-accent: var(--panther-walking-hex); --posture-border: var(--panther-walking-hex); }
      .posture-eyes { --posture-font: var(--font-sans); --posture-accent: var(--panther-eyes-hex); --posture-border: var(--panther-eyes-hex); }
      .posture-resting { --posture-font: var(--font-serif); --posture-accent: var(--panther-roaring-hex); --posture-border: var(--panther-resting-hex); }
    `;
    expect(lintPostureClasses(css, "postures.css")).toHaveLength(0);
  });

  it("ignores rules that do not target a posture class", () => {
    const css = `.posture-walking .card { --posture-accent: var(--panther-resting-hex); }`;
    expect(lintPostureClasses(css, "x.css")).toHaveLength(0);
  });
});

// ── PANTHER-05: same-rule serif/eyes pairing ─────────────────

describe("lintSameRuleFontColour", () => {
  it("rejects serif font-family with Eyes colour in the same rule", () => {
    const css = `.title { font-family: var(--font-serif); color: var(--panther-eyes-hex); }`;
    const violations = lintSameRuleFontColour(css, "x.css");
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("PANTHER-05");
  });

  it("catches inline style attributes in Astro markup", () => {
    const astro = `<h1 style="font-family: var(--font-serif); color: var(--panther-eyes-hex);">x</h1>`;
    const violations = lintSameRuleFontColour(astro, "x.astro");
    expect(violations).toHaveLength(1);
  });

  it("accepts serif with Roaring/Resting ink", () => {
    const css = `.title { font-family: var(--font-serif); color: var(--panther-resting-hex); }`;
    expect(lintSameRuleFontColour(css, "x.css")).toHaveLength(0);
  });

  it("accepts sans with Resting ink (sanctioned by §3.3 light-background ink)", () => {
    const css = `.title { font-family: var(--font-sans); color: var(--panther-resting-hex); }`;
    expect(lintSameRuleFontColour(css, "x.css")).toHaveLength(0);
  });
});

// ── PANTHER-01: SVG resting-fill scope ────────────────────────

describe("lintSvgFills", () => {
  it("rejects resting palette fill on non-terminal pages", () => {
    const src = `<svg fill="var(--panther-resting-hex)"></svg>`;
    const violations = lintSvgFills(src, "src/pages/vehicles/index.astro");
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("PANTHER-01");
  });

  it("allows resting palette fill on switchboard pages", () => {
    const src = `<svg fill="var(--panther-resting-hex)"></svg>`;
    expect(lintSvgFills(src, "src/pages/switchboard/index.astro")).toHaveLength(0);
  });

  it("allows resting palette fill on checkout pages", () => {
    const src = `<svg fill="var(--panther-resting-hex)"></svg>`;
    expect(lintSvgFills(src, "src/pages/checkout.astro")).toHaveLength(0);
  });
});

// ── Dispatcher ────────────────────────────────────────────────

describe("lintSource", () => {
  it("runs token + pairing checks on CSS files", () => {
    const css = `:root {
      --panther-resting-oklch: oklch(30% 0.02 30);
    }
    .title { font-family: var(--font-serif); color: var(--panther-eyes-hex); }`;
    const violations = lintSource(css, "global.css");
    expect(violations.map((v) => v.rule).sort()).toEqual(["PANTHER-02", "PANTHER-05"]);
  });

  it("runs svg fill checks on Astro files", () => {
    const astro = `<svg fill="var(--panther-resting-hex)"></svg>`;
    const violations = lintSource(astro, "src/pages/index.astro");
    expect(violations.some((v) => v.rule === "PANTHER-01")).toBe(true);
  });

  it("is a no-op on files it does not lint", () => {
    expect(lintSource("hello", "src/lib/env.ts")).toEqual([]);
  });
});
