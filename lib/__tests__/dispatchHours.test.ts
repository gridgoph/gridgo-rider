import { ApiError, getOperatingStatus } from "@/lib/api";
import { closedFromRefusal, dispatchClosedSentence, dispatchOpensLine } from "@/lib/dispatchHours";

// Wednesday 4 Nov 2026 in Manila. 09:30Z is 5:30 PM there, after closing.
const WED_EVENING = Date.parse("2026-11-04T09:30:00.000Z");
const at = (iso: string) => `${iso}.000Z`;

describe("dispatchOpensLine", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  // Each of these zones puts a different local day under one of the instants.
  describe.each(["Asia/Manila", "UTC", "America/Los_Angeles", "Pacific/Kiritimati"])("on a phone set to %s", (zone) => {
    beforeEach(() => {
      process.env.TZ = zone;
    });

    it("says today before opening on the same Manila day", () => {
      // 00:30 Thursday in Manila is still Wednesday in UTC and Los Angeles.
      expect(dispatchOpensLine(at("2026-11-05T00:00:00"), Date.parse("2026-11-04T16:30:00.000Z"))).toBe(
        "Opens 8:00 AM today",
      );
    });

    it("says tomorrow after closing", () => {
      expect(dispatchOpensLine(at("2026-11-05T00:00:00"), WED_EVENING)).toBe("Opens 8:00 AM tomorrow");
    });

    it("names the weekday across a closed Sunday", () => {
      // Saturday 5:30 PM in Manila, opening Monday.
      expect(dispatchOpensLine(at("2026-11-09T00:00:00"), Date.parse("2026-11-07T09:30:00.000Z"))).toBe(
        "Opens 8:00 AM Monday",
      );
    });
  });

  it("uses the schedule's real time, not a fixed 8:00 AM", () => {
    expect(dispatchOpensLine(at("2026-11-05T01:30:00"), WED_EVENING)).toBe("Opens 9:30 AM tomorrow");
    expect(dispatchOpensLine(at("2026-11-05T04:00:00"), WED_EVENING)).toBe("Opens 12:00 PM tomorrow");
    expect(dispatchOpensLine(at("2026-11-05T05:05:00"), WED_EVENING)).toBe("Opens 1:05 PM tomorrow");
    expect(dispatchOpensLine(at("2026-11-04T16:00:00"), WED_EVENING)).toBe("Opens 12:00 AM tomorrow");
  });

  it("names the coming weekday up to six days out", () => {
    expect(dispatchOpensLine(at("2026-11-10T00:00:00"), WED_EVENING)).toBe("Opens 8:00 AM Tuesday");
  });

  it("carries the date a week or more out, where a weekday alone would mislead", () => {
    expect(dispatchOpensLine(at("2026-11-11T00:00:00"), WED_EVENING)).toBe("Opens 8:00 AM Wednesday, Nov 11");
    expect(dispatchOpensLine(at("2027-01-04T00:00:00"), WED_EVENING)).toBe("Opens 8:00 AM Monday, Jan 4");
  });

  it("does not call a past moment tomorrow on a phone whose clock is ahead", () => {
    expect(dispatchOpensLine(at("2026-11-03T00:00:00"), WED_EVENING)).toBe("Opens 8:00 AM Tuesday, Nov 3");
  });

  it("makes no time up without one", () => {
    expect(dispatchOpensLine(null, WED_EVENING)).toBe("Check back during operating hours");
    expect(dispatchOpensLine("not a date", WED_EVENING)).toBe("Check back during operating hours");
  });
});

it("writes the notice as one sentence", () => {
  expect(dispatchClosedSentence(at("2026-11-05T00:00:00"), WED_EVENING)).toBe(
    "Dispatch is closed. Opens 8:00 AM tomorrow.",
  );
  expect(dispatchClosedSentence(null, WED_EVENING)).toBe("Dispatch is closed. Check back during operating hours.");
});

describe("closedFromRefusal", () => {
  it("reads the next opening from the API's refusal", () => {
    const refusal = new ApiError(409, { error: "outside_operating_hours", scheduledReviewAt: at("2026-11-05T00:00:00") });
    expect(closedFromRefusal(refusal)).toEqual({ isOpenNow: false, scheduledReviewAt: at("2026-11-05T00:00:00") });
  });

  it("still means closed without a time", () => {
    expect(closedFromRefusal(new ApiError(409, { error: "outside_operating_hours" }))).toEqual({
      isOpenNow: false,
      scheduledReviewAt: null,
    });
  });

  it("ignores every other failure", () => {
    expect(closedFromRefusal(new ApiError(409, { error: "not_offerable" }))).toBeNull();
    expect(closedFromRefusal(new TypeError("Network request failed"))).toBeNull();
  });
});

describe("getOperatingStatus", () => {
  const originalFetch = global.fetch;
  const respond = (body: unknown) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  };
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reads the envelope beside the settings", async () => {
    const operatingStatus = { isOpenNow: false, scheduledReviewAt: at("2026-11-05T00:00:00") };
    respond({ version: 1, settings: {}, operatingStatus });
    expect(await getOperatingStatus()).toMatchObject(operatingStatus);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toMatch(/\/settings$/);
  });

  it.each([{ settings: {} }, { operatingStatus: {} }])("says nothing from an answer without the hours: %p", async (body) => {
    respond(body);
    expect(await getOperatingStatus()).toBeNull();
  });
});
