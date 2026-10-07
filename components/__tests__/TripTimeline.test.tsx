import { render, screen } from "@testing-library/react-native";

import { TripTimeline } from "@/components/TripTimeline";
import type { Order } from "@/lib/api";

const placed: Order["timeline"][number] = {
  at: "2026-08-31T15:24:00.000Z",
  state: "submitted",
  by: "user_client",
  note: "Placed; payment sent for confirmation",
};

const accepted: Order["timeline"][number] = {
  at: "2026-08-31T16:05:00.000Z",
  state: "rider_assigned",
  by: "user_rider",
  note: "Rider accepted",
};

describe("TripTimeline", () => {
  it("renders the rider API progress projection without actor fields", async () => {
    await render(
      <TripTimeline
        timeline={[
          { at: placed.at, state: "submitted", note: "Order submitted" },
          { at: accepted.at, state: "rider_assigned", note: "Rider assigned" },
        ]}
        selfId="user_rider"
      />,
    );

    expect(screen.getByLabelText("Head to pickup, current status")).toBeTruthy();
    expect(screen.getByText("Order submitted")).toBeTruthy();
    expect(screen.getByText("Rider assigned")).toBeTruthy();
    expect(screen.getAllByText(/^GRIDGO ·/)).toHaveLength(2);
  });

  it("renders the latest status first, with the current dot on that row", async () => {
    await render(<TripTimeline timeline={[placed, accepted]} selfId="user_rider" />);

    expect(screen.getByLabelText("Head to pickup, current status")).toBeTruthy();
    expect(screen.getByTestId("timeline-current-dot")).toBeTruthy();

    const latest = screen.getByText("Head to pickup");
    const oldest = screen.getByText("In progress");
    const texts = screen.getAllByText(/Head to pickup|In progress/);
    expect(texts[0]).toBe(latest);
    expect(texts[1]).toBe(oldest);
    expect(screen.getByText("Rider accepted")).toBeTruthy();
    expect(screen.getByText(/You ·/)).toBeTruthy();
  });
});
