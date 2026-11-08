import type { TesterProgramState } from "@/lib/api";
import {
  FEEDBACK_COOLDOWN_MS,
  feedbackAllowed,
  feedbackToShow,
  manilaDateOf,
  meterCells,
  PLAN_DAYS,
  reminderPlan,
  streakLabel,
  testerCardView,
} from "@/lib/testerProgram";

function tester(overrides: Partial<Extract<TesterProgramState, { enrolled: true }>> = {}): TesterProgramState {
  return {
    enrolled: true,
    app: "rider",
    day: 3,
    streak: 3,
    checkedInToday: true,
    runComplete: false,
    stopped: false,
    manilaDate: "2026-11-07",
    nudge: null,
    ...overrides,
  };
}

const at = (iso: string) => Date.parse(iso);

describe("testerCardView", () => {
  it("draws nothing for an account that is not enrolled, or before an answer", () => {
    expect(testerCardView({ enrolled: false })).toBeNull();
    expect(testerCardView(null)).toBeNull();
  });

  it("shows Day N and the streak as GRIDGO counts them", () => {
    expect(testerCardView(tester())).toEqual({ kind: "check_in", day: 3, streak: 3, checkedIn: true });
    expect(testerCardView(tester({ day: 4, streak: 3, checkedInToday: false }))).toEqual({
      kind: "check_in",
      day: 4,
      streak: 3,
      checkedIn: false,
    });
    // After a missed day the run starts again at Day 1.
    expect(testerCardView(tester({ day: 1, streak: 0, checkedInToday: false }))).toMatchObject({ day: 1, streak: 0 });
  });

  it("shows the full meter on the fourteenth day only, and nothing once stopped", () => {
    const complete = tester({ day: 14, streak: 14, runComplete: true, stopped: true });
    expect(testerCardView(complete)).toEqual({ kind: "complete" });
    expect(testerCardView({ ...complete, checkedInToday: false } as TesterProgramState)).toBeNull();
    // Production approval stops the program without completing the run.
    expect(testerCardView(tester({ stopped: true }))).toBeNull();
  });
});

describe("meterCells and streakLabel", () => {
  it("fills the kept days and leaves today's square open until it is in", () => {
    expect(meterCells(2, false).slice(0, 4)).toEqual(["done", "done", "today", "ahead"]);
    expect(meterCells(3, true).slice(0, 4)).toEqual(["done", "done", "done", "ahead"]);
    expect(meterCells(14, true)).toEqual(Array(14).fill("done"));
    expect(meterCells(0, false)[0]).toBe("today");
  });

  it("says the streak plainly", () => {
    expect(streakLabel(0)).toBe("No streak yet");
    expect(streakLabel(1)).toBe("1-day streak");
    expect(streakLabel(7)).toBe("7-day streak");
  });
});

describe("manilaDateOf", () => {
  it("rolls over at Manila midnight, 16:00 UTC", () => {
    expect(manilaDateOf(at("2026-11-07T15:59:59Z"))).toBe("2026-11-07");
    expect(manilaDateOf(at("2026-11-07T16:00:00Z"))).toBe("2026-11-08");
  });
});

