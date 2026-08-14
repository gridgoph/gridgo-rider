import { completeGoogleSso } from "@/lib/googleSso";

describe("completeGoogleSso", () => {
  it("activates the exact session created by Google", async () => {
    const setActive = jest.fn(async () => undefined);

    await expect(
      completeGoogleSso({
        alreadySignedIn: false,
        startSSOFlow: async () => ({ createdSessionId: "sess_google" }),
        setActive,
      }),
    ).resolves.toEqual({ status: "activated", sessionId: "sess_google" });

    expect(setActive).toHaveBeenCalledWith({ session: "sess_google" });
  });

  it("uses the activation function returned by the flow when available", async () => {
    const flowSetActive = jest.fn(async () => undefined);
    const fallbackSetActive = jest.fn(async () => undefined);

    await completeGoogleSso({
      alreadySignedIn: false,
      startSSOFlow: async () => ({
        createdSessionId: "sess_google",
        setActive: flowSetActive,
      }),
      setActive: fallbackSetActive,
    });

    expect(flowSetActive).toHaveBeenCalledWith({ session: "sess_google" });
    expect(fallbackSetActive).not.toHaveBeenCalled();
  });

  it("keeps cancellation silent", async () => {
    const setActive = jest.fn();

    await expect(
      completeGoogleSso({
        alreadySignedIn: false,
        startSSOFlow: async () => ({
          createdSessionId: null,
          authSessionResult: { type: "cancel" },
        }),
        setActive,
      }),
    ).resolves.toEqual({ status: "cancelled" });

    expect(setActive).not.toHaveBeenCalled();
  });
});
