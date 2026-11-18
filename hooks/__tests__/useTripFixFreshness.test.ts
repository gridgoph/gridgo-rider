import { act, renderHook } from "@testing-library/react-native";

import { FRESHNESS_TICK_MS, fixNeedsAttention, useTripFixFreshness } from "@/hooks/useTripFixFreshness";
import type { Order } from "@/lib/api";
import { emptyTripLocation, useTripLocation } from "@/store/tripLocation";

const NOW = new Date("2026-11-18T03:00:00.000Z").getTime();
const toShop = { id: "ord_1", state: "rider_assigned" } as Order;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  useTripLocation.setState({ ...emptyTripLocation, sharing: false, sharingError: null });
});
afterEach(() => jest.useRealTimers());

it("is silent with no job sharing location", async () => {
  const { result } = await renderHook(() => useTripFixFreshness(null));
  expect(result.current).toBeNull();
  const delivered = await renderHook(() => useTripFixFreshness({ ...toShop, state: "delivered" }));
  expect(delivered.result.current).toBeNull();
});

it("ages a fix while nothing new arrives, and names who is watching", async () => {
  useTripLocation.setState({ coords: { lat: 7, lng: 125 }, fixAtMs: NOW - 40_000, permission: "granted" });
  const { result } = await renderHook(() => useTripFixFreshness(toShop));
  expect(result.current?.level).toBe("live");
  await act(async () => jest.advanceTimersByTime(FRESHNESS_TICK_MS));
  expect(result.current?.level).toBe("stale");
  expect(result.current?.label).toMatch(/last fix 45s ago/);
  expect(fixNeedsAttention(result.current)).toBe(true);
});

it("treats location switched off as trouble, and a missing first fix as not yet", async () => {
  useTripLocation.setState({ permission: "denied" });
  const off = await renderHook(() => useTripFixFreshness(toShop));
  expect(off.result.current?.level).toBe("off");
  expect(off.result.current?.detail).toMatch(/The shop cannot see you/);
  expect(fixNeedsAttention(off.result.current)).toBe(true);

  await act(async () => useTripLocation.setState({ permission: "granted" }));
  const waiting = await renderHook(() => useTripFixFreshness(toShop));
  expect(waiting.result.current?.level).toBe("waiting");
  expect(fixNeedsAttention(waiting.result.current)).toBe(false);
});
