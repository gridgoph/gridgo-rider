import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useRouter: () => jest.requireMock("expo-router").router,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/store/sheets", () => ({
  askConfirm: jest.fn(async () => false),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listNotifications: jest.fn(),
  listOrders: jest.fn(),
  deleteNotification: jest.fn(),
  markNotificationsRead: jest.fn(async () => undefined),
}));

import AlertsScreen from "@/app/alerts";
import type { Notification, Order } from "@/lib/api";
import { invalidate } from "@/lib/live";
import { askConfirm } from "@/store/sheets";
import { useNotifications } from "@/store/notifications";

const api = jest.requireMock("@/lib/api") as {
  listNotifications: jest.Mock;
  listOrders: jest.Mock;
  deleteNotification: jest.Mock;
};

const dispatch: Notification = {
  id: "ntf_1",
  userId: "user_rider",
  title: "Out for delivery",
  body: "Your order is on the way.",
  read: false,
  at: "2026-09-01T03:57:00.000Z",
  orderId: "ord_1",
};

describe("AlertsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNotifications.setState({ items: null, unread: 0, readIds: [], hydrated: true });
    api.listNotifications.mockResolvedValue([dispatch]);
    api.listOrders.mockResolvedValue([]);
    api.deleteNotification.mockResolvedValue({
      id: dispatch.id,
      deletedAt: "2026-09-01T04:00:00.000Z",
    });
    (askConfirm as jest.Mock).mockResolvedValue(false);
  });

  it("offers Clear notifications when the list has alerts", async () => {
    await render(<AlertsScreen />);

    expect(await screen.findByText("Clear notifications")).toBeTruthy();
    expect(screen.getByText(dispatch.title)).toBeTruthy();
  });

  it("hides Clear notifications when the list is already empty", async () => {
    api.listNotifications.mockResolvedValue([]);
    await render(<AlertsScreen />);

    expect(await screen.findByText("Nothing from dispatch")).toBeTruthy();
    expect(screen.queryByText("Clear notifications")).toBeNull();
  });

  it("asks before deleting and leaves the list when the rider keeps them", async () => {
    await render(<AlertsScreen />);
    await fireEvent.press(await screen.findByText("Clear notifications"));

    expect(askConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "Clear these notifications?",
        confirmLabel: "Clear notifications",
        cancelLabel: "Keep them",
        destructive: true,
      }),
    );
    expect(api.deleteNotification).not.toHaveBeenCalled();
    expect(screen.getByText(dispatch.title)).toBeTruthy();
  });

  it("empties the list after the rider confirms", async () => {
    (askConfirm as jest.Mock).mockResolvedValue(true);
    await render(<AlertsScreen />);
    await fireEvent.press(await screen.findByText("Clear notifications"));

    await waitFor(() => expect(api.deleteNotification).toHaveBeenCalledWith("ntf_1"));
    expect(await screen.findByText("Nothing from dispatch")).toBeTruthy();
    expect(screen.queryByText(dispatch.title)).toBeNull();
    expect(screen.queryByText("Clear notifications")).toBeNull();
  });
});


it("updates the visible inbox from a silent notification event without navigation", async () => {
  const { invalidate } = require("@/lib/live");
  api.listNotifications.mockResolvedValue([]);
  api.listOrders.mockResolvedValue([]);
  await render(<AlertsScreen />);
  await waitFor(() => expect(api.listNotifications).toHaveBeenCalled());
  const incoming = { id:"ntf_live", userId:"owner", title:"Live decision arrived", body:"Open your account", read:false, at:"2026-09-08T00:00:00Z" };
  api.listNotifications.mockResolvedValue([incoming]);
  await act(async () => { invalidate("notifications"); });
  expect(await screen.findByText("Live decision arrived")).toBeTruthy();
});

it("keeps an incoming notification visible when an earlier clear completes", async () => {
  jest.useFakeTimers();
  useNotifications.setState({ items: null, unread: 0, readIds: [], hydrated: true });
  api.listNotifications.mockResolvedValue([dispatch]);
  api.listOrders.mockResolvedValue([]);
  (askConfirm as jest.Mock).mockResolvedValue(true);
  let finish!: () => void;
  api.deleteNotification.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  try {
    await render(<AlertsScreen />);
    await fireEvent.press(screen.getByText("Clear notifications"));
    const incoming = { ...dispatch, id: "b", title: "New dispatch" };
    api.listNotifications.mockResolvedValue([dispatch, incoming]);
    await act(async () => { invalidate("notifications"); await jest.advanceTimersByTimeAsync(100); });
    expect(screen.getByText("New dispatch")).toBeTruthy();
    await act(async () => { finish(); });
    expect(screen.getByText("New dispatch")).toBeTruthy();
    expect(screen.queryByText(dispatch.title)).toBeNull();
    expect(useNotifications.getState().unread).toBe(1);
  } finally { jest.useRealTimers(); }
});

it("keeps newer order stages when an earlier enrichment fails", async () => {
  jest.useFakeTimers();
  useNotifications.setState({ items: null, unread: 0, readIds: [], hydrated: true });
  api.listNotifications.mockResolvedValue([dispatch]);
  let fail!: (error: Error) => void;
  api.listOrders.mockReturnValueOnce(new Promise<Order[]>((_, reject) => { fail = reject; }))
    .mockResolvedValue([{ id: "ord_1", state: "delivered", timeline: [] }]);
  try {
    await render(<AlertsScreen />);
    await act(async () => { invalidate("orders"); await jest.advanceTimersByTimeAsync(100); });
    expect(screen.getByRole("button", { name: /Delivered/ })).toBeTruthy();
    await act(async () => { fail(new Error("offline")); });
    expect(screen.getByRole("button", { name: /Delivered/ })).toBeTruthy();
  } finally { jest.useRealTimers(); }
});
