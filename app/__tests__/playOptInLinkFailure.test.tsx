import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";

import PlayOptInScreen from "@/app/play-optin";
import type { PlayOptInState } from "@/lib/api";
import { usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";

/**
 * Both links failing to open: each says so inline and stays the current
 * action, even though GRIDGO took the event and its next read is a step ahead.
 */

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
  step: "join_group",
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

it("keeps Join group, then Become a tester, as the action when each link fails to open", async () => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  const openURL = jest.spyOn(Linking, "openURL");
  useSession.setState({ user: { id: "u1", name: "Rider", role: "rider" } as never });
  usePlayOptIn.getState().reset();
  api.getPlayOptIn.mockResolvedValue(optIn());

  await render(<PlayOptInScreen />);

  // The group link fails; GRIDGO's later read is already at open_optin.
  openURL.mockRejectedValueOnce(new Error("no handler"));
  fireEvent.press(await screen.findByRole("button", { name: "Join group" }));
  expect(await screen.findByText("The group page did not open. Try again.")).toBeTruthy();
  api.getPlayOptIn.mockResolvedValue(optIn({ step: "open_optin" }));
  await usePlayOptIn.getState().load("u1");
  expect(await screen.findByRole("button", { name: "Join group" })).toBeTruthy();
  expect(screen.getByTestId("optin-step-group-current")).toBeTruthy();
  expect(screen.queryByText("Opened")).toBeNull();

  // Retried, it opens and the flow moves on.
  openURL.mockResolvedValueOnce(true);
  fireEvent.press(screen.getByRole("button", { name: "Join group" }));
  const become = await screen.findByRole("button", { name: "Become a tester" });

  // The Play tester page fails; GRIDGO's later read is already at install_from_play.
  openURL.mockRejectedValueOnce(new Error("no handler"));
  fireEvent.press(become);
  expect(await screen.findByText("The Play tester page did not open. Try again.")).toBeTruthy();
  api.getPlayOptIn.mockResolvedValue(optIn({ step: "install_from_play" }));
  await usePlayOptIn.getState().load("u1");
  await waitFor(() => expect(screen.getByTestId("optin-step-optin-current")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Become a tester" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Install from Play" })).toBeNull();
});
