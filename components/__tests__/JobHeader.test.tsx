import { fireEvent, render, screen, within } from "@testing-library/react-native";

import { JobHeader } from "@/components/JobHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import type { Order, PickupChecklistRecord } from "@/lib/api";
import { jobProgress } from "@/lib/jobProgress";
import { PICKUP_CHECK_CODES } from "@/lib/pickupChecklist";
import { endsAtOffice, primaryActionLabel, tripPhase } from "@/lib/riderOrder";
import { tripDestination, tripShop } from "@/lib/tripNav";

const RIDER = "user_rider";

function checklist(
  status: PickupChecklistRecord["status"],
  overrides: Partial<PickupChecklistRecord> = {},
): PickupChecklistRecord {
  return {
    status,
    checks: PICKUP_CHECK_CODES.map((code) => ({ code, passed: status !== "failed_escalated" })),
    evidenceFileIds: [],
    failureNote: null,
    completedAt: "2026-10-31T01:00:00.000Z",
    completedBy: RIDER,
    escalationId: null,
    signOffPrompt: null,
    ...overrides,
  };
}

const BASE = {
  id: "ord_1",
  riderId: RIDER,
  state: "rider_assigned",
  fulfillmentMode: "delivery",
  handoverFlow: "rider_packs",
  pickupChecklist: null,
  shopHandover: {},
  zone: "davao_central",
  address: "Matina Crossing, Davao City",
  pickup: { lat: 7.09, lng: 125.61, label: "PrintRight Bajada" },
  dropoff: { lat: 7.06, lng: 125.6, label: "Matina Crossing, Davao City" },
} as unknown as Order;

const INSPECTED = checklist("inspected", { inspectionId: "insp_1" });
const PASSED = checklist("passed", { signOffPrompt: "All six checks passed." });

/**
 * Renders the header the way Active does: the same phase, labels and action
 * from the same helpers, with the sign-off's secondary button as a child while
 * it is owed.
 */
async function renderJob(overrides: Partial<Order>) {
  const order = { ...BASE, ...overrides } as Order;
  const phase = tripPhase(order);
  const label = primaryActionLabel(phase, endsAtOffice(order));
  const onPress = jest.fn();
  await render(
    <JobHeader
      pickup={tripShop(order).label}
      dropoff={tripDestination(order).label}
      progress={jobProgress(order, phase)}
      action={label ? { label, onPress } : null}
    >
      {phase === "start_delivery" ? <SecondaryButton label="Show me the checkpoint again" /> : null}
    </JobHeader>,
  );
  return { order, label };
}

/** The buttons drawn in `actionYellow` — the screen's primary move — by their words. */
function primaryLabels() {
  return screen
    .queryAllByRole("button")
    .filter((button) => String(button.props.className).includes("bg-action-yellow"))
    .map((button) => within(button).queryAllByText(/.+/).map((text) => text.props.children).join(""));
}

function secondaryLabels() {
  return screen
    .queryAllByRole("button")
    .filter((button) => !String(button.props.className).includes("bg-action-yellow"))
    .map((button) => within(button).queryAllByText(/.+/).map((text) => text.props.children).join(""));
}

function railLabel() {
  return screen.getByLabelText(/^(NEXT STEP|ON HOLD|ALL STEPS DONE)/).props.accessibilityLabel as string;
}

