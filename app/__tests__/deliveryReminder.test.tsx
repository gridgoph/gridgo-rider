import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ApiError, type Order } from "@/lib/api";
import type { EvidenceTarget } from "@/lib/attachments";
import type { EvidenceUpload } from "@/lib/proofEvidence";

let mockOrderId = "ord_1";
const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn() };

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    jest.requireActual<typeof import("react")>("react").useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => ({ orderId: mockOrderId }),
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  health: jest.fn(),
  storageStatus: () => "available",
  recordDelivery: jest.fn(),
  // No handover code on these jobs: the reminder is the subject here.
  getHandover: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("@/lib/proofPhoto", () => ({
  ...jest.requireActual("@/lib/proofPhoto"),
  captureProofPhoto: jest.fn((step: string) => Promise.resolve({
    ok: true,
    evidence: {
      kind: "photo", uri: `file:///cache/${step}.jpg`, fileName: `${step}.jpg`,
      mimeType: "image/jpeg", capturedAt: "2026-10-28T09:00:00.000Z", sizeBytes: 2048,
    },
  })),
}));

/**
 * What the package photo upload does next; the door photo always stores.
 * `late` holds the upload open and hands the test its callbacks.
 */
let mockPackageUpload: EvidenceUpload | "late" = { phase: "stored", fileId: "fil_package" };
let mockLate: {
  onPhase: (phase: EvidenceUpload) => void;
  resolve: (ids: object) => void;
  cancel: jest.Mock;
} | null = null;

jest.mock("@/lib/attachments", () => ({
  ...jest.requireActual("@/lib/attachments"),
  uploadEvidence: jest.fn(({ targets, onPhase }: {
    targets: readonly EvidenceTarget[];
    onPhase: (phase: EvidenceUpload) => void;
  }) => {
    if (targets[0]!.purpose === "delivery_package_photo") {
      if (mockPackageUpload === "late") {
        onPhase({ phase: "sending", sentBytes: 0, totalBytes: 2048 });
        const cancel = jest.fn();
        return {
          cancel,
          result: new Promise((resolve) => { mockLate = { onPhase, resolve, cancel }; }),
        };
      }
      onPhase(mockPackageUpload);
      return {
        cancel: jest.fn(),
        result: mockPackageUpload.phase === "stored"
          ? Promise.resolve({ delivery_package_photo: mockPackageUpload.fileId })
          : new Promise(() => undefined),
      };
    }
    onPhase({ phase: "stored", fileId: "fil_door" });
    return {
      cancel: jest.fn(),
      result: Promise.resolve({ delivery_photo: "fil_door", fulfilment_proof: "fil_pof" }),
    };
  }),
}));

// The screen is imported after its native pieces are mocked above.
// eslint-disable-next-line import/first
import DeliveryProofScreen from "@/app/trip/delivery";

const api = jest.requireMock("@/lib/api") as {
  getOrder: jest.Mock;
  health: jest.Mock;
  recordDelivery: jest.Mock;
};
const attachments = jest.requireMock("@/lib/attachments") as { uploadEvidence: jest.Mock };

const atDoor = {
  id: "ord_1",
  clientId: "user_client",
  supplierId: "user_supplier",
  riderId: "user_rider",
  state: "out_for_delivery",
  fulfillmentMode: "delivery",
  title: "Tarpaulin 3×6 ft",
  quantity: 12,
  address: "Bajada, Davao City",
  zone: "davao_central",
  deliveryFeeMinor: 6_000,
  payments: { final_online: { status: "confirmed", amountMinor: 15_000 } },
  pickup: { lat: 7.06, lng: 125.6, label: "PrintRight, Matina" },
  dropoff: { lat: 7.07, lng: 125.61, label: "Bajada" },
  pickupChecklist: null,
  timeline: [],
} as unknown as Order;

const REMINDED = { handoffReminderVersion: 1, remindedClient: true };
const DOOR_PHOTO = { evidenceFileId: "fil_door", evidenceType: "photo" };

const confirm = () => screen.getByRole("button", { name: /confirm delivery/i });
const reminded = () => screen.getByRole("checkbox", { name: "I reminded the client" });
const consent = () => screen.getByRole("checkbox", { name: "Client agreed to a photo" });
const cameraButtons = () => screen.getAllByRole("button", { name: "Open the camera" });

/** Open the door step and take the delivery photo. */
async function photographDoor() {
  await render(<DeliveryProofScreen />);
  await screen.findByText("No evidence yet");
  expect(screen.queryByText("Before you close the job")).toBeNull();
  await fireEvent.press(cameraButtons()[0]!);
  await screen.findByText("Before you close the job");
}

async function photographPackage() {
  await fireEvent.press(consent());
  await screen.findByText("PACKAGE PHOTO");
  await fireEvent.press(cameraButtons()[0]!);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOrderId = "ord_1";
  mockLate = null;
  mockPackageUpload = { phase: "stored", fileId: "fil_package" };
  api.health.mockResolvedValue({});
  api.getOrder.mockImplementation((id: string) => Promise.resolve({ ...atDoor, id }));
  api.recordDelivery.mockResolvedValue({ ...atDoor, state: "issue_window_open" });
});

