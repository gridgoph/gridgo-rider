import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

import { TesterSlot } from "@/components/TesterSlot";
import type { PlayOptInState, TesterProgramState } from "@/lib/api";
import { usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";
import { useTesterProgram } from "@/store/testerProgram";

/**
 * The Play ask on Active: Android APK only, ahead of the check-in for an
 * enrolled APK tester, `shown` once drawn, `tapped` before the steps open,
 * and gone for the session after a close.
 */

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  reportPlayOptInEvent: jest.fn(() => Promise.resolve()),
  reportTesterFeedback: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ask = (overrides: Partial<PlayOptInState> = {}): PlayOptInState => ({
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

const enrolled: TesterProgramState = {
  enrolled: true,
  app: "rider",
  day: 2,
  streak: 2,
  checkedInToday: true,
  runComplete: false,
  stopped: false,
  manilaDate: "2026-11-10",
  nudge: { trigger: "streak_3" },
};

const realOS = Platform.OS;

function given(os: string, optIn: PlayOptInState | null, program: TesterProgramState | null = null) {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  useSession.setState({ user: { id: "u1", name: "Rider", role: "rider" } as never });
  usePlayOptIn.setState({ owner: "u1", state: optIn, closed: false, shownSent: false, tappedSent: false });
  useTesterProgram.setState({ owner: "u1", program, readAt: Date.parse("2026-11-10T04:00:00Z"), held: null });
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: realOS, configurable: true });
  useTesterProgram.setState({ owner: null, program: null, held: null });
  usePlayOptIn.getState().reset();
});

it("asks an Android APK rider and reports it shown once drawn", async () => {
  given("android", ask());
  await render(<TesterSlot />);
  expect(screen.getByRole("button", { name: "Help us launch GRIDGO on Play, become a tester." })).toBeTruthy();
  await waitFor(() => expect(api.reportPlayOptInEvent).toHaveBeenCalledWith({ platform: "android", channel: "sideload" }, "shown"));
});

it("never draws the ask on iOS", async () => {
  given("ios", ask());
  await render(<TesterSlot />);
  expect(screen.toJSON()).toBeNull();
  expect(api.reportPlayOptInEvent).not.toHaveBeenCalled();
});

it("takes the line ahead of an enrolled APK tester's check-in and feedback", async () => {
  given("android", ask(), enrolled);
  await render(<TesterSlot />);
  expect(screen.getByTestId("play-optin-card")).toBeTruthy();
  expect(screen.queryByText("Day 2 of 14")).toBeNull();
  // A feedback card it hid is never counted as shown.
  expect(api.reportTesterFeedback).not.toHaveBeenCalled();
});

it("reports the tap before opening the steps", async () => {
  given("android", ask());
  await render(<TesterSlot />);
  fireEvent.press(screen.getByRole("button", { name: "Help us launch GRIDGO on Play, become a tester." }));
  expect(api.reportPlayOptInEvent).toHaveBeenCalledWith({ platform: "android", channel: "sideload" }, "tapped");
  expect(mockPush).toHaveBeenCalledWith("/play-optin?from=card");
});

it("a close is sent once and hands the line back to the check-in", async () => {
  given("android", ask({ dismissCount: 2 }), { ...enrolled, nudge: null });
  await render(<TesterSlot />);
  fireEvent.press(screen.getByRole("button", { name: "Not now" }));
  expect(await screen.findByText("Day 2 of 14")).toBeTruthy();
  const closes = (api.reportPlayOptInEvent as jest.Mock).mock.calls.filter(([, type]) => type === "dismissed");
  expect(closes).toHaveLength(1);
  expect(usePlayOptIn.getState().state?.dismissCount).toBe(3);
});

it("draws nothing after GRIDGO's third close", async () => {
  given("android", ask({ dismissCount: 3 }));
  await render(<TesterSlot />);
  expect(screen.toJSON()).toBeNull();
});

it("draws nothing when GRIDGO says not to ask", async () => {
  given("android", ask({ show: false }));
  await render(<TesterSlot />);
  expect(screen.toJSON()).toBeNull();
});
