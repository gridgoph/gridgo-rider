import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronDown, Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";

import { CallAvatar } from "@/components/CallAvatar";
import { CallControl } from "@/components/CallControl";
import { CallTimer } from "@/components/CallTimer";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { APP_UPDATE_SOURCE } from "@/lib/appUpdate";
import { deliveryChatOf, deliveryChatRoute } from "@/lib/deliveryChat";
import { getMicPermission, requestMicPermission, type MicPermission } from "@/lib/micPermission";
import {
  callWindow,
  counterpartOf,
  counterpartPhrase,
  endReasonCopy,
  partyOfPair,
  phaseLabel,
  ringingIncoming,
  roleWord,
  type CallEndReason,
  type CallPair,
  type CallRole,
} from "@/lib/orderCalls";
import { pickupChatOf, pickupChatRoute } from "@/lib/pickupChat";
import { webRTCAvailable } from "@/lib/webrtc";
import { useActiveTrip } from "@/store/activeTrip";
import { callInProgress, useCall } from "@/store/call";

/**
 * What the screen shows before there is a call to show: checking a push,
 * explaining the microphone, a microphone the phone refuses, or a binary
 * with no calling in it.
 */
type Gate = "none" | "checking" | "permission" | "blocked" | "unsupported";

/** Words the brief fixed for a build without WebRTC (Expo Go, an older APK). */
export const UNSUPPORTED_TITLE = "Calls need the latest GRIDGO app from the download page";

/** Ends that can be tried again from here. */
const RETRYABLE: readonly CallEndReason[] = ["declined", "no_answer", "missed", "declined_by_you", "network_lost", "failed", "busy"];

/** How long a plainly finished call lingers before the screen gets out of the way. */
const AUTO_CLOSE_MS = 2_000;

/** Runtime first, then the microphone: what stands between a tap and a call. */
async function outgoingGate(): Promise<Gate> {
  if (!webRTCAvailable()) return "unsupported";
  const permission = await getMicPermission();
  return permission === "granted" ? "none" : permission === "blocked" ? "blocked" : "permission";
}

function pairParam(value: unknown): CallPair | null {
  return value === "delivery" || value === "pickup" ? value : null;
}

function roleOfPair(pair: CallPair): CallRole {
  return pair === "pickup" ? "supplier" : "client";
}

/**
 * The call, full screen.
 *
 * Opened three ways: from a Call button on the trip (`?orderId&pair`), by the
 * watcher when a call rings in with the app open, and from an
 * `order_call_incoming` push (`?orderId&incoming=1`), which reads the order's
 * calls and rings only if the call is still ringing.
 *
 * Who is on the line is never in doubt: their role in words and as a glyph,
 * their first name large, and never a phone number — there is none.
 *
 * Leaving the screen does not end the call. Close takes the rider back to the
 * trip with the call still going, and `OngoingCallBar` leads back here.
 */
