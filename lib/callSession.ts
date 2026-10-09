/**
 * One voice call, from the first tap to the last packet.
 *
 * The contract (gridgo-api `docs/CALLS_API.md`) splits the work: the API owns
 * who may call, the call's state and the signalling mailbox; the phones own
 * the audio. This class is the phone's half, with every outside thing — the
 * API, WebRTC, the ring — passed in, so the whole lifecycle runs under test
 * with fakes (`lib/__tests__/callSession.test.ts`).
 *
 * The rules it keeps, all from the contract:
 *
 * - **Signals go out over HTTP and come back by polling** every two seconds
 *   while the call is live, nudged sooner by the stream (`refresh`). The
 *   stream is a hint, never the source.
 * - **One offer, one answer.** The caller offers after the call exists; the
 *   callee answers only after accepting. Remote ICE waits until the remote
 *   description is set.
 * - **Fail closed.** On any terminal state, a refused heartbeat, a lease that
 *   ran out without a renewal, or a refusal of the window, the microphone is
 *   released and the peer connection closed. The server cannot cut a direct
 *   media path; only this can.
 * - **No identity in the media.** Audio only, no camera, no data channel, and
 *   nothing about the rider goes into a signal. A ringing call's network
 *   candidates wait until it is answered, so someone who never picks up never
 *   learns this phone's addresses.
 */

import type * as api from "@/lib/api";
import {
  CALL_HEARTBEAT_MS,
  CALL_POLL_MS,
  endReasonOf,
  endReasonOfError,
  isLiveCall,
  type CallDirection,
  type CallEndReason,
  type CallPair,
  type CallPhase,
  type OrderCall,
} from "@/lib/orderCalls";
import type { RtcCandidate, RtcPeer, RtcStream, WebRTCApi } from "@/lib/webrtc";

/** The lease the API keeps for an answered call. Renewal stops counting after this. */
export const CALL_LEASE_MS = 90_000;
/** An answered call whose audio has not connected by now will not. */
export const CALL_CONNECT_TIMEOUT_MS = 30_000;

export type CallApi = Pick<
  typeof api,
  | "startOrderCall"
  | "getOrderCall"
  | "orderCallAction"
  | "sendCallSignal"
  | "getCallSignals"
  | "getCallIceServers"
  | "apiErrorCode"
>;

export type CallAudio = {
  startRinging: () => () => void;
  routeCallAudio: (speaker: boolean) => Promise<void>;
  releaseCallAudio: () => Promise<void>;
};

export type CallSessionDeps = {
  api: CallApi;
  webrtc: WebRTCApi | null;
  audio: CallAudio;
  now?: () => number;
};

export type CallSnapshot = {
  orderId: string;
  pair: CallPair;
  direction: CallDirection;
  /** Null until the API has created the call. */
  call: OrderCall | null;
  phase: CallPhase;
  endReason: CallEndReason | null;
  /** When the audio first connected, for the timer. */
  connectedAtMs: number | null;
  endedAtMs: number | null;
  muted: boolean;
  speaker: boolean;
  /** Whether the API offered a TURN relay. Null before it was asked. */
  relayAvailable: boolean | null;
};

type Init =
  | { direction: "outgoing"; orderId: string; pair: CallPair }
  | { direction: "incoming"; call: OrderCall };

/** Release the microphone. */
function stopStream(stream: RtcStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Already stopped.
    }
  }
}