describe("the reminder card after the door photo", () => {
  it("reads the three lines and holds the job until the rider ticks the reminder", async () => {
    await photographDoor();
    expect(screen.getByText("Thank you for choosing GRIDGO.")).toBeTruthy();
    expect(screen.getByText("Please rate us in the GRIDGO app.")).toBeTruthy();
    expect(screen.getByText("And share your GRIDGO moment with a friend.")).toBeTruthy();
    expect(reminded()).not.toBeChecked();
    expect(consent()).not.toBeChecked();
    expect(confirm()).toBeDisabled();
    expect(screen.getByText(/tick "I reminded the client"/)).toBeTruthy();
    await fireEvent.press(confirm());
    expect(api.recordDelivery).not.toHaveBeenCalled();

    await fireEvent.press(reminded());
    expect(reminded()).toBeChecked();
    expect(confirm()).toBeEnabled();
    await fireEvent.press(confirm());

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: false,
    });
  });

  it("closes with the client's agreement and no package photo", async () => {
    await photographDoor();
    await fireEvent.press(reminded());
    await fireEvent.press(consent());
    expect(screen.getByText(/Photograph the package only\. Never the documents inside or any shop signage\./)).toBeTruthy();
    expect(confirm()).toBeEnabled();
    await fireEvent.press(confirm());

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: true,
    });
  });

  it("uploads an agreed package photo as its own purpose and names it on the delivery", async () => {
    await photographDoor();
    await fireEvent.press(reminded());
    await photographPackage();
    await waitFor(() => expect(screen.getAllByText("Saved on the server")).toHaveLength(2));

    const packageCall = attachments.uploadEvidence.mock.calls.find(
      ([args]) => args.targets[0].purpose === "delivery_package_photo",
    );
    expect(packageCall?.[0]).toMatchObject({
      orderId: "ord_1",
      targets: [{ purpose: "delivery_package_photo" }],
      evidence: { fileName: "package.jpg" },
    });

    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: true, packagePhotoFileId: "fil_package",
    });
  });

  it.each([
    ["still sending", { phase: "sending", sentBytes: 512, totalBytes: 2048 }, "Sending photo"],
    ["still saving", { phase: "processing" }, "Sent — the server is still saving it"],
    ["failed", { phase: "failed", message: "No connection while sending.", retryable: true }, "Not sent"],
  ] as const)("never holds the job for a package photo %s, and closes without its id", async (_name, phase, status) => {
    mockPackageUpload = phase;
    await photographDoor();
    await fireEvent.press(reminded());
    await photographPackage();
    await screen.findByText(status);

    const closeWithout = screen.getByRole("button", { name: "Confirm delivery without the package photo" });
    expect(closeWithout).toBeEnabled();
    // The client's agreement stays as it was; nobody has to untick it.
    expect(consent()).toBeChecked();
    await fireEvent.press(closeWithout);

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: true,
    });
  });

  it("still sends a failed package photo once it is sent again and saves", async () => {
    mockPackageUpload = { phase: "failed", message: "No connection while sending.", retryable: true };
    await photographDoor();
    await fireEvent.press(reminded());
    await photographPackage();
    await screen.findByText("Not sent");

    mockPackageUpload = { phase: "stored", fileId: "fil_package" };
    await fireEvent.press(screen.getByRole("button", { name: "Send it again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm delivery" })).toBeEnabled());
    await fireEvent.press(confirm());
    await waitFor(() => expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: true, packagePhotoFileId: "fil_package",
    }));
  });

  it("drops a saved package photo when the rider unticks the client's agreement", async () => {
    await photographDoor();
    await fireEvent.press(reminded());
    await photographPackage();
    await waitFor(() => expect(screen.getAllByText("Saved on the server")).toHaveLength(2));

    await fireEvent.press(consent());
    expect(screen.queryByText("PACKAGE PHOTO")).toBeNull();
    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: false,
    });
  });

  it("ignores a package upload that finishes after the rider unticked", async () => {
    mockPackageUpload = "late";
    await photographDoor();
    await fireEvent.press(reminded());
    await photographPackage();
    await screen.findByText("Sending photo");
    await fireEvent.press(consent());

    await act(async () => {
      mockLate!.onPhase({ phase: "stored", fileId: "fil_late" });
      mockLate!.resolve({ delivery_package_photo: "fil_late" });
    });
    // Ticking again starts afresh: the late file is not adopted.
    await fireEvent.press(consent());
    expect(await screen.findByText("No evidence yet")).toBeTruthy();
    expect(screen.getAllByText("Saved on the server")).toHaveLength(1);

    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: true,
    });
    expect(JSON.stringify(api.recordDelivery.mock.calls)).not.toContain("fil_late");
  });

  it("ignores a package upload that finishes after the job closed without it", async () => {
    mockPackageUpload = "late";
    await photographDoor();
    await fireEvent.press(reminded());
    await photographPackage();
    await screen.findByText("Sending photo");
    await fireEvent.press(screen.getByRole("button", { name: "Confirm delivery without the package photo" }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    // The unfinished transfer is stopped before the delivery is sent.
    expect(mockLate!.cancel).toHaveBeenCalled();
    expect(mockLate!.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      api.recordDelivery.mock.invocationCallOrder[0]!,
    );

    await act(async () => {
      mockLate!.onPhase({ phase: "stored", fileId: "fil_late" });
      mockLate!.resolve({ delivery_package_photo: "fil_late" });
    });
    expect(api.recordDelivery).toHaveBeenCalledTimes(1);
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: true,
    });
  });

  it("starts the next order with no ticks and no package photo", async () => {
    const view = await render(<DeliveryProofScreen />);
    await screen.findByText("No evidence yet");
    await fireEvent.press(cameraButtons()[0]!);
    await screen.findByText("Before you close the job");
    await fireEvent.press(reminded());
    await photographPackage();
    await waitFor(() => expect(screen.getAllByText("Saved on the server")).toHaveLength(2));

    mockOrderId = "ord_2";
    await view.rerender(<DeliveryProofScreen />);
    await screen.findByText("No evidence yet");
    expect(screen.queryByText("Before you close the job")).toBeNull();
    await fireEvent.press(cameraButtons()[0]!);
    await screen.findByText("Before you close the job");
    expect(reminded()).not.toBeChecked();
    expect(consent()).not.toBeChecked();
    expect(screen.queryByText("PACKAGE PHOTO")).toBeNull();

    await fireEvent.press(reminded());
    await fireEvent.press(confirm());
    await waitFor(() => expect(api.recordDelivery).toHaveBeenCalledWith("ord_2", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: false,
    }));
  });

  it("is not shown at GRIDGO Office, which sends the reminder version alone", async () => {
    api.getOrder.mockResolvedValue({ ...atDoor, fulfillmentMode: "pickup" });
    await render(<DeliveryProofScreen />);
    await screen.findByText("No evidence yet");
    await fireEvent.press(cameraButtons()[0]!);
    await screen.findByText("Saved on the server");
    expect(screen.queryByText("Before you close the job")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "I reminded the client" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: /confirm drop-off/i }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", { ...DOOR_PHOTO, handoffReminderVersion: 1 });
  });
});

