import type { TesterProgramState } from "@/lib/api";
import type { TesterReminder } from "@/lib/testerProgram";
import { syncTesterReminders, useTesterProgram } from "@/store/testerProgram";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getTesterProgram: jest.fn(),
    testerCheckIn: jest.fn(),
    reportTesterFeedback: jest.fn(),
  };
});

const mockNotifications = {
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: "date" },
};

jest.mock("@/lib/expoNotifications", () => ({ loadExpoNotifications: () => mockNotifications }));
jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const enrolled = (overrides: object = {}): TesterProgramState => ({
  enrolled: true,
  app: "rider",
  day: 4,
  streak: 3,
  checkedInToday: false,
  runComplete: false,
  stopped: false,
  manilaDate: "2026-11-07",
  nudge: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  useTesterProgram.getState().reset();
  useTesterProgram.setState({ held: null });
  mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true });
  api.reportTesterFeedback.mockResolvedValue(undefined);
});

it("checks in on open for an enrolled tester whose day is not yet in", async () => {
  api.getTesterProgram.mockResolvedValue(enrolled());
  api.testerCheckIn.mockResolvedValue(enrolled({ checkedInToday: true }));

  await useTesterProgram.getState().load("u1");

  expect(api.testerCheckIn).toHaveBeenCalledWith(expect.any(String), "open");
  expect(useTesterProgram.getState().program).toMatchObject({ checkedInToday: true });
});

it("asks nothing more of an account that is not enrolled, and cancels any reminder", async () => {
  mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: "gridgo-tester-evening-2026-11-07" },
    { identifier: "something-else" },
  ]);
  api.getTesterProgram.mockResolvedValue({ enrolled: false });

  await useTesterProgram.getState().load("u1");
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(api.testerCheckIn).not.toHaveBeenCalled();
  expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("gridgo-tester-evening-2026-11-07");
  expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it("stays silent when the read fails", async () => {
  api.getTesterProgram.mockRejectedValue(new Error("offline"));
  await expect(useTesterProgram.getState().load("u1")).resolves.toBeUndefined();
  expect(useTesterProgram.getState().program).toBeNull();
});

it("schedules local reminders only with permission already granted, and never asks", async () => {
  const plan: TesterReminder[] = [{ id: "gridgo-tester-evening-x", at: Date.now() + 60_000, title: "Day 4 of 14", body: "b" }];
  mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false });
  await syncTesterReminders(plan);
  expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();

  mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true });
  await syncTesterReminders(plan);
  expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      identifier: "gridgo-tester-evening-x",
      content: expect.objectContaining({ title: "Day 4 of 14", data: { type: "tester_reminder" } }),
      trigger: expect.objectContaining({ type: "date", date: new Date(plan[0].at) }),
    }),
  );
});

