import { fireEvent, render, screen } from "@testing-library/react-native";

import { LocationHealthCard } from "@/components/LocationHealthCard";
import { locationIssues, type LocationHealthInput } from "@/lib/locationHealth";

const healthy: LocationHealthInput = {
  platform: "android",
  servicesEnabled: true,
  foreground: "granted",
  canAskForeground: true,
  precise: true,
  batteryOptimized: false,
  lowPower: false,
};

it("draws nothing for a phone that can share", async () => {
  await render(<LocationHealthCard issues={[]} watcher="client" onFix={jest.fn()} />);
  expect(screen.toJSON()).toBeNull();
});

it("says what it costs, then the steps and the one button that fixes it", async () => {
  const onFix = jest.fn();
  const issues = locationIssues({ ...healthy, foreground: "denied", canAskForeground: false }, "shop");
  await render(<LocationHealthCard issues={issues} watcher="shop" onFix={onFix} />);
  expect(screen.getByText("The shop cannot see you coming")).toBeTruthy();
  expect(screen.getByText("GRIDGO cannot use your location")).toBeTruthy();
  expect(screen.getByText("Tap Permissions, then Location.")).toBeTruthy();
  await fireEvent.press(screen.getByText("Open settings"));
  expect(onFix).toHaveBeenCalledWith("open_app_settings");
});

it("opens the most serious problem and keeps the rest a tap away", async () => {
  const onFix = jest.fn();
  const issues = locationIssues({ ...healthy, precise: false, batteryOptimized: true });
  await render(<LocationHealthCard issues={issues} watcher="client" onFix={onFix} />);
  expect(screen.getByText("Your location may stop reaching the client")).toBeTruthy();
  expect(screen.getByText("Turn on Use precise location.")).toBeTruthy();
  expect(screen.queryByText("Open battery settings")).toBeNull();

  await fireEvent.press(screen.getByLabelText("Battery saving can pause GRIDGO"));
  expect(screen.queryByText("Turn on Use precise location.")).toBeNull();
  await fireEvent.press(screen.getByText("Open battery settings"));
  expect(onFix).toHaveBeenCalledWith("battery_settings");
});
