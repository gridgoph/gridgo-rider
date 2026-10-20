import { Check } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AcknowledgementReceipt } from "@/components/AcknowledgementReceipt";
import { InlineNotice, type NoticeIcon, type NoticeTone } from "@/components/InlineNotice";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonText } from "@/components/Skeleton";
import { useAcknowledgementReceipt } from "@/hooks/useAcknowledgementReceipt";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { receiptStage, type ReceiptProblem } from "@/lib/acknowledgementReceipt";

type Props = {
  order: api.Order;
  handedOver: boolean;
  onToggle: () => void;
  /** The job as the server returned it after the rider recorded arrival. */
  onOrder: (order: api.Order) => void;
  /** The server closed the receipt: re-read the job to learn where it went. */
  onClosed: () => void;
  disabled?: boolean;
};

export const RECEIPT_TICK_LABEL = "Receipt handed over";

const PROBLEM_LOOK: Record<ReceiptProblem["kind"], { tone: NoticeTone; icon: NoticeIcon }> = {
  closed: { tone: "neutral", icon: "info" },
  unsupported: { tone: "info", icon: "info" },
  retry: { tone: "error", icon: "circle-x" },
  gone: { tone: "error", icon: "circle-x" },
};

/**
 * The acknowledgement receipt, at the client's door.
 *
 * The pilot's only receipt: the captain decided (25 Sep 2026) that riders hand
 * the client an acknowledgement receipt with the package, and (21 Oct 2026,
 * gridgo-rider#152) that GRIDGO issues it from the order, so the rider copies
 * GRIDGO's AR number and figures onto the paper form rather than working them
 * out. The signed paper copy stays the proof at the door.
 *
 * The rider sees those figures only here, only after recording arrival, and
 * only until the handover is done (`receiptStage`, `useAcknowledgementReceipt`).
 * Before arrival the card offers that step; it says nothing about money.
 *
 * The tick is still the rider's own reminder and nothing more. It never blocks
 * the delivery and never leaves the phone. Nor does the receipt: the delivery
 * issues the same receipt itself if this card never got to, and refuses
 * atomically if it cannot, so the server stays the only gate.
 */
export function ReceiptReminder({ order, handedOver, onToggle, onOrder, onClosed, disabled = false }: Props) {
  const colors = useThemeColors();
  const stage = receiptStage(order);
  const { load, retry } = useAcknowledgementReceipt(stage === "at_door" ? order.id : null, onClosed);
  const [arriving, setArriving] = useState(false);
  const [arrivalError, setArrivalError] = useState<string | null>(null);

  async function recordArrival() {
    if (arriving) return;
    setArriving(true);
    setArrivalError(null);
    try {
      onOrder(await api.recordArrival(order.id));
    } catch (e) {
      setArrivalError(
        api.tripRefusal(e, "Your arrival was not recorded. Check your connection and try again.").message,
      );
    } finally {
      setArriving(false);
    }
  }

  return (
    <View className="gap-4 rounded-card border-2 border-accent bg-surface p-6">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">HAND THIS TO THE CLIENT</Text>
        <Text className="text-h3 text-text-primary">Acknowledgement receipt</Text>
      </View>

      {stage === "before_arrival" ? (
        <>
          <Text className="text-body text-text-secondary">
            Give the client an acknowledgement receipt with the package, as well as your thank-you.
            When you reach their door, tell GRIDGO you have arrived and the details to copy onto the
            paper receipt open here.
          </Text>
          <SecondaryButton
            label={arriving ? "Recording arrival…" : "I'm at the client's door"}
            onPress={() => void recordArrival()}
            disabled={disabled || arriving}
          />
          <Text className="text-caption text-text-muted">GRIDGO lets the client know you have arrived.</Text>
          {arrivalError ? (
            <InlineNotice tone="error" icon="circle-x" title="Arrival not recorded" body={arrivalError} />
          ) : null}
        </>
      ) : null}

      {load.status === "loading" ? (
        <View className="gap-3" accessibilityLabel="Loading the receipt">
          <SkeletonText width="60%" height={30} />
          <SkeletonText />
          <SkeletonText />
          <SkeletonText width="80%" />
        </View>
      ) : null}

      {load.status === "ready" ? (
        <>
          <Text className="text-body text-text-secondary">
            Copy these onto the paper acknowledgement receipt exactly as shown, then collect the
            signatures on paper.
          </Text>
          <AcknowledgementReceipt receipt={load.receipt} />
        </>
      ) : null}

      {load.status === "problem" ? (
        <InlineNotice
          {...PROBLEM_LOOK[load.problem.kind]}
          title={load.problem.title}
          body={load.problem.body}
          {...(load.problem.kind === "retry"
            ? { actionLabel: "Try again", onAction: () => void retry() }
            : {})}
        />
      ) : null}

      <Pressable
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: handedOver, disabled }}
        accessibilityLabel={RECEIPT_TICK_LABEL}
        className="min-h-11 flex-row items-center gap-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View
          className={
            handedOver
              ? "h-6 w-6 items-center justify-center rounded-sm bg-accent"
              : "h-6 w-6 items-center justify-center rounded-sm border-2 border-outline"
          }
        >
          {handedOver ? <Check size={16} color={colors.accentOn} strokeWidth={3} /> : null}
        </View>
        <Text className="text-body-lg text-text-primary">{RECEIPT_TICK_LABEL}</Text>
      </Pressable>
    </View>
  );
}
