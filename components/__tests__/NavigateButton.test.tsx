import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { NavigateButton } from "@/components/NavigateButton";
import { NextStopCard } from "@/components/NextStopCard";
import { TripStepHeader } from "@/components/TripStepHeader";
import type { Order } from "@/lib/api";
import { copyAddress } from "@/lib/copyAddress";
import { GRIDGO_OFFICE } from "@/lib/gridgoOffice";
import { googleMapsDirectionsUrl } from "@/lib/mapsNavigation";
import { nextStop } from "@/lib/tripNav";
import { useSession } from "@/store/session";

jest.mock("@/lib/copyAddress", () => ({ copyAddress: jest.fn() }));

const order = {
  id: "ord_1", title: "Flyers", riderId: "rider_1", state: "rider_assigned",
  pickup: { lat: 7.064123, lng: 125.608567, label: "Shop & print" },
  dropoff: { lat: 7.047123, lng: 125.586789, label: "Client door" },
  fulfillmentMode: "delivery",
} as Order;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.mocked(copyAddress).mockReset().mockResolvedValue(undefined);
  jest.spyOn(Linking, "openURL").mockReset().mockResolvedValue(undefined);
  useSession.setState({ user: { id: "rider_1", role: "rider" } as never });
});

it.each(["pickup", "dropoff"] as const)("opens the exact %s pin from the proof header", async (stopKind) => {
  const stop = order[stopKind]!;
  await render(<TripStepHeader order={order} stopKind={stopKind} stopLabel={stop.label} />);
  const button = screen.getByRole("button", { name: "Navigate" });
  expect(button.props.accessibilityHint).toContain(stop.label);
  await fireEvent.press(button);
  expect(Linking.openURL).toHaveBeenCalledWith(
    `https://www.google.com/maps/dir/?api=1&destination=${stop.lat}%2C${stop.lng}&travelmode=driving`,
  );
  expect(screen.queryByText("Copy address")).toBeNull();
});

it.each(["pickup_checks", "delivery_proof"] as const)("navigates to the active card's %s stop", async (phase) => {
  const stop = nextStop(order, phase)!;
  await render(
    <NextStopCard kind={stop.cardKind} heading={stop.heading} address={stop.label} routeSummary="Waiting for GPS">
      <NavigateButton order={order} stopKind={stop.cardKind} />
    </NextStopCard>,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Navigate" }));
  const point = stop.cardKind === "pickup" ? order.pickup! : order.dropoff!;
  expect(Linking.openURL).toHaveBeenCalledWith(
    `https://www.google.com/maps/dir/?api=1&destination=${point.lat}%2C${point.lng}&travelmode=driving`,
  );
});

it("uses the map's GRIDGO Office pin for a collection job", async () => {
  await render(<NavigateButton order={{ ...order, fulfillmentMode: "pickup", dropoff: null }} stopKind="dropoff" />);
  await fireEvent.press(screen.getByRole("button", { name: "Navigate" }));
  expect(Linking.openURL).toHaveBeenCalledWith(
    `https://www.google.com/maps/dir/?api=1&destination=${GRIDGO_OFFICE.lat}%2C${GRIDGO_OFFICE.lng}&travelmode=driving`,
  );
});

it("recovers from a rejected open with a copy action and supports retry", async () => {
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error("No handler"));
  await render(<NavigateButton order={order} stopKind="pickup" />);
  await fireEvent.press(screen.getByRole("button", { name: "Navigate" }));
  expect(screen.getByText(/Could not open Google Maps/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Copy address" }));
  expect(copyAddress).toHaveBeenCalledWith("Shop & print");
  expect(screen.getByText("Address copied.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Navigate" }));
  expect(screen.queryByText("Copy address")).toBeNull();
});

it("keeps the address selectable if copying fails", async () => {
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error("No handler"));
  jest.mocked(copyAddress).mockRejectedValueOnce(new Error("Unavailable"));
  await render(<NavigateButton order={order} stopKind="dropoff" />);
  await fireEvent.press(screen.getByRole("button", { name: "Navigate" }));
  await fireEvent.press(screen.getByRole("button", { name: "Copy address" }));
  expect(screen.getByText(/Could not copy/)).toBeTruthy();
  expect(screen.getByText("Client door").props.selectable).toBe(true);
});

it.each([null, "another_rider"])("hides all navigation for assignment %s", async (riderId) => {
  await render(<NavigateButton order={{ ...order, riderId }} stopKind="dropoff" />);
  expect(screen.queryByRole("button")).toBeNull();
});

it.each(["delivered", "cancelled", "awaiting_collection"])("hides navigation after %s", async (state) => {
  await render(<NavigateButton order={{ ...order, state }} stopKind="dropoff" />);
  expect(screen.queryByRole("button")).toBeNull();
});

it("removes failure recovery on reassignment or sign-out", async () => {
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error("No handler"));
  const view = await render(<NavigateButton order={order} stopKind="pickup" />);
  await fireEvent.press(screen.getByRole("button", { name: "Navigate" }));
  await view.rerender(<NavigateButton order={{ ...order, riderId: "another_rider" }} stopKind="pickup" />);
  expect(screen.queryByRole("button")).toBeNull();
  await view.rerender(<NavigateButton order={order} stopKind="pickup" />);
  await act(() => useSession.setState({ user: null }));
  expect(screen.queryByRole("button")).toBeNull();
});

it("never turns a missing pin into a label-based Maps destination", async () => {
  await render(<NavigateButton order={{ ...order, dropoff: null, address: "Client street" }} stopKind="dropoff" />);
  expect(screen.queryByText("Navigate")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Copy address" }));
  expect(copyAddress).toHaveBeenCalledWith("Client street");
  expect(Linking.openURL).not.toHaveBeenCalled();
});

it("rejects malformed pins without rounding valid coordinates", () => {
  expect(googleMapsDirectionsUrl(null)).toBeNull();
  expect(googleMapsDirectionsUrl({ lat: NaN, lng: 125 })).toBeNull();
  expect(googleMapsDirectionsUrl({ lat: 7, lng: 181 })).toBeNull();
  expect(googleMapsDirectionsUrl({ lat: 0, lng: 0 })).toContain("destination=0%2C0");
});
