import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import PlayOptInScreen from "@/app/play-optin";
import { ApiError, type PlayOptInState } from "@/lib/api";
import { usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";

/** A failed first read says so with Try again — never an endless skeleton — and no tap is counted. */

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

const ready: PlayOptInState = {
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
};

it("offers Try again after a failed read, and the Gmail step once the retry lands", async () => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  useSession.setState({ user: { id: "u1", name: "Rider", role: "rider" } as never });
  usePlayOptIn.getState().reset();
  api.getPlayOptIn.mockRejectedValueOnce(new ApiError(503, { error: "service_unavailable" })).mockResolvedValue(ready);

  await render(<PlayOptInScreen />);
  expect(await screen.findByText("Your steps did not load")).toBeTruthy();
  expect(screen.queryByTestId("optin-loading")).toBeNull();
  expect(api.reportPlayOptInEvent).not.toHaveBeenCalled();

  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByDisplayValue("rider@gmail.com")).toBeTruthy();
  expect(api.reportPlayOptInEvent).toHaveBeenCalledWith({ platform: "android", channel: "sideload" }, "tapped");
});
