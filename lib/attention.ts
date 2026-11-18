/**
 * Everything that wants the rider's attention, folded into one chip on the map.
 *
 * The warnings used to be full cards at the top of every tab — approval,
 * alerts switched off, a changed agreement, location trouble — and together
 * they took half the screen a rider works from. On the map they are one small
 * chip that names the problem (or counts them), and the cards themselves live
 * one tap away on `app/attention.tsx`. Pure, so the wording is tested.
 */

export type AttentionKey = "location" | "approval" | "push" | "legal";

/** Most urgent first: a trip nobody can see beats a notice to read. */
const ORDER: readonly AttentionKey[] = ["location", "approval", "push", "legal"];

const LABELS: Record<AttentionKey, string> = {
  location: "Location needs a fix",
  approval: "Account in review",
  push: "Job alerts are off",
  legal: "Updated terms to read",
};

export type AttentionSummary = {
  keys: AttentionKey[];
  label: string;
  tone: "warning" | "info";
  spoken: string;
} | null;

export function attentionSummary(flags: Partial<Record<AttentionKey, boolean>>): AttentionSummary {
  const keys = ORDER.filter((key) => flags[key]);
  if (!keys.length) return null;
  const label = keys.length === 1 ? LABELS[keys[0]] : `${keys.length} things need you`;
  const tone = keys.includes("location") || keys.includes("approval") ? "warning" : "info";
  return {
    keys,
    label,
    tone,
    spoken: `${keys.map((key) => LABELS[key]).join(", ")}. Opens the details.`,
  };
}
