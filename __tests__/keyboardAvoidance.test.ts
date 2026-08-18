import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Every screen with a field keeps that field visible while it is typed.
 *
 * Enumerated rather than sampled, for the same reason `backAffordance` is: "the
 * keyboard covers the input" is a report that a spot check answers wrongly. The
 * captain saw it on two screens; it was on four, and a fifth added later would
 * have arrived broken in exactly the same way.
 *
 * What is asserted is the shape, not the behaviour — a soft keyboard is native
 * and Jest has none, so this cannot prove a field clears it. It proves the
 * screen is wired to the one mechanism that has been checked on a device, and
 * fails a screen that quietly goes back to the one that did not work.
 *
 * Why `KeyboardAvoidingView` is banned outright rather than tuned: with no
 * `behavior` it renders a plain `View`, and every call site here passed
 * `undefined` on Android. Even given one, it resizes a container and never
 * scrolls, and it cannot see a scroll view's content inset. `FormScroll` (which
 * documents the whole diagnosis) is the replacement.
 */

const ROOTS = ["app", "components"];
const SOURCE = /\.tsx$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry) ? [path] : [];
  });
}

const files = ROOTS.flatMap((root) => sourceFiles(join(__dirname, "..", root)));

/** Files that render a text field of their own. */
const withFields = files.filter((file) => /<TextInput\b/.test(readFileSync(file, "utf8")));

describe("a field a rider is typing into stays visible", () => {
  it("finds the screens that have fields", () => {
    // If this ever drops to zero the rest of the file passes vacuously.
    expect(withFields.length).toBeGreaterThan(0);
  });

  it("scrolls every screen that has a field with the keyboard-aware scroll", () => {
    // Field primitives do not own a viewport; their screen owns the scroll.
    // Every route that composes one is still enumerated independently here.
    const primitives = ["FormScroll.tsx", "PasswordField.tsx", "CodeField.tsx"].map((name) =>
      join("components", name),
    );

    const offenders = withFields
      .filter((file) => !primitives.some((primitive) => file.endsWith(primitive)))
      .filter((file) => !/from "@\/components\/FormScroll"/.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });

  it("never reaches back for React Native's KeyboardAvoidingView", () => {
    // Rendered or imported, not merely named: `FormScroll` and the root layout
    // both explain in prose why this component was dropped, and that writing
    // is the point rather than a violation of it.
    const rendered = /<KeyboardAvoidingView\b/;
    const imported = /import\s*\{[^}]*\bKeyboardAvoidingView\b[^}]*\}\s*from\s*"react-native"/s;

    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return rendered.test(source) || imported.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it("mounts the keyboard provider once, at the root", () => {
    // Every one of these components reads the keyboard frame out of its
    // context. Without the provider they render and do nothing — no error, no
    // warning, which is the failure mode this whole file exists to catch.
    const layout = readFileSync(join(__dirname, "..", "app", "_layout.tsx"), "utf8");

    expect(layout).toMatch(/from "react-native-keyboard-controller"/);
    expect(layout).toMatch(/<KeyboardProvider>/);
  });

  it("lets a tap outside the field put the keyboard away", () => {
    // `handled` dismisses on a tap the page did not use, while still letting
    // the submit button take the first tap rather than spending it on a
    // dismiss. `never` would break the second half.
    const scroll = readFileSync(join(__dirname, "..", "components", "FormScroll.tsx"), "utf8");

    expect(scroll).toMatch(/keyboardShouldPersistTaps="handled"/);
  });

  it("keeps the pinned action reachable without dismissing the keyboard", () => {
    // The pickup escalation needs a sentence *and* the button that files it.
    const bar = readFileSync(join(__dirname, "..", "components", "StickyActionBar.tsx"), "utf8");

    expect(bar).toMatch(/<KeyboardStickyView/);
    // The bar's own height is fed back to the scroll, so a focused field clears
    // the bar as well as the keyboard.
    expect(bar).toMatch(/onHeight/);
  });
});
