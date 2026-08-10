import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Notification } from "@/lib/api";
import { useNotifications } from "@/store/notifications";

function alert(patch: Partial<Notification> & Pick<Notification, "id">): Notification {
  return {
    userId: "user_rider",
    title: "Dispatch available",
    body: "School event flyers ready for pickup",
    read: false,
    at: "2026-08-10T12:00:00.000Z",
    ...patch,
  };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useNotifications.setState({ unread: 0, readIds: [], hydrated: false });
});

describe("the unread count", () => {
  it("counts what neither the server nor this phone has marked read", () => {
    const items = [alert({ id: "a" }), alert({ id: "b" }), alert({ id: "c", read: true })];
    useNotifications.getState().adopt(items);
    expect(useNotifications.getState().unread).toBe(2);

    useNotifications.getState().markRead("a");
    expect(useNotifications.getState().unread).toBe(1);
  });

  it("clears in one move when the rider says they have seen everything", () => {
    const items = [alert({ id: "a" }), alert({ id: "b" })];
    useNotifications.getState().adopt(items);
    useNotifications.getState().markAllRead(items);

    expect(useNotifications.getState().unread).toBe(0);
    expect(items.every((item) => useNotifications.getState().isRead(item))).toBe(true);
  });

  it("does not go negative when the same alert is marked twice", () => {
    useNotifications.getState().adopt([alert({ id: "a" })]);
    useNotifications.getState().markRead("a");
    useNotifications.getState().markRead("a");
    expect(useNotifications.getState().unread).toBe(0);
  });
});

describe("read marks live on this phone", () => {
  it("survives the app closing", async () => {
    useNotifications.getState().markRead("a");
    await flush();

    useNotifications.setState({ unread: 0, readIds: [], hydrated: false });
    await useNotifications.getState().hydrate();

    expect(useNotifications.getState().isRead(alert({ id: "a" }))).toBe(true);
    expect(useNotifications.getState().isRead(alert({ id: "b" }))).toBe(false);
  });

  it("never lets a forgetful phone make a server-read alert unread again", () => {
    // The API returns `read` but has no route to set it, so the local mark can
    // only ever add. The server's own true still wins.
    expect(useNotifications.getState().isRead(alert({ id: "z", read: true }))).toBe(true);
  });

  it("starts clean rather than crashing on a corrupt store", async () => {
    await AsyncStorage.setItem("gridgo.alertsRead.v1", "{not json");
    await useNotifications.getState().hydrate();
    expect(useNotifications.getState().hydrated).toBe(true);
    expect(useNotifications.getState().readIds).toEqual([]);
  });
});
