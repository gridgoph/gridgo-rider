import type { BottomTabBarProps } from "expo-router/js-tabs";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { readFileSync } from "fs";
import { join } from "path";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  GridgoTabBar,
  TAB_BAR_MIN_BOTTOM_GAP,
  TAB_LABEL_BOX,
  TAB_ICON_SIZE,
  tabBarActionOverhang,
  tabBarHeight,
  tabBarMetrics,
  tabBarPaddingBottom,
  tabBarTopGap,
} from "@/components/GridgoTabBar";
import { TABS } from "@/constants/tabs";
import type { VerificationStatus } from "@/lib/api";
import { useSession } from "@/store/session";

const navigate = jest.fn();
const emit = jest.fn(() => ({ defaultPrevented: false }));

/**
 * The bar reads three things off the navigator: the route list, which index is
 * open, and the two navigation callbacks. Everything else in `BottomTabBarProps`
 * belongs to the navigator, so the cast keeps the fixture to what is actually
 * exercised rather than restating React Navigation's internals.
 *
 * The fixture's route list is `TABS`, exactly what `app/(tabs)/_layout.tsx`
 * registers.
 */
function tabBarProps(openIndex: number): BottomTabBarProps {
  return {
    state: {
      index: openIndex,
      routes: TABS.map((tab) => ({ key: `${tab.name}-key`, name: tab.name })),
    },
    navigation: { emit, navigate },
  } as unknown as BottomTabBarProps;
}

/**
 * `useSafeAreaInsets` needs a provider. Defaults to iPhone-with-home-indicator
 * metrics; `bottomInset` stands in for a device that reserves a different
 * amount, which is the only way to see an Android gesture or three-button bar
 * without an Android phone — web reports a zero inset and always will.
 */
function renderInSafeArea(ui: ReactElement, bottomInset = 34) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: bottomInset },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

/**
 * Sign the bar in as a rider at a given point in accreditation.
 *
 * A signed-out store reads as approved on purpose — see
 * `verificationStatusOf` — which is what every other case here relies on.
 */
function signedInAs(verificationStatus: VerificationStatus) {
  useSession.setState({
    user: { id: "user_rider", role: "rider", verificationStatus } as never,
  });
}

