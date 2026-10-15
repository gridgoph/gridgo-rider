import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Every delivery step keeps its action in one place: the bottom of the screen.
 *
 * A rider reported the step's button sitting in the middle of the content
 * (gridgo-rider#117). The bar existed; what moved was everything around it —
 * a note under the button on three steps and not the fourth, and no bar at all
 * while a job loaded, failed to load, or sent the rider back to the checks, so
 * the action landed mid-page in exactly the states a rider is least sure of.
 *
 * Enumerated, not sampled: a new step under `app/trip` that renders a primary
 * action fails here until that action goes through `StickyActionBar`.
 */

const TRIP = join(__dirname, "..", "app", "trip");
const read = (file: string) => readFileSync(join(TRIP, file), "utf8");

/** Pushed trip routes that take a step: the ones with a primary action. */
const steps = readdirSync(TRIP).filter(
  (file) => file.endsWith(".tsx") && /<PrimaryButton\b/.test(read(file)),
);

/** Each `<StickyActionBar …>…</StickyActionBar>` block in a source file. */
function bars(source: string): string[] {
  return source.match(/<StickyActionBar\b[\s\S]*?<\/StickyActionBar>/g) ?? [];
}

describe("every delivery step pins its action to the bottom", () => {
  it("finds the steps", () => {
    // If this drops, the rest of the file passes vacuously.
    expect(steps.sort()).toEqual([
      "delivery.tsx",
      "handoff.tsx",
      "pack.tsx",
      "pickup.tsx",
      "sign-off.tsx",
    ]);
  });

  it.each(steps)("%s renders every primary action inside the bar", (file) => {
    const source = read(file);
    const total = source.match(/<PrimaryButton\b/g)?.length ?? 0;
    const pinned = bars(source).reduce(
      (count, bar) => count + (bar.match(/<PrimaryButton\b/g)?.length ?? 0),
      0,
    );
    expect(pinned).toBe(total);
  });

  it.each(steps)("%s says anything about the action through `note`, above the button", (file) => {
    // A `<Text>` inside the bar is how the note ended up under the button.
    for (const bar of bars(read(file))) expect(bar).not.toMatch(/<Text\b/);
  });

  it.each(steps)("%s keeps the bar while the job loads or fails to load", (file) => {
    expect(read(file)).toMatch(/<StickyActionFallback\b/);
  });

  it.each(steps)("%s lets the bar paint the bottom safe area", (file) => {
    // The bar pads the inset itself; a padded shell would count it twice and
    // float the bar over a strip of canvas.
    expect(read(file)).toMatch(/<Screen edges=\{\[\]\}>/);
  });
});
