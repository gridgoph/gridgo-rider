import { ApiError, acceptLegalVersions, getLegalPending, type LegalVersion } from "@/lib/api";
import { LEGAL_VERSION_CHANGED } from "@/lib/legal";
import { LEGAL_FIRST_READ_MS, legalGateFor, useLegalConsent } from "@/store/legalConsent";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getLegalPending: jest.fn(), acceptLegalVersions: jest.fn() };
});
jest.mock("@/lib/legalContext", () => ({
  legalContext: async () => ({ app: "gridgo-rider/test", device: "rider-test" }),
}));

const pendingRead = getLegalPending as jest.Mock;
const acceptCall = acceptLegalVersions as jest.Mock;

const agreement: LegalVersion = {
  id: "rider-agreement-2",
  documentId: "rider-agreement",
  version: 2,
  title: "Rider Agreement",
  audience: "rider",
  text: "Real text",
  effectiveAt: "2026-10-01T00:00:00.000Z",
  placeholder: false,
  material: true,
  status: "live",
};

beforeEach(() => {
  useLegalConsent.getState().reset();
  pendingRead.mockReset();
  acceptCall.mockReset();
});

describe("the agreement gate", () => {
  it("closes the app while a document is pending", async () => {
    pendingRead.mockResolvedValue({ blocking: true, pending: [agreement], notices: [] });
    await useLegalConsent.getState().load("user_1");
    expect(legalGateFor(useLegalConsent.getState(), "user_1")).toBe("blocked");
  });

  it("is unknown for any other account", async () => {
    pendingRead.mockResolvedValue({ blocking: true, pending: [agreement], notices: [] });
    await useLegalConsent.getState().load("user_1");
    expect(legalGateFor(useLegalConsent.getState(), "user_2")).toBe("unknown");
    expect(legalGateFor(useLegalConsent.getState(), null)).toBe("unknown");
  });

  it("lets the rider in when the read fails, and when the API has no library", async () => {
    pendingRead.mockRejectedValueOnce(new TypeError("Network request failed"));
    await useLegalConsent.getState().load("user_1");
    expect(useLegalConsent.getState().status).toBe("clear");

    useLegalConsent.getState().reset();
    pendingRead.mockRejectedValueOnce(new ApiError(404, { error: "not_found" }));
    await useLegalConsent.getState().load("user_1");
    expect(useLegalConsent.getState().status).toBe("clear");
  });

  it("keeps a known block when a later read fails", async () => {
    pendingRead.mockResolvedValueOnce({ blocking: true, pending: [agreement], notices: [] });
    await useLegalConsent.getState().load("user_1");
    pendingRead.mockRejectedValueOnce(new TypeError("Network request failed"));
    await useLegalConsent.getState().load("user_1");
    expect(useLegalConsent.getState().status).toBe("blocked");
  });

  it("gives up waiting after the first-read deadline", async () => {
    jest.useFakeTimers();
    try {
      pendingRead.mockReturnValue(new Promise(() => {}));
      void useLegalConsent.getState().load("user_1");
      expect(useLegalConsent.getState().status).toBe("unknown");
      jest.advanceTimersByTime(LEGAL_FIRST_READ_MS);
      expect(useLegalConsent.getState().status).toBe("clear");
    } finally {
      jest.useRealTimers();
    }
  });

  it("agrees to exactly the versions on screen, from the blocking screen", async () => {
    pendingRead.mockResolvedValue({ blocking: true, pending: [agreement], notices: [] });
    await useLegalConsent.getState().load("user_1");
    acceptCall.mockResolvedValue({ blocking: false, pending: [], notices: [], recorded: 1 });
    await expect(useLegalConsent.getState().accept()).resolves.toBe(true);
    expect(acceptCall).toHaveBeenCalledWith(["rider-agreement-2"], {
      app: "gridgo-rider/test",
      device: "rider-test",
    });
    expect(useLegalConsent.getState().status).toBe("clear");
  });

  it("reads the new text and asks again when a version changed mid-read", async () => {
    pendingRead.mockResolvedValueOnce({ blocking: true, pending: [agreement], notices: [] });
    await useLegalConsent.getState().load("user_1");
    const newer = { ...agreement, id: "rider-agreement-3", version: 3 };
    acceptCall.mockRejectedValue(new ApiError(409, { error: "legal_version_changed" }));
    pendingRead.mockResolvedValueOnce({ blocking: true, pending: [newer], notices: [] });
    await expect(useLegalConsent.getState().accept()).resolves.toBe(false);
    expect(useLegalConsent.getState().error).toBe(LEGAL_VERSION_CHANGED);
    expect(useLegalConsent.getState().pending).toEqual([newer]);
    expect(useLegalConsent.getState().status).toBe("blocked");
  });
});
