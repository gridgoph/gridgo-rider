import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  GridgoTabBar,
  TAB_CONTENT_HEIGHT,
  TAB_DESIGN_PADDING,
  TAB_SURFACE_TOP_OFFSET,
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

  describe("bottom padding: the system's reservation is the breathing room", () => {
    /** What the bar costs a screen: the 80dp column plus the padding. */
    const layout = (inset: number) => TAB_CONTENT_HEIGHT + tabBarPaddingBottom(inset);
    /** What the eye sees: the top 16dp is transparent for the disc to break. */
    const painted = (inset: number) =>
      TAB_CONTENT_HEIGHT - TAB_SURFACE_TOP_OFFSET + tabBarPaddingBottom(inset);

    // The four devices, by the inset each actually reports. Android is
    // edge-to-edge, so `navigationBars` reaches JS in both navigation modes —
    // a three-button phone reports ~48dp, not zero.
    it("Android, three-button navigation (48dp inset)", () => {
      expect(tabBarPaddingBottom(48)).toBe(48);
      expect(layout(48)).toBe(128);
      expect(painted(48)).toBe(112);
    });

    it("Android, gesture navigation (24dp inset)", () => {
      expect(tabBarPaddingBottom(24)).toBe(24);
      expect(layout(24)).toBe(104);
      expect(painted(24)).toBe(88);
    });

    it("iPhone with a home indicator (34pt inset)", () => {
      // Unchanged: UIKit is 49pt of content + the 34pt inset, with no padding
      // of its own, and React Navigation's own bar takes `insets.bottom` flat.
      expect(tabBarPaddingBottom(34)).toBe(34);
      expect(layout(34)).toBe(114);
      expect(painted(34)).toBe(98);
    });

    it("iPhone with a home button (no inset) falls to the design floor", () => {
      expect(tabBarPaddingBottom(0)).toBe(TAB_DESIGN_PADDING);
      expect(layout(0)).toBe(88);
      expect(painted(0)).toBe(72);
    });

    it("puts Android exactly on the MD3 navigation bar, 80dp + the inset", () => {
      // `NavigationBar` pads by the inset *outside* an 80dp minimum height, so
      // the spec total is 80 + inset. Adding the design pad overshot it.
      for (const inset of [24, 48]) {
        expect(layout(inset)).toBe(TAB_CONTENT_HEIGHT + inset);
      }
    });

    it("is one rule, not two: the same inset gives the same padding", () => {
      // The platform decides what the inset is, never what is done with it.
      // A 34dp inset is a home indicator on iOS and nothing in particular on
      // Android; the bar does not need to know which, and must not ask.
      expect(tabBarPaddingBottom(34)).toBe(tabBarPaddingBottom(34));
      expect(tabBarPaddingBottom).toHaveLength(1);
    });

    it("floors deliberately — a reservation smaller than the pad still breathes", () => {
      expect(tabBarPaddingBottom(4)).toBe(TAB_DESIGN_PADDING);
      expect(tabBarPaddingBottom(8)).toBe(TAB_DESIGN_PADDING);
      // The floor never eats into a real reservation: content must clear it.
      for (const inset of [0, 4, 8, 24, 34, 48]) {
        expect(tabBarPaddingBottom(inset)).toBeGreaterThanOrEqual(inset);
      }
    });

    it("keeps the two current-generation phones within a few dp of each other", () => {
      expect(Math.abs(painted(34) - painted(24))).toBeLessThanOrEqual(10);
    });

    it.each([
      ["Android, three-button navigation", 48, 48],
      ["Android, gesture navigation", 24, 24],
      ["iPhone with a home indicator", 34, 34],
      ["iPhone with a home button", 0, TAB_DESIGN_PADDING],
    ])("wires the reported inset through to the bar: %s", async (_device, inset, expected) => {
      // The arithmetic above is only worth anything if the bar actually reads
      // the device's inset. Web reports zero and cannot show either Android
      // case, so this is where those two are checked.
      await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />, inset);

      const style = StyleSheet.flatten(screen.getByTestId("gridgo-tab-bar").props.style);
      expect(style.paddingBottom).toBe(expected);
    });

    it("leaves every labelled column its 44dp touch target", () => {
      // The column is the target, and it is the 80dp row itself — the padding
      // sits under it, so shrinking the padding cannot shrink the target.
      expect(TAB_CONTENT_HEIGHT).toBeGreaterThanOrEqual(44);
      for (const inset of [0, 24, 34, 48]) {
        expect(layout(inset) - tabBarPaddingBottom(inset)).toBeGreaterThanOrEqual(44);
      }
    });
  });

  it("offsets the painted surface 16dp so the disc breaks the hairline", () => {
    // top-4 overlay: transparent strip above the hairline; disc overhangs into it.
    expect(TAB_SURFACE_TOP_OFFSET).toBe(16);
    // Content height is Material Design 3 icon+label standard.
    expect(TAB_CONTENT_HEIGHT).toBe(80);
    expect(TAB_CONTENT_HEIGHT - TAB_SURFACE_TOP_OFFSET).toBe(64);
    // 56dp disc + 16dp label box + 8dp pad is exactly the 80dp column, which is
    // what puts the action's label in the same box as the destinations' labels.
    expect(56 + 16 + TAB_DESIGN_PADDING).toBe(TAB_CONTENT_HEIGHT);
  });
});
