/**
 * Signature geometry.
 *
 * The fallback evidence path when the camera cannot run. Everything here is
 * pure: strokes in, SVG out. The pad component only supplies points.
 */

export type SignaturePoint = { x: number; y: number };

/** One continuous pen-down stroke. */
export type SignatureStroke = SignaturePoint[];

const DECIMALS = 1;

function round(n: number): string {
  return Number(n.toFixed(DECIMALS)).toString();
}

/** One stroke as an SVG path `d` value. A single point becomes a short dash. */
export function strokeToPath(stroke: SignatureStroke): string {
  if (stroke.length === 0) return "";
  const first = stroke[0]!;
  if (stroke.length === 1) {
    // A tap still leaves a visible mark rather than an empty path.
    return `M${round(first.x)} ${round(first.y)} L${round(first.x + 0.5)} ${round(first.y)}`;
  }
  const rest = stroke
    .slice(1)
    .map((p) => `L${round(p.x)} ${round(p.y)}`)
    .join(" ");
  return `M${round(first.x)} ${round(first.y)} ${rest}`;
}

/**
 * Total ink length in points. Used to reject an accidental tap — a signature
 * that is one dot proves nothing and would fail a dispute.
 */
export function inkLength(strokes: SignatureStroke[]): number {
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i += 1) {
      const a = stroke[i - 1]!;
      const b = stroke[i]!;
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return total;
}

/** Minimum ink before a signature counts as signed, in points. */
export const MIN_SIGNATURE_INK = 120;

export function hasEnoughInk(strokes: SignatureStroke[]): boolean {
  return inkLength(strokes) >= MIN_SIGNATURE_INK;
}

/**
 * Ink and paper for a captured signature.
 *
 * Fixed regardless of app theme: this image leaves the phone and is read by
 * Operations and, in a dispute, by someone outside GRIDGO. A white-on-black
 * signature would be unreadable printed.
 */
export const SIGNATURE_INK = "#1A1A1A";
export const SIGNATURE_PAPER = "#FFFFFF";
export const SIGNATURE_STROKE_WIDTH = 2.5;

/**
 * Fit strokes drawn on a pad of one width onto a pad of another.
 *
 * A signature restored from a draft was drawn in the coordinates of the pad
 * it was drawn on. If the pad comes back a different width — a rotated
 * phone, a different device — the same strokes scaled uniformly are still
 * the same signature; left unscaled they are a signature clipped at the
 * edge. Scaled about the origin, so the baseline the pad draws stays under it.
 */
export function scaleStrokes(
  strokes: SignatureStroke[],
  fromWidth: number,
  toWidth: number,
): SignatureStroke[] {
  if (!(fromWidth > 0) || !(toWidth > 0) || fromWidth === toWidth) return strokes;
  const factor = toWidth / fromWidth;
  return strokes.map((stroke) =>
    stroke.map((point) => ({
      x: Number((point.x * factor).toFixed(DECIMALS)),
      y: Number((point.y * factor).toFixed(DECIMALS)),
    })),
  );
}

/** The signature baseline on a form: a hairline with the cross at its left. */
export const SIGNATURE_BASELINE = "#DCDCDC";
