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
});
