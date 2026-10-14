import { locationHealthHeadline, locationIssues, type LocationHealthInput } from "@/lib/locationHealth";

const healthy: LocationHealthInput = {
  platform: "android",
  servicesEnabled: true,
  foreground: "granted",
  canAskForeground: true,
  precise: true,
  batteryOptimized: false,
  lowPower: false,
};

const keys = (input: Partial<LocationHealthInput>, watcher: "shop" | "client" = "client") =>
  locationIssues({ ...healthy, ...input }, watcher).map((issue) => issue.key);

describe("locationIssues", () => {
  it("says nothing about a phone that can share", () => {
    expect(keys({})).toEqual([]);
    expect(locationHealthHeadline([], "client")).toBeNull();
  });

  it("puts the phone-wide switch first, with Android's own turn-on box", () => {
    const [issue] = locationIssues({ ...healthy, servicesEnabled: false });
    expect(issue).toEqual(expect.objectContaining({ key: "location_off", severity: "blocking" }));
    expect(issue.action).toEqual({ label: "Turn on location", fix: "turn_on_location" });
  });

  it("asks again while the phone still lets it, and sends to settings once it will not", () => {
    const askable = locationIssues({ ...healthy, foreground: "denied", canAskForeground: true })[0];
    expect(askable.action).toEqual({ label: "Allow location", fix: "ask_location" });
    const refused = locationIssues({ ...healthy, foreground: "denied", canAskForeground: false })[0];
    expect(refused.action).toEqual({ label: "Open settings", fix: "open_app_settings" });
    expect(refused.steps.join(" ")).toMatch(/Permissions, then Location/);
  });

  it("stops at a refused permission: nothing else can be fixed before it", () => {
    expect(keys({ foreground: "denied", precise: false, batteryOptimized: true, lowPower: true })).toEqual(["permission_off"]);
  });

  it("flags approximate location, battery optimisation and battery saver on Android, in that order", () => {
    expect(keys({ precise: false, batteryOptimized: true, lowPower: true })).toEqual([
      "precise_off",
      "battery_optimized",
      "low_power",
    ]);
  });

  it("uses iPhone words and never invents an Android battery list there", () => {
    const issues = locationIssues({ ...healthy, platform: "ios", precise: false, batteryOptimized: true, lowPower: true });
    expect(issues.map((issue) => issue.key)).toEqual(["precise_off", "low_power"]);
    expect(issues[0].steps).toContain("Turn on Precise Location.");
    expect(issues[1].title).toBe("Low Power Mode is on");
    expect(issues[1].action).toBeNull();
  });

  it("never asks for Allow all the time: the job's service runs on While using the app", () => {
    const all = locationIssues({ ...healthy, foreground: "denied", canAskForeground: false });
    expect(JSON.stringify(all)).not.toMatch(/all the time|Always/);
  });

  it("tells a browser only what a browser can change", () => {
    expect(keys({ platform: "web", servicesEnabled: false, precise: false, batteryOptimized: true })).toEqual([]);
    const [denied] = locationIssues({ ...healthy, platform: "web", foreground: "denied", canAskForeground: true });
    expect(denied.action).toBeNull();
    expect(denied.steps[0]).toMatch(/browser/);
  });

  it("names whoever is watching where the cost is a person", () => {
    expect(locationIssues({ ...healthy, precise: false }, "shop")[0].body).toMatch(/the shop sees you in the wrong place/);
  });
});

describe("locationHealthHeadline", () => {
  it("says the cost from the watcher's side, red when nothing is shared", () => {
    const issues = locationIssues({ ...healthy, foreground: "denied" }, "shop");
    expect(locationHealthHeadline(issues, "shop")).toEqual({
      title: "The shop cannot see you coming",
      body: "Your location is not being shared. Fix this to turn it back on.",
      tone: "error",
    });
  });

  it("is amber and counts the fixes when sharing only may stop", () => {
    const issues = locationIssues({ ...healthy, precise: false, lowPower: true });
    expect(locationHealthHeadline(issues, "client")).toEqual({
      title: "Your location may stop reaching the client",
      body: "Fix these 2 things so sharing keeps going until the job is done.",
      tone: "warning",
    });
  });
});
