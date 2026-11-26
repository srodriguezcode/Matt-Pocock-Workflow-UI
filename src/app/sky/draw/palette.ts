/** Adapted from rengwu/wayfinder-maps `theme.js` (MIT). See NOTICE. */
import type { Theme } from '@contract/repo';
import type { Light } from '@contract/sky';

export type Rgb = readonly [number, number, number];

export function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** Core and glow colours. `r` and `gr` are the core and glow radii in world px. */
export interface Look {
  core: Rgb;
  glow: Rgb;
  r: number;
  gr: number;
}

/**
 * One theme's Sky. `glows` false draws a star chart, ink on paper: star and edge glows are dropped,
 * not recoloured, a dimmed star goes hollow and each label gets a ring.
 */
export interface Palette {
  glows: boolean;
  sky: Rgb;
  ink: Rgb;
  /** Multiplies the starfield's alpha, so specks stay faint on paper. */
  specks: number;
  speckDensity: number;
  /** Multiplies Fog's alpha: paper needs a denser wash than a dark sky to show the same Fog. */
  fogDensity: number;
  /** Multiplies the alpha of a System disc's dotted edge. */
  discEdge: number;
  /**
   * Shadow behind each label, and its ring on paper.
   * At or near `sky`, so it erases the lines under the text.
   */
  labelHalo: Rgb;
  lit: Record<Light, Look>;
  emberLook: Look;
  ember: { crust: Rgb; heart: Rgb };
  husk: { crust: Rgb; rim: Rgb };
  system: Record<
    | 'mapGlow'
    | 'mapCore'
    | 'gatedGlow'
    | 'gatedRing'
    | 'glow'
    | 'core'
    | 'spentCore'
    | 'arcTrack'
    | 'arcDone',
    Rgb
  >;
  disc: Record<'map' | 'gated' | 'plain' | 'looseRing', Rgb>;
  lane: Record<'thread' | 'bead' | 'hotGlow' | 'hotThread' | 'hotBead', Rgb>;
  satisfied: Record<'line' | 'spark', Rgb>;
  hyperlane: Record<'haze' | 'beam' | 'core' | 'chevron' | 'comet' | 'cometHead' | 'portal', Rgb>;
  fog: Record<'inner' | 'mid' | 'outer' | 'puff' | 'ring', Rgb>;
  mark: Record<'stale' | 'old' | 'spinner' | 'working' | 'asking' | 'waiting', Rgb>;
  label: Record<'map' | 'system' | 'ember' | 'fog', Rgb>;
  swatch: Record<'map' | 'gated' | 'plain', Rgb>;
}

export const DARK: Palette = {
  glows: true,
  sky: [5, 7, 13],
  ink: [255, 255, 255],
  specks: 1,
  speckDensity: 1,
  fogDensity: 1,
  discEdge: 1,
  labelHalo: [0, 0, 0],
  lit: {
    frontier: { core: [138, 216, 255], glow: [47, 155, 224], r: 7.5, gr: 42 },
    yours: { core: [255, 216, 115], glow: [217, 154, 26], r: 6.5, gr: 30 },
    'decision-frontier': { core: [143, 240, 196], glow: [31, 174, 116], r: 6.5, gr: 30 },
    idle: { core: [197, 202, 214], glow: [92, 100, 117], r: 5, gr: 18 },
    'in-flight': { core: [255, 216, 115], glow: [255, 176, 32], r: 6, gr: 24 },
    undecided: { core: [174, 180, 191], glow: [75, 81, 92], r: 5, gr: 12 },
    blocked: { core: [224, 90, 95], glow: [140, 34, 48], r: 4.2, gr: 14 },
  },
  emberLook: { core: [255, 154, 69], glow: [224, 104, 26], r: 4.4, gr: 20 },
  ember: {
    crust: [90, 30, 12],
    heart: [255, 197, 138],
  },
  husk: {
    crust: [48, 38, 34],
    rim: [138, 112, 98],
  },
  system: {
    mapGlow: [201, 164, 92],
    mapCore: [255, 243, 214],
    gatedGlow: [160, 90, 90],
    gatedRing: [224, 128, 128],
    glow: [125, 143, 179],
    core: [230, 235, 245],
    spentCore: [138, 144, 160],
    arcTrack: [57, 65, 79],
    arcDone: [185, 214, 196],
  },
  disc: {
    map: [201, 164, 92],
    gated: [160, 90, 90],
    plain: [110, 130, 180],
    looseRing: [120, 150, 200],
  },
  lane: {
    thread: [180, 190, 212],
    bead: [215, 222, 238],
    hotGlow: [47, 155, 224],
    hotThread: [150, 215, 255],
    hotBead: [200, 236, 255],
  },
  satisfied: {
    line: [255, 150, 70],
    spark: [255, 170, 110],
  },
  hyperlane: {
    haze: [140, 90, 255],
    beam: [170, 120, 255],
    core: [225, 205, 255],
    chevron: [215, 190, 255],
    comet: [190, 160, 255],
    cometHead: [255, 245, 255],
    portal: [196, 160, 255],
  },
  fog: {
    inner: [170, 180, 195],
    mid: [140, 150, 165],
    outer: [120, 130, 145],
    puff: [185, 195, 210],
    ring: [220, 226, 236],
  },
  mark: {
    stale: [216, 200, 154],
    old: [224, 90, 95],
    spinner: [138, 216, 255],
    working: [138, 216, 255],
    asking: [255, 216, 115],
    waiting: [143, 240, 196],
  },
  label: {
    map: [243, 220, 166],
    system: [223, 229, 242],
    ember: [255, 154, 106],
    fog: [180, 188, 201],
  },
  swatch: {
    map: [232, 198, 122],
    gated: [224, 122, 122],
    plain: [159, 180, 224],
  },
};

