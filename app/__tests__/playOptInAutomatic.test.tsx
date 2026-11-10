import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

import PlayOptInScreen from "@/app/play-optin";
import type { PlayOptInState } from "@/lib/api";
import { usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";

/** Automatic mode: GRIDGO adds the Gmail, so there is no group step. */

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
  groupMode: "automatic",
  campaignEnabled: true,
  optInUrl: "https://play.google.com/apps/testing/ph.gridgo.rider",
  groupJoinUrl: null,
  target: 12,
  optedIn: false,
  dismissCount: 0,
  playStoreUrl: "https://play.google.com/store/apps/details?id=ph.gridgo.rider",
  ...overrides,
});

it("goes straight from the Gmail to Become a tester", async () => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  useSession.setState({ user: { id: "u1", name: "Rider", role: "rider" } as never });
  usePlayOptIn.getState().reset();
  api.getPlayOptIn.mockResolvedValue(optIn());
  api.confirmPlayOptInGmail.mockResolvedValue(optIn({ step: "open_optin" }));

  await render(<PlayOptInScreen />);
  expect(screen.queryByText("Join the tester group")).toBeNull();
  fireEvent.press(await screen.findByRole("button", { name: "Confirm" }));
  expect(await screen.findByRole("button", { name: "Become a tester" })).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId("optin-step-optin-current")).toBeTruthy());
  expect(screen.queryByText("Join the tester group")).toBeNull();
});
