import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { EvidenceCapture } from "@/components/EvidenceCapture";
import { FormScroll } from "@/components/FormScroll";
import { HandoverSteps } from "@/components/HandoverSteps";
import { InlineNotice } from "@/components/InlineNotice";
import { PassedChecksSummary } from "@/components/PassedChecksSummary";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ProofStepSkeleton } from "@/components/SkeletonScreens";
import { StickyActionBar, StickyActionFallback } from "@/components/StickyActionBar";
import { TripStepHeader } from "@/components/TripStepHeader";
import { useProofEvidence } from "@/hooks/useProofEvidence";
import { useTripOrder } from "@/hooks/useTripOrder";
import { PACKING_PHOTO_TARGETS } from "@/lib/attachments";
import { formatCheckedAt } from "@/lib/handoffSignature";
import { recordedCountLines } from "@/lib/pickupCount";
import { evidenceBlockReason } from "@/lib/proofEvidence";
import { pickupLabel } from "@/lib/riderOrder";
import {
  currentInspectionId,
  packedPhotoAt,
  packedPhotoStored,
  ridersPack,
} from "@/lib/shopHandover";

/**
 * The shop packs in front of the rider, and the rider photographs it.
 *
 * Step two of the `rider_packs` counter (gridgo-api `docs/SHOP_HANDOVER_API.md`,
 * step 4). The items were checked unpacked on the previous screen and the
 * server holds that inspection; the photo is bound to it, so it shows the
 * pieces that were checked going into the materials that were checked. It is
 * the rider's photo, not the shop's: the point of report 6C695C15 is that the
 * packing happens where the rider can see it.
 *
 * Like every proof here, the photo only counts once the server has it —
 * `stored`, never optimistic. A photo the server already holds for this
 * inspection (the app was closed after taking it) is said so, rather than
 * asking for a second one.
 */
export default function PackedPhotoScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error: loadError } = useTripOrder(id);
  const [actionBarHeight, setActionBarHeight] = useState(0);
  // The clock "today" is read against, fixed when the screen opens.
  const [openedAtMs] = useState(() => Date.now());

  const evidence = useProofEvidence({
    orderId: id ?? "",
    step: "packing",
    targets: PACKING_PHOTO_TARGETS,
  });

  const packs = order ? ridersPack(order) : false;
  const inspectionId = order ? currentInspectionId(order) : null;
  const savedEarlier = order ? packedPhotoStored(order) : false;
  const savedNow = Boolean(evidence.stored.packing_photo);
  const saved = savedEarlier || savedNow;
  const ready = Boolean(order && packs && inspectionId);

  const blocked = !order
    ? "Loading the job."
    : !ready
      ? null
      : saved
        ? null
        : evidenceBlockReason(
            evidence.evidence,
            evidence.upload,
            "Photograph the packed job once every piece is in.",
          );

  function openChecks() {
    if (order) router.replace({ pathname: "/trip/pickup", params: { orderId: order.id } });
  }

  return (
    <Screen edges={[]}>
      <FormScroll contentClassName="gg-page gap-6 pb-8 pt-6" stickyActionHeight={actionBarHeight}>
        {loading ? <ProofStepSkeleton /> : null}

        {loadError ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="This job did not load"
            body={loadError}
          />
        ) : null}

        {order && !packs ? (
          <InlineNotice
            tone="info"
            icon="info"
            title="This job has no packing step"
            body="The shop packed this one before you arrived. Run the pickup checks, then the shop signs on your phone."
          />
        ) : null}

        {order && packs && !inspectionId ? (
          <InlineNotice
            tone="warning"
            icon="triangle-alert"
            title="Check the items unpacked first"
            body="The shop packs after you have counted and checked every piece together. Run the six checks, then come back here."
          />
        ) : null}

        {order && ready ? (
          <>
            <TripStepHeader order={order} stopKind="pickup" stopLabel={pickupLabel(order)} />

            <HandoverSteps current="pack" />

            <PassedChecksSummary
              flow="rider_packs"
              checkedAt={formatCheckedAt(order.pickupChecklist?.completedAt ?? null, openedAtMs)}
              counts={recordedCountLines(order)}
            />

            <View className="gap-1">
              <Text className="text-h2 text-text-primary">Pack it in front of you</Text>
              <Text className="text-body-lg text-text-secondary">
                Watch the shop pack the pieces you just checked into the materials you checked.
                Nothing is swapped or added once packing starts.
              </Text>
            </View>

            {savedEarlier && !savedNow ? (
              <InlineNotice
                tone="success"
                icon="circle-check"
                title="Packed photo saved"
                body={`GRIDGO has the packed photo from ${formatCheckedAt(packedPhotoAt(order), openedAtMs) ?? "this check"}. The shop signs next.`}
              />
            ) : (
              <EvidenceCapture
                key={id}
                title="The packed job"
                instruction="When every piece is in, photograph the packed job with the order slip or label in frame."
                purpose="The client sees this photo, and GRIDGO keeps it with your check in case anything arrives damaged."
                evidence={evidence.evidence}
                upload={evidence.upload}
                captureError={evidence.captureError}
                cameraBlocked={evidence.cameraBlocked}
                onTakePhoto={() => void evidence.takePhoto()}
                onRetry={evidence.retry}
                onClear={evidence.clear}
                disabled={savedNow}
              />
            )}

            <View className="gap-2">
              <Text className="text-body text-text-secondary">
                Found a problem while packing? Check the items again before anyone signs.
              </Text>
              <SecondaryButton label="Check the items again" onPress={openChecks} />
            </View>
          </>
        ) : null}
      </FormScroll>

      <StickyActionBar
        onHeight={setActionBarHeight}
        note={
          ready
            ? (blocked ?? "The packed photo is saved. Next, the shop signs on your phone.")
            : null
        }
      >
        {order && ready ? (
          <PrimaryButton
            label="Shop signs next"
            onPress={() =>
              router.replace({ pathname: "/trip/handoff", params: { orderId: order.id } })
            }
            disabled={Boolean(blocked)}
            size="large"
          />
        ) : order && packs ? (
          <PrimaryButton label="Open the pickup checks" onPress={openChecks} size="large" />
        ) : (
          <StickyActionFallback loading={loading} onBack={() => router.back()} />
        )}
      </StickyActionBar>
    </Screen>
  );
}
