import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  GridgoTabBar,
  TAB_CONTENT_HEIGHT,
  TAB_DESIGN_PADDING,
  TAB_SURFACE_TOP_OFFSET,
} from "@/components/GridgoTabBar";
import { ACTION_TAB, TABS } from "@/constants/tabs";

const navigate = jest.fn();
const emit = jest.fn(() => ({ defaultPrevented: false }));

/**
 * The bar reads three things off the navigator: the route list, which index is
 * open, and the two navigation callbacks. Everything else in `BottomTabBarProps`
 * belongs to the navigator, so the cast keeps the fixture to what is actually
 * exercised rather than restating React Navigation's internals.
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
  });

  it("labels every destination, so none is an icon alone", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    for (const tab of TABS.filter((entry) => entry.name !== ACTION_TAB)) {
      expect(screen.getByText(tab.label)).toBeTruthy();
    }
  });

  it("names the action tab for screen readers even though it draws no label", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    const action = TABS.find((tab) => tab.name === ACTION_TAB);
    expect(action).toBeTruthy();
    // Action tab is icon-only on the canvas; a11y label still names the destination.
    expect(screen.queryByText(action!.label)).toBeNull();
    expect(screen.getByRole("tab", { name: action!.label })).toBeTruthy();
  });

  it("marks only the open tab as selected", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(1)} />);

    expect(screen.getByRole("tab", { name: TABS[1].label, selected: true })).toBeTruthy();
    expect(screen.queryAllByRole("tab", { selected: true })).toHaveLength(1);
  });

  it("navigates to a tab that is not open", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Alerts" }));

    expect(navigate).toHaveBeenCalledWith("notifications");
  });

  it("stays put when the open tab is pressed again", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Offers" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("stacks design padding with the system inset rather than Math.max", () => {
    // Design pad is always added to insets.bottom (never Math.max).
    expect(TAB_DESIGN_PADDING).toBe(8);
    // Content height is Material Design 3 icon+label standard.
    expect(TAB_CONTENT_HEIGHT).toBe(80);
  });

  it("offsets the painted surface 16dp so the visible bar matches client (64 + inset + 8)", () => {
    // top-4 overlay: transparent strip above the hairline; disc overhangs into it.
    expect(TAB_SURFACE_TOP_OFFSET).toBe(16);
    // Visible painted height above the design pad (before system inset).
    expect(TAB_CONTENT_HEIGHT - TAB_SURFACE_TOP_OFFSET).toBe(64);
    // Label sits on pb-2 (8dp) above the bar's bottom edge of the content column.
    expect(TAB_DESIGN_PADDING).toBe(8);
  });

  it("honours a tabPress handler that prevents the default", async () => {
    emit.mockReturnValueOnce({ defaultPrevented: true });

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    const action = TABS.find((tab) => tab.name === ACTION_TAB)!;
    fireEvent.press(screen.getByRole("tab", { name: action.label }));

    expect(navigate).not.toHaveBeenCalled();
  });
});
