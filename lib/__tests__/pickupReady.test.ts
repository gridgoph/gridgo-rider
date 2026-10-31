import { pickupReadyLabel } from "@/lib/pickupReady";

const now = Date.parse("2026-10-31T02:00:00.000Z"); // 10:00 AM in Davao

describe("pickupReadyLabel", () => {
  it("says the shop's ready time as a pickup time, in Davao time", () => {
    expect(pickupReadyLabel({ readyBy: "2026-10-31T06:30:00.000Z" }, now)).toBe(
      "Ready for pickup by 2:30 PM today",
    );
    expect(pickupReadyLabel({ readyBy: "2026-11-02T01:05:00.000Z" }, now)).toBe(
      "Ready for pickup by Mon, Nov 2, 9:05 AM",
    );
  });

  it("says ready now once the time has passed", () => {
    expect(pickupReadyLabel({ readyBy: "2026-10-31T01:00:00.000Z" }, now)).toBe("Ready for pickup now");
    expect(pickupReadyLabel({ readyBy: "2026-10-31T02:00:00.000Z" }, now)).toBe("Ready for pickup now");
  });

  it("says nothing without a usable readyBy", () => {
    expect(pickupReadyLabel({}, now)).toBeNull();
    expect(pickupReadyLabel({ readyBy: null }, now)).toBeNull();
    expect(pickupReadyLabel({ readyBy: "" }, now)).toBeNull();
    expect(pickupReadyLabel({ readyBy: "not a date" }, now)).toBeNull();
  });
});
