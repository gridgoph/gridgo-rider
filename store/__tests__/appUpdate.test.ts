import AsyncStorage from "@react-native-async-storage/async-storage";

import { APP_UPDATE_CHECK_INTERVAL_MS, APP_UPDATE_STORAGE_KEY } from "@/lib/appUpdate";
import {
  checkForAppUpdate,
  openUpdateSheet,
  resetAppUpdateForTests,
  settleUpdateSheet,
  startAppUpdate,
  useAppUpdate,
} from "@/store/appUpdate";

const build = (versionCode: number) => ({ versionCode, versionName: `1.0.${versionCode}` });
const NOW = new Date(2026, 8, 24, 9, 0).getTime();

function latest(versionCode: number | null): jest.Mock {
  return jest.fn(async () =>
    versionCode === null
      ? { ok: false, status: 403, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ tag_name: `v1.0.${versionCode}` }) },
  );
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function stored() {
  await flush();
  return JSON.parse((await AsyncStorage.getItem(APP_UPDATE_STORAGE_KEY)) ?? "null");
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetAppUpdateForTests();
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const offline = () =>
  jest.fn(async () => {
    throw new TypeError("Network request failed");
  });

describe("launch", () => {
  it("offers a newer release", async () => {
    await startAppUpdate(build(96), { now: NOW, fetchImpl: latest(97) as unknown as typeof fetch });
    expect(openUpdateSheet()).toEqual({
      kind: "available",
      installed: build(96),
      latest: build(97),
    });
  });

  it("offers nothing when the phone is already on the latest", async () => {
    await startAppUpdate(build(97), { now: NOW, fetchImpl: latest(97) as unknown as typeof fetch });
    expect(openUpdateSheet()).toBeNull();
  });

  it("stays silent when GitHub does not answer, and tries again on the next foreground", async () => {
    await startAppUpdate(build(96), { now: NOW, fetchImpl: offline() as unknown as typeof fetch });
    expect(openUpdateSheet()).toBeNull();
    expect(useAppUpdate.getState().memory.lastCheckedAt).toBeNull();

    const retry = latest(97);
    await checkForAppUpdate(build(96), { now: NOW + 60_000, fetchImpl: retry as unknown as typeof fetch });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(openUpdateSheet()?.kind).toBe("available");
  });

  it("counts a refusal GitHub did answer (403) as a read, so foregrounds do not hammer it", async () => {
    await startAppUpdate(build(96), { now: NOW, fetchImpl: latest(null) as unknown as typeof fetch });
    expect(openUpdateSheet()).toBeNull();
    expect(useAppUpdate.getState().memory.lastCheckedAt).toBe(NOW);

    const retry = latest(97);
    await checkForAppUpdate(build(96), { now: NOW + 60_000, fetchImpl: retry as unknown as typeof fetch });
    expect(retry).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(
      "[update-check] skipped: the latest release was read less than 4 hours ago",
    );
  });

  it("reads on a cold launch even when the stored throttle is fresh", async () => {
    // A launch a minute after the last read, with that read still remembered.
    await AsyncStorage.setItem(
      APP_UPDATE_STORAGE_KEY,
      JSON.stringify({ lastCheckedAt: NOW - 60_000, lastSeenVersionCode: 90 }),
    );
    const fetchImpl = latest(95);
    await startAppUpdate(build(90), { now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(openUpdateSheet()?.kind).toBe("available");
  });

  it("logs each decision in a development build", async () => {
    await startAppUpdate(build(90), { now: NOW, fetchImpl: latest(95) as unknown as typeof fetch });
    expect(console.info).toHaveBeenCalledWith("[update-check] latest release is 1.0.95");
    expect(console.info).toHaveBeenCalledWith("[update-check] offering 1.0.95 over 1.0.90");

    const dismissed = openUpdateSheet();
    settleUpdateSheet("later", { sheet: dismissed ?? undefined, now: NOW });
    await stored();
    resetAppUpdateForTests();
    await startAppUpdate(build(90), { now: NOW + 60_000, fetchImpl: latest(95) as unknown as typeof fetch });
    expect(console.info).toHaveBeenCalledWith(
      '[update-check] not offering 1.0.95: "Later" was tapped for 95 on 2026-09-24',
    );
  });

  it("reads at most once per interval on foregrounds, but always on a cold launch", async () => {
    const fetchImpl = latest(96);
    await startAppUpdate(build(96), { now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch });
    await checkForAppUpdate(build(96), { now: NOW + 60_000, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await checkForAppUpdate(build(96), {
      now: NOW + APP_UPDATE_CHECK_INTERVAL_MS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // A new launch reads regardless of the stored throttle.
    resetAppUpdateForTests();
    await startAppUpdate(build(96), { now: NOW + APP_UPDATE_CHECK_INTERVAL_MS + 1, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("Later", () => {
  it("quiets that release until the next day the app is opened", async () => {
    const fetchImpl = latest(97) as unknown as typeof fetch;
    await startAppUpdate(build(96), { now: NOW, fetchImpl });
    const sheet = openUpdateSheet();
    settleUpdateSheet("later", { sheet: sheet ?? undefined, now: NOW });
    expect((await stored()).dismissed).toEqual({ versionCode: 97, day: "2026-09-24" });

    // Relaunch the same day: nothing.
    resetAppUpdateForTests();
    await startAppUpdate(build(96), { now: NOW + 3_600_000, fetchImpl });
    expect(openUpdateSheet()).toBeNull();

    // Relaunch the next day: asked again.
    resetAppUpdateForTests();
    await startAppUpdate(build(96), { now: NOW + 24 * 3_600_000, fetchImpl });
    expect(openUpdateSheet()?.kind).toBe("available");
  });

  it("is not what a sheet taken down with nobody answering means", async () => {
    await startAppUpdate(build(96), { now: NOW, fetchImpl: latest(97) as unknown as typeof fetch });
    const sheet = openUpdateSheet();
    // The root stack was replaced under the sheet (the owner changed).
    settleUpdateSheet("interrupted", { sheet: sheet ?? undefined, now: NOW });
    expect(useAppUpdate.getState().memory.dismissed).toBeNull();
    expect(useAppUpdate.getState().open).toBeNull();
    // Still waiting, so the hook presents it again.
    expect(openUpdateSheet()).toEqual(sheet);
  });

  it("is what every way out of the offer means except Update now", async () => {
    await startAppUpdate(build(96), { now: NOW, fetchImpl: latest(97) as unknown as typeof fetch });
    openUpdateSheet();
    settleUpdateSheet("update", { now: NOW });
    expect(useAppUpdate.getState().memory.dismissed).toBeNull();
    expect(useAppUpdate.getState().offer).toBeNull();
  });
});

describe("Update completed", () => {
  it("is said once, on the first launch of the newer build", async () => {
    const fetchImpl = latest(97) as unknown as typeof fetch;
    await startAppUpdate(build(96), { now: NOW, fetchImpl });
    settleUpdateSheet("update", { sheet: openUpdateSheet() ?? undefined, now: NOW });

    resetAppUpdateForTests();
    await startAppUpdate(build(97), { now: NOW + 600_000, fetchImpl });
    const sheet = openUpdateSheet();
    expect(sheet).toEqual({ kind: "completed", installed: build(97) });
    settleUpdateSheet("done", { sheet: sheet ?? undefined });
    expect((await stored()).lastSeenVersionCode).toBe(97);

    resetAppUpdateForTests();
    await startAppUpdate(build(97), { now: NOW + 1_200_000, fetchImpl });
    expect(openUpdateSheet()).toBeNull();
  });

  it("says nothing on a fresh install", async () => {
    await startAppUpdate(build(97), { now: NOW, fetchImpl: latest(97) as unknown as typeof fetch });
    expect(openUpdateSheet()).toBeNull();
    expect((await stored()).lastSeenVersionCode).toBe(97);
  });

  it("comes before an offer, and a late unmount cannot settle the one after it", async () => {
    await AsyncStorage.setItem(
      APP_UPDATE_STORAGE_KEY,
      JSON.stringify({ lastSeenVersionCode: 95 }),
    );
    await startAppUpdate(build(96), { now: NOW, fetchImpl: latest(97) as unknown as typeof fetch });

    const first = openUpdateSheet();
    expect(first?.kind).toBe("completed");
    settleUpdateSheet("done", { sheet: first ?? undefined });

    const second = openUpdateSheet();
    expect(second?.kind).toBe("available");
    // The completed sheet's route unmounts after the offer has opened.
    settleUpdateSheet("later", { sheet: first ?? undefined });
    expect(useAppUpdate.getState().open).toBe(second);
    expect(useAppUpdate.getState().memory.dismissed).toBeNull();
  });
});