export const LIGHT: Palette = {
  glows: false,
  sky: [246, 243, 234],
  ink: [34, 38, 48],
  specks: 0.75,
  speckDensity: 2.5,
  fogDensity: 2.6,
  discEdge: 4,
  labelHalo: [246, 243, 234],
  lit: {
    frontier: { core: [0, 106, 170], glow: [0, 106, 170], r: 7.5, gr: 42 },
    yours: { core: [138, 94, 0], glow: [138, 94, 0], r: 6.5, gr: 30 },
    'decision-frontier': { core: [0, 120, 80], glow: [0, 120, 80], r: 6.5, gr: 30 },
    idle: { core: [72, 78, 92], glow: [72, 78, 92], r: 5, gr: 18 },
    'in-flight': { core: [156, 88, 0], glow: [156, 88, 0], r: 6, gr: 24 },
    undecided: { core: [104, 108, 116], glow: [104, 108, 116], r: 5, gr: 12 },
    blocked: { core: [184, 36, 46], glow: [184, 36, 46], r: 4.2, gr: 14 },
  },
  emberLook: { core: [128, 56, 16], glow: [128, 56, 16], r: 4.4, gr: 20 },
  ember: {
    crust: [184, 80, 28],
    heart: [240, 160, 100],
  },
  husk: {
    crust: [216, 208, 200],
    rim: [166, 154, 144],
  },
  system: {
    mapGlow: [132, 98, 30],
    mapCore: [132, 98, 30],
    gatedGlow: [166, 58, 58],
    gatedRing: [166, 58, 58],
    glow: [70, 86, 120],
    core: [52, 62, 86],
    spentCore: [120, 126, 140],
    arcTrack: [150, 146, 138],
    arcDone: [16, 128, 78],
  },
  disc: {
    map: [150, 112, 40],
    gated: [160, 70, 70],
    plain: [70, 90, 140],
    looseRing: [80, 100, 150],
  },
  lane: {
    thread: [70, 78, 96],
    bead: [52, 60, 78],
    hotGlow: [0, 106, 170],
    hotThread: [0, 106, 170],
    hotBead: [0, 84, 140],
  },
  satisfied: {
    line: [190, 90, 26],
    spark: [168, 70, 20],
  },
  hyperlane: {
    haze: [120, 70, 220],
    beam: [110, 60, 210],
    core: [90, 40, 190],
    chevron: [100, 50, 200],
    comet: [110, 60, 210],
    cometHead: [76, 28, 164],
    portal: [110, 60, 210],
  },
  fog: {
    inner: [150, 122, 96],
    mid: [164, 138, 112],
    outer: [186, 164, 140],
    puff: [156, 128, 102],
    ring: [112, 86, 62],
  },
  mark: {
    stale: [132, 110, 30],
    old: [184, 36, 46],
    spinner: [0, 106, 170],
    working: [0, 106, 170],
    asking: [138, 94, 0],
    waiting: [0, 120, 80],
  },
  label: {
    map: [116, 82, 18],
    system: [40, 48, 66],
    ember: [150, 60, 16],
    fog: [100, 80, 60],
  },
  swatch: {
    map: [132, 98, 30],
    gated: [166, 58, 58],
    plain: [70, 90, 140],
  },
};

export const PALETTES: Record<Theme, Palette> = { dark: DARK, light: LIGHT };
