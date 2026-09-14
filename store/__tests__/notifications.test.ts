import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Notification } from "@/lib/api";
import { useNotifications } from "@/store/notifications";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listNotifications: jest.fn(),
    deleteNotification: jest.fn(),
    markNotificationsRead: jest.fn(async () => undefined),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api") as {
  listNotifications: jest.Mock;
  deleteNotification: jest.Mock;
  markNotificationsRead: jest.Mock;
};

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
  api.listNotifications.mockReset().mockResolvedValue([]);
  api.markNotificationsRead.mockReset().mockResolvedValue(undefined);
  api.deleteNotification.mockReset();
  api.deleteNotification.mockResolvedValue({ id: "a", deletedAt: "2026-09-01T04:00:00.000Z" });
  useNotifications.setState({ items: null, unread: 0, readIds: [], confirmedReadIds: [], hydrated: false });
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

    useNotifications.setState({ items: null, unread: 0, readIds: [], confirmedReadIds: [], hydrated: false });
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

describe("clearing the inbox", () => {
  it("deletes every row on GRIDGO and drops the local marks", async () => {
    const items = [alert({ id: "a" }), alert({ id: "b" })];
    useNotifications.getState().adopt(items);
    useNotifications.getState().markRead("a");

    const outcome = await useNotifications.getState().clear(items);

    expect(api.deleteNotification).toHaveBeenCalledWith("a");
    expect(api.deleteNotification).toHaveBeenCalledWith("b");
    expect(outcome).toEqual({ cleared: ["a", "b"], failed: false });
    expect(useNotifications.getState().readIds).not.toContain("a");
  });

  it("keeps a row that GRIDGO would not delete", async () => {
    api.deleteNotification
      .mockResolvedValueOnce({ id: "a", deletedAt: "2026-09-01T04:00:00.000Z" })
      .mockRejectedValueOnce(new Error("offline"));

    const items = [alert({ id: "a" }), alert({ id: "b" })];
    const outcome = await useNotifications.getState().clear(items);

    expect(outcome.cleared).toEqual(["a"]);
    expect(outcome.failed).toBe(true);
  });

  it("does nothing when the list is already empty", async () => {
    await expect(useNotifications.getState().clear([])).resolves.toEqual({
      cleared: [],
      failed: false,
    });
    expect(api.deleteNotification).not.toHaveBeenCalled();
  });
});

it("writes only the displayed snapshot and accepts another device's read state",async()=>{
  api.markNotificationsRead.mockResolvedValue(undefined);
  await useNotifications.getState().markAllRead([alert({id:"a"}),alert({id:"b"})]);
  expect(api.markNotificationsRead).toHaveBeenCalledWith(["a","b"]);
  api.listNotifications.mockResolvedValue([alert({id:"new",read:true})]);
  await useNotifications.getState().refreshUnread();
  expect(useNotifications.getState().unread).toBe(0);
});
it("rolls back a failed read and refetches the authoritative badge",async()=>{
  api.markNotificationsRead.mockRejectedValueOnce(new Error("offline"));
  api.listNotifications.mockResolvedValue([alert({id:"a"})]);
  await useNotifications.getState().markRead("a");
  expect(useNotifications.getState().readIds).not.toContain("a");
  expect(useNotifications.getState().unread).toBe(1);
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it.each(["acknowledge", "clear"])("persists only confirmed marks through %s", async (operation) => {
  useNotifications.getState().bindOwner("concurrent-rider");
  const pending = deferred();
  api.markNotificationsRead.mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
  api.listNotifications.mockResolvedValue([alert({ id: "a" }), alert({ id: "b", read: true })]);
  const a = useNotifications.getState().markRead("a");
  if (operation === "acknowledge") await useNotifications.getState().markRead("b");
  else await useNotifications.getState().clear([alert({ id: "b" })]);
  await flush();
  expect(JSON.parse((await AsyncStorage.getItem("gridgo.alertsRead.v1.concurrent-rider"))!)).not.toContain("a");
  pending.reject(new Error("offline"));
  await a;
  await flush();
  useNotifications.getState().bindOwner(null);
  useNotifications.getState().bindOwner("concurrent-rider");
  await useNotifications.getState().hydrate();
  expect(useNotifications.getState().isRead(alert({ id: "a" }))).toBe(false);
  expect(useNotifications.getState().isRead(alert({ id: "b" }))).toBe(operation === "acknowledge");
});

function pendingList() {
  let resolve!: (items: Notification[]) => void;
  const promise = new Promise<Notification[]>((done) => { resolve = done; });
  return { promise, resolve };
}

it.each(["refresh", "adopt"])("keeps a newer %s ahead of an old unread response", async (source) => {
  const old = pendingList();
  const b = alert({ id: "b" });
  api.listNotifications.mockReturnValueOnce(old.promise).mockResolvedValueOnce([b]);
  const first = useNotifications.getState().refreshUnread();
  if (source === "refresh") await useNotifications.getState().refreshUnread();
  else useNotifications.getState().adopt([b]);
  old.resolve([]);
  await first;
  expect(useNotifications.getState().unread).toBe(1);
  expect(useNotifications.getState().items).toEqual([b]);
});

it("applies deletion to the current inbox and rejects reads started before it completed", async () => {
  const a = alert({ id: "a" });
  const b = alert({ id: "b" });
  useNotifications.getState().adopt([a]);
  const deletion = deferred();
  api.deleteNotification.mockReturnValueOnce(deletion.promise);
  const clear = useNotifications.getState().clear([a]);
  useNotifications.getState().adopt([a, b]);
  const old = pendingList();
  api.listNotifications.mockReturnValueOnce(old.promise);
  const read = useNotifications.getState().refreshUnread();
  deletion.resolve();
  await clear;
  expect(useNotifications.getState().items).toEqual([b]);
  expect(useNotifications.getState().unread).toBe(1);
  old.resolve([a]);
  await read;
  expect(useNotifications.getState().items).toEqual([b]);
  expect(useNotifications.getState().unread).toBe(1);
});

it.each([false, true])("restores the badge before offline recovery, with newer inbox: %s", async (newerInbox) => {
  const a = alert({ id: "offline-a" });
  const b = alert({ id: "offline-b" });
  useNotifications.getState().adopt([a]);
  const patch = deferred();
  const recovery = deferred();
  api.markNotificationsRead.mockReturnValueOnce(patch.promise);
  api.listNotifications.mockReturnValueOnce(recovery.promise);
  const marking = useNotifications.getState().markRead(a.id);
  expect(useNotifications.getState().unread).toBe(0);
  if (newerInbox) useNotifications.getState().adopt([a, b]);
  patch.reject(new Error("offline"));
  await flush();
  expect(useNotifications.getState().isRead(a)).toBe(false);
  expect(useNotifications.getState().unread).toBe(newerInbox ? 2 : 1);
  recovery.reject(new Error("still offline"));
  await marking;
  expect(useNotifications.getState().unread).toBe(newerInbox ? 2 : 1);
});
