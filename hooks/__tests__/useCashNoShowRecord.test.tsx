import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { useCashNoShowRecord } from "@/hooks/useCashNoShowRecord";
import type { Order, OrderCashDetail } from "@/lib/api";
import { useCashNoShow } from "@/store/cashNoShow";
import { useSession } from "@/store/session";

const order = {
  id: "ord_1",
  riderId: "user_rider",
  state: "out_for_delivery",
  cash: { method: "cash", version: 3, status: "due", noShowWaitSeconds: 60 },
} as unknown as Order;

const read = (version: number, patch: Partial<OrderCashDetail> = {}): OrderCashDetail => ({
  version,
  status: "due",
  amountDueMinor: 10_350,
  shopPaidAt: "2026-11-18T00:20:00.000Z",
  collectedAt: null,
  noShowApprovedAt: null,
  repaymentConfirmedAt: null,
  noShowStartedAt: null,
  noShowReportedAt: null,
  ...patch,
});

const STARTED = "2026-11-18T08:18:15.804Z";
let renders = 0;

function Probe({ detail, label }: { detail: OrderCashDetail; label: string }) {
  renders += 1;
  const record = useCashNoShowRecord("ord_1", order, detail);
  return <Text testID={label}>{record ? String(record.startedAtMs) : "none"}</Text>;
}

beforeEach(() => {
  renders = 0;
  useSession.setState({
    user: { id: "user_rider", email: "rider@example.test", name: "Rider", role: "rider", verificationStatus: "approved" },
  } as never);
  useCashNoShow.setState({ byOrder: {}, hydrated: true, serverVersion: {} });
});

/*
  Found in the end-to-end run against gridgo-api#401: the delivery screen stays
  mounted under the no-show screen, each with its own read of the cash record.
  The older read (no wait yet) cleared what the newer one (wait started)
  adopted, and React stopped them with "Maximum update depth exceeded".
*/
it("two screens with reads of different ages settle on the newer one", async () => {
  const screen = await render(
    <>
      <Probe detail={read(2)} label="delivery" />
      <Probe detail={read(3, { noShowStartedAt: STARTED })} label="no-show" />
    </>,
  );
  await waitFor(() => expect(useCashNoShow.getState().byOrder.ord_1?.startedAtMs).toBe(Date.parse(STARTED)));
  expect(screen.getByTestId("no-show").props.children).toBe(String(Date.parse(STARTED)));
  expect(useCashNoShow.getState().serverVersion.ord_1).toBe(3);
  expect(renders).toBeLessThan(20);
});

it("a start the server just accepted survives a read from before it", async () => {
  useCashNoShow.getState().started("ord_1", "call", 1_000, 3);
  await render(<Probe detail={read(2)} label="delivery" />);
  expect(useCashNoShow.getState().byOrder.ord_1?.startedAtMs).toBe(1_000);
});

it("a newer read still overrides: the server's start time replaces the phone's", async () => {
  useCashNoShow.getState().started("ord_1", "call", 1_000, 3);
  await render(<Probe detail={read(3, { noShowStartedAt: STARTED })} label="no-show" />);
  await waitFor(() => expect(useCashNoShow.getState().byOrder.ord_1?.startedAtMs).toBe(Date.parse(STARTED)));
  expect(useCashNoShow.getState().byOrder.ord_1?.contactMethod).toBe("call");
});
