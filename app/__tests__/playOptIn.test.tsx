import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";

import PlayOptInScreen from "@/app/play-optin";
import type { PlayOptInState } from "@/lib/api";
import { usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";

/** The tester steps: tap on entry, the Gmail (and the Google-account tick), then each group mode. */

jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require("react");
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
    useFocusEffect: (run: () => void) => useEffect(run, [run]),
  };
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
  gmailSuggestion: null,
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

const install = { platform: "android", channel: "sideload" };
const realOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  useSession.setState({ user: { id: "u1", name: "Rider", role: "rider" } as never });
  usePlayOptIn.getState().reset();
});

afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: realOS, configurable: true });
});

/** Type into the Gmail field and let the value land before the next press. */
async function typeGmail(value: string) {
  fireEvent.changeText(await screen.findByLabelText("Gmail on Google Play"), value);
  await waitFor(() => expect(screen.getByLabelText("Gmail on Google Play").props.value).toBe(value));
}

function events(): string[] {
  return (api.reportPlayOptInEvent as jest.Mock).mock.calls.map(([, type]) => type);
}

it("reports the tap on entry, refuses a malformed address, then asks a custom one to be named a Google account", async () => {
  api.getPlayOptIn.mockResolvedValue(optIn());
  api.confirmPlayOptInGmail.mockResolvedValue(optIn({ step: "join_group", gmailSuggestion: "rider@company.ph" }));
  await render(<PlayOptInScreen />);
  await waitFor(() => expect(events()).toEqual(["tapped"]));

  await typeGmail("rider@");
  fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByText("That does not look like an email address.")).toBeTruthy();

  await typeGmail("rider@company.ph");
  fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByText("Play admits Google accounts only.")).toBeTruthy();
  expect(api.confirmPlayOptInGmail).not.toHaveBeenCalled();

  fireEvent.press(screen.getByRole("checkbox", { name: "This is my Google account" }));
  await waitFor(() =>
    expect(screen.getByRole("checkbox", { name: "This is my Google account" }).props.accessibilityState.checked).toBe(true),
  );
  fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(api.confirmPlayOptInGmail).toHaveBeenCalledWith(install, "rider@company.ph", true));
  expect(await screen.findByRole("button", { name: "Join group" })).toBeTruthy();
});
