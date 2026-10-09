import { CALL_CONNECT_TIMEOUT_MS, CallSession, type CallApi, type CallSessionDeps } from "@/lib/callSession";
import type { OrderCall } from "@/lib/orderCalls";
import type { RtcPeer, RtcStream, WebRTCApi } from "@/lib/webrtc";

const NOW = Date.parse("2026-10-08T08:00:00.000Z");

function makeCall(patch: Partial<OrderCall> = {}): OrderCall {
  return {
    id: "e115b493-dee1-448f-b6ba-a9868f448df2",
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

function refusal(code: string, status = 409) {
  return Object.assign(new Error(code), { status, body: { error: code } });
}

type FakePeer = RtcPeer & {
  emit: (type: string, event?: unknown) => void;
  closed: boolean;
  remote: { type: string; sdp: string } | null;
  candidates: unknown[];
};

function fakePeer(): FakePeer {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const peer: FakePeer = {
    closed: false,
    remote: null,
    candidates: [],
    connectionState: "new",
    createOffer: jest.fn(async () => ({ type: "offer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" })),
    createAnswer: jest.fn(async () => ({ type: "answer", sdp: "v=0\r\nanswer\r\n" })),
    setLocalDescription: jest.fn(async () => undefined),
    setRemoteDescription: jest.fn(async (description) => {
      peer.remote = description;
    }),
    addIceCandidate: jest.fn(async (candidate) => {
      peer.candidates.push(candidate);
    }),
    addTrack: jest.fn(),
    addEventListener: (type: string, listener: (event: never) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener as (event: unknown) => void]);
    },
    close: jest.fn(() => {
      peer.closed = true;
    }),
    emit: (type, event = {}) => {
      if (type === "connectionstatechange") peer.connectionState = (event as { state: string }).state;
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
  return peer;
}

function rig(options: { webrtc?: "none" | "mic-denied" } = {}) {
  const track = { enabled: true, stop: jest.fn() };
  const stream: RtcStream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const peers: FakePeer[] = [];
  const webrtc: WebRTCApi | null =
    options.webrtc === "none"
      ? null
      : {
          createPeer: jest.fn(() => {
            const peer = fakePeer();
            peers.push(peer);
            return peer;
          }),
          getAudioStream: jest.fn(async () => {
            if (options.webrtc === "mic-denied") throw new Error("Permission denied");
            return stream;
          }),
          attachRemoteAudio: jest.fn(() => () => undefined),
        };
  let server = makeCall();
  const signals: { id: number; kind: string; [key: string]: unknown }[] = [];
  const api = {
    startOrderCall: jest.fn(async () => server),
    getOrderCall: jest.fn(async () => server),
    orderCallAction: jest.fn(async (_order: string, _id: string, action: string) => {
      const next =
        action === "accept"
          ? "accepted"
          : action === "decline"
            ? "declined"
            : action === "cancel"
              ? "cancelled"
              : action === "end"
                ? "ended"
                : server.state;
      server = { ...server, state: next as OrderCall["state"] };
      return server;
    }),
    sendCallSignal: jest.fn(async () => ({ id: 1 })),
    getCallSignals: jest.fn(async (_o: string, _c: string, after: number) => {
      const fresh = signals.filter((signal) => signal.id > after);
      return { signals: fresh, cursor: fresh.at(-1)?.id ?? after, call: server };
    }),
    getCallIceServers: jest.fn(async () => ({ iceServers: [{ urls: ["stun:stun.example.test:3478"] }], relayAvailable: false })),
    apiErrorCode: (error: unknown) =>
      ((error as { body?: { error?: string } } | null)?.body?.error as string | undefined) ?? null,
  };
  const stopRing = jest.fn();
  const audio = {
    startRinging: jest.fn(() => stopRing),
    routeCallAudio: jest.fn(async () => undefined),
    releaseCallAudio: jest.fn(async () => undefined),
  };
  const deps: CallSessionDeps = { api: api as unknown as CallApi, webrtc, audio, now: () => Date.now() };
  return {
    deps,
    api,
    audio,
    stopRing,
    track,
    peers,
    signals,
    setServer: (patch: Partial<OrderCall>) => {
      server = { ...server, ...patch };
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("calling the client", () => {
  it("rings, connects on the answer, counts from the connection and ends cleanly", async () => {
    const r = rig();
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "delivery" });
    const phases: string[] = [];
    session.subscribe((s) => phases.push(s.phase));

    await session.place();
    expect(r.api.startOrderCall).toHaveBeenCalledWith("ord_1", "delivery");
    expect(session.snapshot.phase).toBe("ringing");
    // Fresh ICE servers for this call, then an audio-only offer.
    expect(r.api.getCallIceServers).toHaveBeenCalledTimes(1);
    expect(r.peers[0]!.createOffer).toHaveBeenCalledWith({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    await jest.advanceTimersByTimeAsync(0);
    expect(r.api.sendCallSignal).toHaveBeenCalledWith(
      "ord_1",
      expect.any(String),
      expect.objectContaining({ kind: "offer", clientId: expect.stringMatching(/^offer_/) }),
    );

    // A local candidate (this phone's address) is held while the call only rings.
    const kinds = () => r.api.sendCallSignal.mock.calls.map((call) => ((call as unknown[])[2] as { kind: string }).kind);
    r.peers[0]!.emit("icecandidate", { candidate: { candidate: "candidate:1 1 UDP 1 192.0.2.1 1234 typ host", sdpMid: "0", sdpMLineIndex: 0 } });
    await jest.advanceTimersByTimeAsync(0);
    expect(kinds()).toEqual(["offer"]);

    // The client answers; their candidate arrives before the answer is applied and waits.
    r.setServer({ state: "accepted", acceptedAt: new Date(NOW + 5_000).toISOString() });
    r.signals.push(
      { id: 1, kind: "ice", candidate: "candidate:2 1 UDP 1 192.0.2.2 1234 typ host", sdpMid: "0", sdpMLineIndex: 0 },
      { id: 2, kind: "answer", sdp: "v=0\r\nanswer\r\n" },
    );
    await jest.advanceTimersByTimeAsync(2_000);
    expect(r.peers[0]!.remote).toEqual({ type: "answer", sdp: "v=0\r\nanswer\r\n" });
    expect(r.peers[0]!.candidates).toHaveLength(1);
    expect(session.snapshot.phase).toBe("connecting");
    expect(r.audio.routeCallAudio).toHaveBeenCalledWith(false);
    // Answered: the held candidate goes now, after the offer.
    expect(kinds()).toEqual(["offer", "ice"]);

    r.peers[0]!.emit("connectionstatechange", { state: "connected" });
    expect(session.snapshot.phase).toBe("connected");
    expect(session.snapshot.connectedAtMs).toBe(Date.now());

    r.peers[0]!.emit("connectionstatechange", { state: "disconnected" });
    expect(session.snapshot.phase).toBe("reconnecting");
    r.peers[0]!.emit("connectionstatechange", { state: "connected" });
    expect(session.snapshot.phase).toBe("connected");

    await jest.advanceTimersByTimeAsync(20_000);
    expect(r.api.orderCallAction).toHaveBeenCalledWith("ord_1", expect.any(String), "heartbeat");

    await session.hangUp();
    expect(r.api.orderCallAction).toHaveBeenLastCalledWith("ord_1", expect.any(String), "end");
    expect(session.snapshot).toMatchObject({ phase: "ended", endReason: "ended" });
    expect(r.peers[0]!.closed).toBe(true);
    expect(r.track.stop).toHaveBeenCalled();
    expect(r.audio.releaseCallAudio).toHaveBeenCalled();
    expect(phases).toEqual(expect.arrayContaining(["calling", "ringing", "connecting", "connected", "reconnecting", "ended"]));
  });

  it("says the client declined, and stops polling once the server has", async () => {
    const r = rig();
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "delivery" });
    await session.place();
    r.setServer({ state: "declined" });
    await jest.advanceTimersByTimeAsync(2_000);
    expect(session.snapshot).toMatchObject({ phase: "ended", endReason: "declined" });
    expect(r.peers[0]!.closed).toBe(true);
    const polls = r.api.getCallSignals.mock.calls.length;
    await jest.advanceTimersByTimeAsync(10_000);
    expect(r.api.getCallSignals.mock.calls.length).toBe(polls);
  });

  it("reports no answer when the ring runs out", async () => {
    const r = rig();
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "pickup" });
    await session.place();
    r.setServer({ state: "missed" });
    await jest.advanceTimersByTimeAsync(2_000);
    expect(session.snapshot.endReason).toBe("no_answer");
  });

  it("never sends this phone's network candidates for a call nobody answered", async () => {
    const r = rig();
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "delivery" });
    await session.place();
    r.peers[0]!.emit("icecandidate", { candidate: { candidate: "candidate:1 1 UDP 1 192.0.2.1 1234 typ host", sdpMid: "0", sdpMLineIndex: 0 } });
    r.setServer({ state: "missed" });
    await jest.advanceTimersByTimeAsync(2_000);
    expect(session.snapshot.endReason).toBe("no_answer");
    const sent = r.api.sendCallSignal.mock.calls.map((call) => ((call as unknown[])[2] as { kind: string }).kind);
    expect(sent).toEqual(["offer"]);
  });

  it("cancels a call the rider ends while it rings", async () => {
    const r = rig();
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "delivery" });
    await session.place();
    await session.hangUp();
    expect(r.api.orderCallAction).toHaveBeenCalledWith("ord_1", expect.any(String), "cancel");
    expect(session.snapshot.endReason).toBe("cancelled");
  });

  it("never rings the other phone when the microphone is refused", async () => {
    const r = rig({ webrtc: "mic-denied" });
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "delivery" });
    await session.place();
    expect(r.api.startOrderCall).not.toHaveBeenCalled();
    expect(session.snapshot).toMatchObject({ phase: "ended", endReason: "mic_blocked" });
  });

  it("says calling is closed when the API refuses the window", async () => {
    const r = rig();
    r.api.startOrderCall.mockRejectedValueOnce(refusal("call_not_available"));
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "pickup" });
    await session.place();
    expect(session.snapshot.endReason).toBe("not_available");
    expect(r.track.stop).toHaveBeenCalled();
  });

  it("does nothing but say so in a build without WebRTC", async () => {
    const r = rig({ webrtc: "none" });
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "delivery" });
    await session.place();
    expect(r.api.startOrderCall).not.toHaveBeenCalled();
    expect(session.snapshot.endReason).toBe("unsupported");
  });

  it("drops a call whose lease ran out without a renewal (fail closed)", async () => {
    const r = rig();
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "delivery" });
    await session.place();
    r.setServer({ state: "accepted" });
    await jest.advanceTimersByTimeAsync(2_000);
    r.peers[0]!.emit("connectionstatechange", { state: "connected" });
    // The network goes: every request now fails without an answer.
    const offline = () => Promise.reject(new Error("Network request failed"));
    r.api.orderCallAction.mockImplementation(offline);
    r.api.getCallSignals.mockImplementation(offline);
    await jest.advanceTimersByTimeAsync(92_000);
    expect(session.snapshot).toMatchObject({ phase: "ended", endReason: "network_lost" });
    expect(r.peers[0]!.closed).toBe(true);
    expect(r.track.stop).toHaveBeenCalled();
  });

  it("ends an answered call whose audio never connects", async () => {
    const r = rig();
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "delivery" });
    await session.place();
    r.setServer({ state: "accepted" });
    await jest.advanceTimersByTimeAsync(2_000);
    await jest.advanceTimersByTimeAsync(CALL_CONNECT_TIMEOUT_MS);
    expect(session.snapshot.endReason).toBe("failed");
  });

  it("mutes the microphone track and routes the voice to the speaker", async () => {
    const r = rig();
    const session = new CallSession(r.deps, { direction: "outgoing", orderId: "ord_1", pair: "delivery" });
    await session.place();
    session.setMuted(true);
    expect(r.track.enabled).toBe(false);
    expect(session.snapshot.muted).toBe(true);
    session.setSpeaker(true);
    expect(r.audio.routeCallAudio).toHaveBeenLastCalledWith(true);
  });
});

