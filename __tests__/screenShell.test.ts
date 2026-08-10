import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * `className` only reaches components NativeWind actually replaces.
 *
 * The Metro alias swaps `react-native`'s exports for styled ones. Anything from
 * another package — `SafeAreaView` above all — keeps its own implementation and
 * silently ignores `className`. There is no error and no warning: the class
 * simply never applies.
 *
 * That cost the whole app once. `gg-screen` carries `flex-1`, so a screen shell
 * that lost it collapsed to the height of its own insets, every `flex: 1` child
 * inside measured zero, and the phone rendered a blank canvas — black in Dark.
 * Web was fine throughout, because react-native-web hands `className` to the
 * DOM where the compiled stylesheet applies it for real. So the bug was
 * invisible to every check that did not run on a device.
 *
 * A unit test cannot catch it either: Jest renders the tree, not the layout.
 * So this reads the source instead.
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

describe("styling reaches the components it is written on", () => {
  it("finds source to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("never hands a className to a component NativeWind does not style", () => {
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const hits = source.match(/<SafeAreaView[^>]*className=/gs) ?? [];
      return hits.length ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });

  it("opens every screen with the shared shell rather than a raw SafeAreaView", () => {
    // components/Screen.tsx is the one place allowed to touch it.
    const offenders = files
      .filter((file) => !file.endsWith(join("components", "Screen.tsx")))
      .filter((file) => /from "react-native-safe-area-context"/.test(readFileSync(file, "utf8")))
      .filter((file) => /\bSafeAreaView\b/.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });
});
