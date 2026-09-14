import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockListCatalogShops = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react") as typeof import("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listCatalogShops: (...args: unknown[]) => mockListCatalogShops(...args),
}));

jest.mock("@/components/BrowseMap", () => {
  const { Pressable } = require("react-native") as typeof import("react-native");
  return {
    BrowseMap: ({
      onSelectPlace,
    }: {
      onSelectPlace?: (id: string) => void;
    }) => (
      <>
        <Pressable
          testID="browse-map"
          accessibilityLabel="City map"
          onPress={() => onSelectPlace?.("user_lovis_printshop")}
        />
        <Pressable
          testID="browse-map-office"
          accessibilityLabel="GRIDGO Office pin"
          onPress={() => onSelectPlace?.("gridgo-office")}
        />
      </>
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

import { invalidate } from "@/lib/live";
import MapScreen from "@/app/(tabs)/map";

const LIVE_SHOPS = [
  {
    supplierId: "user_lovis_printshop",
    shopName: "Lovis Printshop",
    shop: {
      lat: 7.086767242919336,
      lng: 125.61613995306057,
      label: "Iñigo, Corner Cervantes St, Poblacion, Davao City",
    },
    categories: ["marketing_collateral"],
    itemCount: 8,
  },
  {
    supplierId: "user_jopal_davao",
    shopName: "Jopal Davao",
    shop: {
      lat: 7.0729598559850615,
      lng: 125.62065833216744,
      label: "Door 2 Calderon Bldg., J. Luna St, Poblacion, Davao City",
    },
    categories: ["corporate_event_merch"],
    itemCount: 3,
  },
];

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
  beforeEach(() => {
    mockListCatalogShops.mockReset();
    mockListCatalogShops.mockResolvedValue(LIVE_SHOPS);
  });

  it("is a city map with search, not a route builder", async () => {
    await renderMap(<MapScreen />);

    await waitFor(() => {
      expect(screen.getByText(/GRIDGO print shops/i)).toBeTruthy();
    });

    expect(screen.getByLabelText("City map")).toBeTruthy();
    expect(screen.getByLabelText("Find a shop or the office")).toBeTruthy();
    expect(screen.getByLabelText("Center the map on you")).toBeTruthy();
    expect(screen.queryByText(/stand-in print shops/i)).toBeNull();
    expect(screen.queryByText(/placeholder/i)).toBeNull();
    expect(screen.queryByText(/create route/i)).toBeNull();
  });

  it("lists live catalog shops as you type", async () => {
    await renderMap(<MapScreen />);
    await waitFor(() => expect(mockListCatalogShops).toHaveBeenCalled());

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Find a shop or the office"), "Lovis");
    });

    expect(screen.getByLabelText("Lovis Printshop")).toBeTruthy();
    expect(screen.queryByLabelText("Jopal Davao")).toBeNull();
  });

  it("opens a live shop from the map", async () => {
    await renderMap(<MapScreen />);
    await waitFor(() => expect(mockListCatalogShops).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(screen.getByTestId("browse-map"));
    });

    expect(screen.getByText("Lovis Printshop")).toBeTruthy();
    expect(screen.getByText(/Cervantes St/)).toBeTruthy();
    expect(screen.queryByText(/Directory placeholder/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Close shop details"));
    });

    expect(screen.queryByText("Lovis Printshop")).toBeNull();
    expect(screen.getByLabelText("Find a shop or the office").props.value).toBe("");
    expect(screen.getByLabelText("City map")).toBeTruthy();
    expect(screen.getByLabelText("Center the map on you")).toBeTruthy();
  });

  it("opens GRIDGO Office from its own pin", async () => {
    await renderMap(<MapScreen />);
    await waitFor(() => expect(mockListCatalogShops).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(screen.getByTestId("browse-map-office"));
    });

    expect(screen.getByText("GRIDGO Office")).toBeTruthy();
    expect(screen.getByText(/Poblacion District/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Close office details"));
    });

    expect(screen.queryByText("GRIDGO Office")).toBeNull();
  });

  it("lists the office when you search for it", async () => {
    await renderMap(<MapScreen />);
    await waitFor(() => expect(mockListCatalogShops).toHaveBeenCalled());

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Find a shop or the office"), "office");
    });

    expect(screen.getByLabelText("GRIDGO Office")).toBeTruthy();
    expect(screen.queryByLabelText("Lovis Printshop")).toBeNull();
  });

  it("says so when the catalog cannot be loaded", async () => {
    mockListCatalogShops.mockRejectedValueOnce(new Error("offline"));
    await renderMap(<MapScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Could not load print shops/i)).toBeTruthy();
    });
    expect(screen.getByLabelText("Try loading shops again")).toBeTruthy();
  });
});

it.each(["success", "failure"])("keeps the newest catalog when an old %s arrives late", async (outcome) => {
  jest.useFakeTimers();
  let finish!: (shops: typeof LIVE_SHOPS) => void;
  let fail!: (error: Error) => void;
  mockListCatalogShops.mockReset();
  mockListCatalogShops.mockReturnValueOnce(new Promise((resolve, reject) => { finish = resolve; fail = reject; }))
    .mockResolvedValue(LIVE_SHOPS);
  try {
    await renderMap(<MapScreen />);
    await act(async () => { invalidate("catalog"); await jest.advanceTimersByTimeAsync(100); });
    await fireEvent.changeText(screen.getByLabelText("Find a shop or the office"), "Lovis");
    expect(screen.getByLabelText("Lovis Printshop")).toBeTruthy();
    await act(async () => { if (outcome === "success") finish([]); else fail(new Error("offline")); });
    expect(screen.getByLabelText("Lovis Printshop")).toBeTruthy();
    expect(screen.queryByText(/Could not load print shops/i)).toBeNull();
  } finally { jest.useRealTimers(); }
});