function randomTag(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class CallSession {
  private state: CallSnapshot;
  private readonly deps: Required<CallSessionDeps>;
  private readonly listeners = new Set<(snapshot: CallSnapshot) => void>();

  private peer: RtcPeer | null = null;
  private stream: RtcStream | null = null;
  private detachRemote: (() => void) | null = null;
  private stopRing: (() => void) | null = null;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private pollAgain = false;

  private cursor = 0;
  private remoteSet = false;
  private pendingRemoteIce: RtcCandidate[] = [];
  private answered = false;
  private outbox: Promise<void> = Promise.resolve();
  /** Outgoing candidates kept back until the call is answered. */
  private heldIce: api.CallSignalBody[] = [];
  private signalCount = 0;
  private readonly tag = randomTag();
  private lastRenewedMs = 0;
  private finished = false;
  private abandoned = false;

  constructor(deps: CallSessionDeps, init: Init) {
    this.deps = { now: Date.now, ...deps };
    this.state =
      init.direction === "outgoing"
        ? {
            orderId: init.orderId,
            pair: init.pair,
            direction: "outgoing",
            call: null,
            phase: "calling",
            endReason: null,
            connectedAtMs: null,
            endedAtMs: null,
            muted: false,
            speaker: false,
            relayAvailable: null,
          }
        : {
            orderId: init.call.orderId,
            pair: init.call.pair,
            direction: "incoming",
            call: init.call,
            phase: "incoming",
            endReason: null,
            connectedAtMs: null,
            endedAtMs: null,
            muted: false,
            speaker: false,
            relayAvailable: null,
          };
  }

  get snapshot(): CallSnapshot {
    return this.state;
  }

  subscribe(listener: (snapshot: CallSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(patch: Partial<CallSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  // -------------------------------------------------------------------------
  // Ringing in

  /** Ring for an incoming call until it is answered, declined or expires. */
  ring(): void {
    if (this.finished || this.state.direction !== "incoming" || !this.state.call) return;
    this.stopRing = this.deps.audio.startRinging();
    const left = Date.parse(this.state.call.ringExpiresAt) - this.deps.now();
    // The server decides; this only stops the noise on time if the poll is late.
    this.ringTimer = setTimeout(() => this.silence(), Math.max(0, left));
    this.startPolling();
  }

  private silence(): void {
    this.stopRing?.();
    this.stopRing = null;
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ringTimer = null;
  }

  // -------------------------------------------------------------------------
  // Placing a call

  /** Call out. The microphone must already be allowed (the screen asks first). */
  async place(): Promise<void> {
    if (this.finished || this.state.direction !== "outgoing" || this.state.call) return;
    const { webrtc, api } = this.deps;
    if (!webrtc) return this.finish("unsupported");
    this.update({ phase: "calling" });
    let stream: RtcStream;
    try {
      // The microphone before the other phone rings: a refusal must not leave
      // someone answering a call that can never carry a voice.
      stream = await webrtc.getAudioStream();
    } catch {
      return this.finish("mic_blocked");
    }
    if (this.finished || this.abandoned) {
      stopStream(stream);
      return this.finish("cancelled");
    }
    this.stream = stream;

    let call: OrderCall;
    try {
      call = await api.startOrderCall(this.state.orderId, this.state.pair);
    } catch (error) {
      return this.finish(endReasonOfError(api.apiErrorCode(error)) ?? "failed");
    }
    this.update({ call, phase: call.state === "ringing" ? "ringing" : this.state.phase });
    if (this.abandoned) {
      await this.post("cancel");
      return this.finish("cancelled");
    }
    this.startPolling();

    try {
      const peer = await this.openPeer();
      if (!peer) return;
      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      if (this.finished) return;
      await peer.setLocalDescription({ type: "offer", sdp: offer.sdp ?? "" });
      this.queueSignal({ clientId: `offer_${this.tag}`, kind: "offer", sdp: offer.sdp ?? "" });
    } catch (error) {
      if (this.finished) return;
      const reason = endReasonOfError(api.apiErrorCode(error));
      await this.post("cancel");
      this.finish(reason ?? "failed");
    }
  }

  // -------------------------------------------------------------------------
  // Answering

  /** Pick up. The microphone must already be allowed. */
  async answer(): Promise<void> {
    const call = this.state.call;
    if (this.finished || this.answered || this.state.direction !== "incoming" || !call) return;
    const { webrtc, api } = this.deps;
    this.answered = true;
    this.silence();
    if (!webrtc) {
      await this.post("decline");
      return this.finish("unsupported");
    }
    this.update({ phase: "answering" });
    let stream: RtcStream;
    try {
      stream = await webrtc.getAudioStream();
    } catch {
      return this.finish("mic_blocked", { decline: true });
    }
    if (this.finished) return stopStream(stream);
    this.stream = stream;
    try {
      const accepted = await api.orderCallAction(call.orderId, call.id, "accept");
      this.update({ call: accepted });
    } catch (error) {
      // Lost the race: it was cancelled, timed out, or the window closed.
      await this.settleFromServer(error);
      if (!this.finished) this.finish("failed");
      return;
    }
    this.onAccepted();
    try {
      await this.openPeer();
    } catch {
      if (!this.finished) await this.hangUp("failed");
      return;
    }
    // The offer is already waiting on the server; fetch it now rather than at the next tick.
    void this.poll();
  }

  /** Turn the call down. The caller hears it was declined. */
  async decline(): Promise<void> {
    if (this.finished || this.state.direction !== "incoming" || this.answered) return;
    this.silence();
    await this.post("decline");
    this.finish("declined_by_you");
  }

  // -------------------------------------------------------------------------
  // During the call

  setMuted(muted: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
    this.update({ muted });
  }

  setSpeaker(speaker: boolean): void {
    this.update({ speaker });
    void this.deps.audio.routeCallAudio(speaker);
  }

  /**
   * End, whatever the stage: cancel a call still ringing out, decline one
   * ringing in, end one that was answered. Ends locally even if the API cannot
   * be reached — the ring deadline and the lease close it there.
   */
  async hangUp(reason?: CallEndReason): Promise<void> {
    if (this.finished) return;
    const { call, direction } = this.state;
    if (!call) {
      // Still creating the call: `place` cancels it as soon as it exists.
      this.abandoned = true;
      if (direction === "outgoing" && this.state.phase === "calling" && !this.stream) return this.finish("cancelled");
      return;
    }
    if (call.state === "ringing" && direction === "incoming" && !this.answered) return this.decline();
    if (call.state === "ringing" && direction === "outgoing") {
      await this.post("cancel");
      return this.finish(reason ?? "cancelled");
    }
    await this.post("end");
    this.finish(reason ?? "ended");
  }

  /** Something changed on the server (the stream said so): look now. */
  refresh(): void {
    if (this.finished) return;
    void this.poll();
  }

  /** Drop everything without a word to the API — the account changed under the call. */
  dispose(): void {
    this.finish(this.state.endReason ?? "ended");
  }

  // -------------------------------------------------------------------------
  // Internals

  private onAccepted(): void {
    if (this.heartbeatTimer || this.finished) return;
    this.lastRenewedMs = this.deps.now();
    this.update({ phase: this.state.connectedAtMs ? this.state.phase : "connecting" });
    void this.deps.audio.routeCallAudio(this.state.speaker);
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), CALL_HEARTBEAT_MS);
    const held = this.heldIce;
    this.heldIce = [];
    for (const signal of held) this.queueSignal(signal);
    this.connectTimer = setTimeout(() => {
      if (!this.state.connectedAtMs && !this.finished) void this.hangUp("failed");
    }, CALL_CONNECT_TIMEOUT_MS);
  }

  private async heartbeat(): Promise<void> {
    const call = this.state.call;
    if (!call || this.finished) return;
    try {
      const renewed = await this.deps.api.orderCallAction(call.orderId, call.id, "heartbeat");
      this.lastRenewedMs = this.deps.now();
      this.adopt(renewed);
    } catch (error) {
      if (this.deps.api.apiErrorCode(error)) await this.settleFromServer(error);
    }
  }

  private async openPeer(): Promise<RtcPeer | null> {
    const call = this.state.call;
    const { webrtc, api } = this.deps;
    if (!call || !webrtc || !this.stream || this.finished) return null;
    // Fresh credentials for every call; a TURN password is never reused.
    const ice = await api.getCallIceServers(call.orderId, call.id);
    if (this.finished) return null;
    this.update({ relayAvailable: ice.relayAvailable });
    const peer = webrtc.createPeer(ice.iceServers);
    this.peer = peer;
    for (const track of this.stream.getTracks()) peer.addTrack(track, this.stream);
    this.setMuted(this.state.muted);

    peer.addEventListener("icecandidate", (event: { candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null }) => {
      if (this.finished) return;
      const candidate = event.candidate;
      const signal: api.CallSignalBody = {
        clientId: `ice_${this.tag}_${++this.signalCount}`,
        kind: "ice",
        candidate: candidate?.candidate ?? "",
        sdpMid: candidate ? (candidate.sdpMid ?? null) : null,
        sdpMLineIndex: candidate ? (candidate.sdpMLineIndex ?? null) : null,
      };
      // A candidate carries this phone's network address. Until the other
      // person picks up, they have not agreed to a call, so it waits here.
      if (this.state.call?.state !== "accepted") this.heldIce.push(signal);
      else this.queueSignal(signal);
    });
    peer.addEventListener("track", (event: { streams?: unknown[] }) => {
      const stream = event.streams?.[0];
      if (stream && !this.detachRemote) this.detachRemote = this.deps.webrtc?.attachRemoteAudio(stream) ?? null;
    });
    const onState = () => this.onConnectionState(peer.connectionState ?? peer.iceConnectionState ?? "");
    peer.addEventListener("connectionstatechange", onState);
    peer.addEventListener("iceconnectionstatechange", onState);
    return peer;
  }

  private onConnectionState(state: string): void {
    if (this.finished) return;
    if (state === "connected" || state === "completed") {
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.connectTimer = null;
      this.update({ phase: "connected", connectedAtMs: this.state.connectedAtMs ?? this.deps.now() });
    } else if (state === "disconnected" && this.state.connectedAtMs) {
      this.update({ phase: "reconnecting" });
    } else if (state === "failed") {
      // One negotiation per call: a failed path is a dropped call, not a retry.
      void this.hangUp(this.state.connectedAtMs ? "network_lost" : "failed");
    }
  }

  /** Signals leave in the order they were made, the offer before its candidates. */
  private queueSignal(signal: api.CallSignalBody): void {
    const call = this.state.call;
    if (!call) return;
    this.outbox = this.outbox.then(async () => {
      if (this.finished) return;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await this.deps.api.sendCallSignal(call.orderId, call.id, signal);
          return;
        } catch (error) {
          const code = this.deps.api.apiErrorCode(error);
          // Same clientId and payload is safe to resend; a refusal is not worth repeating.
          if (code) {
            if (code !== "call_signal_out_of_order" && code !== "invalid_call_signal") await this.settleFromServer(error);
            return;
          }
        }
      }
    });
  }

  private startPolling(): void {
    if (this.pollTimer || this.finished) return;
    this.pollTimer = setInterval(() => void this.poll(), CALL_POLL_MS);
  }

  private async poll(): Promise<void> {
    const call = this.state.call;
    if (!call || this.finished) return;
    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    this.polling = true;
    try {
      this.checkLease();
      if (this.finished) return;
      // Signals are read only into a peer that can take them: one fetched
      // before the peer exists would move the cursor past the offer for good.
      if (!this.peer) {
        this.adopt(await this.deps.api.getOrderCall(call.orderId, call.id));
        return;
      }
      const result = await this.deps.api.getCallSignals(call.orderId, call.id, this.cursor);
      if (this.finished) return;
      this.cursor = Math.max(this.cursor, result.cursor);
      for (const signal of result.signals) await this.apply(signal);
      this.adopt(result.call);
    } catch (error) {
      if (this.deps.api.apiErrorCode(error)) await this.settleFromServer(error);
      // A dropped connection is retried at the next tick; the lease decides when to give up.
    } finally {
      this.polling = false;
      if (this.pollAgain && !this.finished) {
        this.pollAgain = false;
        void this.poll();
      }
    }
  }

  private checkLease(): void {
    if (!this.heartbeatTimer || this.finished) return;
    if (this.deps.now() - this.lastRenewedMs > CALL_LEASE_MS) this.finish("network_lost");
  }

  private async apply(signal: api.CallSignal): Promise<void> {
    const peer = this.peer;
    if (!peer || this.finished) return;
    try {
      if (signal.kind === "ice") {
        if (!signal.candidate) return;
        const candidate = { candidate: signal.candidate, sdpMid: signal.sdpMid, sdpMLineIndex: signal.sdpMLineIndex };
        if (this.remoteSet) await peer.addIceCandidate(candidate);
        else this.pendingRemoteIce.push(candidate);
        return;
      }
      if (signal.kind === "offer" && this.state.direction === "incoming" && !this.remoteSet) {
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await this.flushRemoteIce();
        const answer = await peer.createAnswer();
        await peer.setLocalDescription({ type: "answer", sdp: answer.sdp ?? "" });
        this.queueSignal({ clientId: `answer_${this.tag}`, kind: "answer", sdp: answer.sdp ?? "" });
        return;
      }
      if (signal.kind === "answer" && this.state.direction === "outgoing" && !this.remoteSet) {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await this.flushRemoteIce();
      }
    } catch {
      // A candidate the stack rejects is skipped; a description it rejects ends the call.
      if (signal.kind !== "ice") await this.hangUp("failed");
    }
  }

  private async flushRemoteIce(): Promise<void> {
    this.remoteSet = true;
    const pending = this.pendingRemoteIce;
    this.pendingRemoteIce = [];
    for (const candidate of pending) {
      try {
        await this.peer?.addIceCandidate(candidate);
      } catch {
        // Skip it; others may still connect.
      }
    }
  }

  /** Take the server's word for where the call is. */
  private adopt(call: OrderCall): void {
    if (this.finished) return;
    const before = this.state.call?.state;
    this.update({ call });
    if (!isLiveCall(call)) {
      this.finish(this.state.connectedAtMs || before === "accepted" ? "ended" : endReasonOf(call));
      return;
    }
    if (call.state === "accepted" && before !== "accepted") this.onAccepted();
  }

  /** A request was refused: read the call's real state, or close on a refused window. */
  private async settleFromServer(error: unknown): Promise<void> {
    if (this.finished) return;
    const call = this.state.call;
    const reason = endReasonOfError(this.deps.api.apiErrorCode(error));
    if (call) {
      try {
        const current = await this.deps.api.getOrderCall(call.orderId, call.id);
        if (!isLiveCall(current)) return this.adopt(current);
        if (reason !== "not_available") return;
      } catch {
        // Fall through: the window itself is refused.
      }
    }
    this.finish(reason ?? "failed");
  }

  private async post(action: "cancel" | "decline" | "end"): Promise<void> {
    const call = this.state.call;
    if (!call) return;
    try {
      const after = await this.deps.api.orderCallAction(call.orderId, call.id, action);
      this.update({ call: after });
    } catch {
      // The ring deadline or the lease closes it on the server.
    }
  }

  private finish(reason: CallEndReason, options: { decline?: boolean } = {}): void {
    if (this.finished) return;
    if (options.decline) void this.post("decline");
    this.finished = true;
    this.silence();
    for (const timer of [this.pollTimer, this.heartbeatTimer]) if (timer) clearInterval(timer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.pollTimer = this.heartbeatTimer = this.connectTimer = null;
    try {
      this.peer?.close();
    } catch {
      // Already closed.
    }
    this.peer = null;
    if (this.stream) stopStream(this.stream);
    this.stream = null;
    this.detachRemote?.();
    this.detachRemote = null;
    void this.deps.audio.releaseCallAudio();
    this.update({ phase: "ended", endReason: reason, endedAtMs: this.deps.now() });
  }
}
