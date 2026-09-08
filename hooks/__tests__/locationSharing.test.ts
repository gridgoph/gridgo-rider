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
