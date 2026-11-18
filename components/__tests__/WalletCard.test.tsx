import { render, screen } from "@testing-library/react-native";

import { WalletCard } from "@/components/WalletCard";

const read = {
  wallet: { balanceMinor: 8_550, reservedMinor: 2_230, availableMinor: 6_320, lowBalance: true, topupAmountsMinor: [20_000, 50_000, 100_000] },
  activity: [
    {
      id: "a1",
      type: "topup_pending",
      orderId: null,
      at: "2026-11-18T01:00:00Z",
      balanceDeltaMinor: 0,
      availableDeltaMinor: 0,
      reservedDeltaMinor: 0,
      amountMinor: 20_000,
      reference: "REF1",
    },
  ],
  incidents: [],
};

describe("WalletCard", () => {
  it("with cash on: balance, held money, the low-balance chip and three top-up amounts", async () => {
    await render(<WalletCard wallet={read} error={null} cashOn onRetry={jest.fn()} onTopup={jest.fn()} />);
    expect(screen.getByText("₱85.50")).toBeTruthy();
    expect(screen.getByText("Held for jobs in hand")).toBeTruthy();
    expect(screen.getByText("Low balance")).toBeTruthy();
    for (const amount of ["₱200", "₱500", "₱1,000"]) expect(screen.getByRole("button", { name: `Top up ${amount}` })).toBeTruthy();
    expect(screen.getByText("Checking")).toBeTruthy();
  });

  it("with cash off: the balance and history stay, top-up and cash wording go", async () => {
    await render(<WalletCard wallet={read} error={null} cashOn={false} onRetry={jest.fn()} onTopup={jest.fn()} />);
    expect(screen.getByText("₱85.50")).toBeTruthy();
    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.queryByText("Available for cash jobs")).toBeNull();
    expect(screen.queryByText("Low balance")).toBeNull();
    expect(screen.queryByText("Top up")).toBeNull();
    expect(screen.getByText("Ref REF1")).toBeTruthy();
  });

  /*
    Cash review P3: a rider who took cash jobs before a Super Admin turned cash
    off keeps every row of that history, worded without cash.
  */
  const row = (id: string, type: string, patch: Record<string, number> = {}) => ({
    id,
    type,
    orderId: "ord_1",
    at: `2026-11-18T0${id.slice(1)}:00:00Z`,
    balanceDeltaMinor: 0,
    availableDeltaMinor: 0,
    reservedDeltaMinor: 0,
    amountMinor: 0,
    ...patch,
  });
  const cashJob = {
    ...read,
    activity: [
      row("c1", "wallet_reserved", { availableDeltaMinor: -2_230, reservedDeltaMinor: 2_230, amountMinor: 2_230 }),
      row("c2", "shop_paid", { amountMinor: 1_000 }),
      row("c3", "cash_collected", { amountMinor: 10_350 }),
      row("c4", "gridgo_share_debited", { balanceDeltaMinor: -2_230, reservedDeltaMinor: -2_230, amountMinor: 2_230 }),
      row("c5", "cash_incident_resolution", { amountMinor: 1_000 }),
    ],
  };

  it("with cash off: a real cash job's history stays, without cash wording", async () => {
    await render(<WalletCard wallet={cashJob} error={null} cashOn={false} onRetry={jest.fn()} onTopup={jest.fn()} />);

    expect(screen.getAllByTestId("wallet-activity-row")).toHaveLength(5);
    for (const title of ["Held for a job", "Paid the shop", "Collected from the client", "GRIDGO's share taken", "Shop repaid you"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getAllByText("Outside wallet")).toHaveLength(3);
    expect(screen.queryAllByText(/cash/i)).toHaveLength(0);
    for (const item of screen.getAllByTestId("wallet-activity-row")) {
      expect(String(item.props.accessibilityLabel)).not.toMatch(/cash/i);
    }
  });

  it("with cash on: the same history says which money changed hands in cash", async () => {
    await render(<WalletCard wallet={cashJob} error={null} cashOn onRetry={jest.fn()} onTopup={jest.fn()} />);
    expect(screen.getByText("Held for a cash job")).toBeTruthy();
    expect(screen.getAllByText("In cash")).toHaveLength(3);
  });
});
