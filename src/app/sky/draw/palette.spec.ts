import { describe, expect, it } from 'vitest';
import { type Palette, PALETTES, type Rgb } from './palette';

/** Violet: hue 250°–300° with enough saturation to read as a colour, not a tinted white. */
function isViolet([r, g, b]: Rgb): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0 || (max - min) / max < 0.2) return false;
  const d = max - min;
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60 >= 250 && h * 60 <= 300;
}

function colours(value: unknown): Rgb[] {
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number'))
    return [value as unknown as Rgb];
  if (value && typeof value === 'object') return Object.values(value).flatMap(colours);
  return [];
}

function shape(value: unknown, at = ''): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return Object.entries(value).flatMap(([key, v]) => shape(v, `${at}.${key}`));
  return [`${at}:${Array.isArray(value) ? 'rgb' : typeof value}`];
}

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function colourPaths(value: unknown, at = ''): [string, Rgb][] {
  if (Array.isArray(value)) return value.length === 3 ? [[at, value as unknown as Rgb]] : [];
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, v]) => colourPaths(v, at ? `${at}.${key}` : key));
  return [];
}

/** What labels are drawn in: the `label` group and every Light's core (see `colour` in `labels.ts`). */
const LABEL = /^(label\.|lit\.[^.]+\.core$)/;

/** Not marks: the backdrop, glows, washes, the arc's empty track, and the husk, which is muted on purpose. */
const EXEMPT = [
  /^sky$/,
  /^labelHalo$/,
  /^lit\.[^.]+\.glow$/,
  /^emberLook\.glow$/,
  /^husk\./,
  /^disc\./,
  /^fog\.(inner|mid|outer|puff)$/,
  /^system\.(mapGlow|gatedGlow|glow|arcTrack)$/,
  /^lane\.hotGlow$/,
  /^hyperlane\.haze$/,
];

/** Drawn on the Ember's crust, so the sky is the wrong background to test it against. */
const OVER_CRUST = ['ember.heart'];

/**
 * Exempt on dark only: there the crust is the Ember's shadowed body and its rim,
 * `emberLook.core`, carries it.
 */
const DARK_ONLY = ['ember.crust'];

function exempt(palette: Palette, path: string): boolean {
  if (EXEMPT.some((rule) => rule.test(path)) || OVER_CRUST.includes(path)) return true;
  return palette.glows && DARK_ONLY.includes(path);
}

describe.each(Object.entries(PALETTES))('%s palette', (_, palette) => {
  it.each(colourPaths(palette).filter(([path]) => !exempt(palette, path)))(
    'reads %s against its own sky at WCAG AA',
    (path, colour) => {
      const floor = LABEL.test(path) ? 4.5 : 3;
      expect(contrast(colour, palette.sky)).toBeGreaterThanOrEqual(floor);
    },
  );

  it('keeps violet for Hyperlanes alone', () => {
    const { hyperlane, ...rest } = palette;
    expect(colours(rest).filter(isViolet)).toEqual([]);
    expect(colours(hyperlane).filter(isViolet).length).toBeGreaterThan(3);
  });
});

describe('palettes', () => {
  it('share one shape', () => {
    expect(shape(PALETTES.light)).toEqual(shape(PALETTES.dark));
  });
});