describe("a call ringing in from the shop", () => {
  const incoming = () =>
    makeCall({
      pair: "pickup",
      mine: false,
      caller: { firstName: "Mika", role: "supplier" },
      callee: { firstName: "Sam", role: "rider" },
    });

  it("rings, answers with an answer to the shop's offer, and stops ringing", async () => {
    const r = rig();
    r.setServer(incoming());
    const session = new CallSession(r.deps, { direction: "incoming", call: incoming() });
    session.ring();
    expect(r.audio.startRinging).toHaveBeenCalled();
    expect(session.snapshot.phase).toBe("incoming");

    r.signals.push({ id: 7, kind: "offer", sdp: "v=0\r\noffer\r\n" });
    await session.answer();
    expect(r.stopRing).toHaveBeenCalled();
    expect(r.api.orderCallAction).toHaveBeenCalledWith("ord_1", expect.any(String), "accept");
    await jest.advanceTimersByTimeAsync(0);
    expect(r.peers[0]!.remote).toEqual({ type: "offer", sdp: "v=0\r\noffer\r\n" });
    expect(r.api.sendCallSignal).toHaveBeenCalledWith(
      "ord_1",
      expect.any(String),
      expect.objectContaining({ kind: "answer", clientId: expect.stringMatching(/^answer_/) }),
    );
    expect(session.snapshot.phase).toBe("connecting");
  });

  it("keeps the shop's offer when a poll lands before the audio is set up", async () => {
    const r = rig();
    r.setServer(incoming());
    r.signals.push({ id: 21, kind: "offer", sdp: "v=0\r\noffer\r\n" });
    let releaseIce: () => void = () => undefined;
    r.api.getCallIceServers.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseIce = () => resolve({ iceServers: [], relayAvailable: false });
      }),
    );
    const session = new CallSession(r.deps, { direction: "incoming", call: incoming() });
    session.ring();
    const answering = session.answer();
    await jest.advanceTimersByTimeAsync(0);
    // The stream nudges a poll while the ICE servers are still on their way.
    session.refresh();
    await jest.advanceTimersByTimeAsync(2_000);
    expect(r.api.getCallSignals).not.toHaveBeenCalled();
    releaseIce();
    await answering;
    await jest.advanceTimersByTimeAsync(0);
    expect(r.peers[0]!.remote).toEqual({ type: "offer", sdp: "v=0\r\noffer\r\n" });
  });

  it("declines, telling the API", async () => {
    const r = rig();
    r.setServer(incoming());
    const session = new CallSession(r.deps, { direction: "incoming", call: incoming() });
    session.ring();
    await session.decline();
    expect(r.api.orderCallAction).toHaveBeenCalledWith("ord_1", expect.any(String), "decline");
    expect(r.stopRing).toHaveBeenCalled();
    expect(session.snapshot.endReason).toBe("declined_by_you");
  });

  it("becomes a missed call when the shop gives up, and stops the ring on time anyway", async () => {
    const r = rig();
    r.setServer(incoming());
    const session = new CallSession(r.deps, { direction: "incoming", call: incoming() });
    session.ring();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(r.stopRing).toHaveBeenCalled();
    r.setServer({ state: "missed" });
    await jest.advanceTimersByTimeAsync(2_000);
    expect(session.snapshot.endReason).toBe("missed");
  });

  it("reads a lost race on Answer as the call it became", async () => {
    const r = rig();
    r.setServer(incoming());
    const session = new CallSession(r.deps, { direction: "incoming", call: incoming() });
    session.ring();
    r.api.orderCallAction.mockRejectedValueOnce(refusal("invalid_call_transition"));
    r.setServer({ state: "cancelled" });
    await session.answer();
    expect(session.snapshot.endReason).toBe("missed");
    expect(r.track.stop).toHaveBeenCalled();
  });
});