describe("reminderPlan", () => {
  it("reminds at 7 PM Manila on a day not yet in, then assumes a miss", () => {
    const plan = reminderPlan(tester({ day: 4, streak: 3, checkedInToday: false }), at("2026-11-07T02:00:00Z"));
    expect(plan[0]).toMatchObject({ at: at("2026-11-07T11:00:00Z"), title: "Day 4 of 14", body: "Open GRIDGO for 1 minute." });
    // The next morning's catch-up at 8 AM Manila, then Day 1 that evening.
    expect(plan[1]).toMatchObject({ at: at("2026-11-08T00:00:00Z"), title: "Missed yesterday" });
    expect(plan[2]).toMatchObject({ at: at("2026-11-08T11:00:00Z"), title: "Day 1 of 14" });
    // One catch-up only, then an evening a day across the whole planning horizon.
    expect(plan.filter((r) => r.title === "Missed yesterday")).toHaveLength(1);
    expect(plan).toHaveLength(PLAN_DAYS + 1);
    // Inside iOS's 64 pending local notifications.
    expect(plan.length).toBeLessThanOrEqual(64);
    expect(new Set(plan.map((r) => r.id)).size).toBe(plan.length);
  });

  it("moves to tomorrow evening once today is in", () => {
    const plan = reminderPlan(tester({ day: 3, streak: 3, checkedInToday: true }), at("2026-11-07T02:00:00Z"));
    expect(plan[0]).toMatchObject({ at: at("2026-11-08T11:00:00Z"), title: "Day 4 of 14" });
    expect(plan.some((r) => r.at < at("2026-11-08T00:00:00Z"))).toBe(false);
  });

  it("skips tonight's reminder when it is already past 7 PM, across Manila midnight", () => {
    // 23:59 in Manila, not checked in: tonight is gone; the catch-up is 8 hours away.
    const late = reminderPlan(tester({ day: 4, streak: 3, checkedInToday: false }), at("2026-11-07T15:59:00Z"));
    expect(late[0]).toMatchObject({ at: at("2026-11-08T00:00:00Z"), title: "Missed yesterday" });
    // 00:01 in Manila: GRIDGO's answer is a new day, Day 1 after the miss.
    const next = reminderPlan(
      tester({ day: 1, streak: 0, checkedInToday: false, manilaDate: "2026-11-08" }),
      at("2026-11-07T16:01:00Z"),
    );
    expect(next[0]).toMatchObject({ at: at("2026-11-08T11:00:00Z"), title: "Day 1 of 14" });
  });

  it("lands on 7 PM Manila whatever time zone the phone is in", () => {
    const plan = reminderPlan(tester({ day: 4, streak: 3, checkedInToday: false }), at("2026-11-07T02:00:00Z"));
    const evening = plan[0].at;
    const wallClock = (timeZone: string) =>
      new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(evening);
    expect(wallClock("Asia/Manila")).toBe("19");
    // The same instant is morning in Los Angeles and noon in London: one moment, not "7 PM local".
    expect(wallClock("America/Los_Angeles")).toBe("03");
    expect(wallClock("Europe/London")).toBe("11");
  });

  it("never reminds on an evening already checked in", () => {
    // Opened at 10 AM Manila and checked in: tonight stays quiet, tomorrow is Day 4.
    const plan = reminderPlan(tester({ day: 3, streak: 3, checkedInToday: true }), at("2026-11-07T02:00:00Z"));
    expect(plan.some((r) => r.at === at("2026-11-07T11:00:00Z"))).toBe(false);
    expect(plan.every((r) => manilaDateOf(r.at) !== "2026-11-07")).toBe(true);
    expect(plan[0]).toMatchObject({ at: at("2026-11-08T11:00:00Z"), title: "Day 4 of 14" });
    // One-shot instants only, so nothing can repeat into an evening already kept.
    expect(new Set(plan.map((r) => r.at)).size).toBe(plan.length);
  });

  it("keeps reminding past the first week of an unfinished run", () => {
    // Checked in on 7 Nov, then the app is never opened again.
    const plan = reminderPlan(tester({ day: 1, streak: 1, checkedInToday: true }), at("2026-11-07T02:00:00Z"));
    expect(plan.some((r) => r.at >= at("2026-11-15T00:00:00Z"))).toBe(true);
    // Every evening through the horizon, each at 7 PM Manila.
    expect(plan[plan.length - 1].at).toBe(at("2026-12-07T11:00:00Z"));
    expect(plan.every((r) => r.title === "Missed yesterday" || new Date(r.at).getUTCHours() === 11)).toBe(true);
  });

  it("plans nothing for a non-tester, a finished run or a production-approved app", () => {
    const now = at("2026-11-07T02:00:00Z");
    expect(reminderPlan({ enrolled: false }, now)).toEqual([]);
    expect(reminderPlan(null, now)).toEqual([]);
    expect(reminderPlan(tester({ stopped: true }), now)).toEqual([]);
    expect(reminderPlan(tester({ day: 14, streak: 14, runComplete: true, stopped: true }), now)).toEqual([]);
    expect(reminderPlan(tester({ day: 14, streak: 14, checkedInToday: true }), now)).toEqual([]);
  });
});

