/**
 * WebRTC, loaded only where this binary actually has it.
 *
 * `react-native-webrtc` is native code. Expo Go does not carry it, and neither
 * does any APK built before calls were added. Requiring the package there does
 * not fail cleanly — it reaches for `NativeModules.WebRTCModule` and breaks on
 * first use — so the module is probed first and the package required only
 * once it is really there, the shape `lib/brandSound.ts` uses for audio.
 *
 * `null` means "this app cannot call": the call screen says so and points at
 * the download page, and everything else in the app keeps working.
 *
 * The types below are the slice of the WebRTC API the call session uses, so
 * the browser build (`webrtc.web.ts`) and tests can stand in for the native one.
 */

import { NativeModules } from "react-native";

import type { CallIceServer } from "@/lib/api";

export type RtcDescription = { type: "offer" | "answer"; sdp: string };
export type RtcCandidate = { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

export type RtcTrack = { enabled: boolean; stop: () => void };
export type RtcStream = { getTracks: () => RtcTrack[]; getAudioTracks: () => RtcTrack[] };

export type RtcPeer = {
  connectionState?: string;
  iceConnectionState?: string;
  createOffer: (options?: Record<string, unknown>) => Promise<{ type?: string | null; sdp?: string | null }>;
  createAnswer: () => Promise<{ type?: string | null; sdp?: string | null }>;
  setLocalDescription: (description: RtcDescription) => Promise<void>;
  setRemoteDescription: (description: RtcDescription) => Promise<void>;
  addIceCandidate: (candidate: RtcCandidate | null) => Promise<void>;
  addTrack: (track: RtcTrack, stream: RtcStream) => unknown;
  addEventListener: (type: string, listener: (event: never) => void) => void;
  close: () => void;
};

export type WebRTCApi = {
  createPeer: (iceServers: CallIceServer[]) => RtcPeer;
  /** The microphone, audio only. Never the camera. */
  getAudioStream: () => Promise<RtcStream>;
  /** Plays the other person. Native routes remote audio itself; a browser needs an element. */
  attachRemoteAudio: (stream: unknown) => () => void;
};

type NativeWebRTC = {
  RTCPeerConnection: new (config: { iceServers: CallIceServer[] }) => RtcPeer;
  mediaDevices: { getUserMedia: (constraints: { audio: boolean; video: boolean }) => Promise<RtcStream> };
};

/** Whether this binary carries the WebRTC native module. */
export function webRTCAvailable(): boolean {
  try {
    return Boolean((NativeModules as Record<string, unknown>).WebRTCModule);
  } catch {
    return false;
  }
}

export function loadWebRTC(): WebRTCApi | null {
  if (!webRTCAvailable()) return null;
  let native: NativeWebRTC;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    native = require("react-native-webrtc") as NativeWebRTC;
  } catch {
    return null;
  }
  return {
    createPeer: (iceServers) => new native.RTCPeerConnection({ iceServers }),
    getAudioStream: () => native.mediaDevices.getUserMedia({ audio: true, video: false }),
    attachRemoteAudio: () => () => {},
  };
}
