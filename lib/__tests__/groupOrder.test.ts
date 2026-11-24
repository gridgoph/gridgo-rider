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

describe("host wording on a group job's door steps", () => {
  // Imported here so the group helpers above stay free of these modules.
  const { handoverBlockReason } = jest.requireActual<typeof import("@/lib/handoverCode")>("@/lib/handoverCode");
  const { receiptDeliveryHold } = jest.requireActual<typeof import("@/lib/acknowledgementReceipt")>("@/lib/acknowledgementReceipt");
  const { tripStepNote } = jest.requireActual<typeof import("@/lib/tripSteps")>("@/lib/tripSteps");
  const { cashSlipRows } = jest.requireActual<typeof import("@/lib/cash")>("@/lib/cash");

  it("asks the host, not a client, and leaves an ordinary job's words alone", () => {
    expect(handoverBlockReason({ status: "ready" } as never, "", "host")).toBe("Enter the six-digit code the host reads aloud.");
    expect(handoverBlockReason({ status: "ready" } as never, "")).toBe("Enter the six-digit code the client reads aloud.");
    expect(receiptDeliveryHold("before_arrival", { status: "idle" } as never, "host")).toMatch(/I'm at the host's door/);
    expect(receiptDeliveryHold("before_arrival", { status: "idle" } as never)).toMatch(/I'm at the client's door/);
  });

  it("says the host pays the whole group's cash, using the server's figure", () => {
    const amounts = { shopMinor: 1_000, collectMinor: 10_350, gridgoMinor: 2_230, riderMinor: 7_120 };
    const order = { id: "o", state: "out_for_delivery", fulfillmentMode: "delivery", cash: { method: "cash", version: 1, status: "due" }, cashAmounts: amounts, groupOrder: group } as never;
    expect(tripStepNote(order, "delivery_proof" as never, "to_client", "carry")).toBe(
      "Ride to the host. They pay exactly ₱103.50 in cash for the whole group.",
    );
    expect(tripStepNote(order, "delivery_proof" as never, "hand_over", "carry")).toMatch(/from the host, for the whole group/);
    expect(cashSlipRows(amounts, "host").find((r) => r.key === "collect")).toMatchObject({ label: "Collect from the host", minor: 10_350 });
  });
});
