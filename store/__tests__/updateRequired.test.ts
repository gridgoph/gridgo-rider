/*
  The header every request sends, and how a 426 or the published minimum
  becomes the update block. The build is the development override, the one
  way a test (or a developer) can be a numbered build.
*/
import * as api from "@/lib/api";
import { resetAppIdentityForTests } from "@/lib/appIdentity";
import {
  bindUpdateRequiredHandler,
  checkMinimumBuild,
  resetUpdateRequiredForTests,
  updateRequired,
  useUpdateRequired,
} from "@/store/updateRequired";

// Read when the first request names this build (`currentRiderBuild`).
process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE = "146";

const installed = { versionCode: 146, versionName: "1.0.146" };
const originalFetch = global.fetch;

function respond(status: number, body: unknown) {
  return jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }));
}

let unbind: () => void;
beforeEach(() => {
  resetAppIdentityForTests();
  resetUpdateRequiredForTests();
  unbind = bindUpdateRequiredHandler();
});
afterEach(() => {
  unbind();
  global.fetch = originalFetch;
});

it("names this build in X-GRIDGO-App on every API request", async () => {
  const fetchMock = respond(200, []);
  global.fetch = fetchMock as unknown as typeof fetch;
  await api.listOffers();
  const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
  expect(headers["X-GRIDGO-App"]).toBe("rider/1.0.146+146");
});

it("turns a 426 app_update_required from any request into the update", async () => {
  global.fetch = respond(426, { error: "app_update_required", minimumBuild: 161, app: "rider" }) as unknown as typeof fetch;
  await expect(api.confirmPickup("ord_1", { fileId: "fil_1", signerName: "Shop" } as never)).rejects.toMatchObject({ status: 426 });
  expect(useUpdateRequired.getState()).toMatchObject({ refused: true, minimum: 161 });
  expect(updateRequired(useUpdateRequired.getState())).toBe(true);
  expect(api.apiErrorMessage(new api.ApiError(426, { error: "app_update_required" }), "x")).toBe(
    "Update GRIDGO to do this step. Your trip stays as it is.",
  );
});

it("ignores a 426 that is not the API's update refusal", async () => {
  global.fetch = respond(426, { error: "something_else" }) as unknown as typeof fetch;
  await expect(api.listOffers()).rejects.toMatchObject({ status: 426 });
  expect(updateRequired(useUpdateRequired.getState())).toBe(false);
});

describe("the published minimum", () => {
  it.each([
    ["below", 147, true],
    ["at", 146, false],
    ["above", 145, false],
  ])("a build %s the minimum (%i) blocks: %s", async (_where, minimum, blocks) => {
    await checkMinimumBuild(installed, {
      apiBase: "https://api.example",
      fetchImpl: respond(200, { minimumBuilds: { rider: minimum } }) as unknown as typeof fetch,
    });
    expect(updateRequired(useUpdateRequired.getState())).toBe(blocks);
  });

  it("is no minimum when the read fails, even after one that blocked", async () => {
    await checkMinimumBuild(installed, {
      apiBase: "https://api.example",
      fetchImpl: respond(200, { minimumBuilds: { rider: 161 } }) as unknown as typeof fetch,
    });
    expect(updateRequired(useUpdateRequired.getState())).toBe(true);
    await checkMinimumBuild(installed, {
      apiBase: "https://api.example",
      fetchImpl: jest.fn(async () => {
        throw new TypeError("Network request failed");
      }) as unknown as typeof fetch,
    });
    expect(updateRequired(useUpdateRequired.getState())).toBe(false);
  });

  it("is never read for a build that names no number", async () => {
    const fetchImpl = respond(200, { minimumBuilds: { rider: 999 } });
    await checkMinimumBuild(null, { apiBase: "https://api.example", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(updateRequired(useUpdateRequired.getState())).toBe(false);
  });
});
