import type { InstalledBuildInput } from "@/lib/appUpdate";
import {
  appHeaderValue,
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
  it("names the rider app, the version and the build", () => {
    expect(appHeaderValue(riderBuild(release))).toBe("rider/1.0.161+161");
  });

  it("names nothing for a build with no release number", () => {
    // Each of these would read versionCode 1 and be refused every rider_packs step.
    expect(riderBuild({ ...release, dev: true })).toBeNull();
    expect(riderBuild({ ...release, expoGo: true })).toBeNull();
    expect(riderBuild({ ...release, versionName: "1.0.0", versionCode: 1 })).toBeNull();
    expect(appHeaderValue(null)).toBeNull();
  });

  it("names nothing on an iPhone, whose build number is not on the minimum's scale", () => {
    expect(riderBuild({ ...release, platform: "ios", versionName: "1.0.0", versionCode: 12 })).toBeNull();
    expect(riderBuild({ ...release, platform: "web" })).toBeNull();
  });

  it("takes the development override on any platform", () => {
    const forced = riderBuild({ ...release, platform: "web", dev: true, versionName: "1.0.0", forcedVersionCode: 146 });
    expect(appHeaderValue(forced)).toBe("rider/1.0.146+146");
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