describe("a refused delivery keeps the door photo", () => {
  it("removes a refused package photo, keeps the door photo, and closes on retry without it", async () => {
    api.recordDelivery.mockRejectedValueOnce(new ApiError(400, { error: "package_photo_required" }));
    await photographDoor();
    await fireEvent.press(reminded());
    await photographPackage();
    await waitFor(() => expect(confirm()).toBeEnabled());
    await fireEvent.press(confirm());

    await screen.findByText("Delivery not recorded");
    expect(screen.getByText(/The package photo is not on this job, so it was removed\./)).toBeTruthy();
    expect(screen.queryByText("package_photo_required")).toBeNull();
    // The door photo is still there and still saved; only the package photo went.
    expect(screen.getByLabelText("The proof photo you captured")).toBeTruthy();
    expect(screen.getAllByText("Saved on the server")).toHaveLength(1);
    expect(reminded()).toBeChecked();

    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenLastCalledWith("ord_1", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: true,
    });
    expect(attachments.uploadEvidence).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["client_reminder_required", /tick it, then confirm again/],
    ["unsupported_handoff_reminder_version", /does not recognise this app's door reminder/],
    ["invalid_photo_consent", /Tick or untick the photo box again/],
  ])("explains %s in plain words and lets the rider retry", async (code, copy) => {
    api.recordDelivery.mockRejectedValueOnce(new ApiError(400, { error: code }));
    await photographDoor();
    await fireEvent.press(reminded());
    await fireEvent.press(confirm());

    await screen.findByText("Delivery not recorded");
    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.queryByText(code)).toBeNull();
    expect(screen.getByLabelText("The proof photo you captured")).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();

    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledTimes(2);
  });

  it("keeps everything through a dropped connection and retries the same request", async () => {
    api.recordDelivery.mockRejectedValueOnce(new Error("Network request failed"));
    await photographDoor();
    await fireEvent.press(reminded());
    await photographPackage();
    await waitFor(() => expect(confirm()).toBeEnabled());
    await fireEvent.press(confirm());

    await screen.findByText("Delivery not recorded");
    expect(screen.getAllByText("Saved on the server")).toHaveLength(2);
    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery.mock.calls[1]).toEqual(api.recordDelivery.mock.calls[0]);
    expect(api.recordDelivery).toHaveBeenLastCalledWith("ord_1", {
      ...DOOR_PHOTO, ...REMINDED, clientAgreedToPhoto: true, packagePhotoFileId: "fil_package",
    });
  });
});
