import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddressStop } from "@/components/AddressStop";
import { EmptyState } from "@/components/EmptyState";
import { LocationSharingBanner } from "@/components/LocationSharingBanner";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { TripTimeline } from "@/components/TripTimeline";
import { useLocationSharing } from "@/hooks/useLocationSharing";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  buildFailureNote,
  codAmountDueMinor,
  FAILURE_REASONS,
  type FailureReasonId,
  orderStateChip,
  primaryActionLabel,
  selectActiveTrip,
  tripPhase,
  zoneLabel,
} from "@/lib/riderOrder";
import { useSession } from "@/store/session";

type Panel = "main" | "pickup" | "delivery" | "cod" | "failure";

export default function ActiveScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useSession();
  const [trip, setTrip] = useState<api.Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  const [panel, setPanel] = useState<Panel>("main");

  // Proof fields — local UI only, never persisted.
  const [otp, setOtp] = useState("");
  const [photoName, setPhotoName] = useState("demo-proof.jpg");
  const [failureReason, setFailureReason] = useState<FailureReasonId>("unavailable");
  const [failureNote, setFailureNote] = useState("");

  const phase = tripPhase(trip);
  const { sharing } = useLocationSharing({
    orderId: trip?.id ?? null,
    state: trip?.state ?? null,
    enabled: focused,
  });

  const reload = useCallback(async (mode: "load" | "refresh" = "load") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const orders = await api.listOrders();
      const next = user ? selectActiveTrip(orders, user.id) : null;
      setTrip(next);
      setError(null);
      if (!next) setPanel("main");
    } catch (e) {
      setError(
        api.apiErrorMessage(
          e,
          "Could not load your trip. Check your connection and try again.",
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void reload();
      return () => setFocused(false);
    }, [reload]),
  );

  function openPrimaryPanel() {
    if (phase === "pickup") {
      setOtp("");
      setPhotoName("pickup-proof.jpg");
      setPanel("pickup");
    } else if (phase === "collect_cod") {
      setPanel("cod");
    } else if (phase === "delivery_proof") {
      setOtp("");
      setPhotoName("delivery-proof.jpg");
      setPanel("delivery");
    }
  }

  async function runStartDelivery() {
    if (!trip) return;
    setBusy(true);
    setError(null);
    try {
      const order = await api.transitionOrder(trip.id, "out_for_delivery");
      setTrip(order);
      setPanel("main");
    } catch (e) {
      setError(api.apiErrorMessage(e, "Could not start delivery. Refresh and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function submitPickup() {
    if (!trip) return;
    if (otp.trim().length < 4) {
      setError("Enter the 4-digit pickup OTP from the supplier.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.submitProof(trip.id, {
        kind: "pickup",
        otp: otp.trim(),
        photoName: photoName.trim() || "pickup-proof.jpg",
      });
      setTrip(order);
      setPanel("main");
      setOtp("");
    } catch (e) {
      setError(api.apiErrorMessage(e, "Pickup proof was not recorded. Check the OTP and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function submitCod() {
    if (!trip) return;
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.submitProof(trip.id, {
        kind: "cod",
        note: `Collected ${api.formatPhp(codAmountDueMinor(trip))}`,
      });
      setTrip(order);
      setPanel("main");
    } catch (e) {
      setError(
        api.apiErrorMessage(
          e,
          "Cash collection was not recorded. Do not leave until it is confirmed.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitDelivery() {
    if (!trip) return;
    // Hard gate: never allow delivery proof on a COD job without collection.
    if (phase === "collect_cod") {
      setError("Record cash collection before confirming delivery.");
      setPanel("cod");
      return;
    }
    if (otp.trim().length < 4) {
      setError("Enter the 4-digit delivery OTP from the client.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.submitProof(trip.id, {
        kind: "delivery",
        otp: otp.trim(),
        photoName: photoName.trim() || "delivery-proof.jpg",
      });
      setTrip(order);
      setPanel("main");
      setOtp("");
    } catch (e) {
      setError(
        api.apiErrorMessage(e, "Delivery proof was not recorded. Check the OTP and try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitFailure() {
    if (!trip) return;
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.submitProof(trip.id, {
        kind: "failure",
        note: buildFailureNote(failureReason, failureNote),
        reason: failureReason,
      });
      setTrip(order);
      setPanel("main");
      setFailureNote("");
    } catch (e) {
      setError(
        api.apiErrorMessage(
          e,
          "Could not record the failed attempt. Try again, or contact Operations.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPrimary() {
    if (phase === "start_delivery") {
      await runStartDelivery();
      return;
    }
    openPrimaryPanel();
  }

  const chip = trip ? orderStateChip(trip.state) : null;
  const cta = primaryActionLabel(phase);

  return (
    <SafeAreaView className="gg-screen" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10 pt-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload("refresh")}
            tintColor={colors.textMuted}
          />
        }
      >
        <Text className="text-h1 text-text-primary">Active trip</Text>

        {error ? (
          <View className="mt-4 rounded-card border border-error bg-surface p-4">
            <Text className="text-body text-error">{error}</Text>
          </View>
        ) : null}

        {loading && !trip ? (
          <View className="mt-10 items-center">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="mt-3 text-body text-text-muted">Loading trip…</Text>
          </View>
        ) : null}

        {!loading && !trip ? (
          <EmptyState
            title="No active trip"
            body="Accept an offer to start a job. Offers lists jobs ready for pickup."
            actionLabel="Browse offers"
            onAction={() => router.push("/(tabs)/offers")}
          />
        ) : null}

        {trip ? (
          <View className="mt-6 gap-4">
            <LocationSharingBanner sharing={sharing} />

            <View className="gg-card gap-3">
              <View className="flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 text-h3 text-text-primary">{trip.title}</Text>
                {chip ? (
                  <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
                ) : null}
              </View>

              <View>
                <SpecRow label="Size" value={trip.size} />
                <SpecRow label="Material" value={trip.material} />
                <SpecRow label="Quantity" value={String(trip.quantity)} />
                <SpecRow label="Zone" value={zoneLabel(trip.zone)} />
                {trip.paymentMethod === "cod" ? (
                  <SpecRow
                    label="Cash due"
                    value={api.formatPhp(codAmountDueMinor(trip))}
                  />
                ) : (
                  <SpecRow label="Payment" value="Prepaid" />
                )}
              </View>
            </View>

            <View className="gap-2">
              <AddressStop
                kind="pickup"
                address="Supplier print shop"
                detail="Collect the finished job"
                zone={zoneLabel(trip.zone)}
                active={phase === "pickup"}
              />
              <AddressStop
                kind="dropoff"
                address={trip.address}
                zone={zoneLabel(trip.zone)}
                active={
                  phase === "start_delivery" ||
                  phase === "collect_cod" ||
                  phase === "delivery_proof"
                }
              />
            </View>

            {panel === "main" && cta ? (
              <View className="gap-3">
                <PrimaryButton
                  label={busy ? "Working…" : cta}
                  onPress={() => void onPrimary()}
                  disabled={busy}
                />
                {phase === "delivery_proof" ||
                phase === "collect_cod" ||
                phase === "start_delivery" ? (
                  <SecondaryButton
                    label="Report failed attempt"
                    onPress={() => setPanel("failure")}
                    disabled={busy}
                  />
                ) : null}
              </View>
            ) : null}

            {phase === "complete" ? (
              <View className="gg-card gap-3">
                <StatusChip tone="success" label="Delivery complete" icon="circle-check" />
                <Text className="text-body text-text-secondary">
                  The 24-hour issue window is open for the client. Browse offers
                  for the next job.
                </Text>
                <PrimaryButton
                  label="Browse offers"
                  onPress={() => router.push("/(tabs)/offers")}
                />
              </View>
            ) : null}

            {panel === "pickup" ? (
              <ProofForm
                title="Pickup proof"
                helper="Get the OTP from the supplier and photograph the package at the shop."
                otp={otp}
                onOtp={setOtp}
                photoName={photoName}
                onPhotoName={setPhotoName}
                primaryLabel={busy ? "Recording…" : "Confirm pickup"}
                onPrimary={() => void submitPickup()}
                onCancel={() => setPanel("main")}
                busy={busy}
              />
            ) : null}

            {panel === "cod" && trip ? (
              <CodPanel
                amountMinor={codAmountDueMinor(trip)}
                busy={busy}
                onConfirm={() => void submitCod()}
                onCancel={() => setPanel("main")}
              />
            ) : null}

            {panel === "delivery" ? (
              <ProofForm
                title="Delivery proof"
                helper="Get the OTP from the client and photograph the package at the door."
                otp={otp}
                onOtp={setOtp}
                photoName={photoName}
                onPhotoName={setPhotoName}
                primaryLabel={busy ? "Recording…" : "Confirm delivery"}
                onPrimary={() => void submitDelivery()}
                onCancel={() => setPanel("main")}
                busy={busy}
              />
            ) : null}

            {panel === "failure" ? (
              <FailureForm
                reason={failureReason}
                onReason={setFailureReason}
                note={failureNote}
                onNote={setFailureNote}
                busy={busy}
                onSubmit={() => void submitFailure()}
                onCancel={() => setPanel("main")}
              />
            ) : null}

            <View className="gg-card gap-3">
              <Text className="text-overline text-text-muted">TIMELINE</Text>
              <TripTimeline timeline={trip.timeline} selfId={user?.id} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProofForm({
  title,
  helper,
  otp,
  onOtp,
  photoName,
  onPhotoName,
  primaryLabel,
  onPrimary,
  onCancel,
  busy,
}: {
  title: string;
  helper: string;
  otp: string;
  onOtp: (v: string) => void;
  photoName: string;
  onPhotoName: (v: string) => void;
  primaryLabel: string;
  onPrimary: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View className="gg-card gap-4">
      <Text className="text-h3 text-text-primary">{title}</Text>
      <Text className="text-body text-text-secondary">{helper}</Text>
      <View className="gap-2">
        <Text className="text-caption text-text-muted">OTP</Text>
        <TextInput
          value={otp}
          onChangeText={onOtp}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="4-digit code"
          placeholderTextColor={colors.textMuted}
          className="gg-field"
          accessibilityLabel="OTP code"
        />
      </View>
      <View className="gap-2">
        <Text className="text-caption text-text-muted">Photo evidence</Text>
        <TextInput
          value={photoName}
          onChangeText={onPhotoName}
          className="gg-field"
          accessibilityLabel="Photo file name"
          placeholderTextColor={colors.textMuted}
        />
        <Text className="text-caption text-text-muted">
          Demo MVP records a photo file name. Camera capture lands with the Navigation SDK.
        </Text>
      </View>
      <PrimaryButton label={primaryLabel} onPress={onPrimary} disabled={busy} />
      <SecondaryButton label="Cancel" onPress={onCancel} disabled={busy} />
    </View>
  );
}

function CodPanel({
  amountMinor,
  busy,
  onConfirm,
  onCancel,
}: {
  amountMinor: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View className="gap-3 rounded-card border-2 border-accent bg-surface p-4">
      <Text className="text-overline text-text-muted">CASH ON DELIVERY</Text>
      <Text className="text-body text-text-secondary">
        Collect this exact amount from the client before you confirm delivery.
      </Text>
      <Text
        className="text-display text-text-primary"
        accessibilityRole="text"
        accessibilityLabel={`Amount due ${api.formatPhp(amountMinor)}`}
      >
        {api.formatPhp(amountMinor)}
      </Text>
      <Text className="text-caption text-text-muted">
        Order total plus delivery fee. Count the cash, then record the collection.
      </Text>
      <PrimaryButton
        label={busy ? "Recording…" : "I collected this amount"}
        onPress={onConfirm}
        disabled={busy}
      />
      <SecondaryButton label="Not yet" onPress={onCancel} disabled={busy} />
    </View>
  );
}

function FailureForm({
  reason,
  onReason,
  note,
  onNote,
  busy,
  onSubmit,
  onCancel,
}: {
  reason: FailureReasonId;
  onReason: (id: FailureReasonId) => void;
  note: string;
  onNote: (v: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View className="gg-card gap-4">
      <Text className="text-h3 text-text-primary">Failed attempt</Text>
      <Text className="text-body text-text-secondary">
        Document what happened. The job stays with you — return the package to
        the supplier or retry when the client is available. Operations can see this note.
      </Text>
      <View className="gap-2">
        {FAILURE_REASONS.map((item) => {
          const selected = item.id === reason;
          return (
            <Pressable
              key={item.id}
              onPress={() => onReason(item.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={
                selected
                  ? "gg-touch flex-row items-center rounded-field border border-accent bg-surface-high px-3"
                  : "gg-touch flex-row items-center rounded-field border border-outline bg-surface px-3"
              }
            >
              <Text className="text-body text-text-primary">{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View className="gap-2">
        <Text className="text-caption text-text-muted">Note (optional)</Text>
        <TextInput
          value={note}
          onChangeText={onNote}
          multiline
          className="min-h-20 rounded-field border border-outline bg-surface px-3 py-3 text-body text-text-primary"
          placeholder="Gate code, contact, next attempt…"
          placeholderTextColor={colors.textMuted}
        />
      </View>
      <PrimaryButton
        label={busy ? "Recording…" : "Record failed attempt"}
        onPress={onSubmit}
        disabled={busy}
      />
      <SecondaryButton label="Cancel" onPress={onCancel} disabled={busy} />
      <Text className="text-caption text-text-muted">
        After recording, open Offers only when this trip is closed. Until then,
        retry delivery or return the package — this is not a dead end.
      </Text>
    </View>
  );
}
