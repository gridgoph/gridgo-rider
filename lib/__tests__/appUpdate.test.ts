import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  APP_UPDATE_COPY,
  APP_UPDATE_SOURCE,
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
  it("reads the rider app's latest release without credentials", async () => {
    const fetchImpl = respond(200, { tag_name: "v1.0.97" });
    await expect(fetchLatestRelease(fetchImpl)).resolves.toEqual(release(97));
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/gridgoph/gridgo-rider/releases/latest");
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("answers null, never throws, offline or rate limited", async () => {
    const offline = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(fetchLatestRelease(offline)).resolves.toBeNull();
    await expect(fetchLatestRelease(respond(403, { message: "rate limit" }))).resolves.toBeNull();
    await expect(fetchLatestRelease(respond(429, {}))).resolves.toBeNull();
    await expect(fetchLatestRelease(respond(404, {}))).resolves.toBeNull();
  });

  it("ignores drafts, prereleases and a body with no tag", async () => {
    await expect(
      fetchLatestRelease(respond(200, { tag_name: "v1.0.97", prerelease: true })),
    ).resolves.toBeNull();
    await expect(
      fetchLatestRelease(respond(200, { tag_name: "v1.0.97", draft: true })),
    ).resolves.toBeNull();
    await expect(fetchLatestRelease(respond(200, null))).resolves.toBeNull();
    const badJson = jest.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    })) as unknown as typeof fetch;
    await expect(fetchLatestRelease(badJson)).resolves.toBeNull();
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
      await expect(pending).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
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
