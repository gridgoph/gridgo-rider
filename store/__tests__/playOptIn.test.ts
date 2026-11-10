import { Linking, Platform } from "react-native";

import type { PlayOptInState } from "@/lib/api";
import { usePlayOptIn } from "@/store/playOptIn";

/**
 * The Play opt-in store over the wire contract (gridgo-api
 * `docs/PLAY_OPTIN_API.md`), with `fetch` mocked: app=rider, platform and
 * channel on every call, `dismissed` once per close, link events before links.
 */

const state = (overrides: Partial<PlayOptInState> = {}): PlayOptInState => ({
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

const originalFetch = global.fetch;
const fetchMock = jest.fn();
const realOS = Platform.OS;

function answer(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function calls(): { url: string; method: string; body: Record<string, unknown> | null }[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(init.body) : null,
  }));
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
  fetchMock.mockReset();
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  usePlayOptIn.getState().reset();
});

afterEach(() => {
  global.fetch = originalFetch;
  Object.defineProperty(Platform, "OS", { value: realOS, configurable: true });
});

it("reads with app, platform and the APK channel", async () => {
  fetchMock.mockResolvedValue(answer(state()));
  await usePlayOptIn.getState().load("u1");
  expect(calls()[0].url).toMatch(/\/me\/play-optin\?app=rider&platform=android&channel=sideload$/);
  expect(usePlayOptIn.getState().state?.show).toBe(true);
});

it("does not ask GRIDGO at all off Android", async () => {
  Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
  await usePlayOptIn.getState().load("u1");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps a failed read quiet and marks it for Try again", async () => {
  fetchMock.mockResolvedValue(answer({ error: "service_unavailable" }, 503));
  await usePlayOptIn.getState().load("u1");
  expect(usePlayOptIn.getState()).toMatchObject({ state: null, readFailed: true, reading: false });
});

it("sends shown and tapped once per session, and every close once", async () => {
  fetchMock.mockResolvedValue(answer(state()));
  await usePlayOptIn.getState().load("u1");
  fetchMock.mockResolvedValue(answer({ ok: true }));
  const store = usePlayOptIn.getState();
  store.shown();
  store.shown();
  store.tapped();
  store.tapped();
  store.dismiss();
  await settle();
  await settle();
  const events = calls().filter((c) => c.url.endsWith("/me/play-optin/event"));
  expect(events.map((c) => c.body)).toEqual([
    { app: "rider", platform: "android", channel: "sideload", type: "shown" },
    { app: "rider", platform: "android", channel: "sideload", type: "tapped" },
    { app: "rider", platform: "android", channel: "sideload", type: "dismissed" },
  ]);
  expect(usePlayOptIn.getState()).toMatchObject({ closed: true, state: { dismissCount: 1 } });
});

it("confirms a Gmail, and a custom address only with the Google-account assertion", async () => {
  fetchMock.mockResolvedValue(answer(state()));
  await usePlayOptIn.getState().load("u1");
  fetchMock.mockResolvedValue(answer(state({ step: "join_group" })));
  expect(await usePlayOptIn.getState().confirmGmail(" rider@gmail.com ", false)).toBeNull();
  expect(await usePlayOptIn.getState().confirmGmail("rider@company.ph", true)).toBeNull();
  const confirms = calls().filter((c) => c.url.endsWith("/me/play-optin/confirm-gmail"));
  expect(confirms.map((c) => c.body)).toEqual([
    { app: "rider", platform: "android", channel: "sideload", email: "rider@gmail.com" },
    { app: "rider", platform: "android", channel: "sideload", email: "rider@company.ph", googleAccount: true },
  ]);
  expect(usePlayOptIn.getState().state?.step).toBe("join_group");
});

it("words a Google failure and keeps the step", async () => {
  fetchMock.mockResolvedValue(answer(state({ groupMode: "automatic" })));
  await usePlayOptIn.getState().load("u1");
  fetchMock.mockResolvedValue(answer({ error: "google_group_unavailable" }, 503));
  expect(await usePlayOptIn.getState().confirmGmail("rider@gmail.com", false)).toBe(
    "Google did not answer. Try again in a moment.",
  );
  expect(usePlayOptIn.getState().state?.step).toBe("confirm_gmail");
});

it("link mode: reports group_opened, then optin_opened, before opening each link", async () => {
  fetchMock.mockResolvedValue(answer(state({ step: "join_group" })));
  await usePlayOptIn.getState().load("u1");
  fetchMock.mockResolvedValue(answer({ ok: true }));
  expect(await usePlayOptIn.getState().openGroup()).toBeNull();
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://groups.google.com/g/example-testers");
  expect(await usePlayOptIn.getState().openOptIn()).toBeNull();
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://play.google.com/apps/testing/ph.gridgo.rider");
  await usePlayOptIn.getState().openPlayStore();
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://play.google.com/store/apps/details?id=ph.gridgo.rider");
  const types = calls()
    .filter((c) => c.url.endsWith("/me/play-optin/event"))
    .map((c) => c.body?.type);
  expect(types).toEqual(["group_opened", "optin_opened"]);
  expect(usePlayOptIn.getState().progress).toEqual({ groupOpened: true, optInOpened: true });
});

it("does not open Play when GRIDGO refuses the step, and reads the steps again", async () => {
  fetchMock.mockResolvedValue(answer(state({ step: "join_group" })));
  await usePlayOptIn.getState().load("u1");
  fetchMock.mockResolvedValueOnce(answer({ error: "group_step_required" }, 409));
  fetchMock.mockResolvedValueOnce(answer(state({ step: "join_group" })));
  expect(await usePlayOptIn.getState().openOptIn()).toBe("Join the tester group first.");
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(calls().at(-1)?.url).toMatch(/\/me\/play-optin\?/);
});

it("reports the Play channel from the Play bundle", async () => {
  process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
  try {
    fetchMock.mockResolvedValue(answer(state({ show: false, optedIn: true, step: "opted_in" })));
    await usePlayOptIn.getState().load("u1");
    expect(calls().at(-1)?.url).toMatch(/channel=play$/);
  } finally {
    delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
  }
});
