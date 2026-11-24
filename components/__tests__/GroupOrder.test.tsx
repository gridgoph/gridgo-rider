import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

import { GroupArrivalEstimate } from "@/components/GroupArrivalEstimate";
import { GroupOrderTag } from "@/components/GroupOrderTag";
import { OfferSheet } from "@/components/OfferSheet";
import { TripPanel } from "@/components/TripPanel";
import type { Order } from "@/lib/api";
import { TripContacts } from "@/components/TripContacts";
import { GROUP_BACKUP_REFRESH_MS, useGroupBackup } from "@/hooks/useGroupBackup";
import { useGroupArrivalEstimate } from "@/store/groupArrivalEstimate";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/hooks/useRoute", () => ({ useRoute: () => ({ route: null }) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  shareGroupArrivalEstimate: jest.fn(),
  getGroupBackup: jest.fn(),
}));

const api = jest.requireMock("@/lib/api") as { shareGroupArrivalEstimate: jest.Mock; getGroupBackup: jest.Mock };
const actual = jest.requireActual("@/lib/api") as typeof import("@/lib/api");
const GROUP = { id: "grp_1", memberCount: 4, hostName: "Host Person" };
const open = { status: "open", closesAt: null, retentionHours: 24 };

beforeEach(() => {
  jest.clearAllMocks();
  useGroupArrivalEstimate.getState().clear();
});

describe("the group tag (F54BDF7A)", () => {
  it("says how many people and who the host is, and is absent on an ordinary job", async () => {
    await render(<GroupOrderTag order={{ groupOrder: GROUP }} />);
    expect(screen.getByText("Group order, 4 people")).toBeTruthy();
    expect(screen.getByText("Host: Host Person")).toBeTruthy();
    expect(screen.getByLabelText(/Hand everything to Host Person, the host/)).toBeTruthy();

    await render(<GroupOrderTag order={{}} />);
    expect(screen.queryByTestId("group-order-tag")).toBeNull();
  });
});

describe("contacting the host", () => {
  it("names the host on the call and message row of a group job, the client otherwise", async () => {
    await render(
      <TripContacts trip={{ id: "ord_1", state: "out_for_delivery", deliveryChat: open, groupOrder: GROUP }} onCall={jest.fn()} />,
    );
    expect(screen.getByText("Message the host")).toBeTruthy();
    expect(screen.getByLabelText("Call the host")).toBeTruthy();
    expect(screen.queryByText("Message the client")).toBeNull();

    await render(<TripContacts trip={{ id: "ord_1", state: "out_for_delivery", deliveryChat: open }} onCall={jest.fn()} />);
    expect(screen.getByText("Message the client")).toBeTruthy();
  });
});

describe("sharing an arrival estimate", () => {
  const trip = { id: "ord_1", state: "out_for_delivery", groupOrder: GROUP };

  it("sends the tapped minutes at once and says the time the group now sees", async () => {
    api.shareGroupArrivalEstimate.mockResolvedValue({ estimatedArrivalAt: "2026-11-24T07:42:00.000Z" });
    await render(<GroupArrivalEstimate order={trip} routeSeconds={540} />);
    expect(screen.getByText("Tell the group when you will arrive")).toBeTruthy();
    expect(screen.getByText(/The map says about 9 min/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Arriving in 10 minutes"));
    expect(api.shareGroupArrivalEstimate).toHaveBeenCalledWith("ord_1", 10);
    expect(await screen.findByText("Arrival time shared with the group")).toBeTruthy();
    expect(screen.getByText(/The group sees about .*Running late\? Tap a new time\./)).toBeTruthy();
    expect(screen.getByLabelText("Arriving in 10 minutes").props.accessibilityState.selected).toBe(true);
  });

  it("says plainly when the server refuses, and keeps nothing as shared", async () => {
    api.shareGroupArrivalEstimate.mockRejectedValue(new actual.ApiError(409, { error: "group_delivery_not_active" }));
    await render(<GroupArrivalEstimate order={trip} />);
    await fireEvent.press(screen.getByLabelText("Arriving in 5 minutes"));
    expect(await screen.findByText(/once you have picked the job up/)).toBeTruthy();
    expect(useGroupArrivalEstimate.getState().byOrder.ord_1).toBeUndefined();
  });

  it("is not offered before pick-up or on an ordinary job", async () => {
    await render(<GroupArrivalEstimate order={{ ...trip, state: "rider_assigned" }} />);
    expect(screen.queryByTestId("group-arrival-estimate")).toBeNull();
    await render(<GroupArrivalEstimate order={{ id: "ord_2", state: "out_for_delivery" }} />);
    expect(screen.queryByTestId("group-arrival-estimate")).toBeNull();
  });
});

describe("the backup receiver read", () => {
  function Probe({ order }: { order: Parameters<typeof useGroupBackup>[0] }) {
    const { load } = useGroupBackup(order);
    const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
    return <Text testID="probe">{load.status === "ready" ? (load.backup.unlocked ? "open" : "locked") : load.status}</Text>;
  }
  const order = { id: "ord_1", state: "out_for_delivery", fulfillmentMode: "delivery", groupOrder: GROUP };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AppState, "addEventListener").mockImplementation(
      () => ({ remove: () => undefined }) as ReturnType<typeof AppState.addEventListener>,
    );
  });
  afterEach(() => jest.useRealTimers());

  it("asks again while locked and stops once the server unlocks it", async () => {
    api.getGroupBackup.mockResolvedValue({ unlocked: false });
    await render(<Probe order={order} />);
    await waitFor(() => expect(screen.getByTestId("probe").props.children).toBe("locked"));
    expect(api.getGroupBackup).toHaveBeenCalledTimes(1);

    api.getGroupBackup.mockResolvedValue({ unlocked: true, receiver: { name: "B", phone: "1" } });
    await act(async () => {
      jest.advanceTimersByTime(GROUP_BACKUP_REFRESH_MS);
    });
    await waitFor(() => expect(screen.getByTestId("probe").props.children).toBe("open"));
    expect(api.getGroupBackup).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(GROUP_BACKUP_REFRESH_MS * 3);
    });
    expect(api.getGroupBackup).toHaveBeenCalledTimes(2);
  });

  it("never asks on an ordinary job", async () => {
    await render(<Probe order={{ id: "ord_2", state: "out_for_delivery", fulfillmentMode: "delivery" }} />);
    await act(async () => {
      jest.advanceTimersByTime(GROUP_BACKUP_REFRESH_MS * 2);
    });
    expect(screen.getByTestId("probe").props.children).toBe("off");
    expect(api.getGroupBackup).not.toHaveBeenCalled();
  });
});