it("reports a shown card, then holds it closed once dismissed", () => {
  useTesterProgram.setState({ owner: "u1" });
  useTesterProgram.getState().feedbackShown("streak_3", 1_000);
  expect(api.reportTesterFeedback).toHaveBeenCalledWith("shown", "streak_3");

  useTesterProgram.getState().feedbackDismissed();
  expect(api.reportTesterFeedback).toHaveBeenCalledWith("dismissed", "streak_3");
  expect(useTesterProgram.getState().held).toEqual({ userId: "u1", trigger: "streak_3", shownAt: 1_000, closed: true });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("reminders cannot outlive a sign-out or a stop", () => {
  let now: jest.SpyInstance;
  beforeEach(() => {
    now = jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-07T02:00:00Z"));
  });
  afterEach(() => now.mockRestore());

  it("sign-out wins over a plan still waiting on the OS", async () => {
    let releasePermission!: (value: { granted: boolean }) => void;
    mockNotifications.getPermissionsAsync.mockImplementationOnce(
      () => new Promise((resolve) => { releasePermission = resolve; }),
    );
    api.getTesterProgram.mockResolvedValue(enrolled({ checkedInToday: true }));
    await useTesterProgram.getState().load("u1");
    await flush();
    useTesterProgram.getState().forget();
    await flush();
    releasePermission({ granted: true });
    await flush();
    await flush();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("a stop read overtaking a pending plan leaves nothing scheduled", async () => {
    let releasePermission!: (value: { granted: boolean }) => void;
    mockNotifications.getPermissionsAsync.mockImplementationOnce(
      () => new Promise((resolve) => { releasePermission = resolve; }),
    );
    api.getTesterProgram
      .mockResolvedValueOnce(enrolled({ checkedInToday: true }))
      .mockResolvedValueOnce(enrolled({ checkedInToday: true, stopped: true }));
    await useTesterProgram.getState().load("u1");
    await flush();
    await useTesterProgram.getState().load("u1");
    releasePermission({ granted: true });
    await flush();
    await flush();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("schedules an unfinished run's reminders well past one week", async () => {
    api.getTesterProgram.mockResolvedValue(enrolled({ day: 1, streak: 1, checkedInToday: true }));
    await useTesterProgram.getState().load("u1");
    await flush();
    await flush();
    const dates = mockNotifications.scheduleNotificationAsync.mock.calls.map((call) => call[0].trigger.date.getTime());
    expect(dates.some((at: number) => at >= Date.parse("2026-11-15T00:00:00Z"))).toBe(true);
  });
});

describe("the Check in button always leaves its pending state", () => {
  it("after a refresh overtakes a failing tap", async () => {
    let rejectButton!: (error: Error) => void;
    useTesterProgram.setState({ owner: "u1", program: enrolled() });
    api.testerCheckIn
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectButton = reject; }))
      .mockRejectedValue(new Error("offline"));
    api.getTesterProgram.mockResolvedValue(enrolled());
    const button = useTesterProgram.getState().checkIn();
    await useTesterProgram.getState().load("u1");
    rejectButton(new Error("offline"));
    await button;
    expect(useTesterProgram.getState().checkingIn).toBe(false);
    expect(useTesterProgram.getState().checkInFailed).toBe(true);
  });

  it("after a refresh overtakes a successful tap", async () => {
    let resolveButton!: (value: TesterProgramState) => void;
    useTesterProgram.setState({ owner: "u1", program: enrolled() });
    api.testerCheckIn
      .mockImplementationOnce(() => new Promise((resolve) => { resolveButton = resolve; }))
      .mockRejectedValue(new Error("offline"));
    api.getTesterProgram.mockResolvedValue(enrolled());
    const button = useTesterProgram.getState().checkIn();
    await useTesterProgram.getState().load("u1");
    api.getTesterProgram.mockResolvedValue(enrolled({ checkedInToday: true, streak: 4 }));
    resolveButton(enrolled({ checkedInToday: true, streak: 4 }));
    await button;
    await flush();
    expect(useTesterProgram.getState().checkingIn).toBe(false);
    // The overtaken answer is not drawn; a fresh read is, which agrees.
    expect(useTesterProgram.getState().program).toMatchObject({ checkedInToday: true });
  });

  it("and a sign-out mid-tap cannot write to the next person", async () => {
    let resolveButton!: (value: TesterProgramState) => void;
    useTesterProgram.setState({ owner: "u1", program: enrolled() });
    api.testerCheckIn.mockImplementationOnce(() => new Promise((resolve) => { resolveButton = resolve; }));
    const button = useTesterProgram.getState().checkIn();
    useTesterProgram.getState().forget();
    resolveButton(enrolled({ checkedInToday: true }));
    await button;
    expect(useTesterProgram.getState()).toMatchObject({ owner: null, program: null, checkingIn: false });
  });
});

describe("a delayed Check in answer cannot undo a newer read", () => {
  let now: jest.SpyInstance;
  beforeEach(() => {
    now = jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-07T02:00:00Z"));
  });
  afterEach(() => now.mockRestore());

  async function overtakenBy(newer: TesterProgramState) {
    let resolveButton!: (value: TesterProgramState) => void;
    useTesterProgram.setState({ owner: "u1", program: enrolled() });
    api.testerCheckIn.mockImplementationOnce(() => new Promise((resolve) => { resolveButton = resolve; }));
    api.getTesterProgram.mockResolvedValue(newer);
    const button = useTesterProgram.getState().checkIn();
    await useTesterProgram.getState().load("u1");
    await flush();
    mockNotifications.scheduleNotificationAsync.mockClear();
    resolveButton(enrolled({ checkedInToday: true }));
    await button;
    await flush();
    await flush();
  }

  it("after production approval", async () => {
    await overtakenBy(enrolled({ checkedInToday: true, stopped: true }));
    expect(useTesterProgram.getState().program).toMatchObject({ stopped: true });
    expect(useTesterProgram.getState().checkingIn).toBe(false);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("after unenrolment", async () => {
    await overtakenBy({ enrolled: false });
    expect(useTesterProgram.getState().program).toEqual({ enrolled: false });
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe("the newer read wins", () => {
  it("an older read answering late is not drawn over a newer one", async () => {
    let resolveOld!: (value: TesterProgramState) => void;
    api.getTesterProgram
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(enrolled({ checkedInToday: true, stopped: true }));
    const older = useTesterProgram.getState().load("u1");
    await useTesterProgram.getState().load("u1");
    resolveOld(enrolled({ checkedInToday: false }));
    await older;
    await flush();
    expect(useTesterProgram.getState().program).toMatchObject({ stopped: true });
    // The late answer must not check in on the newer read's behalf.
    expect(api.testerCheckIn).not.toHaveBeenCalled();
  });

  it("a read for another account never lands on the next one", async () => {
    let resolveOld!: (value: TesterProgramState) => void;
    api.getTesterProgram
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ enrolled: false });
    const older = useTesterProgram.getState().load("u1");
    await useTesterProgram.getState().load("u2");
    resolveOld(enrolled({ checkedInToday: true }));
    await older;
    expect(useTesterProgram.getState()).toMatchObject({ owner: "u2", program: { enrolled: false } });
  });
});

describe("the session", () => {
  it("signing out cancels this phone's tester reminders", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSession } = require("@/store/session");
    useSession.setState({ user: { id: "u1", name: "Rina", role: "rider" } });
    useTesterProgram.setState({ owner: "u1", program: enrolled({ checkedInToday: true }) });
    mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: "gridgo-tester-evening-2026-11-08" },
      { identifier: "gridgo-tester-morning-2026-11-09" },
      { identifier: "someone-elses" },
    ]);
    useSession.setState({ user: null });
    await flush();
    await flush();
    expect(useTesterProgram.getState()).toMatchObject({ owner: null, program: null });
    expect(mockNotifications.cancelScheduledNotificationAsync.mock.calls.map((call) => call[0])).toEqual([
      "gridgo-tester-evening-2026-11-08",
      "gridgo-tester-morning-2026-11-09",
    ]);
  });
});

describe("a read already pending at the tap", () => {
  let now: jest.SpyInstance;
  beforeEach(() => {
    now = jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-09T02:00:00Z"));
  });
  afterEach(() => now.mockRestore());

  async function pendingReadLands(newer: TesterProgramState) {
    useTesterProgram.setState({ owner: "u1", program: enrolled({ day: 1, streak: 0 }) });
    let resolveRead!: (value: TesterProgramState) => void;
    let resolveButton!: (value: TesterProgramState) => void;
    api.getTesterProgram.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    const read = useTesterProgram.getState().load("u1");
    api.testerCheckIn.mockImplementationOnce(() => new Promise((resolve) => { resolveButton = resolve; }));
    const button = useTesterProgram.getState().checkIn();
    resolveRead(newer);
    await read;
    await flush();
    await flush();
    mockNotifications.scheduleNotificationAsync.mockClear();
    // The reconciling read after the button agrees with what landed.
    api.getTesterProgram.mockResolvedValue(newer);
    resolveButton(enrolled({ checkedInToday: true, day: 1, streak: 1 }));
    await button;
    await flush();
    await flush();
  }

  it("keeps a production approval it landed over the older button answer", async () => {
    await pendingReadLands(enrolled({ checkedInToday: false, stopped: true, productionApproved: true }));
    expect(useTesterProgram.getState().program).toMatchObject({ stopped: true });
    expect(useTesterProgram.getState().checkingIn).toBe(false);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("keeps an unenrolment it landed over the older button answer", async () => {
    await pendingReadLands({ enrolled: false });
    expect(useTesterProgram.getState().program).toEqual({ enrolled: false });
    expect(useTesterProgram.getState().checkingIn).toBe(false);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
