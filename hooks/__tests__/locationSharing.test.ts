import { act, renderHook } from "@testing-library/react-native";
import { useLocationSharing } from "@/hooks/useLocationSharing";
import * as api from "@/lib/api";
jest.mock("@/lib/api", () => ({ postLocation: jest.fn(async () => ({})) }));
describe("original GPS fix time", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());
  it("does not send stale cached coordinates", async () => {
    await renderHook(() => useLocationSharing({orderId:"ord",state:"picked_up",coords:{lat:7,lng:125},fixAtMs:Date.now()-60_000}));
    expect(api.postLocation).not.toHaveBeenCalled();
  });
  it("sends the source timestamp once and never republishes the same fix as fresh", async () => {
    const fixAtMs = Date.now();
    await renderHook(() => useLocationSharing({orderId:"ord",state:"picked_up",coords:{lat:7,lng:125},fixAtMs}));
    expect(api.postLocation).toHaveBeenCalledWith("ord",expect.objectContaining({recordedAt:new Date(fixAtMs).toISOString()}));
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(api.postLocation).toHaveBeenCalledTimes(1);
  });
});

// C2BE8E7A: the shop watches the rider come to it, so the ping starts at acceptance.
describe("pick-up leg", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  it("shares the position from acceptance, before the package is picked up", async () => {
    const fixAtMs = Date.now();
    const { result } = await renderHook(() => useLocationSharing({orderId:"ord",state:"rider_assigned",coords:{lat:7,lng:125},fixAtMs}));
    expect(api.postLocation).toHaveBeenCalledWith("ord",expect.objectContaining({lat:7,lng:125}));
    await act(async () => {});
    expect(result.current.sharing).toBe(true);
  });

  it("never shares before the rider has accepted, or once the job has left their hands", async () => {
    const fixAtMs = Date.now();
    await renderHook(() => useLocationSharing({orderId:"ord",state:"ready_for_dispatch",coords:{lat:7,lng:125},fixAtMs}));
    await renderHook(() => useLocationSharing({orderId:"ord",state:"delivered",coords:{lat:7,lng:125},fixAtMs}));
    expect(api.postLocation).not.toHaveBeenCalled();
  });

  it("goes quiet, without an error, when an older API refuses the pick-up leg", async () => {
    (api.postLocation as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error("tracking_not_active"), { status: 409, body: { error: "tracking_not_active" } }),
    );
    let fixAtMs = Date.now();
    const { result, rerender } = await renderHook(
      (props: { fixAtMs: number }) => useLocationSharing({orderId:"ord",state:"rider_assigned",coords:{lat:7,lng:125},fixAtMs:props.fixAtMs}),
      { initialProps: { fixAtMs } },
    );
    await act(async () => {});
    expect(result.current).toEqual({ sharing: false, lastError: null });
    fixAtMs = Date.now() + 1;
    await rerender({ fixAtMs });
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(api.postLocation).toHaveBeenCalledTimes(1);
  });
});
