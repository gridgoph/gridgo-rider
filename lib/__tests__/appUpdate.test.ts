import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  APP_UPDATE_COPY,
  APP_UPDATE_SOURCE,
  describeInstalledBuild,
  describeOffer,
  fetchLatestRelease,
  installedBuild,
  justUpdated,
  localDay,
  parseForcedVersionCode,
  parseUpdateMemory,
  releaseBuildFromTag,
  shouldCheckForUpdate,
  shouldOfferUpdate,
} from "@/lib/appUpdate";

const release = (versionCode: number) => ({ versionCode, versionName: `1.0.${versionCode}` });

function respond(status: number, body: unknown): typeof fetch {
  return jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("releaseBuildFromTag", () => {
  it("reads the run number CI writes into the tag", () => {
    expect(releaseBuildFromTag("v1.0.96")).toEqual({ versionCode: 96, versionName: "1.0.96" });
    expect(releaseBuildFromTag("1.2.7")).toEqual({ versionCode: 7, versionName: "1.2.7" });
  });

  it("ignores a tag CI would not write", () => {
    for (const tag of ["v1.0", "v1.0.96-beta", "latest", "v1.0.0", "", null, 96]) {
      expect(releaseBuildFromTag(tag)).toBeNull();
    }
  });
});

describe("installedBuild", () => {
  const base = {
    platform: "android",
    expoGo: false,
    dev: false,
    versionName: "1.0.96",
    versionCode: 96,
    forcedVersionCode: null,
  };

  it("trusts a CI release, where the patch and the versionCode agree", () => {
    expect(installedBuild(base)).toEqual({ versionCode: 96, versionName: "1.0.96" });
  });

  it("skips Expo Go, a dev build, and a local build with no run number", () => {
    expect(installedBuild({ ...base, expoGo: true })).toBeNull();
    expect(installedBuild({ ...base, dev: true })).toBeNull();
    expect(installedBuild({ ...base, versionName: "1.0.0", versionCode: 1 })).toBeNull();
    expect(installedBuild({ ...base, versionCode: undefined })).toBeNull();
  });

  it("skips anything but Android, which is the only place an APK installs", () => {
    expect(installedBuild({ ...base, platform: "ios" })).toBeNull();
    expect(installedBuild({ ...base, platform: "web" })).toBeNull();
  });

  it("lets the dev override pretend to be a build, even in Expo Go", () => {
    expect(
      installedBuild({
        ...base,
        expoGo: true,
        dev: true,
        versionName: "1.0.0",
        versionCode: 1,
        forcedVersionCode: 1,
      }),
    ).toEqual({ versionCode: 1, versionName: "1.0.1" });
  });

  it("does not let the override reach another platform", () => {
    expect(installedBuild({ ...base, platform: "ios", forcedVersionCode: 1 })).toBeNull();
  });
});

describe("parseForcedVersionCode", () => {
  it("accepts a whole number from 1 up and nothing else", () => {
    expect(parseForcedVersionCode("1")).toBe(1);
    expect(parseForcedVersionCode(" 42 ")).toBe(42);
    for (const raw of [undefined, null, "", "0", "-1", "1.5", "yes"]) {
      expect(parseForcedVersionCode(raw)).toBeNull();
    }
  });
});

describe("fetchLatestRelease", () => {
  it("reads the rider app's latest release without credentials, naming itself", async () => {
    const fetchImpl = respond(200, { tag_name: "v1.0.97" });
    await expect(fetchLatestRelease(fetchImpl)).resolves.toEqual({
      latest: release(97),
      answered: true,
      detail: "latest release is 1.0.97",
    });
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/gridgoph/gridgo-rider/releases/latest");
    expect(init.headers).not.toHaveProperty("Authorization");
    // GitHub answers a request with no User-Agent with 403, the same status as
    // its rate limit, so the read cannot leave it to the phone's HTTP stack.
    expect(init.headers["User-Agent"]).toBe("GRIDGO-rider");
    expect(APP_UPDATE_SOURCE.userAgent).toBe("GRIDGO-rider");
  });

  it("answers nothing, never throws, when GitHub refuses, and says why", async () => {
    for (const [status, body] of [
      [403, { message: "rate limit" }],
      [429, {}],
      [404, {}],
    ] as const) {
      await expect(fetchLatestRelease(respond(status, body))).resolves.toEqual({
        latest: null,
        answered: true,
        detail: `GitHub answered HTTP ${status}`,
      });
    }
  });

  it("tells an unanswered read from an answered one", async () => {
    const offline = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(fetchLatestRelease(offline)).resolves.toEqual({
      latest: null,
      answered: false,
      detail: "no answer (Network request failed)",
    });
  });

  it("ignores drafts, prereleases, a body with no tag and a tag CI did not write", async () => {
    const cases: [typeof fetch, string][] = [
      [respond(200, { tag_name: "v1.0.97", prerelease: true }), "release v1.0.97 is not final"],
      [respond(200, { tag_name: "v1.0.97", draft: true }), "release v1.0.97 is not final"],
      [respond(200, null), "GitHub answered an empty body"],
      [respond(200, { tag_name: "nightly" }), 'tag "nightly" is not a CI release'],
      [
        jest.fn(async () => ({
          ok: true,
          json: async () => {
            throw new SyntaxError("Unexpected token");
          },
        })) as unknown as typeof fetch,
        "unreadable release body (Unexpected token)",
      ],
    ];
    for (const [fetchImpl, detail] of cases) {
      await expect(fetchLatestRelease(fetchImpl)).resolves.toEqual({
        latest: null,
        answered: true,
        detail,
      });
    }
  });

  it("gives up on a read that never answers", async () => {
    jest.useFakeTimers();
    try {
      const hang = jest.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ) as unknown as typeof fetch;
      const pending = fetchLatestRelease(hang, { timeoutMs: 1000 });
      jest.advanceTimersByTime(1000);
      await expect(pending).resolves.toMatchObject({ latest: null, answered: false });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("the development log", () => {
  const expoGo = {
    platform: "android",
    expoGo: true,
    dev: true,
    versionName: "1.0.0",
    versionCode: 1,
    forcedVersionCode: null,
  };

  it("says the override reached the app, or that it did not", () => {
    const forced = { ...expoGo, forcedVersionCode: 90 };
    expect(describeInstalledBuild(forced, installedBuild(forced))).toBe(
      "installed 1.0.90 (versionCode 90, forced by override)",
    );
    expect(describeInstalledBuild(expoGo, installedBuild(expoGo))).toBe(
      "off: Expo Go and EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE is not set",
    );
    const devClient = { ...expoGo, expoGo: false };
    expect(describeInstalledBuild(devClient, installedBuild(devClient))).toBe(
      "off: development build and EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE is not set",
    );
    const ios = { ...expoGo, platform: "ios", forcedVersionCode: 90 };
    expect(describeInstalledBuild(ios, installedBuild(ios))).toBe("off: ios cannot install an APK");
  });

  it("names a release build, and a local build that is not one", () => {
    const ci = { ...expoGo, expoGo: false, dev: false, versionName: "1.0.96", versionCode: 96 };
    expect(describeInstalledBuild(ci, installedBuild(ci))).toBe(
      "installed 1.0.96 (versionCode 96, release build)",
    );
    const local = { ...ci, versionName: "1.0.0", versionCode: 1 };
    expect(describeInstalledBuild(local, installedBuild(local))).toBe(
      "off: 1.0.0 / versionCode 1 is not a CI release",
    );
  });

  it("says why a release was or was not offered", () => {
    const installed = release(90);
    const latest = release(95);
    const today = "2026-09-24";
    expect(describeOffer({ installed, latest, dismissed: null, today }, true)).toBe(
      "offering 1.0.95 over 1.0.90",
    );
    expect(describeOffer({ installed: latest, latest, dismissed: null, today }, false)).toBe(
      "not offering: 1.0.95 is already the latest",
    );
    expect(
      describeOffer({ installed, latest, dismissed: { versionCode: 95, day: today }, today }, false),
    ).toBe('not offering 1.0.95: "Later" was tapped for 95 on 2026-09-24');
  });
});

describe("shouldCheckForUpdate", () => {
  const now = 1_000_000_000;

  it("reads when it never has, and after the interval", () => {
    expect(shouldCheckForUpdate(null, now)).toBe(true);
    expect(shouldCheckForUpdate(now - APP_UPDATE_CHECK_INTERVAL_MS, now)).toBe(true);
  });

  it("stays quiet inside the interval", () => {
    expect(shouldCheckForUpdate(now - APP_UPDATE_CHECK_INTERVAL_MS + 1, now)).toBe(false);
  });

  it("does not let a clock set backwards silence it", () => {
    expect(shouldCheckForUpdate(now + 60_000, now)).toBe(true);
  });
});

describe("shouldOfferUpdate", () => {
  const today = "2026-09-24";

  it("offers only a newer release", () => {
    const installed = release(96);
    expect(shouldOfferUpdate({ installed, latest: release(97), dismissed: null, today })).toBe(true);
    expect(shouldOfferUpdate({ installed, latest: release(96), dismissed: null, today })).toBe(false);
    expect(shouldOfferUpdate({ installed, latest: release(90), dismissed: null, today })).toBe(false);
  });

  it("keeps quiet about a release put off today, and asks again tomorrow", () => {
    const input = { installed: release(96), latest: release(97) };
    const dismissed = { versionCode: 97, day: today };
    expect(shouldOfferUpdate({ ...input, dismissed, today })).toBe(false);
    expect(shouldOfferUpdate({ ...input, dismissed, today: "2026-09-25" })).toBe(true);
  });

  it("offers a newer release than the one put off straight away", () => {
    expect(
      shouldOfferUpdate({
        installed: release(96),
        latest: release(98),
        dismissed: { versionCode: 97, day: today },
        today,
      }),
    ).toBe(true);
  });
});

describe("justUpdated", () => {
  it("is true only on the first launch of a newer build", () => {
    expect(justUpdated(release(97), 96)).toBe(true);
    expect(justUpdated(release(97), 97)).toBe(false);
    expect(justUpdated(release(90), 97)).toBe(false);
  });

  it("says nothing on a fresh install", () => {
    expect(justUpdated(release(97), null)).toBe(false);
  });
});

describe("localDay", () => {
  it("uses the phone's own calendar day", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("parseUpdateMemory", () => {
  it("reads a stored record back", () => {
    const raw = JSON.stringify({
      lastCheckedAt: 5,
      dismissed: { versionCode: 97, day: "2026-09-24" },
      lastSeenVersionCode: 96,
    });
    expect(parseUpdateMemory(raw)).toEqual({
      lastCheckedAt: 5,
      dismissed: { versionCode: 97, day: "2026-09-24" },
      lastSeenVersionCode: 96,
    });
  });

  it("reads anything malformed as empty, field by field", () => {
    const empty = { lastCheckedAt: null, dismissed: null, lastSeenVersionCode: null };
    expect(parseUpdateMemory(null)).toEqual(empty);
    expect(parseUpdateMemory("{not json")).toEqual(empty);
    expect(parseUpdateMemory("42")).toEqual(empty);
    expect(
      parseUpdateMemory(
        JSON.stringify({ lastCheckedAt: "soon", dismissed: { versionCode: 97 }, lastSeenVersionCode: 0 }),
      ),
    ).toEqual(empty);
  });
});

describe("copy", () => {
  it("says what the rider is getting and where it lands", () => {
    expect(APP_UPDATE_COPY.availableTitle).toBe("A new version of GRIDGO is ready");
    expect(APP_UPDATE_COPY.completedBody("1.0.97")).toBe("You're on 1.0.97.");
    expect(APP_UPDATE_SOURCE.downloadUrl).toBe(
      "https://gridgo.talasora.com/downloads/gridgo-rider.apk",
    );
  });
});