export default function CallScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ orderId?: string; pair?: string; incoming?: string }>();
  const snapshot = useCall((s) => s.snapshot);
  const trip = useActiveTrip((s) => s.order);

  const intentOrder = typeof params.orderId === "string" ? params.orderId : null;
  const intentPair = pairParam(params.pair);
  const incomingIntent = params.incoming === "1";

  const [gate, setGate] = useState<Gate>(() => {
    if (callInProgress(useCall.getState().snapshot)) return "none";
    if (incomingIntent) return "checking";
    return intentOrder && intentPair ? "checking" : "none";
  });
  const [incomingMic, setIncomingMic] = useState<MicPermission | null>(null);
  const [outgoing, setOutgoing] = useState<{ orderId: string; pair: CallPair } | null>(
    intentOrder && intentPair && !incomingIntent ? { orderId: intentOrder, pair: intentPair } : null,
  );

  const leave = useCallback(() => {
    if (!callInProgress(useCall.getState().snapshot)) useCall.getState().clear();
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/active");
  }, [router]);

  /** Show what an outgoing call needs next, and place it when nothing is missing. */
  const enter = useCallback((orderId: string, pair: CallPair, next: Gate) => {
    setOutgoing({ orderId, pair });
    setGate(next);
    if (next === "none") useCall.getState().place(orderId, pair);
  }, []);

  // Arrival: an outgoing intent places the call; a push checks it still rings.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (callInProgress(useCall.getState().snapshot)) return;
    useCall.getState().clear();
    if (incomingIntent && intentOrder) {
      void (async () => {
        try {
          const ringing = ringingIncoming(await api.listOrderCalls(intentOrder), Date.now());
          if (ringing) useCall.getState().receive(ringing);
        } catch {
          // Treated as no longer ringing: the trip shows what happened.
        }
        const current = useCall.getState().snapshot;
        if (current && current.direction === "incoming" && callInProgress(current)) setGate("none");
        else router.replace("/(tabs)/active");
      })();
      return;
    }
    if (intentOrder && intentPair) void outgoingGate().then((next) => enter(intentOrder, intentPair, next));
  }, [enter, incomingIntent, intentOrder, intentPair, router]);

  // The microphone for an incoming call is read, not asked, until Answer.
  useEffect(() => {
    if (snapshot?.direction === "incoming" && snapshot.phase === "incoming" && incomingMic === null) {
      void getMicPermission().then(setIncomingMic);
    }
  }, [incomingMic, snapshot?.direction, snapshot?.phase]);

  // A call that simply finished gets out of the way on its own.
  useEffect(() => {
    if (snapshot?.phase !== "ended") return;
    if (snapshot.endReason !== "ended" && snapshot.endReason !== "cancelled") return;
    const handle = setTimeout(leave, AUTO_CLOSE_MS);
    return () => clearTimeout(handle);
  }, [leave, snapshot?.endReason, snapshot?.phase]);

  // Tell the watcher and the bar this screen is up; put a finished call away when it goes.
  useEffect(() => {
    useCall.getState().setScreenOpen(true);
    return () => {
      useCall.getState().setScreenOpen(false);
      useCall.getState().clear();
    };
  }, []);

  async function allowAndCall() {
    if (!outgoing) return;
    const permission = await requestMicPermission();
    if (permission === "granted") {
      setGate("none");
      useCall.getState().place(outgoing.orderId, outgoing.pair);
    } else {
      setGate("blocked");
    }
  }

  async function answer() {
    let permission = await getMicPermission();
    if (permission === "undetermined") permission = await requestMicPermission();
    setIncomingMic(permission);
    if (permission === "granted") await useCall.getState().answer();
  }

  function callAgain(orderId: string, pair: CallPair) {
    useCall.getState().clear();
    void outgoingGate().then((next) => enter(orderId, pair, next));
  }

  // -------------------------------------------------------------------------
  // Who, and what the screen says about them.

  const pair = snapshot?.pair ?? outgoing?.pair ?? intentPair ?? "delivery";
  const orderId = snapshot?.orderId ?? outgoing?.orderId ?? intentOrder;
  const person = snapshot?.call ? counterpartOf(snapshot.call) : null;
  const role = person?.role ?? roleOfPair(pair);
  const roleLabel = roleWord(role);
  const name = person?.firstName ?? roleLabel;
  const party = partyOfPair(pair);
  const jobTrip = trip && trip.id === orderId ? trip : null;
  const windowOpen = callWindow(jobTrip, party).open;
  const chat = party === "shop" ? pickupChatOf(jobTrip) : deliveryChatOf(jobTrip);
  const messageRoute = orderId && chat?.status === "open"
    ? (party === "shop" ? pickupChatRoute(orderId) : deliveryChatRoute(orderId))
    : null;
  const messageLabel = party === "shop" ? "Message the shop" : "Message the client";

  const phase = gate === "none" ? snapshot?.phase ?? null : null;
  const ringing = phase === "incoming" || phase === "ringing" || phase === "calling";
  const live = Boolean(phase && phase !== "ended");
  const ended = phase === "ended" && snapshot?.endReason ? endReasonCopy(snapshot.endReason, person) : null;

  const status =
    gate === "checking"
      ? "Checking the call…"
      : gate === "permission" || gate === "blocked"
        ? `Call the ${roleLabel.toLowerCase()}`
        : gate === "unsupported"
          ? "Calls are not in this version"
          : phase
            ? phase === "incoming"
              ? `${roleLabel} calling`
              : phaseLabel(phase)
            : "";

  const message = messageRoute ? (
    <SecondaryButton label={messageLabel} size="large" onPress={() => router.replace(messageRoute as Href)} />
  ) : null;

  return (
    <Screen>
      <View className="flex-1 px-4 pb-4">
        <View className="min-h-12 flex-row items-center">
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel={live ? "Close the call screen" : "Close"}
            accessibilityHint={live ? "The call keeps going. Return to it from the bar at the top." : undefined}
            className="gg-touch flex-row items-center gap-1 rounded-pill pr-3"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <ChevronDown size={26} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body font-medium text-text-primary">{live ? "Hide" : "Close"}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="flex-grow items-center justify-center gap-2 py-4">
          <CallAvatar role={role} ringing={ringing} />
          <View
            className="items-center gap-1"
            accessible
            accessibilityRole="header"
            accessibilityLabel={person ? counterpartPhrase(person) : `The ${roleLabel.toLowerCase()}`}
          >
            {/* Until the API names them (or when it could only name the role), the role is the name. */}
            {name !== roleLabel ? (
              <Text className="text-body-lg font-medium text-text-secondary">{roleLabel}</Text>
            ) : null}
            <Text className="text-center text-display text-text-primary" numberOfLines={2}>
              {name}
            </Text>
          </View>

          <View className="min-h-8 items-center" accessibilityLiveRegion="polite">
            {phase === "connected" && snapshot?.connectedAtMs ? (
              <CallTimer since={snapshot.connectedAtMs} className="text-h3 text-text-primary" />
            ) : ended ? (
              <Text className="text-h3 text-text-primary" accessibilityRole="text">
                {ended.title}
              </Text>
            ) : (
              <Text className="text-h3 text-text-secondary">{status}</Text>
            )}
          </View>

          {jobTrip ? (
            <Text className="text-center text-body text-text-muted" numberOfLines={2}>
              {jobTrip.title}
            </Text>
          ) : null}

          <Text className="mt-2 text-center text-caption text-text-muted">
            Over mobile data or Wi-Fi. No phone numbers are shared.
          </Text>
        </ScrollView>

        {phase === "reconnecting" ? (
          <View className="mb-4">
            <InlineNotice
              tone="warning"
              icon="triangle-alert"
              title="Weak connection"
              body="Hold on — GRIDGO is trying to reconnect the call."
            />
          </View>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {gate === "permission" ? (
          <View className="gap-3">
            <View className="gg-card gap-1">
              <Text className="text-body-lg font-bold text-text-primary">Calls use your microphone</Text>
              <Text className="text-body text-text-secondary">
                {`So the ${roleLabel.toLowerCase()} can hear you. Your phone will ask once. GRIDGO only listens while you are on a call, and nothing is recorded.`}
              </Text>
            </View>
            <PrimaryButton label="Allow microphone and call" size="large" onPress={() => void allowAndCall()} />
            <SecondaryButton label="Cancel" size="large" onPress={leave} />
          </View>
        ) : null}

        {gate === "blocked" ? (
          <View className="gap-3">
            <InlineNotice
              tone="error"
              icon="circle-x"
              title="Microphone is off for GRIDGO"
              body="Calls need the microphone. Allow it in your phone's settings, then come back and call again."
            />
            <PrimaryButton label="Open phone settings" size="large" onPress={() => void Linking.openSettings()} />
            {message}
            <SecondaryButton label="Cancel" size="large" onPress={leave} />
          </View>
        ) : null}

        {gate === "unsupported" ? (
          <View className="gap-3">
            <InlineNotice
              tone="info"
              icon="info"
              title={UNSUPPORTED_TITLE}
              body={`This version of GRIDGO cannot make calls. Install the latest app from ${APP_UPDATE_SOURCE.downloadPage}. Messages still work here.`}
            />
            <PrimaryButton
              label="Open the download page"
              size="large"
              onPress={() => void Linking.openURL(`https://${APP_UPDATE_SOURCE.downloadPage}`).catch(() => undefined)}
            />
            {message}
            <SecondaryButton label="Cancel" size="large" onPress={leave} />
          </View>
        ) : null}

        {phase === "incoming" ? (
          <View className="gap-4">
            {!webRTCAvailable() ? (
              <InlineNotice
                tone="info"
                icon="info"
                title={UNSUPPORTED_TITLE}
                body="This version cannot answer. Decline, then send a message instead."
              />
            ) : incomingMic === "blocked" ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="Microphone is off for GRIDGO"
                body="Allow it in your phone's settings to answer calls."
                actionLabel="Open phone settings"
                onAction={() => void Linking.openSettings()}
              />
            ) : incomingMic === "undetermined" ? (
              <Text className="text-center text-body text-text-secondary">
                Your phone will ask to use the microphone when you answer.
              </Text>
            ) : null}
            <View className="flex-row justify-center gap-10">
              <CallControl
                label="Decline"
                icon={PhoneOff}
                tone="end"
                accessibilityLabel={`Decline the call from ${person ? counterpartPhrase(person) : "the " + roleLabel.toLowerCase()}`}
                onPress={() => void useCall.getState().decline()}
              />
              {webRTCAvailable() && incomingMic !== "blocked" ? (
                <CallControl
                  label="Answer"
                  icon={Phone}
                  tone="answer"
                  accessibilityLabel={`Answer the call from ${person ? counterpartPhrase(person) : "the " + roleLabel.toLowerCase()}`}
                  onPress={() => void answer()}
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {live && phase !== "incoming" ? (
          <View className="items-center gap-6">
            <View className="flex-row justify-center gap-6">
              <CallControl
                label="Mute"
                icon={snapshot?.muted ? MicOff : Mic}
                on={Boolean(snapshot?.muted)}
                onPress={() => useCall.getState().setMuted(!snapshot?.muted)}
              />
              <CallControl
                label="Speaker"
                icon={Volume2}
                on={Boolean(snapshot?.speaker)}
                onPress={() => useCall.getState().setSpeaker(!snapshot?.speaker)}
              />
            </View>
            <CallControl
              label="End call"
              icon={PhoneOff}
              tone="end"
              accessibilityLabel={`End the call with ${person ? counterpartPhrase(person) : "the " + roleLabel.toLowerCase()}`}
              onPress={() => void useCall.getState().hangUp()}
            />
          </View>
        ) : null}

        {ended && snapshot ? (
          <View className="gap-3">
            <Text className="text-center text-body-lg text-text-secondary">{ended.body}</Text>
            {snapshot.endReason === "mic_blocked" ? (
              <PrimaryButton label="Open phone settings" size="large" onPress={() => void Linking.openSettings()} />
            ) : snapshot.endReason && RETRYABLE.includes(snapshot.endReason) && windowOpen ? (
              <PrimaryButton
                label={snapshot.direction === "incoming" ? "Call back" : "Call again"}
                size="large"
                onPress={() => callAgain(snapshot.orderId, snapshot.pair)}
              />
            ) : null}
            {message}
            <SecondaryButton label="Close" size="large" onPress={leave} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