describe("the offer and the trip panel", () => {
  const base = {
    id: "ord_1",
    clientId: "user_host",
    supplierId: "user_shop",
    riderId: "user_rider",
    state: "out_for_delivery",
    fulfillmentMode: "delivery",
    title: "Group Express",
    quantity: 1,
    deliveryFeeMinor: 8_900,
    pickup: { lat: 7.06, lng: 125.6, label: "Shop, Matina" },
    dropoff: { lat: 7.07, lng: 125.61, label: "Bajada" },
    deliveryChat: open,
    timeline: [],
    dispatchOffer: { id: "off_1" },
  } as unknown as Order;

  it("tags a group offer with its people and host, and leaves an ordinary offer as it was", async () => {
    const props = { secondsLeft: null, fractionLeft: null, busy: null, error: null, onAccept: jest.fn(), onDecline: jest.fn() };
    const cashAmounts = { shopMinor: 1_000, collectMinor: 10_350, gridgoMinor: 2_230, riderMinor: 7_120 };
    const cash = { method: "cash", version: 1, status: "due" };
    await render(<OfferSheet offer={{ ...base, state: "ready_for_dispatch", groupOrder: GROUP, cash, cashAmounts } as Order} {...props} />);
    expect(screen.getByText("Group order, 4 people, host Host Person")).toBeTruthy();
    // The cash slip names who pays: the host, for everyone — the server's own figure.
    expect(screen.getByText("Collect from the host")).toBeTruthy();
    expect(screen.getByText("In cash, for the whole group")).toBeTruthy();
    expect(screen.getByText("+₱103.50")).toBeTruthy();

    await render(<OfferSheet offer={{ ...base, state: "ready_for_dispatch", cash, cashAmounts } as Order} {...props} />);
    expect(screen.queryByTestId("group-order-tag")).toBeNull();
    expect(screen.getByText("Collect from the client")).toBeTruthy();
  });

  it("on the way, shows the tag and the estimate; at the door, the locked backup", async () => {
    api.getGroupBackup.mockResolvedValue({ unlocked: false });
    const panel = {
      phase: "complete" as const,
      action: { kind: "none" as const },
      stop: null,
      routeSummary: null,
      busy: false,
      error: null,
      onAction: jest.fn(),
      onDone: jest.fn(),
    };
    const trip = { ...base, groupOrder: GROUP };
    await render(<TripPanel trip={trip} step="to_client" {...panel} />);
    expect(screen.getByText("Group order, 4 people, host Host Person")).toBeTruthy();
    expect(screen.getByTestId("group-arrival-estimate")).toBeTruthy();
    expect(screen.queryByText("Backup receiver, locked")).toBeNull();
    expect(screen.getByLabelText("Call the host")).toBeTruthy();

    await render(<TripPanel trip={trip} step="hand_over" {...panel} />);
    expect(await screen.findByText("Backup receiver, locked")).toBeTruthy();
    expect(screen.queryByTestId("group-arrival-estimate")).toBeNull();

    await render(<TripPanel trip={base} step="hand_over" {...panel} />);
    expect(screen.queryByTestId("group-order-tag")).toBeNull();
    expect(screen.queryByText("Backup receiver, locked")).toBeNull();
    expect(screen.getByLabelText("Call the client")).toBeTruthy();
  });
});
