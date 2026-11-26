import { describe, expect, it } from 'vitest';
import { DARK } from '@app/sky/draw/palette';
import { stateColours } from './state-colours';

describe('stateColours', () => {
  it('gives the chrome the dark Sky colours it used to write out', () => {
    expect(stateColours(DARK)).toEqual({
      '--frontier': 'rgb(138 216 255)',
      '--yours': 'rgb(255 216 115)',
      '--decision': 'rgb(143 240 196)',
      '--blocked': 'rgb(224 90 95)',
      '--undecided': 'rgb(174 180 191)',
      '--ember': 'rgb(255 154 69)',
      '--hyperlane': 'rgb(170 120 255)',
      '--swatch-map': 'rgb(232 198 122)',
      '--swatch-gated': 'rgb(224 122 122)',
      '--swatch-plain': 'rgb(159 180 224)',
      '--asking': 'rgb(255 216 115)',
    });
  });
});
