import { Text, View } from "react-native";

import { CheckboxRow } from "@/components/CheckboxRow";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import {
  HANDOFF_SCRIPT,
  PACKAGE_CAPTURE_FAILED,
  PACKAGE_PHOTO_HINT,
  PHOTO_CONSENT_TICK_LABEL,
  REMINDED_TICK_LABEL,
} from "@/lib/handoffReminder";
import type { EvidenceUpload, ProofEvidence } from "@/lib/proofEvidence";

type PackagePhoto = {
  evidence: ProofEvidence | null;
  upload: EvidenceUpload;
  captureError: string | null;
  cameraBlocked: boolean;
  takePhoto: () => void;
  retry: () => void;
  clear: () => void;
};

type Props = {
  reminded: boolean;
  onReminded: (value: boolean) => void;
  photoConsent: boolean;
  onPhotoConsent: (value: boolean) => void;
  packagePhoto: PackagePhoto;
  disabled?: boolean;
};

/**
 * What the rider says at the door before closing the job (`lib/handoffReminder.ts`).
 *
 * Three lines, read aloud while the client takes the package, and one required
 * tick. Built to cost seconds: no extra screen, no extra tap beyond the tick.
 * The lines sit behind a single ink rule so they read as a cue card to say,
 * not instructions to the rider. Nothing here is yellow — the screen's one
 * action stays "Confirm delivery".
 *
 * The photo tick is optional and opens a package-only capture. Without it the
 * job closes exactly the same; rider pay never depends on either tick.
 */
export function HandoffReminderCard({
  reminded,
  onReminded,
  photoConsent,
  onPhotoConsent,
  packagePhoto,
  disabled = false,
}: Props) {
  return (
    <View className="gg-card gap-4 p-5">
      <View className="gap-1">
        <Text className="text-h3 text-text-primary">Before you close the job</Text>
        <Text className="text-body text-text-secondary">Say this to the client as you hand it over.</Text>
      </View>

      <View
        className="gap-2 border-l-4 border-accent pl-4"
        accessible
        accessibilityLabel={`Say to the client: ${HANDOFF_SCRIPT.join(" ")}`}
      >
        {HANDOFF_SCRIPT.map((line) => (
          <Text key={line} className="text-body-lg font-bold text-text-primary">
            {line}
          </Text>
        ))}
      </View>

      <View className="gap-1 border-t border-outline-subtle pt-2">
        <CheckboxRow
          checked={reminded}
          onChange={onReminded}
          label={REMINDED_TICK_LABEL}
          hint="Needed to close the job."
          disabled={disabled}
        />
        <CheckboxRow
          checked={photoConsent}
          onChange={onPhotoConsent}
          label={PHOTO_CONSENT_TICK_LABEL}
          hint="Optional. Only if they said yes to a photo of the package."
          disabled={disabled}
        />
      </View>

      {photoConsent ? (
        <EvidenceCapture
          title="Package photo"
          instruction={PACKAGE_PHOTO_HINT}
          purpose="Optional. The job closes the same without it."
          evidence={packagePhoto.evidence}
          upload={packagePhoto.upload}
          captureError={packagePhoto.captureError ? PACKAGE_CAPTURE_FAILED : null}
          cameraBlocked={packagePhoto.cameraBlocked}
          onTakePhoto={packagePhoto.takePhoto}
          onRetry={packagePhoto.retry}
          onClear={packagePhoto.clear}
          disabled={disabled}
        />
      ) : null}
    </View>
  );
}
