import { fireEvent, render, screen } from "@testing-library/react-native";

import { DeliveryChatRow } from "@/components/DeliveryChatRow";

it("words a delivered conversation as readable until it is removed", async () => {
  await render(
    <DeliveryChatRow
      chat={{ status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24 }}
      onPress={jest.fn()}
    />,
  );
  expect(screen.getByText("Messages with the client")).toBeTruthy();
  expect(screen.getByText(/^Delivered\. Readable until .+, then removed\.$/)).toBeTruthy();
  expect(screen.getByLabelText("Read your messages with the client")).toBeTruthy();
});

// The one press in this file, last.
it("invites a message while the job is the rider's, and opens it on tap", async () => {
  const onPress = jest.fn();
  await render(<DeliveryChatRow chat={{ status: "open", closesAt: null, retentionHours: 24 }} onPress={onPress} />);
  expect(screen.getByText("Message the client")).toBeTruthy();
  expect(screen.getByText(/Neither of you sees a phone number/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Message the client about this delivery"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
