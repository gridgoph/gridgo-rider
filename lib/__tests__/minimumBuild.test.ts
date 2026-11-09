import type { InstalledBuildInput } from "@/lib/appUpdate";
import {
  appHeaderValue,
  appIdentity,
  custodyStepNeedsUpdate,
  fetchRiderMinimum,
  isBelowMinimum,
  isUpdateRequiredRefusal,
  knowsHandoverFlow,
  MINIMUM_BUILD_PATH,
  parseRiderMinimum,
  riderBuild,
  updateBlock,
} from "@/lib/minimumBuild";

const release: InstalledBuildInput = {
  platform: "android",
  expoGo: false,
  dev: false,
  versionName: "1.0.161",
  versionCode: 161,
  forcedVersionCode: null,
};

describe("X-GRIDGO-App", () => {
  const ios = { ...release, platform: "ios", versionName: "1.0.0", versionCode: 1, iosBuildNumber: "12" };

  it("names the rider app, the version and the build", () => {
    expect(appHeaderValue(appIdentity({ ...release, iosBuildNumber: null }))).toBe("rider/1.0.161+161");
    expect(riderBuild(release)).toEqual({ versionCode: 161, versionName: "1.0.161" });
  });

  it("names nothing for a build with no release number", () => {
    // Each of these would read versionCode 1 and be refused every rider_packs step.
    for (const input of [{ ...release, dev: true }, { ...release, expoGo: true }, { ...release, versionName: "1.0.0", versionCode: 1 }]) {
      expect(riderBuild(input)).toBeNull();
      expect(appIdentity({ ...input, iosBuildNumber: null })).toBeNull();
    }
    expect(appHeaderValue(null)).toBeNull();
  });

  it("names an iPhone under its own key, never compared with the Android minimum", () => {
    expect(appHeaderValue(appIdentity(ios))).toBe("rider-ios/1.0.0+12");
    expect(riderBuild(ios)).toBeNull();
  });

  it("names nothing for an iPhone development build, Expo Go or an unreadable build number", () => {
    for (const input of [{ ...ios, dev: true }, { ...ios, expoGo: true }, { ...ios, iosBuildNumber: null }, { ...ios, iosBuildNumber: "1.2" }, { ...ios, iosBuildNumber: "0" }]) {
      expect(appIdentity(input)).toBeNull();
    }
  });

  it("names nothing on web", () => {
    expect(appIdentity({ ...release, platform: "web", iosBuildNumber: null })).toBeNull();
  });

  it("takes the development override on any platform", () => {
    const forced = { ...release, platform: "web", dev: true, versionName: "1.0.0", forcedVersionCode: 146, iosBuildNumber: null };
    expect(appHeaderValue(appIdentity(forced))).toBe("rider/1.0.146+146");
    expect(riderBuild(forced)?.versionCode).toBe(146);
  });
});

describe("parseRiderMinimum", () => {
  it.each([
    [{ version: 3, minimumBuilds: { client: 0, supplier: 0, rider: 161 } }, 161],
    [{ minimumBuilds: { rider: 170 } }, 170],
  ])("reads %j", (body, expected) => {
    expect(parseRiderMinimum(body)).toBe(expected);
  });

  it.each([null, "161", [], {}, { minimumBuilds: {} }, { minimumBuilds: { rider: "161" } }, { minimumBuilds: { rider: 0 } }, { minimumBuilds: { rider: 1.5 } }, { minimumBuilds: { client: 9 } }, { rider: 161 }])(
    "reads %j as no minimum",
    (body) => {
      expect(parseRiderMinimum(body)).toBeNull();
    },
  );
});

describe("fetchRiderMinimum", () => {
  const ok = (body: unknown) => jest.fn(async () => ({ ok: true, status: 200, json: async () => body }));

  it("reads the public route on this API", async () => {
    const fetchImpl = ok({ minimumBuilds: { rider: 161 } });
    await expect(fetchRiderMinimum(fetchImpl as unknown as typeof fetch, "https://api.example/")).resolves.toBe(161);
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`https://api.example${MINIMUM_BUILD_PATH}`);
  });

  it("answers no minimum when the route is missing", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: "not_found" }) }));
    await expect(fetchRiderMinimum(fetchImpl as unknown as typeof fetch, "https://api.example")).resolves.toBeNull();
  });

  it("answers no minimum on a server error, offline, or an unreadable body", async () => {
    const failing = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({ minimumBuilds: { rider: 999 } }) }));
    const offline = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    const garbage = jest.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } }));
    for (const impl of [failing, offline, garbage]) {
      await expect(fetchRiderMinimum(impl as unknown as typeof fetch, "https://api.example")).resolves.toBeNull();
    }
  });
});

describe("isBelowMinimum", () => {
  const build = (versionCode: number) => ({ versionCode, versionName: `1.0.${versionCode}` });

  it("blocks only below the minimum", () => {
    expect(isBelowMinimum(build(160), 161)).toBe(true);
    expect(isBelowMinimum(build(161), 161)).toBe(false);
    expect(isBelowMinimum(build(162), 161)).toBe(false);
  });

  it("never blocks without a minimum or without a known build", () => {
    expect(isBelowMinimum(build(1), null)).toBe(false);
    expect(isBelowMinimum(null, 161)).toBe(false);
  });
});

describe("isUpdateRequiredRefusal", () => {
  it("is the API's 426 app_update_required and nothing else", () => {
    expect(isUpdateRequiredRefusal(426, { error: "app_update_required", minimumBuild: 161, app: "rider" })).toBe(true);
    expect(isUpdateRequiredRefusal(409, { error: "app_update_required" })).toBe(false);
    expect(isUpdateRequiredRefusal(426, { error: "something_else" })).toBe(false);
    expect(isUpdateRequiredRefusal(426, "Upgrade Required")).toBe(false);
  });
});

describe("handover flows", () => {
  it("knows the two flows this build runs, and an API that names none", () => {
    for (const flow of ["rider_packs", "legacy", null, undefined]) expect(knowsHandoverFlow(flow)).toBe(true);
    for (const flow of ["shop_seals", "", 2]) expect(knowsHandoverFlow(flow)).toBe(false);
  });

  it("closes a custody step on an unknown flow even with no minimum", () => {
    expect(custodyStepNeedsUpdate({ handoverFlow: "shop_seals" }, false)).toBe(true);
  });

  it("closes only rider_packs steps when this build is too old", () => {
    expect(custodyStepNeedsUpdate({ handoverFlow: "rider_packs" }, true)).toBe(true);
    expect(custodyStepNeedsUpdate({ handoverFlow: "legacy" }, true)).toBe(false);
    expect(custodyStepNeedsUpdate({}, true)).toBe(false);
    expect(custodyStepNeedsUpdate({ handoverFlow: "rider_packs" }, false)).toBe(false);
    expect(custodyStepNeedsUpdate(null, true)).toBe(false);
  });
});

describe("updateBlock", () => {
  it("covers the app only with no job in hand", () => {
    expect(updateBlock({ updateRequired: true, tripInHand: false })).toBe("full");
    expect(updateBlock({ updateRequired: true, tripInHand: true })).toBe("steps");
    expect(updateBlock({ updateRequired: false, tripInHand: false })).toBeNull();
  });
});
