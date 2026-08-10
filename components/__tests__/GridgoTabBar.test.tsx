import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
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

/** `useSafeAreaInsets` needs a provider; these are iPhone-with-home-indicator metrics. */
function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
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

  describe("bottom padding follows each platform's own bottom-bar spec", () => {
    // The visible painted bar is 64 + padding; see `tabBarPaddingBottom`.
    const PAINTED_ROW = TAB_CONTENT_HEIGHT - TAB_SURFACE_TOP_OFFSET;

    it("gives iOS the safe-area inset and nothing on top of it", () => {
      // UIKit is 49pt of content + the 34pt inset = 83pt, with no padding of
      // its own; React Navigation's own bar does the same. Adding the design
      // pad here is the 8pt of extra bar that was reported as sitting too high.
      expect(tabBarPaddingBottom(34, "ios")).toBe(34);
      expect(PAINTED_ROW + tabBarPaddingBottom(34, "ios")).toBe(98);
    });

    it("still pads an iPhone that has no home indicator to breathe on", () => {
      expect(tabBarPaddingBottom(0, "ios")).toBe(TAB_DESIGN_PADDING);
      expect(PAINTED_ROW + tabBarPaddingBottom(0, "ios")).toBe(72);
    });

    it("stacks the design pad on Android, where the inset is a gesture strip", () => {
      // MD3's 80dp container sits above the system inset, and our painted row
      // is 64. Math.max is still banned: it would hand Android the bare inset.
      expect(tabBarPaddingBottom(24, "android")).toBe(32);
      expect(PAINTED_ROW + tabBarPaddingBottom(24, "android")).toBe(96);
      expect(tabBarPaddingBottom(48, "android")).toBe(56);
      expect(PAINTED_ROW + tabBarPaddingBottom(48, "android")).toBe(120);
      expect(tabBarPaddingBottom(24, "android")).not.toBe(Math.max(24, TAB_DESIGN_PADDING));
    });

    it("keeps the two current-generation phones within a few dp of each other", () => {
      const ios = PAINTED_ROW + tabBarPaddingBottom(34, "ios");
      const android = PAINTED_ROW + tabBarPaddingBottom(24, "android");
      expect(Math.abs(ios - android)).toBeLessThanOrEqual(4);
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
