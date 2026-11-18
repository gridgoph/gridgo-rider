import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook } from "@testing-library/react-native";

import {
  hydrateRiderOnline,
  parseRiderOnline,
  RIDER_ONLINE_STORAGE_KEY,
  resetRiderOnlineForTests,
  setRiderOnline,
  useIsRiderOnline,
  useRiderOnline,
} from "@/store/riderOnline";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

beforeEach(async () => {
  resetRiderOnlineForTests();
  await AsyncStorage.clear();
});

describe("the online switch", () => {
  it("starts offline for everyone", async () => {
    const { result } = await renderHook(() => useIsRiderOnline("user_rider"));
    expect(result.current).toBe(false);
  });

  it("is remembered per account across a relaunch", async () => {
    setRiderOnline("user_rider", true);
    expect(JSON.parse((await AsyncStorage.getItem(RIDER_ONLINE_STORAGE_KEY)) ?? "{}")).toEqual({ user_rider: true });

    resetRiderOnlineForTests();
    await hydrateRiderOnline();
    expect(useRiderOnline.getState().online).toEqual({ user_rider: true });
    const other = await renderHook(() => useIsRiderOnline("user_other"));
    expect(other.result.current).toBe(false);
  });

  it("keeps a switch flipped before storage answered", async () => {
    await AsyncStorage.setItem(RIDER_ONLINE_STORAGE_KEY, JSON.stringify({ user_rider: true }));
    setRiderOnline("user_rider", false);
    await hydrateRiderOnline();
    expect(useRiderOnline.getState().online.user_rider).toBe(false);
    expect(useRiderOnline.getState().hydrated).toBe(true);
  });

  it("reads anything malformed as offline", () => {
    expect(parseRiderOnline("not json")).toEqual({});
    expect(parseRiderOnline("[true]")).toEqual({});
    expect(parseRiderOnline('{"a":true,"b":"yes"}')).toEqual({ a: true });
    expect(parseRiderOnline(null)).toEqual({});
  });

  it("is nobody's when signed out", async () => {
    setRiderOnline("user_rider", true);
    const { result } = await renderHook(() => useIsRiderOnline(null));
    expect(result.current).toBe(false);
  });
});
