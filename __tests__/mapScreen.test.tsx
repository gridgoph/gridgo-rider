import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("@/components/BrowseMap", () => {
  const { Pressable } = require("react-native") as typeof import("react-native");
  return {
    BrowseMap: ({
      onSelectPlace,
    }: {
      onSelectPlace?: (id: string) => void;
    }) => (
      <Pressable
        testID="browse-map"
        accessibilityLabel="City map"
        onPress={() => onSelectPlace?.("shop-vicenta")}
      />
    ),
  };
});

jest.mock("@/hooks/useRiderLocation", () => ({
  useRiderLocation: () => ({
    coords: { lat: 7.07, lng: 125.61 },
    accuracy: 12,
    fixAtMs: 1,
    permission: "granted",
    error: null,
  }),
}));

import MapScreen from "@/app/(tabs)/map";
import { PLACEHOLDER_SHOPS } from "@/data/placeholderShops";

function renderMap(ui: ReactElement) {
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

describe("Map tab", () => {
  it("is a city map with search, not a route builder", async () => {
    await renderMap(<MapScreen />);

    expect(screen.getByLabelText("City map")).toBeTruthy();
    expect(screen.getByLabelText("Search shops or streets")).toBeTruthy();
    expect(screen.getByLabelText("Center the map on you")).toBeTruthy();
    expect(screen.getByText(/stand-in print shops/i)).toBeTruthy();
    expect(screen.getByLabelText("Close map details")).toBeTruthy();
    expect(screen.queryByText(/create route/i)).toBeNull();
    expect(screen.queryByText(/^Routes$/)).toBeNull();
  });

  it("lists placeholder shops from the local directory as you type", async () => {
    await renderMap(<MapScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Search shops or streets"), "Vicenta");
    });

    expect(screen.getByLabelText("Vicenta Print House")).toBeTruthy();
    expect(
      screen.queryByLabelText(
        PLACEHOLDER_SHOPS.find((shop) => shop.id === "shop-buhangin-wide")?.name ?? "",
      ),
    ).toBeNull();
  });

  it("opens a placeholder shop from the map", async () => {
    await renderMap(<MapScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("browse-map"));
    });

    expect(screen.getByText("Vicenta Print House")).toBeTruthy();
    expect(screen.getByText(/Directory placeholder/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Close shop details"));
    });

    expect(screen.queryByText(/Directory placeholder/)).toBeNull();
    expect(screen.queryByText(/stand-in print shops/i)).toBeNull();
    expect(screen.getByLabelText("Search shops or streets").props.value).toBe("");
    expect(screen.getByLabelText("City map")).toBeTruthy();
    // Closing also recenters on the rider — same control the locate button uses.
    expect(screen.getByLabelText("Center the map on you")).toBeTruthy();
  });
});
