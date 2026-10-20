import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { AcknowledgementReceipt } from "@/components/AcknowledgementReceipt";
import { InlineNotice, type NoticeIcon, type NoticeTone } from "@/components/InlineNotice";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonText } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import type { ReceiptLoad, ReceiptProblem, ReceiptStage } from "@/lib/acknowledgementReceipt";

type Props = {
  stage: ReceiptStage;
  load: ReceiptLoad;
  onRetry: () => void;
  onArrive: () => void;
  arriving: boolean;
  arrivalError: string | null;
  handedOver: boolean;
  onToggle: () => void;
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
 * only while this handover is on screen (`useAcknowledgementReceipt`, which
 * the delivery screen owns). Before arrival the card offers that step; it says
 * nothing about money. On a server older than arrival tracking it is the plain
 * paper reminder it used to be.
 *
 * The tick is still the rider's own reminder and nothing more. It never blocks
 * the delivery and never leaves the phone. The receipt does hold the
 * delivery, on a server that has one: the delivery screen waits for it (`receiptDeliveryHold`)
 * so the AR number reaches the paper before the server closes it.
 */
export function ReceiptReminder({
  stage,
  load,
  onRetry,
  onArrive,
  arriving,
  arrivalError,
  handedOver,
  onToggle,
  disabled = false,
}: Props) {
  const colors = useThemeColors();

  return (
    <View className="gap-4 rounded-card border-2 border-accent bg-surface p-6">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">HAND THIS TO THE CLIENT</Text>
        <Text className="text-h3 text-text-primary">Acknowledgement receipt</Text>
      </View>

      {stage === "paper_only" ? (
        <Text className="text-body text-text-secondary">
          Give the client an acknowledgement receipt with the package, as well as your thank-you.
        </Text>
      ) : null}

      {stage === "before_arrival" ? (
        <>
          <Text className="text-body text-text-secondary">
            Give the client an acknowledgement receipt with the package, as well as your thank-you.
            When you reach their door, tell GRIDGO you have arrived and the details to copy onto the
            paper receipt open here.
          </Text>
          <SecondaryButton
            label={arriving ? "Recording arrival…" : "I'm at the client's door"}
            onPress={onArrive}
            disabled={disabled || arriving}
          />
          <Text className="text-caption text-text-muted">GRIDGO lets the client know you have arrived.</Text>
          {arrivalError ? (
            <InlineNotice tone="error" icon="circle-x" title="Arrival not recorded" body={arrivalError} />
          ) : null}
        </>
      ) : null}

      {load.status === "loading" || load.status === "checking" ? (
        <View
          className="gap-3"
          accessibilityLabel={
            load.status === "checking" ? "Checking this job before the receipt opens again" : "Loading the receipt"
          }
        >
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
            ? { actionLabel: "Try again", onAction: onRetry }
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
