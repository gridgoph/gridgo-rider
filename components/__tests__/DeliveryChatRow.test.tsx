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

// C2BE8E7A: the shop's row sits beside the client's on the same trip.
it("draws the shop's conversation as its own row, with the shop's words", async () => {
  await render(
    <DeliveryChatRow
      party="shop"
      chat={{ status: "open", closesAt: null, retentionHours: 24, unread: 0 }}
      onPress={jest.fn()}
    />,
  );
  expect(screen.getByText("Message the shop")).toBeTruthy();
  expect(screen.queryByText("Message the client")).toBeNull();
  expect(screen.queryByTestId("chat-unread-badge", { includeHiddenElements: true })).toBeNull();
});

it("shows how many shop messages are unread, and says it aloud", async () => {
  await render(
    <DeliveryChatRow
      party="shop"
      chat={{ status: "open", closesAt: null, retentionHours: 24, unread: 2 }}
      onPress={jest.fn()}
    />,
  );
  // Drawn for the eye; the row's label already says it to a screen reader.
  const hidden = { includeHiddenElements: true };
  expect(screen.getByTestId("chat-unread-badge", hidden)).toBeTruthy();
  expect(screen.getByText("2 new", hidden)).toBeTruthy();
  expect(screen.getByLabelText("2 new messages from the shop. Message the shop about this pick-up")).toBeTruthy();
});

it("keeps a finished job's shop messages readable, still counting what is unread", async () => {
  await render(
    <DeliveryChatRow
      party="shop"
      chat={{ status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24, unread: 12 }}
      onPress={jest.fn()}
    />,
  );
  expect(screen.getByText("Messages with the shop")).toBeTruthy();
  expect(screen.getByText("9+ new", { includeHiddenElements: true })).toBeTruthy();
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
