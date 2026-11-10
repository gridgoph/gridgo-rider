import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";

import PlayOptInScreen from "@/app/play-optin";
import type { PlayOptInState } from "@/lib/api";
import { usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";

/** Link mode end to end: prefilled Gmail, group, Play testing page, install from Play. */

jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require("react");
  return { router: { replace: jest.fn() }, useFocusEffect: (run: () => void) => useEffect(run, [run]) };
});
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getPlayOptIn: jest.fn(),
  confirmPlayOptInGmail: jest.fn(),
  reportPlayOptInEvent: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const optIn = (overrides: Partial<PlayOptInState> = {}): PlayOptInState => ({
  app: "rider",
  show: true,
  step: "confirm_gmail",
  gmailSuggestion: "rider@gmail.com",
  groupMode: "link",
  campaignEnabled: true,
  optInUrl: "https://play.google.com/apps/testing/ph.gridgo.rider",
  groupJoinUrl: "https://groups.google.com/g/example-testers",
  target: 12,
  optedIn: false,
  dismissCount: 0,
  playStoreUrl: "https://play.google.com/store/apps/details?id=ph.gridgo.rider",
  ...overrides,
});

it("walks the link mode in order and never claims the rider joined", async () => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  useSession.setState({ user: { id: "u1", name: "Rider", role: "rider" } as never });
  usePlayOptIn.getState().reset();
  api.getPlayOptIn.mockResolvedValue(optIn());
  api.confirmPlayOptInGmail.mockResolvedValue(optIn({ step: "join_group" }));

  await render(<PlayOptInScreen />);
  expect(await screen.findByDisplayValue("rider@gmail.com")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(api.confirmPlayOptInGmail).toHaveBeenCalledWith({ platform: "android", channel: "sideload" }, "rider@gmail.com", false),
  );

  fireEvent.press(await screen.findByRole("button", { name: "Join group" }));
  await waitFor(() => expect(Linking.openURL).toHaveBeenLastCalledWith("https://groups.google.com/g/example-testers"));

  fireEvent.press(await screen.findByRole("button", { name: "Become a tester" }));
  await waitFor(() => expect(Linking.openURL).toHaveBeenLastCalledWith("https://play.google.com/apps/testing/ph.gridgo.rider"));

  fireEvent.press(await screen.findByRole("button", { name: "Install from Play" }));
  await waitFor(() =>
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://play.google.com/store/apps/details?id=ph.gridgo.rider"),
  );
  expect(screen.getAllByText("Opened").length).toBe(2);
  expect((api.reportPlayOptInEvent as jest.Mock).mock.calls.map(([, type]) => type)).toEqual([
    "tapped",
    "group_opened",
    "optin_opened",
  ]);
});