describe("feedbackAllowed", () => {
  it("allows the card once today is in, and on a completed run's last day", () => {
    expect(feedbackAllowed(tester())).toBe(true);
    expect(feedbackAllowed(tester({ checkedInToday: false }))).toBe(false);
    expect(feedbackAllowed(tester({ day: 14, streak: 14, runComplete: true, stopped: true }))).toBe(true);
  });

  it("never after production approval, even on a completed run; a missing flag reads as not approved", () => {
    const complete = { day: 14, streak: 14, runComplete: true, stopped: true };
    expect(feedbackAllowed(tester({ ...complete, productionApproved: true }))).toBe(false);
    expect(feedbackAllowed(tester({ productionApproved: true }))).toBe(false);
    expect(feedbackAllowed(tester({ ...complete, productionApproved: false }))).toBe(true);
  });

  it("never after production approval, nor for a non-tester", () => {
    expect(feedbackAllowed(tester({ stopped: true, runComplete: false }))).toBe(false);
    expect(feedbackAllowed({ enrolled: false })).toBe(false);
    expect(feedbackAllowed(null)).toBe(false);
  });
});

describe("feedbackToShow", () => {
  const now = at("2026-11-07T12:00:00Z");

  it("shows a nudge GRIDGO offers, fresh, and nothing without one", () => {
    expect(feedbackToShow({ trigger: "streak_3" }, null, "u1", now)).toEqual({ trigger: "streak_3", fresh: true });
    expect(feedbackToShow(null, null, "u1", now)).toBeNull();
    expect(feedbackToShow({ trigger: "streak_3" }, null, null, now)).toBeNull();
  });

  it("holds a shown card until it is closed, after GRIDGO stops offering it", () => {
    const held = { userId: "u1", trigger: "streak_3" as const, shownAt: now - 3_600_000, closed: false };
    expect(feedbackToShow(null, held, "u1", now)).toEqual({ trigger: "streak_3", fresh: false });
  });

  it("shows at most one card per 72 hours, and a closed card stays closed", () => {
    const closed = { userId: "u1", trigger: "streak_3" as const, shownAt: now - 3_600_000, closed: true };
    expect(feedbackToShow({ trigger: "completed_order" }, closed, "u1", now)).toBeNull();
    expect(feedbackToShow({ trigger: "completed_order" }, closed, "u1", now - 3_600_000 + FEEDBACK_COOLDOWN_MS)).toEqual({
      trigger: "completed_order",
      fresh: true,
    });
  });

  it("never carries one account's card to another", () => {
    const held = { userId: "u1", trigger: "streak_3" as const, shownAt: now, closed: false };
    expect(feedbackToShow(null, held, "u2", now)).toBeNull();
  });
});

describe("a tapped reminder", () => {
  it("opens Active, where the check-in card is, not the alerts list", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parsePushData, pushTargetRoute } = require("@/lib/push");
    expect(pushTargetRoute(parsePushData({ type: "tester_reminder" }))).toBe("/(tabs)/active");
  });
});

describe("the rider's feedback link", () => {
  it("opens this app's Play listing, never another app's", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PLAY_FEEDBACK_URL } = require("@/lib/testerProgram");
    expect(PLAY_FEEDBACK_URL).toBe("https://play.google.com/store/apps/details?id=ph.gridgo.rider");
  });
});
