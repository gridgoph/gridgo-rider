import { Linking, Platform } from "react-native";

import { androidSettingsExtras, openPhoneSettings } from "@/lib/phoneSettings";

it("names this app and the alert channel so Android opens the exact switch", () => {
  expect(androidSettingsExtras("channel", "ph.gridgo.rider", "gridgo_default")).toEqual([
    { key: "android.provider.extra.APP_PACKAGE", value: "ph.gridgo.rider" },
    { key: "android.provider.extra.CHANNEL_ID", value: "gridgo_default" },
  ]);
  expect(androidSettingsExtras("battery", "ph.gridgo.rider")).toEqual([]);
  expect(androidSettingsExtras("channel", null, "gridgo_default")).toEqual([]);
});

it("falls back to GRIDGO's own settings page when the phone has no such screen", async () => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  const intent = jest.spyOn(Linking, "sendIntent").mockRejectedValueOnce(new Error("No Activity found"));
  const settings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  await openPhoneSettings("battery");
  expect(intent).toHaveBeenCalledWith("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS", []);
  expect(settings).toHaveBeenCalled();
  intent.mockRestore();
  settings.mockRestore();
});
