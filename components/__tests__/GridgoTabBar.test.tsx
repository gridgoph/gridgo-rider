import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  GridgoTabBar,
  TAB_BAR_METRICS,
  TAB_BAR_MIN_BOTTOM_GAP,
  TAB_LABEL_BOX,
  tabBarActionOverhang,
  tabBarHeight,
  tabBarMetrics,
  tabBarPaddingBottom,
} from "@/components/GridgoTabBar";
import { ACTION_TAB, DESTINATION_TABS, TABS } from "@/constants/tabs";
import { useActiveTrip } from "@/store/activeTrip";

const navigate = jest.fn();
const emit = jest.fn(() => ({ defaultPrevented: false }));
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: "medium" },
}));

/**
 * The bar reads three things off the navigator: the route list, which index is
 * open, and the two navigation callbacks. Everything else in `BottomTabBarProps`
 * belongs to the navigator, so the cast keeps the fixture to what is actually
 * exercised rather than restating React Navigation's internals.
 *
 * The navigator only knows about destinations — the action column is not a
 * screen — so the fixture's route list is `DESTINATION_TABS`, exactly what
 * `app/(tabs)/_layout.tsx` registers.
 */
function tabBarProps(openIndex: number): BottomTabBarProps {
  return {
    state: {
      index: openIndex,
      routes: DESTINATION_TABS.map((tab) => ({ key: `${tab.name}-key`, name: tab.name })),
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

describe("GridgoTabBar", () => {
  beforeEach(() => {
    navigate.mockClear();
    emit.mockClear();
    mockPush.mockClear();
    useActiveTrip.getState().clear();
  });

  it("draws five columns: four destinations around one action", () => {
    expect(TABS).toHaveLength(5);
    expect(TABS[2].name).toBe(ACTION_TAB);
    expect(DESTINATION_TABS.map((tab) => tab.name)).toEqual([
      "offers",
      "active",
      "earnings",
      "account",
    ]);
  });

  it("labels every destination, so none is an icon alone", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    for (const tab of DESTINATION_TABS) {
      expect(screen.getByText(tab.label)).toBeTruthy();
    }
  });

  it("labels the action with its verb, because the verb changes with the job", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    // No trip in hand — the only move a rider has is to take one.
    expect(screen.getByText("Find work")).toBeTruthy();
    expect(screen.getByTestId("tab-action-disc")).toBeTruthy();
  });

  it("marks only the open tab as selected", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(1)} />);

    expect(
      screen.getByRole("tab", { name: DESTINATION_TABS[1].label, selected: true }),
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

  it("the action disc performs the job's next step, carrying the order id", async () => {
    useActiveTrip.getState().setOrder({
      id: "ord_1",
      state: "rider_assigned",
      riderId: "user_rider",
      timeline: [],
    } as never);

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    expect(screen.getByText("Check it")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tab-action-disc"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/trip/pickup",
      params: { orderId: "ord_1" },
    });
    // The disc is an action, not a destination: it never drives the tab state.
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

    it("gives Android the Material 3 80dp container, with nothing moved", () => {
      const m = tabBarMetrics("android");
      expect(m).toEqual({
        columnHeight: 80,
        itemPaddingTop: 8,
        itemGap: 4,
        itemPaddingBottom: 8,
        actionDiameter: 56,
        actionRise: 16,
      });
      // The label box the captain approved: 56..72 in an 80dp column.
      expect(m.columnHeight - m.itemPaddingBottom - TAB_LABEL_BOX).toBe(56);
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
    it("sits flush inside Android's 80dp column, overhanging nothing", () => {
      // 56 disc + 16 label + 8 pad is exactly 80, so the disc's top is the
      // row's top. This is the shipped Android look and it must not move.
      expect(tabBarActionOverhang("android")).toBe(0);
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

    it("gives the action column the running platform's row height and disc", async () => {
      await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

      const style = StyleSheet.flatten(screen.getByTestId("tab-action-disc").props.style);
      expect(style.height).toBe(TAB_BAR_METRICS.columnHeight);
      expect(style.paddingBottom).toBe(TAB_BAR_METRICS.itemPaddingBottom);
    });

    it("offsets the painted surface so the disc breaks the hairline", () => {
      // The surface starts `actionRise` below the row top; that strip stays
      // transparent and the disc paints across it on both platforms.
      expect(tabBarMetrics("android").actionRise).toBe(16);
      expect(tabBarMetrics("ios").actionRise).toBe(10);
      for (const os of ["ios", "android"]) {
        const m = tabBarMetrics(os);
        expect(m.actionRise).toBeGreaterThan(0);
        expect(m.actionRise).toBeLessThan(m.columnHeight);
      }
    });
  });
});
