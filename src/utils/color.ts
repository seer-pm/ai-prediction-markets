/**
 * Returns a readable text colour (near-black or paper) for a given background.
 *
 * Uses perceived luminance, so a legend swatch stays legible whether its series
 * colour is a light ochre or a deep slate.
 * https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.601-6-200701-S!!PDF-E.pdf
 */
export function readableTextColor(background: string): string {
  const hex = background.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#16181D" : "#FAFAF8";
}

/** Fades a hex colour to rgba — used to push un-hovered series into the background. */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
