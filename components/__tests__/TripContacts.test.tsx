import { fireEvent, render, screen } from "@testing-library/react-native";

import { TripContacts } from "@/components/TripContacts";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const open = { status: "open", closesAt: null, retentionHours: 24 };
const shopOpen = { ...open, unread: 0 };

/**
 * Who the rider can call from the trip, and when. Each Call sits on its own
 * person's row, so "Call the shop" and "Call the client" are never one control.
 */
describe("call buttons on the trip", () => {
  it("offers a separate call to the shop and to the client while heading to the shop", async () => {
    const onCall = jest.fn();
    await render(
      <TripContacts trip={{ id: "ord_1", state: "rider_assigned", deliveryChat: open, pickupChat: shopOpen }} onCall={onCall} />,
    );
    expect(screen.getByText("Message the shop")).toBeTruthy();
    expect(screen.getByText("Message the client")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Call the shop"));
    await fireEvent.press(screen.getByLabelText("Call the client"));
    expect(onCall.mock.calls).toEqual([["shop"], ["client"]]);
  });

  it("takes the shop's call away at pick-up and says why, keeping the client's", async () => {
    await render(
      <TripContacts trip={{ id: "ord_1", state: "out_for_delivery", deliveryChat: open, pickupChat: shopOpen }} onCall={jest.fn()} />,
    );
    expect(screen.queryByLabelText("Call the shop")).toBeNull();
    expect(screen.getByText("Calls with the shop end at pick-up. You can still message them.")).toBeTruthy();
    expect(screen.getByLabelText("Call the client")).toBeTruthy();
  });

  it("offers no call to anyone once the job is delivered", async () => {
    const readOnly = { status: "read_only", closesAt: null, retentionHours: 24 };
    await render(
      <TripContacts trip={{ id: "ord_1", state: "delivered", deliveryChat: readOnly, pickupChat: { ...readOnly, unread: 0 } }} onCall={jest.fn()} />,
    );
    expect(screen.queryByLabelText(/^Call the/)).toBeNull();
    expect(screen.getByText("Messages with the client")).toBeTruthy();
  });

  it("puts each Call under its own row, naming the person, when text is large", async () => {
    const spy = jest
      .spyOn(jest.requireActual("react-native"), "useWindowDimensions")
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.3 });
    try {
      await render(
        <TripContacts trip={{ id: "ord_1", state: "rider_assigned", deliveryChat: open, pickupChat: shopOpen }} onCall={jest.fn()} />,
      );
      expect(screen.getByText("Call the shop")).toBeTruthy();
      expect(screen.getByText("Call the client")).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("has no client call on a job carried to GRIDGO Office", async () => {
    await render(<TripContacts trip={{ id: "ord_1", state: "rider_assigned", pickupChat: shopOpen }} onCall={jest.fn()} />);
    expect(screen.getByLabelText("Call the shop")).toBeTruthy();
    expect(screen.queryByLabelText("Call the client")).toBeNull();
  });
});
