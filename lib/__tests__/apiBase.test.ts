import { hostnameFromDevHostUri, notificationImageUrl, resolveApiBase } from "@/lib/api";

describe("resolveApiBase", () => {
  const defaultPort = "8787";

  it("1. explicit EXPO_PUBLIC_API_URL always wins (trailing slash stripped)", () => {
    expect(
      resolveApiBase({
        envUrl: "https://api.example.com/v1/",
        envPort: "9999",
        devHostUri: "192.168.1.50:8081",
        platformOS: "android",
      }),
    ).toBe("https://api.example.com/v1");
  });

  it("1a. a production build reaches the hosted API and never the dev host", () => {
    // The hosted pilot points a build at its own API with EXPO_PUBLIC_API_URL
    // and nothing else. Every later step has to stay unreachable — including
    // the Android loopback rewrite, which is the one branch that edits a host
    // rather than choosing one, and would silently send a shipped build to an
    // emulator alias.
    const hosted = "https://api.example.test";

    for (const platformOS of ["ios", "android", "web"]) {
      for (const devHostUri of [null, "localhost:8081", "127.0.0.1:8081", "192.168.1.42:8081"]) {
        expect(resolveApiBase({ envUrl: hosted, envPort: "8787", devHostUri, platformOS })).toBe(
          hosted,
        );
      }
    }
  });

  it("1b. empty EXPO_PUBLIC_API_URL is ignored", () => {
    expect(
      resolveApiBase({
        envUrl: "   ",
        envPort: null,
        devHostUri: "10.0.0.4:8081",
        platformOS: "ios",
      }),
    ).toBe("http://10.0.0.4:8787");
  });

  it("2. Expo Go on a LAN phone uses the dev-server hostname + apiPort", () => {
    expect(
      resolveApiBase({
        envUrl: undefined,
        envPort: undefined,
        devHostUri: "192.168.1.42:8081",
        platformOS: "android",
      }),
    ).toBe("http://192.168.1.42:8787");
  });

  it("2b. EXPO_PUBLIC_API_PORT overrides the default port", () => {
    expect(
      resolveApiBase({
        envUrl: null,
        envPort: "9000",
        devHostUri: "192.168.0.10:8081",
        platformOS: "ios",
      }),
    ).toBe("http://192.168.0.10:9000");
  });

  it("3. Android emulator (loopback dev host) uses 10.0.2.2", () => {
    expect(
      resolveApiBase({
        envUrl: null,
        envPort: null,
        devHostUri: "127.0.0.1:8081",
        platformOS: "android",
      }),
    ).toBe(`http://10.0.2.2:${defaultPort}`);

    expect(
      resolveApiBase({
        envUrl: null,
        envPort: null,
        devHostUri: "localhost:8081",
        platformOS: "android",
      }),
    ).toBe(`http://10.0.2.2:${defaultPort}`);
  });

  it("4. iOS simulator keeps loopback hostname from the dev server (not the Android alias)", () => {
    // Step 2 yields localhost; step 3 only rewrites on Android → stay on localhost.
    expect(
      resolveApiBase({
        envUrl: null,
        envPort: null,
        devHostUri: "localhost:8081",
        platformOS: "ios",
      }),
    ).toBe(`http://localhost:${defaultPort}`);

    expect(
      resolveApiBase({
        envUrl: null,
        envPort: null,
        devHostUri: "127.0.0.1:8081",
        platformOS: "ios",
      }),
    ).toBe(`http://127.0.0.1:${defaultPort}`);
  });

  it("4b. missing dev host falls back to 127.0.0.1", () => {
    expect(
      resolveApiBase({
        envUrl: null,
        envPort: null,
        devHostUri: null,
        platformOS: "ios",
      }),
    ).toBe(`http://127.0.0.1:${defaultPort}`);

    // Android with no host still uses the loopback fallback (not 10.0.2.2 —
    // that alias is only for when the dev server itself reported loopback).
    expect(
      resolveApiBase({
        envUrl: null,
        envPort: null,
        devHostUri: null,
        platformOS: "android",
      }),
    ).toBe(`http://127.0.0.1:${defaultPort}`);
  });
});

describe("hostnameFromDevHostUri", () => {
  it("parses host:port", () => {
    expect(hostnameFromDevHostUri("192.168.1.9:8081")).toBe("192.168.1.9");
  });

  it("parses full URLs (linkingUri style)", () => {
    expect(hostnameFromDevHostUri("exp://192.168.1.9:8081")).toBe("192.168.1.9");
  });

  it("returns null for empty input", () => {
    expect(hostnameFromDevHostUri(null)).toBeNull();
    expect(hostnameFromDevHostUri("")).toBeNull();
  });
});

describe("notificationImageUrl", () => {
  it("leaves a public picture link alone and ignores blanks", () => {
    expect(notificationImageUrl("https://cdn.gridgo.example/update.png")).toBe(
      "https://cdn.gridgo.example/update.png",
    );
    expect(notificationImageUrl("  ")).toBeNull();
    expect(notificationImageUrl(undefined)).toBeNull();
  });
});
