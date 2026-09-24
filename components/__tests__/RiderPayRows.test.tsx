import { render, screen } from "@testing-library/react-native";

import { RiderPayRows } from "@/components/RiderPayRows";

describe("RiderPayRows", () => {
  it("reads like a receipt when GRIDGO keeps a share", async () => {
    await render(
      <RiderPayRows
        order={{ deliveryFeeMinor: 2500, riderCommissionBps: 8500, riderPayoutMinor: 2125 }}
        label="You earn"
        last
      />,
    );

    expect(screen.getByText("Delivery fee")).toBeTruthy();
    expect(screen.getByText("₱25.00")).toBeTruthy();
    expect(screen.getByText("You earn (85%)")).toBeTruthy();
    expect(screen.getByText("₱21.25")).toBeTruthy();
  });

  it("is one line, the whole fee, without the split", async () => {
    await render(<RiderPayRows order={{ deliveryFeeMinor: 2500 }} label="You earn" last />);

    expect(screen.getByText("You earn")).toBeTruthy();
    expect(screen.getByText("₱25.00")).toBeTruthy();
    expect(screen.queryByText("Delivery fee")).toBeNull();
  });
});
