import type { Palette, Rgb } from '@app/sky/draw/palette';

const css = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`;

/** The chrome's state variables, so a badge or swatch matches its star on either theme. */
export function stateColours(palette: Palette): Record<string, string> {
  const { lit } = palette;
  return {
    '--frontier': css(lit.frontier.core),
    '--yours': css(lit.yours.core),
    '--decision': css(lit['decision-frontier'].core),
    '--blocked': css(lit.blocked.core),
    '--undecided': css(lit.undecided.core),
    '--ember': css(palette.emberLook.core),
    '--hyperlane': css(palette.hyperlane.beam),
    '--swatch-map': css(palette.swatch.map),
    '--swatch-gated': css(palette.swatch.gated),
    '--swatch-plain': css(palette.swatch.plain),
    '--asking': css(palette.mark.asking),
  };
}
