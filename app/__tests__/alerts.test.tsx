import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

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
}));

import AlertsScreen from "@/app/alerts";
import type { Notification } from "@/lib/api";
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
    useNotifications.setState({ unread: 0, readIds: [], hydrated: true });
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
