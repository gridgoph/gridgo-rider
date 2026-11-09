import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import type { Order } from "@/lib/api";
import { resetUpdateRequiredForTests, useUpdateRequired } from "@/store/updateRequired";

/*
  The 16 Oct dead end (ord_de22bfb54b9d): a build from before `rider_packs`
  met that counter mid-handover. A custody screen now shows the update
  instead, and a job on a flow this build runs carries on.
*/

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    jest.requireActual<typeof import("react")>("react").useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => ({ orderId: "ord_1" }),
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
}));

let mockChannel: "apk" | "play" | "ios" | null = "apk";
jest.mock("@/lib/buildDistribution", () => ({
  ...jest.requireActual("@/lib/buildDistribution"),
  installChannel: () => mockChannel,
}));

jest.mock("@/hooks/useProofEvidence", () => ({
  useProofEvidence: () => ({
    evidence: null,
    upload: { phase: "idle" },
    stored: {},
    captureError: null,
    cameraBlocked: false,
    takePhoto: jest.fn(),
    attachSignature: jest.fn(),
    retry: jest.fn(),
    clear: jest.fn(),
  }),
}));

jest.mock("@/components/EvidenceCapture", () => {
  const RN = jest.requireActual<typeof import("react-native")>("react-native");
  return { EvidenceCapture: (props: { title: string }) => <RN.Text>{props.title}</RN.Text> };
});

// eslint-disable-next-line import/first
import PackedPhotoScreen from "@/app/trip/pack";

const api = jest.requireMock("@/lib/api") as { getOrder: jest.Mock };

const order = {
  id: "ord_1",
  riderId: "user_rider",
  state: "rider_assigned",
  title: "Print bundle",
  fulfillmentMode: "delivery",
  pickup: { lat: 7.06, lng: 125.6, label: "PrintRight, Matina" },
  dropoff: { lat: 7.07, lng: 125.61, label: "Bajada" },
  handoverFlow: "rider_packs",
  pickupCountItems: [],
  pickupChecklist: null,
  shopHandover: {},
  timeline: [],
} as unknown as Order;

const UPDATE = "Update GRIDGO";

beforeEach(() => {
  jest.clearAllMocks();
  resetUpdateRequiredForTests();
  mockChannel = "apk";
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});

it("shows the update instead of a step on a handover flow this build does not know", async () => {
  api.getOrder.mockResolvedValue({ ...order, handoverFlow: "shop_seals" });
  await render(<PackedPhotoScreen />);
  await screen.findByText(UPDATE);
  expect(screen.getByText("Update to do this step. Your trip stays as it is.")).toBeTruthy();
  // Remembered, so the whole app asks once the trip is over.
  expect(useUpdateRequired.getState().unknownFlow).toBe(true);
});

it("closes a rider_packs step once the API refused this build", async () => {
  api.getOrder.mockResolvedValue(order);
  await render(<PackedPhotoScreen />);
  await screen.findByText("Check the items unpacked first");

  await act(async () => useUpdateRequired.setState({ refused: true }));
  expect(screen.getByText(UPDATE)).toBeTruthy();
  expect(screen.queryByText("Check the items unpacked first")).toBeNull();
});

it("leaves a legacy job alone when the build is below the rider_packs minimum", async () => {
  useUpdateRequired.setState({ installed: { versionCode: 146, versionName: "1.0.146" }, minimum: 161 });
  api.getOrder.mockResolvedValue({ ...order, handoverFlow: "legacy" });
  await render(<PackedPhotoScreen />);
  await screen.findByText("This job has no packing step");
  expect(screen.queryByText(UPDATE)).toBeNull();
});

describe("Update now opens this install's own update path", () => {
  it.each([
    ["apk", "https://gridgo.talasora.com/downloads/gridgo-rider.apk"],
    ["play", "market://details?id=ph.gridgo.rider"],
    ["ios", "itms-beta://"],
  ] as const)("%s", async (channel, url) => {
    mockChannel = channel;
    useUpdateRequired.setState({ installed: { versionCode: 146, versionName: "1.0.146" }, minimum: 161 });
    api.getOrder.mockResolvedValue(order);
    await render(<PackedPhotoScreen />);
    await screen.findByText(UPDATE);
    expect(screen.getByText("On this phone: 1.0.146")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Update now" }));
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith(url);
  });

  it("falls back to the Play web listing, then says when nothing opened", async () => {
    mockChannel = "play";
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));
    useUpdateRequired.setState({ refused: true });
    api.getOrder.mockResolvedValue(order);
    await render(<PackedPhotoScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Update now" }));
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://play.google.com/store/apps/details?id=ph.gridgo.rider");
    expect(await screen.findByText("The update did not open. Try again.")).toBeTruthy();
  });
});