describe("JobHeader through every step of a rider_packs job", () => {
  it.each([
    {
      name: "unpacked check",
      overrides: {},
      title: "Check unpacked",
      overline: "NEXT STEP · 1 OF 5",
      primary: "Check with the supplier",
      rail: "Check unpacked: next. Packed photo: to do",
      pickupDone: false,
    },
    {
      name: "packed photo",
      overrides: { pickupChecklist: INSPECTED },
      title: "Packed photo",
      overline: "NEXT STEP · 2 OF 5",
      primary: "Photograph the packed job",
      rail: "Check unpacked: done. Packed photo: next. Shop signs: to do",
      pickupDone: false,
    },
    {
      name: "shop signature",
      overrides: {
        pickupChecklist: INSPECTED,
        shopHandover: { packingPhotos: [{ at: "2026-10-31T01:05:00.000Z", by: RIDER, fileId: "f", inspectionId: "insp_1" }] },
      },
      title: "Shop signs",
      overline: "NEXT STEP · 3 OF 5",
      primary: "Shop signs the handoff",
      rail: "Packed photo: done. Shop signs: next. Set off: to do",
      pickupDone: false,
    },
    {
      name: "set off",
      overrides: { state: "picked_up", pickupChecklist: PASSED },
      title: "Set off",
      overline: "NEXT STEP · 4 OF 5",
      primary: "Start delivery",
      rail: "Shop signs: done. Set off: next. Hand over: to do",
      pickupDone: true,
    },
    {
      name: "hand over",
      overrides: { state: "out_for_delivery", pickupChecklist: PASSED },
      title: "Hand over",
      overline: "NEXT STEP · 5 OF 5",
      primary: "Confirm delivery",
      rail: "Set off: done. Hand over: next",
      pickupDone: true,
    },
  ])("$name: both stops, the next step, its done marks and one primary button", async (step) => {
    await renderJob(step.overrides as Partial<Order>);

    expect(screen.getByText("PrintRight Bajada")).toBeTruthy();
    expect(screen.getByText("Matina Crossing, Davao City")).toBeTruthy();
    expect(screen.getByText(step.overline)).toBeTruthy();
    // Once as the headline, once on the rail.
    expect(screen.getAllByText(step.title)).toHaveLength(2);
    expect(railLabel()).toContain(step.rail);
    expect(screen.queryAllByText("PICKUP · DONE")).toHaveLength(step.pickupDone ? 1 : 0);
    expect(screen.queryByText("DROP-OFF · DONE")).toBeNull();
    expect(primaryLabels()).toEqual([step.primary]);
  });

  it("keeps the sign-off's button secondary under the Start delivery step", async () => {
    await renderJob({ state: "picked_up", pickupChecklist: PASSED });

    expect(primaryLabels()).toEqual(["Start delivery"]);
    expect(secondaryLabels()).toEqual(["Show me the checkpoint again"]);
  });

  it("offers no primary button, and holds the check, while a failed check is with Operations", async () => {
    await renderJob({ pickupChecklist: checklist("failed_escalated", { escalationId: "esc_1" }) });

    expect(screen.getByText("ON HOLD")).toBeTruthy();
    expect(screen.getByText("Wait for Operations")).toBeTruthy();
    expect(railLabel()).toContain("Check unpacked: on hold");
    expect(primaryLabels()).toEqual([]);
  });

  it("marks both stops and every step done once delivered, with nothing left to press", async () => {
    await renderJob({ state: "delivered", pickupChecklist: PASSED });

    expect(screen.getByText("ALL STEPS DONE")).toBeTruthy();
    expect(screen.getByText("PICKUP · DONE")).toBeTruthy();
    expect(screen.getByText("DROP-OFF · DONE")).toBeTruthy();
    expect(railLabel()).not.toMatch(/next|to do|on hold/);
    expect(primaryLabels()).toEqual([]);
  });

  it("fires the step's own move from its button", async () => {
    const order = { ...BASE, pickupChecklist: INSPECTED } as Order;
    const onPress = jest.fn();
    await render(
      <JobHeader
        pickup="PrintRight Bajada"
        dropoff="Matina Crossing, Davao City"
        progress={jobProgress(order, tripPhase(order))}
        action={{ label: "Photograph the packed job", onPress }}
      />,
    );

    fireEvent.press(screen.getByRole("button", { name: "Photograph the packed job" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("JobHeader on other jobs", () => {
  it("draws a legacy counter's check and signature as one step", async () => {
    await renderJob({ handoverFlow: "legacy" });

    expect(screen.getByText("NEXT STEP · 1 OF 3")).toBeTruthy();
    expect(screen.getAllByText("Check and sign").length).toBeGreaterThan(0);
    expect(primaryLabels()).toEqual(["Check with the supplier"]);
  });

  it("names GRIDGO Office as the drop-off and the last step a drop-off", async () => {
    await renderJob({ fulfillmentMode: "pickup", state: "out_for_delivery", pickupChecklist: PASSED });

    expect(screen.getByText(tripDestination({ ...BASE, fulfillmentMode: "pickup" } as Order).label)).toBeTruthy();
    expect(screen.getAllByText("Drop off").length).toBeGreaterThan(0);
    expect(primaryLabels()).toEqual(["Confirm drop-off"]);
  });
});
