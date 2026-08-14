import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Every screen a rider can reach must offer a way back.
 *
 * This is enumerated rather than sampled, because "some screens have no Back"
 * is exactly the kind of report that a spot check answers wrongly. A route
 * added without a header — or with one whose back control was never
 * configured — fails here rather than on someone's phone.
 *
 * Two shapes are allowed above the tab shell:
 *
 *  - a pushed screen carrying `multiOriginPushedScreenOptions`, which draws the
 *    platform back control (iOS chevron, Android arrow) and — the part that
 *    matters — never lets the `(tabs)` route group become its label;
 *  - a `confirmSheetScreenOptions` sheet, which has no header and therefore
 *    has to carry a labelled cancel in its own body, in every state.
 *
 * Everything else is a root of the app — the launch redirect, welcome,
 * and onboarding — where there is nothing behind to go back to. Auth
 * screens pushed off welcome use the native stack header.
 */

const APP = join(__dirname, "..", "app");

/** Routes that are the first screen in their own right. */
const ROOTS = new Set([
  "index",
  "sso-callback",
  "(auth)/welcome",
  "onboarding",
  "(tabs)",
]);

function routeFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    // Co-located tests are not routes. Skipping the directory keeps a future
    // `app/__tests__` suite from looking like an undeclared Stack.Screen.
    if (entry === "__tests__") return [];
    if (statSync(path).isDirectory()) return routeFiles(path, `${prefix}${entry}/`);
    if (!entry.endsWith(".tsx") || entry.startsWith("_")) return [];
    return [`${prefix}${entry.replace(/\.tsx$/, "")}`];
  });
}

const layout = readFileSync(join(APP, "_layout.tsx"), "utf8");

/** `<Stack.Screen name="x" options={…} />` → the name and its options text. */
function declaredScreens(): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /<Stack\.Screen\s+name="([^"]+)"([\s\S]*?)\/>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(layout)) !== null) {
    found.set(match[1], match[2]);
  }
  return found;
}

describe("every route is reachable and escapable", () => {
  const screens = declaredScreens();

  it("declares every route file in the root stack", () => {
    // An undeclared route still renders, but with the stack's default header
    // options — which is how a screen ends up without the configured back.
    const undeclared = routeFiles(APP)
      // Tab destinations are declared by the tab shell, which the root stack
      // mounts as the single `(tabs)` screen.
      .filter((route) => !route.startsWith("(tabs)/"))
      .filter((route) => !screens.has(route));
    expect(undeclared).toEqual([]);
  });

  it("gives every pushed screen a configured back control", () => {
    const missing = [...screens.entries()]
      .filter(([name]) => !ROOTS.has(name))
      .filter(
        ([, options]) =>
          !options.includes("multiOriginPushedScreenOptions") &&
          !options.includes("confirmSheetScreenOptions"),
      )
      .map(([name]) => name);

    expect(missing).toEqual([]);
  });

  it("titles the tab shell so iOS can never label a back control '(tabs)'", () => {
    expect(screens.get("(tabs)")).toMatch(/title:\s*"GRIDGO"/);
  });
});

describe("headerless confirmation sheets carry their own way out", () => {
  const sheets = [...declaredScreens().entries()]
    .filter(([, options]) => options.includes("confirmSheetScreenOptions"))
    .map(([name]) => name);

  it("finds the sheets", () => {
    expect(sheets.length).toBeGreaterThan(0);
  });

  it.each(sheets)("%s offers a cancel while loading, on error, and when ready", (name) => {
    const source = readFileSync(join(APP, `${name}.tsx`), "utf8");

    // Loading: the skeleton takes a real cancel rather than drawing a fake one.
    expect(source).toMatch(/ConfirmSheetSkeleton[\s\S]*?cancelLabel=/);
    // Failed to load: an explicit route back to the trip.
    expect(source).toContain("Back to the trip");
    // Ready: the sheet body's own labelled cancel.
    expect(source).toMatch(/cancelLabel=/);
  });
});
