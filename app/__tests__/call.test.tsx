import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CallScreen, { UNSUPPORTED_TITLE } from "@/app/call";
import type { OrderCall } from "@/lib/orderCalls";
import { useActiveTrip } from "@/store/activeTrip";
import { setCallSessionDeps, useCall } from "@/store/call";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

let mockWebRTC = true;
jest.mock("@/lib/webrtc", () => ({
  webRTCAvailable: () => mockWebRTC,
  loadWebRTC: () => null,
}));

const mockGetMic = jest.fn();
const mockRequestMic = jest.fn();
jest.mock("@/lib/micPermission", () => ({
  getMicPermission: () => mockGetMic(),
  requestMicPermission: () => mockRequestMic(),
}));

const mockListCalls = jest.fn();
const mockStart = jest.fn();
const mockAction = jest.fn();
jest.mock("@/lib/api", () => ({
  listOrderCalls: (...args: unknown[]) => mockListCalls(...args),
  startOrderCall: (...args: unknown[]) => mockStart(...args),
  orderCallAction: (...args: unknown[]) => mockAction(...args),
  getOrderCall: jest.fn(async () => new Promise(() => undefined)),
  getCallSignals: jest.fn(async () => new Promise(() => undefined)),
  getCallIceServers: jest.fn(async () => ({ iceServers: [], relayAvailable: false })),
  sendCallSignal: jest.fn(async () => ({ id: 1 })),
  apiErrorCode: () => null,
}));

const NOW = Date.parse("2026-10-08T08:00:00.000Z");

function makeCall(patch: Partial<OrderCall> = {}): OrderCall {
  return {
    id: "c1",
    orderId: "ord_1",
    pair: "delivery",
    state: "ringing",
    caller: { firstName: "Sam", role: "rider" },
    callee: { firstName: "Alex", role: "client" },
    mine: true,
    createdAt: new Date(NOW).toISOString(),
    ringExpiresAt: new Date(NOW + 30_000).toISOString(),
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
    ...patch,
  };
}

const track = { enabled: true, stop: jest.fn() };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
const peer = {
  createOffer: jest.fn(async () => ({ type: "offer", sdp: "v=0\r\n" })),
  createAnswer: jest.fn(async () => ({ type: "answer", sdp: "v=0\r\n" })),
  setLocalDescription: jest.fn(async () => undefined),
  setRemoteDescription: jest.fn(async () => undefined),
  addIceCandidate: jest.fn(async () => undefined),
  addTrack: jest.fn(),
  addEventListener: jest.fn(),
  close: jest.fn(),
};
const stopRing = jest.fn();

function renderScreen(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWebRTC = true;
  mockParams = {};
  mockGetMic.mockResolvedValue("granted");
  mockRequestMic.mockResolvedValue("granted");
  mockListCalls.mockResolvedValue([]);
  mockAction.mockImplementation(async (_o: string, _c: string, action: string) =>
    makeCall({ state: action === "decline" ? "declined" : action === "accept" ? "accepted" : "ringing" }),
  );
  const api = jest.requireMock("@/lib/api");
  setCallSessionDeps(() => ({
    api,
    webrtc: { createPeer: () => peer, getAudioStream: async () => stream, attachRemoteAudio: () => () => undefined },
    audio: { startRinging: () => stopRing, routeCallAudio: async () => undefined, releaseCallAudio: async () => undefined },
  }));
  useCall.getState().reset();
  useActiveTrip.setState({
    order: {
      id: "ord_1",
      state: "rider_assigned",
      title: "Business cards",
      deliveryChat: { status: "open", closesAt: null, retentionHours: 24 },
      pickupChat: { status: "open", closesAt: null, retentionHours: 24, unread: 0 },
    } as never,
    loaded: true,
  });
});

afterAll(() => setCallSessionDeps(null));

