/**
 * The browser's own WebRTC, for the web build (see `lib/webrtc.ts`).
 *
 * Web is where calls can be exercised without a phone, so it uses the real
 * thing: the browser's peer connection, its microphone prompt, and an audio
 * element for the other person's voice.
 */

import type { CallIceServer } from "@/lib/api";
import type { RtcPeer, RtcStream, WebRTCApi } from "@/lib/webrtc";

export type { RtcCandidate, RtcDescription, RtcPeer, RtcStream, RtcTrack, WebRTCApi } from "@/lib/webrtc";

type BrowserGlobals = {
  RTCPeerConnection?: new (config: { iceServers: CallIceServer[] }) => RtcPeer;
  navigator?: { mediaDevices?: { getUserMedia?: (c: { audio: boolean; video: boolean }) => Promise<RtcStream> } };
  document?: {
    createElement: (tag: "audio") => { srcObject: unknown; autoplay: boolean; play: () => Promise<void>; remove: () => void };
    body: { appendChild: (node: unknown) => void };
  };
};

function browser(): BrowserGlobals {
  return globalThis as unknown as BrowserGlobals;
}

export function webRTCAvailable(): boolean {
  const g = browser();
  return Boolean(g.RTCPeerConnection && g.navigator?.mediaDevices?.getUserMedia);
}

export function loadWebRTC(): WebRTCApi | null {
  if (!webRTCAvailable()) return null;
  const g = browser();
  const Peer = g.RTCPeerConnection!;
  return {
    createPeer: (iceServers) => new Peer({ iceServers }),
    getAudioStream: () => g.navigator!.mediaDevices!.getUserMedia!({ audio: true, video: false }),
    attachRemoteAudio: (stream) => {
      if (!g.document) return () => {};
      const element = g.document.createElement("audio");
      element.autoplay = true;
      element.srcObject = stream;
      g.document.body.appendChild(element);
      void element.play().catch(() => undefined);
      return () => {
        element.srcObject = null;
        element.remove();
      };
    },
  };
}
