import {
  ARRIVAL_ESTIMATE_CHOICES,
  backupApplies,
  canShareArrivalEstimate,
  groupHostLabel,
  groupOrderOf,
  groupRefusalMessage,
  groupTagLine,
  groupTagTitle,
  parseGroupBackup,
  receiverWord,
} from "@/lib/groupOrder";

const group = { id: "grp_1", memberCount: 5, hostName: "Host Person" };

describe("the group order on a job (F54BDF7A)", () => {
  it("reads the server's group and nothing on an ordinary job", () => {
    expect(groupOrderOf({ groupOrder: group })).toEqual(group);
    expect(groupOrderOf({})).toBeNull();
    expect(groupOrderOf({ groupOrder: null })).toBeNull();
    expect(groupOrderOf({ groupOrder: { id: "grp_1", memberCount: 0, hostName: "X" } })).toBeNull();
    expect(groupOrderOf({ groupOrder: { id: "grp_1", memberCount: 3, hostName: " " } })).toEqual({
      id: "grp_1",
      memberCount: 3,
      hostName: null,
    });
  });

  it("names the number of people and the one host", () => {
    expect(groupTagTitle(group)).toBe("Group order, 5 people");
    expect(groupHostLabel(group)).toBe("Host: Host Person");
    expect(groupTagLine(group)).toBe("Group order, 5 people, host Host Person");
    expect(groupHostLabel({ ...group, hostName: null })).toBe("Hand everything to the host");
    expect(receiverWord({ groupOrder: group })).toBe("host");
    expect(receiverWord({})).toBe("client");
  });

  it("offers the arrival estimate only after pick-up, inside the API's 1–180 minutes", () => {
    expect(canShareArrivalEstimate({ state: "picked_up", groupOrder: group })).toBe(true);
    expect(canShareArrivalEstimate({ state: "out_for_delivery", groupOrder: group })).toBe(true);
    expect(canShareArrivalEstimate({ state: "rider_assigned", groupOrder: group })).toBe(false);
    expect(canShareArrivalEstimate({ state: "out_for_delivery" })).toBe(false);
    expect(ARRIVAL_ESTIMATE_CHOICES.every((m) => Number.isInteger(m) && m >= 1 && m <= 180)).toBe(true);
  });

  it("asks about a backup only on a group door delivery being carried", () => {
    expect(backupApplies({ state: "out_for_delivery", groupOrder: group, fulfillmentMode: "delivery" })).toBe(true);
    expect(backupApplies({ state: "out_for_delivery", groupOrder: group, fulfillmentMode: "pickup" })).toBe(false);
    expect(backupApplies({ state: "delivered", groupOrder: group, fulfillmentMode: "delivery" })).toBe(false);
    expect(backupApplies({ state: "out_for_delivery", fulfillmentMode: "delivery" })).toBe(false);
  });

  it("opens the backup only on the server's own unlocked answer with a number", () => {
    expect(parseGroupBackup({ backup: { unlocked: false } })).toEqual({ unlocked: false });
    expect(parseGroupBackup({ backup: { unlocked: true, receiver: { name: "B", phone: "+63917" } } })).toEqual({
      unlocked: true,
      receiver: { name: "B", phone: "+63917" },
    });
    // Anything short of that stays locked: no receiver, no phone, a truthy non-true flag.
    expect(parseGroupBackup({ backup: { unlocked: true } })).toEqual({ unlocked: false });
    expect(parseGroupBackup({ backup: { unlocked: true, receiver: { name: "B", phone: "" } } })).toEqual({ unlocked: false });
    expect(parseGroupBackup({ backup: { unlocked: "yes", receiver: { name: "B", phone: "1" } } })).toEqual({ unlocked: false });
    expect(parseGroupBackup(null)).toEqual({ unlocked: false });
  });

  it("puts the group refusals in the rider's words", () => {
    expect(groupRefusalMessage("group_delivery_not_active", "x")).toMatch(/picked the job up/);
    expect(groupRefusalMessage("something_else", "fallback")).toBe("fallback");
  });
});
