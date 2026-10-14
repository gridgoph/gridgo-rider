import { act, renderHook } from "@testing-library/react-native";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { Linking, Platform } from "react-native";

import { readLocationHealth, useLocationHealth } from "@/hooks/useLocationHealth";

const location = Location as jest.Mocked<typeof Location>;
const battery = Battery as jest.Mocked<typeof Battery>;

beforeAll(() => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
});
beforeEach(() => jest.clearAllMocks());

it("reads precision, the location switch and battery settings from the phone", async () => {
  location.getForegroundPermissionsAsync.mockResolvedValueOnce({ status: "granted", canAskAgain: true, android: { accuracy: "coarse" } } as never);
  location.hasServicesEnabledAsync.mockResolvedValueOnce(false);
  battery.isBatteryOptimizationEnabledAsync.mockResolvedValueOnce(true);
  battery.isLowPowerModeEnabledAsync.mockResolvedValueOnce(true);
  await expect(readLocationHealth("android")).resolves.toEqual({
    platform: "android",
    servicesEnabled: false,
    foreground: "granted",
    canAskForeground: true,
    precise: false,
    batteryOptimized: true,
    lowPower: true,
  });
});

it("treats a switch it cannot read as unknown, never as a problem", async () => {
  location.hasServicesEnabledAsync.mockRejectedValueOnce(new Error("no module"));
  battery.isBatteryOptimizationEnabledAsync.mockRejectedValueOnce(new Error("no module"));
  const health = await readLocationHealth("android");
  expect(health.servicesEnabled).toBeNull();
  expect(health.batteryOptimized).toBeNull();
});

it("reads nothing outside a tracked job, and fixes through the phone's own screens", async () => {
  const view = await renderHook((props: { enabled: boolean }) => useLocationHealth({ ...props, watcher: "client" }), { initialProps: { enabled: false } });
  expect(location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(view.result.current.issues).toEqual([]);

  location.getForegroundPermissionsAsync.mockResolvedValue({ status: "denied", canAskAgain: true } as never);
  await view.rerender({ enabled: true });
  await act(async () => {});
  expect(view.result.current.issues.map((issue) => issue.key)).toEqual(["permission_off"]);

  await act(async () => { await view.result.current.fix("ask_location"); });
  expect(location.requestForegroundPermissionsAsync).toHaveBeenCalled();

  location.enableNetworkProviderAsync.mockRejectedValueOnce(new Error("dismissed"));
  const intent = jest.spyOn(Linking, "sendIntent").mockResolvedValue(undefined);
  await act(async () => { await view.result.current.fix("turn_on_location"); });
  expect(intent).toHaveBeenCalledWith("android.settings.LOCATION_SOURCE_SETTINGS", []);
  intent.mockRestore();
  location.getForegroundPermissionsAsync.mockResolvedValue({ status: "undetermined" } as never);
});
