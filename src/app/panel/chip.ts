export interface ChipColours {
  background: string;
  color: string;
}

export function chipColours(hex: string): ChipColours | null {
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const value = parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return { background: `#${hex}`, color: brightness >= 150 ? '#1b1f24' : '#ffffff' };
}
