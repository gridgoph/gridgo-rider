import * as api from "@/lib/api";

function sentBody(fetchSpy: jest.SpyInstance): Record<string, unknown> {
  const init = fetchSpy.mock.calls[0][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("POST /devices installChannel", () => {
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
  });
  afterEach(() => fetchSpy.mockRestore());

  it.each(["apk", "play", "ios"] as const)("reports %s on an unclaimed registration", async (channel) => {
    await api.registerDeviceUnclaimed("tok", channel === "ios" ? "ios" : "android", channel);
    expect(sentBody(fetchSpy)).toMatchObject({ token: "tok", appRole: "rider", installChannel: channel });
  });

  it("sends no channel when the build has none to report", async () => {
    await api.registerDeviceUnclaimed("tok", "web", null);
    expect(sentBody(fetchSpy)).not.toHaveProperty("installChannel");
  });
});
