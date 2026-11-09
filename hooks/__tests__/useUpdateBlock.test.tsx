import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import { useUpdateBlock } from "@/hooks/useUpdateRequired";
import * as api from "@/lib/api";
import type { Order } from "@/lib/api";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";
import { resetUpdateRequiredForTests, useUpdateRequired } from "@/store/updateRequired";

/*
  Mid-trip the update never takes the app: the job, its location sharing and
  anything typed stay as they are, and only the custody step closes. Only a
  current, successful, idle trip read (`tripProvedIdle`, shared with the Play
  restart prompt) lets the block cover the whole app.
*/

const rider = { id: "user_rider", role: "rider" } as never;
const assigned = { id: "ord_1", riderId: "user_rider", state: "rider_assigned" } as Order;

/** One trip read, answered by `reply`. */
async function read(reply: () => Promise<Order[]>, mode: "load" | "refresh" = "load") {
  jest.spyOn(api, "listOrders").mockImplementationOnce(reply);
  await act(async () => {
    await useActiveTrip.getState().refresh("user_rider", mode);
  });
}

const originalAppState = AppState.currentState;

beforeEach(() => {
  AppState.currentState = "active";
  resetUpdateRequiredForTests();
  useActiveTrip.getState().clear();
  useActiveTrip.setState({ appState: "active" });
  useSession.setState({ user: null });
});
afterEach(() => {
  jest.restoreAllMocks();
  AppState.currentState = originalAppState;
});

it("blocks nothing while the build is current", async () => {
  const { result } = await renderHook(() => useUpdateBlock());
  expect(result.current).toBeNull();
});

it("covers the whole app signed out, and signed in once a read proves no job", async () => {
  useUpdateRequired.setState({ refused: true });
  const signedOut = await renderHook(() => useUpdateBlock());
  expect(signedOut.result.current).toBe("full");

  useSession.setState({ user: rider });
  await read(async () => []);
  const idle = await renderHook(() => useUpdateBlock());
  expect(idle.result.current).toBe("full");
});

it("closes only the steps while a job is in hand, or before the first read", async () => {
  useUpdateRequired.setState({ installed: { versionCode: 146, versionName: "1.0.146" }, minimum: 161 });
  useSession.setState({ user: rider });
  const loading = await renderHook(() => useUpdateBlock());
  expect(loading.result.current).toBe("steps");

  await read(async () => [assigned]);
  const carrying = await renderHook(() => useUpdateBlock());
  expect(carrying.result.current).toBe("steps");
});

describe("a trip read that is not a current, successful answer is not 'no job'", () => {
  beforeEach(() => {
    useUpdateRequired.setState({ installed: { versionCode: 146, versionName: "1.0.146" }, minimum: 161 });
    useSession.setState({ user: rider });
  });

  it.each([
    ["a 500", () => new api.ApiError(500, { error: "internal_error" })],
    ["a lost connection", () => new TypeError("Network request failed")],
  ])("keeps the trip usable after %s on the first read", async (_what, failure) => {
    await read(async () => {
      throw failure();
    });
    expect(useActiveTrip.getState()).toMatchObject({ order: null, loaded: true });
    const { result } = await renderHook(() => useUpdateBlock());
    expect(result.current).toBe("steps");
  });

  it("covers the app again once a later read answers with no job", async () => {
    await read(async () => {
      throw new api.ApiError(500, {});
    });
    await read(async () => []);
    expect((await renderHook(() => useUpdateBlock())).result.current).toBe("full");
  });

  it("keeps the trip usable while a later read is pending after an empty one", async () => {
    await read(async () => []);
    const { result } = await renderHook(() => useUpdateBlock());
    expect(result.current).toBe("full");

    // Back in front, the next read has gone out and not answered.
    jest.spyOn(api, "listOrders").mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      void useActiveTrip.getState().refresh("user_rider", "refresh");
    });
    expect(useActiveTrip.getState()).toMatchObject({ order: null, loaded: true, reconciling: true });
    expect(result.current).toBe("steps");
  });

  it("keeps the trip usable after a foreground return, until the trip is read again", async () => {
    await read(async () => []);
    const { result } = await renderHook(() => useUpdateBlock());
    expect(result.current).toBe("full");

    AppState.currentState = "background";
    await act(async () => useActiveTrip.getState().syncAppState("background"));
    AppState.currentState = "active";
    await act(async () => useActiveTrip.getState().syncAppState("active"));
    expect(result.current).toBe("steps");

    await read(async () => [], "refresh");
    expect(result.current).toBe("full");
  });

  it("keeps the trip usable while an offer acceptance is in flight", async () => {
    await read(async () => []);
    const { result } = await renderHook(() => useUpdateBlock());
    let settle = () => {};
    await act(async () => {
      settle = useActiveTrip.getState().beginOfferAcceptance();
    });
    expect(result.current).toBe("steps");
    await act(async () => settle());
    // Settled, but the job may now be this rider's: only a new read decides.
    expect(result.current).toBe("steps");
    await read(async () => [], "refresh");
    expect(result.current).toBe("full");
  });
});
