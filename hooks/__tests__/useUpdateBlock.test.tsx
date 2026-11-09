import { renderHook } from "@testing-library/react-native";

import { useUpdateBlock } from "@/hooks/useUpdateRequired";
import * as api from "@/lib/api";
import type { Order } from "@/lib/api";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";
import { resetUpdateRequiredForTests, useUpdateRequired } from "@/store/updateRequired";

/*
  Mid-trip the update never takes the app: the job, its location sharing and
  anything typed stay as they are, and only the custody step closes.
*/

const rider = { id: "user_rider", role: "rider" } as never;

beforeEach(() => {
  resetUpdateRequiredForTests();
  useActiveTrip.getState().clear();
  useSession.setState({ user: null });
});

it("blocks nothing while the build is current", async () => {
  const { result } = await renderHook(() => useUpdateBlock());
  expect(result.current).toBeNull();
});

it("covers the whole app with no job in hand, signed in or out", async () => {
  useUpdateRequired.setState({ refused: true });
  const signedOut = await renderHook(() => useUpdateBlock());
  expect(signedOut.result.current).toBe("full");

  useSession.setState({ user: rider });
  useActiveTrip.setState({ order: null, loaded: true });
  const idle = await renderHook(() => useUpdateBlock());
  expect(idle.result.current).toBe("full");
});

it("closes only the steps while a job is in hand, or still loading", async () => {
  useUpdateRequired.setState({ installed: { versionCode: 146, versionName: "1.0.146" }, minimum: 161 });
  useSession.setState({ user: rider });
  const loading = await renderHook(() => useUpdateBlock());
  expect(loading.result.current).toBe("steps");

  useActiveTrip.setState({ order: { id: "ord_1" } as Order, loaded: true });
  const carrying = await renderHook(() => useUpdateBlock());
  expect(carrying.result.current).toBe("steps");
});

describe("a trip read that failed is not 'no job'", () => {
  beforeEach(() => {
    useUpdateRequired.setState({ installed: { versionCode: 146, versionName: "1.0.146" }, minimum: 161 });
    useSession.setState({ user: rider });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["a 500", () => new api.ApiError(500, { error: "internal_error" })],
    ["a lost connection", () => new TypeError("Network request failed")],
  ])("keeps the trip usable after %s on the first read", async (_what, failure) => {
    jest.spyOn(api, "listOrders").mockRejectedValue(failure());
    await useActiveTrip.getState().refresh("user_rider");
    expect(useActiveTrip.getState()).toMatchObject({ order: null, loaded: true, readFailed: true });
    const { result } = await renderHook(() => useUpdateBlock());
    expect(result.current).toBe("steps");
  });

  it("covers the app once a read answers: an empty list, or a 403 for a rider who cannot hold jobs", async () => {
    jest.spyOn(api, "listOrders").mockRejectedValueOnce(new api.ApiError(500, {})).mockResolvedValueOnce([]);
    await useActiveTrip.getState().refresh("user_rider");
    await useActiveTrip.getState().refresh("user_rider");
    expect((await renderHook(() => useUpdateBlock())).result.current).toBe("full");

    jest.spyOn(api, "listOrders").mockRejectedValue(new api.ApiError(403, { error: "forbidden" }));
    await useActiveTrip.getState().refresh("user_rider");
    expect((await renderHook(() => useUpdateBlock())).result.current).toBe("full");
  });
});
