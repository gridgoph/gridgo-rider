import { act, renderHook } from "@testing-library/react-native";

import { useIncomingCalls } from "@/hooks/useIncomingCalls";
import { invalidate } from "@/lib/live";
import type { OrderCall } from "@/lib/orderCalls";
import { useActiveTrip } from "@/store/activeTrip";
import { setCallSessionDeps, useCall } from "@/store/call";
import { useSession } from "@/store/session";

/**
 * Ringing with the app open: the stream's `calls` pointer, or any broader
 * refresh, reads the order's calls and rings only for one still ringing in.
 */

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockList = jest.fn();
const mockAction = jest.fn(async (..._args: unknown[]) => ringing({ state: "declined" }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listOrderCalls: (...args: unknown[]) => mockList(...args),
  orderCallAction: (...args: unknown[]) => mockAction(...args),
}));

const startRinging = jest.fn(() => () => undefined);

function ringing(patch: Partial<OrderCall> = {}): OrderCall {
  return {
    id: "c1",
    orderId: "ord_1",
    pair: "delivery",
    state: "ringing",
    caller: { firstName: "Alex", role: "client" },
    callee: { firstName: "Sam", role: "rider" },
    mine: false,
    createdAt: new Date().toISOString(),
    ringExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
    ...patch,
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setCallSessionDeps(() => ({
    api: {
      ...jest.requireActual("@/lib/api"),
      getOrderCall: () => new Promise(() => undefined),
      orderCallAction: mockAction,
    },
    webrtc: null,
    audio: { startRinging, routeCallAudio: async () => undefined, releaseCallAudio: async () => undefined },
  }));
  useCall.getState().reset();
  useSession.setState({ user: { id: "u1", email: "r@example.ph", name: "Sam", role: "rider", verificationStatus: "approved" } as never });
  useActiveTrip.setState({
    order: { id: "ord_1", state: "picked_up", deliveryChat: { status: "open", closesAt: null, retentionHours: 24 } } as never,
  });
});

afterAll(() => setCallSessionDeps(null));

it("rings and opens the call screen when the stream says the order's calls changed", async () => {
  mockList.mockResolvedValue([ringing()]);
  const hook = await renderHook(() => useIncomingCalls());
  await act(async () => invalidate("calls", "ord_1"));
  await settle();

  expect(mockList).toHaveBeenCalledWith("ord_1");
  expect(startRinging).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/call");
  expect(useCall.getState().snapshot).toMatchObject({ phase: "incoming", direction: "incoming" });

  // The same pointer again, or the fallback tick, never rings the same call twice.
  await act(async () => invalidate("calls", "ord_1"));
  await act(async () => invalidate("*"));
  await settle();
  expect(startRinging).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it("checks the trip in hand on a broad refresh, and ignores the rider's own or expired calls", async () => {
  mockList.mockResolvedValue([ringing({ mine: true }), ringing({ id: "c2", ringExpiresAt: new Date(Date.now() - 1).toISOString() })]);
  const hook = await renderHook(() => useIncomingCalls());
  await act(async () => invalidate("*"));
  await settle();
  expect(mockList).toHaveBeenCalledWith("ord_1");
  expect(startRinging).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  await hook.unmount();
});

it("declines a second call while one is already going, rather than ringing over it", async () => {
  mockList.mockResolvedValue([ringing()]);
  const hook = await renderHook(() => useIncomingCalls());
  await act(async () => invalidate("calls", "ord_1"));
  await settle();

  mockList.mockResolvedValue([ringing({ id: "c2", pair: "pickup", caller: { firstName: "Mika", role: "supplier" } })]);
  await act(async () => invalidate("calls", "ord_1"));
  await settle();
  expect(mockAction).toHaveBeenCalledWith("ord_1", "c2", "decline");
  expect(startRinging).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it("does not ring for an unapproved rider", async () => {
  useSession.setState({ user: { id: "u1", email: "r@example.ph", name: "Sam", role: "rider", verificationStatus: "pending" } as never });
  mockList.mockResolvedValue([ringing()]);
  const hook = await renderHook(() => useIncomingCalls());
  await act(async () => invalidate("calls", "ord_1"));
  await settle();
  expect(mockList).not.toHaveBeenCalled();
  await hook.unmount();
});
