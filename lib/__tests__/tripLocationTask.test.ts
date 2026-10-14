import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";

import * as api from "@/lib/api";
import { TRIP_LOCATION_NOTICE, TRIP_LOCATION_TASK } from "@/lib/backgroundLocation";

jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), postLocation: jest.fn(async () => ({})) }));

const location = Location as jest.Mocked<typeof Location>;
let task: typeof import("@/lib/tripLocationTask");

beforeAll(() => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  // Loaded after the platform is pinned: the task is defined at module load.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  task = require("@/lib/tripLocationTask");
});

function setAppState(state: string) {
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  setAppState("background");
  task.setTripLocationTarget(null);
});

const fix = (ageMs = 1_000) => [{ coords: { latitude: 7.07, longitude: 125.61, accuracy: 8 }, timestamp: Date.now() - ageMs }];

it("defines the task when the bundle loads", () => {
  // Cleared by beforeEach for other tests, so assert the module did it once on load.
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/lib/tripLocationTask");
  });
  expect(TaskManager.defineTask).toHaveBeenCalledWith(TRIP_LOCATION_TASK, expect.any(Function));
});

it("posts a background fix for the tracked job, with its source time", async () => {
  task.setTripLocationTarget({ orderId: "ord_1" });
  const batch = fix();
  await task.handleServiceFixes(batch);
  expect(api.postLocation).toHaveBeenCalledWith("ord_1", {
    lat: 7.07, lng: 125.61, accuracy: 8, recordedAt: new Date(batch[0].timestamp).toISOString(),
  });
});

it("stays quiet with GRIDGO on screen, where the foreground watch already posts", async () => {
  setAppState("active");
  task.setTripLocationTarget({ orderId: "ord_1" });
  await task.handleServiceFixes(fix());
  expect(api.postLocation).not.toHaveBeenCalled();
});

it("stops the service when there is no job to post for", async () => {
  location.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(true);
  await task.handleServiceFixes(fix());
  await Promise.resolve();
  expect(api.postLocation).not.toHaveBeenCalled();
  expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith(TRIP_LOCATION_TASK);
});

it("stops at once when the server says the job is no longer tracked", async () => {
  task.setTripLocationTarget({ orderId: "ord_1" });
  (api.postLocation as jest.Mock).mockRejectedValueOnce(new api.ApiError(409, { error: "tracking_not_active" }));
  location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
  await task.handleServiceFixes(fix());
  expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith(TRIP_LOCATION_TASK);
  // And it does not post again for that job.
  await task.handleServiceFixes(fix(500));
  expect(api.postLocation).toHaveBeenCalledTimes(1);
  location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
});

it("keeps going through a network failure", async () => {
  task.setTripLocationTarget({ orderId: "ord_1" });
  (api.postLocation as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed"));
  await task.handleServiceFixes(fix(20_000));
  await task.handleServiceFixes(fix(1_000));
  expect(api.postLocation).toHaveBeenCalledTimes(2);
  expect(location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
});

it("starts once, with the visible notice, a fresh fix every interval and no auto-pause", async () => {
  await expect(task.startTripLocationUpdates()).resolves.toBe(true);
  expect(location.startLocationUpdatesAsync).toHaveBeenCalledWith(TRIP_LOCATION_TASK, expect.objectContaining({
    distanceInterval: 0,
    timeInterval: 15_000,
    pausesUpdatesAutomatically: false,
    foregroundService: expect.objectContaining({
      notificationTitle: TRIP_LOCATION_NOTICE.title,
      killServiceOnDestroy: true,
    }),
  }));
  location.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(true);
  await task.startTripLocationUpdates();
  expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
});

it("reports a phone that refuses to start the service, without throwing", async () => {
  location.startLocationUpdatesAsync.mockRejectedValueOnce(new Error("ForegroundServiceStartNotAllowed"));
  await expect(task.startTripLocationUpdates()).resolves.toBe(false);
});
