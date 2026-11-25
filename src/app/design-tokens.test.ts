import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const root = css.match(/:root\s*\{([^}]+)\}/)![1];
const colors = Object.fromEntries([...root.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((match) => [match[1], match[2]]));

/** WCAG relative luminance uses linear sRGB, including the low-channel branch; no rounded ratios are used for pass/fail. */
function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map((channel) => parseInt(channel, 16) / 255).map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

describe("accessible design tokens", () => {
  it.each(["surface", "canvas", "surface-muted", "surface-indigo", "surface-emerald"])("preserves normal text and control contrast on %s", (surface) => {
    for (const text of ["ink", "muted", "accent", "accent-hover", "success"]) expect(contrast(colors[text], colors[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    for (const control of ["border", "focus"]) expect(contrast(colors[control], colors[surface]), `${control} on ${surface}`).toBeGreaterThanOrEqual(3);
  });
  it("preserves white action text, synthetic contrast and a prominent offset focus ring", () => {
    expect(contrast("#ffffff", colors.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", colors["accent-hover"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#633704", "#fff0c2")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#925a0d", "#fff0c2")).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/:focus-visible\s*\{\s*outline: 3px solid var\(--focus\); outline-offset: 4px;/);
  });
});