describe("GridgoTabBar", () => {
  beforeEach(() => {
    navigate.mockClear();
    emit.mockClear();
    useSession.setState({ user: null });
  });

  it("draws five destination tabs and no Find work disc", () => {
    expect(TABS.map((tab) => tab.name)).toEqual([
      "offers",
      "active",
      "map",
      "earnings",
      "account",
    ]);
  });

  it("labels every destination, so none is an icon alone", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    expect(screen.queryAllByRole("tab")).toHaveLength(5);
    for (const tab of TABS) {
      expect(screen.getByText(tab.label)).toBeTruthy();
    }
    expect(screen.queryByText("Find work")).toBeNull();
    expect(screen.queryByTestId("tab-action-disc")).toBeNull();
  });

  describe("an account Operations is still reviewing", () => {
    it("keeps every destination, because accreditation is a header chip, not a missing tab", async () => {
      signedInAs("pending");

      await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

      expect(screen.queryAllByRole("tab")).toHaveLength(5);
      for (const tab of TABS) {
        expect(screen.getByRole("tab", { name: tab.label })).toBeTruthy();
      }
    });

    it("still navigates, because the destinations are not what is withheld", async () => {
      signedInAs("pending");

      await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);
      fireEvent.press(screen.getByRole("tab", { name: "Earnings" }));

      expect(navigate).toHaveBeenCalledWith("earnings");
    });
  });

  it("marks only the open tab as selected", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(1)} />);

    expect(
      screen.getByRole("tab", { name: TABS[1].label, selected: true }),
    ).toBeTruthy();
    expect(screen.queryAllByRole("tab", { selected: true })).toHaveLength(1);
  });

  it("navigates to a tab that is not open", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Earnings" }));

    expect(navigate).toHaveBeenCalledWith("earnings");
  });

  it("stays put when the open tab is pressed again", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Offers" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("honours a tabPress handler that prevents the default", async () => {
    emit.mockReturnValueOnce({ defaultPrevented: true });

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Active" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  describe("bottom padding: the platform's reservation is the breathing room", () => {
    it("lets a platform inset be the whole breathing room", () => {
      // Not `inset + gap`. A home-indicator iPhone's 34pt keep-out is already
      // the bar's breathing room, and Android's ~24/~48 is already Material's.
      expect(tabBarPaddingBottom(34)).toBe(34);
      expect(tabBarPaddingBottom(24)).toBe(24);
      expect(tabBarPaddingBottom(48)).toBe(48);
    });

    it("stands in with the design gap where the platform reserves nothing", () => {
      expect(tabBarPaddingBottom(0)).toBe(TAB_BAR_MIN_BOTTOM_GAP);
    });

    it("floors at the design gap, not at zero", () => {
      // A `> 0` test would hand a 2dp inset a 2dp gap — a bar that gets shorter
      // as the device reserves more.
      expect(tabBarPaddingBottom(2)).toBe(TAB_BAR_MIN_BOTTOM_GAP);
      expect(tabBarPaddingBottom(8)).toBe(TAB_BAR_MIN_BOTTOM_GAP);
    });

    it("never shrinks as the platform reserves more", () => {
      const insets = [0, 2, 8, 16, 24, 34, 48];
      for (const inset of insets) {
        expect(tabBarPaddingBottom(inset)).toBeGreaterThanOrEqual(inset);
      }
      const heights = insets.map((inset) => tabBarPaddingBottom(inset));
      expect([...heights].sort((a, b) => a - b)).toEqual(heights);
    });

    it("is one rule: the platform never enters the formula", () => {
      // The platform decides what the inset is, and what the row above it
      // measures — never what is done with the inset.
      expect(tabBarPaddingBottom).toHaveLength(1);
    });
  });

  describe("tabBarHeight — every device case, both platforms", () => {
    // The bar's whole height: the platform's content row plus what sits under
    // it. Android is edge-to-edge, so `navigationBars` reaches JS in both
    // navigation modes — a three-button phone reports ~48dp, not zero.
    it.each([
      ["iPhone with a home indicator", "ios", 34, 83],
      ["iPhone with a home button", "ios", 0, 57],
      ["Android, gesture navigation", "android", 24, 104],
      ["Android, three-button navigation", "android", 48, 128],
      ["Android or web, no inset", "android", 0, 88],
    ])("%s", (_device, os, inset, expected) => {
      expect(tabBarHeight(os, inset)).toBe(expected);
    });

    it("puts a home-indicator iPhone on UIKit's own 83pt", () => {
      // 49pt content row + the 34pt inset, which is the platform's own total —
      // and the same number gridgo-client and gridgo-supplier land on.
      expect(tabBarHeight("ios", 34)).toBe(49 + 34);
      expect(tabBarMetrics("ios").columnHeight).toBe(49);
    });

    it("keeps Material's 80dp container above the system inset, not inside it", () => {
      for (const inset of [0, 24, 48]) {
        expect(tabBarHeight("android", inset)).toBe(80 + tabBarPaddingBottom(inset));
      }
      // Android's approved heights, unmoved.
      expect(tabBarHeight("android", 48)).toBe(128);
      expect(tabBarHeight("android", 24)).toBe(104);
    });
  });

  describe("tabBarMetrics", () => {
    it("gives iOS the Human Interface Guidelines 49pt row", () => {
      const m = tabBarMetrics("ios");
      expect(m.columnHeight).toBe(49);
      // 4 + 24 icon + 2 + 16 label + 3 = 49, the row exactly.
      expect(m.itemPaddingTop + 24 + m.itemGap + TAB_LABEL_BOX + m.itemPaddingBottom).toBe(49);
    });

    it("gives Android the Material 3 80dp container on the fleet's item padding", () => {
      const m = tabBarMetrics("android");
      expect(m).toEqual({
        columnHeight: 80,
        // 12 and 16, which is what gridgo-client and gridgo-supplier use. This
        // bar shipped 8 and 8; that is what sat its icons too high.
        itemPaddingTop: 12,
        itemGap: 4,
        itemPaddingBottom: 16,
        actionDiameter: 56,
      });
      // The label box that keeps every column's label on one line: 48..64.
      expect(m.columnHeight - m.itemPaddingBottom - TAB_LABEL_BOX).toBe(48);
    });

    it("keeps every labelled column on the 44dp touch floor", () => {
      // The column is the target, and the padding sits *under* it, so no inset
      // can shrink it.
      for (const os of ["ios", "android"]) {
        expect(tabBarMetrics(os).columnHeight).toBeGreaterThanOrEqual(44);
      }
    });
  });

  describe("the raised action on a row too short to hold it", () => {
    it("rises above Android's 80dp column too, which is what breaks the hairline", () => {
      // 56 disc + 16 label + 16 pad = 88 against an 80dp column. On the old
      // 8dp padding this was exactly 80 and overhung nothing, which is why a
      // transparent strip had to be left at the top of the column to fake the
      // break — the strip that pushed every item's icon toward the edge.
      expect(tabBarActionOverhang("android")).toBe(8);
    });

    it("rises above iOS's 49pt row rather than shrinking or losing its label", () => {
      // 44 + 16 + 3 = 63 against a 49pt row.
      expect(tabBarActionOverhang("ios")).toBe(14);
    });

    it("does not measure the overhang into the bar's height", () => {
      // The whole point: the disc is drawn above the row, never inside it, so
      // iOS stays on UIKit's 83pt with the disc raised.
      expect(tabBarHeight("ios", 34)).toBe(83);
      expect(tabBarActionOverhang("ios")).toBeGreaterThan(0);
    });

    it("keeps the action's label on the same line as its neighbours", () => {
      // Both column kinds bottom-align, and both reserve the same label box
      // above the same bottom padding — which is what puts the verb on the
      // destinations' line on either platform.
      for (const os of ["ios", "android"]) {
        const m = tabBarMetrics(os);
        expect(m.columnHeight - m.itemPaddingBottom - TAB_LABEL_BOX).toBeGreaterThan(0);
      }
    });

    it("matches gridgo-client's disc on each platform", () => {
      expect(tabBarMetrics("ios").actionDiameter).toBe(44);
      expect(tabBarMetrics("android").actionDiameter).toBe(56);
    });
  });

  describe("the gap above the icon, measured from the painted edge", () => {
    // The captain's report: the items sat too close to the top edge against
    // gridgo-supplier. These are the supplier's own numbers, and this bar must
    // land on them exactly — the whole point of the fix.
    it.each([
      ["iOS", "ios", 4],
      ["Android", "android", 20],
    ])("matches gridgo-supplier on %s", (_platform, os, expected) => {
      expect(tabBarTopGap(os)).toBe(expected);
    });

    it("is the room left above the content once the bottom padding is taken", () => {
      // Spelled out, because `itemPaddingTop` looks like the term that sets
      // this and is not: every column bottom-aligns, so the top padding is
      // slack the layout absorbs.
      for (const os of ["ios", "android"]) {
        const m = tabBarMetrics(os);
        const content = TAB_ICON_SIZE + m.itemGap + TAB_LABEL_BOX;
        expect(tabBarTopGap(os)).toBe(m.columnHeight - m.itemPaddingBottom - content);
      }
    });

    it("never lets an icon sit above the hairline", () => {
      // What iOS actually did before: a 10pt strip over a 4pt gap put the
      // icons 6pt *above* the painted edge.
      for (const os of ["ios", "android"]) {
        expect(tabBarTopGap(os)).toBeGreaterThan(0);
      }
    });

    it("leaves the approved bar heights untouched", () => {
      // Fixing the gap moved the painted edge and the bottom padding, never
      // the totals — those are the captain's, and settled.
      expect(tabBarHeight("ios", 34)).toBe(83);
      expect(tabBarHeight("ios", 0)).toBe(57);
      expect(tabBarHeight("android", 24)).toBe(104);
      expect(tabBarHeight("android", 48)).toBe(128);
      expect(tabBarHeight("android", 0)).toBe(88);
    });
  });

  describe("the bar as rendered", () => {
    it.each([
      ["Android, three-button navigation", 48, 48],
      ["Android, gesture navigation", 24, 24],
      ["iPhone with a home indicator", 34, 34],
      ["iPhone with a home button", 0, TAB_BAR_MIN_BOTTOM_GAP],
    ])("wires the reported inset through to the bar: %s", async (_device, inset, expected) => {
      // The arithmetic above is only worth anything if the bar actually reads
      // the device's inset. Web reports zero and cannot show either Android
      // case, so this is where those two are checked.
      await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />, inset);

      const style = StyleSheet.flatten(screen.getByTestId("gridgo-tab-bar").props.style);
      expect(style.paddingBottom).toBe(expected);
    });

    it("paints the surface across the whole bar, as gridgo-supplier does", () => {
      // No transparent strip at the top of the column any more: the painted
      // edge and the layout edge are the same line, which is what makes the gap
      // above the icons comparable with the supplier's at all.
      //
      // Read from the source rather than the rendered tree, because the class
      // that positions it is compiled by NativeWind and never reaches the node
      // as an inline style — a render assertion here passes on `undefined`.
      const source = readFileSync(
        join(__dirname, "..", "GridgoTabBar.tsx"),
        "utf8",
      );
      expect(source).toContain('className="absolute inset-0 border-t border-outline bg-surface"');
      expect(source).not.toMatch(/absolute inset-x-0 bottom-0 border-t/);
      expect(source).not.toMatch(/\bactionRise\b\s*[,:}]/);
    });
  });
});