it("in Expo Go, says calls need the latest app instead of crashing, and never starts a call", async () => {
  mockWebRTC = false;
  mockParams = { orderId: "ord_1", pair: "delivery" };
  useCall.getState().arm("ord_1", "delivery");
  await renderScreen(<CallScreen />);

  expect(await screen.findByText(UNSUPPORTED_TITLE)).toBeTruthy();
  expect(screen.getByText("Open the download page")).toBeTruthy();
  // The conversation is still a way to reach the same person.
  expect(screen.getByText("Message the client")).toBeTruthy();
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockGetMic).not.toHaveBeenCalled();
});

it("explains the microphone at the first call, and stops when the phone refuses it", async () => {
  mockGetMic.mockResolvedValue("undetermined");
  mockRequestMic.mockResolvedValue("blocked");
  mockParams = { orderId: "ord_1", pair: "pickup" };
  useCall.getState().arm("ord_1", "pickup");
  await renderScreen(<CallScreen />);

  expect(await screen.findByText("Calls use your microphone")).toBeTruthy();
  expect(screen.getByText("Shop")).toBeTruthy();
  expect(mockRequestMic).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.press(screen.getByText("Allow microphone and call"));
  });
  expect(mockRequestMic).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("Microphone is off for GRIDGO")).toBeTruthy();
  expect(screen.getByText("Open phone settings")).toBeTruthy();
  expect(mockStart).not.toHaveBeenCalled();
});

it("places the call and names who is being called, by role and first name", async () => {
  mockStart.mockResolvedValue(makeCall());
  mockParams = { orderId: "ord_1", pair: "delivery" };
  useCall.getState().arm("ord_1", "delivery");
  await renderScreen(<CallScreen />);

  expect(await screen.findByText("Alex")).toBeTruthy();
  expect(mockStart).toHaveBeenCalledWith("ord_1", "delivery");
  expect(screen.getByText("Client")).toBeTruthy();
  expect(screen.getByText("Ringing…")).toBeTruthy();
  expect(screen.getByLabelText("End the call with Alex, the client")).toBeTruthy();
  expect(screen.getByText("Mute")).toBeTruthy();
  expect(screen.getByText("Speaker")).toBeTruthy();
  expect(screen.queryByText(/\+63|09\d{9}/)).toBeNull();
});

it("never dials from a link alone: it asks first, then calls on the tap", async () => {
  mockStart.mockResolvedValue(makeCall());
  mockParams = { orderId: "ord_1", pair: "delivery" };
  await renderScreen(<CallScreen />);

  expect(await screen.findByText("Call the client")).toBeTruthy();
  await act(async () => undefined);
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockGetMic).not.toHaveBeenCalled();

  await act(async () => {
    await fireEvent.press(screen.getByText("Call the client"));
  });
  expect(await screen.findByText("Alex")).toBeTruthy();
  expect(mockStart).toHaveBeenCalledWith("ord_1", "delivery");
});

it("rings for a pushed call that is still ringing, and declines it", async () => {
  mockListCalls.mockResolvedValue([
    makeCall({ mine: false, pair: "pickup", caller: { firstName: "Mika", role: "supplier" }, callee: { firstName: "Sam", role: "rider" } }),
  ]);
  mockParams = { orderId: "ord_1", incoming: "1" };
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  jest.setSystemTime(NOW + 1_000);
  try {
    await renderScreen(<CallScreen />);
    expect(await screen.findByText("Mika")).toBeTruthy();
    expect(screen.getByText("Shop")).toBeTruthy();
    expect(screen.getByText("Shop calling")).toBeTruthy();
    expect(screen.getByLabelText("Answer the call from Mika, the shop")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Decline the call from Mika, the shop"));
    });
    expect(mockAction).toHaveBeenCalledWith("ord_1", "c1", "decline");
    expect(stopRing).toHaveBeenCalled();
    expect(await screen.findByText("You declined the call")).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

it("does not reopen ringing for a stale push: it lands on the trip", async () => {
  mockListCalls.mockResolvedValue([makeCall({ mine: false, state: "missed" })]);
  mockParams = { orderId: "ord_1", incoming: "1" };
  await renderScreen(<CallScreen />);

  await act(async () => undefined);
  expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/active");
  expect(stopRing).not.toHaveBeenCalled();
  expect(useCall.getState().snapshot).toBeNull();
});
