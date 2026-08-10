import { Image } from "expo-image";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { InlineNotice } from "@/components/InlineNotice";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import {
  type EvidenceUpload,
  isUploadInFlight,
  type ProofEvidence,
  uploadProgressFraction,
  uploadStatusLine,
} from "@/lib/proofEvidence";

type Props = {
  /** What the evidence is of, in the rider's words. */
  title: string;
  instruction: string;
  evidence: ProofEvidence | null;
  upload: EvidenceUpload;
  captureError: string | null;
  cameraBlocked: boolean;
  onTakePhoto: () => void;
  onRetry: () => void;
  onClear: () => void;
  /** Signature is the delivery fallback; pickup and failed attempts are photo only. */
  onSignature?: (uri: string) => void;
  disabled?: boolean;
};

/**
 * Capture a photo, watch it reach the server, and prove it got there.
 *
 * Three states are kept visibly distinct, because collapsing them is how an
 * app ends up claiming proof it does not hold: sending (bytes moving), saving
 * (bytes sent, server still writing), and saved (the server confirmed it).
 *
 * The signature pad only appears when it is asked for. A photo is the default
 * evidence; signing is the way out when the camera will not run, not a peer
 * option to pick between at the door.
 */
export function EvidenceCapture({
  title,
  instruction,
  evidence,
  upload,
  captureError,
  cameraBlocked,
  onTakePhoto,
  onRetry,
  onClear,
  onSignature,
  disabled = false,
}: Props) {
  const colors = useThemeColors();
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const status = uploadStatusLine(upload, evidence?.kind ?? "photo");
  const progress = uploadProgressFraction(upload);
  const busy = disabled || isUploadInFlight(upload);

  async function acceptSignature() {
    if (!onSignature) return;
    setSignError(null);
    try {
      const uri = await padRef.current?.toPngFile();
      if (!uri) throw new Error("no_file");
      setSigning(false);
      setSigned(false);
      onSignature(uri);
    } catch {
      setSignError("The signature could not be saved. Ask for it again, or try the camera.");
    }
  }

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">{title.toUpperCase()}</Text>
        <Text className="text-body text-text-secondary">{instruction}</Text>
      </View>

      {evidence ? (
        <View className="gap-3">
          <View className="overflow-hidden rounded-field border border-outline bg-surface-variant">
            <Image
              source={{ uri: evidence.uri }}
              style={{ width: "100%", height: 200 }}
              contentFit="cover"
              accessibilityLabel={
                evidence.kind === "photo"
                  ? "The proof photo you captured"
                  : "The signature you captured"
              }
            />
          </View>

          {status ? (
            <View className="gap-2">
              <View className="flex-row items-center justify-between gap-3">
                <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
                {progress != null ? (
                  <Text className="text-caption text-text-muted">
                    {Math.round(progress * 100)}%
                  </Text>
                ) : null}
              </View>

              {/*
                A real bar for a real transfer. It is absent, not faked, when
                the platform will not report a total size.
              */}
              {progress != null ? (
                <View
                  className="h-1.5 overflow-hidden rounded-pill bg-surface-variant"
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
                >
                  <View
                    style={{
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor: colors.accent,
                      height: "100%",
                    }}
                  />
                </View>
              ) : null}

              {status.detail ? (
                <Text
                  className={
                    status.tone === "error"
                      ? "text-body text-error"
                      : "text-caption text-text-muted"
                  }
                >
                  {status.detail}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View className="gap-2">
            {upload.phase === "failed" && upload.retryable ? (
              <SecondaryButton label="Send it again" onPress={onRetry} disabled={disabled} />
            ) : null}
            <SecondaryButton
              label={evidence.kind === "photo" ? "Retake the photo" : "Capture it again"}
              onPress={onClear}
              disabled={busy}
            />
          </View>
        </View>
      ) : signing ? (
        <View className="gap-3">
          <SignaturePad ref={padRef} onSignedChange={setSigned} />
          {signError ? (
            <Text className="text-body text-error">{signError}</Text>
          ) : (
            <Text className="text-caption text-text-muted">
              A signature is accepted only because the camera is unavailable. A photo is
              stronger evidence — use it if the camera starts working.
            </Text>
          )}
          <SecondaryButton
            label={signed ? "Use this signature" : "Sign above to continue"}
            onPress={() => void acceptSignature()}
            disabled={!signed || disabled}
          />
          <SecondaryButton
            label="Back to the camera"
            onPress={() => {
              setSigning(false);
              setSignError(null);
            }}
            disabled={disabled}
          />
        </View>
      ) : (
        <View className="gap-3">
          <View className="items-center gap-2 rounded-field border border-dashed border-outline bg-surface-variant px-4 py-8">
            <Text className="text-body-lg text-text-primary">No evidence yet</Text>
            <Text className="text-center text-caption text-text-muted">
              Nothing is recorded until a file reaches the server.
            </Text>
          </View>

          <SecondaryButton label="Open the camera" onPress={onTakePhoto} disabled={disabled} />

          {/*
            The signature route appears only after the camera has actually
            failed. Offering it up front as a second button makes signing a peer
            of photographing, and it is not one — it is the way out when the
            camera will not run.
          */}
          {captureError ? (
            <InlineNotice
              tone={cameraBlocked ? "warning" : "neutral"}
              icon={cameraBlocked ? "triangle-alert" : "info"}
              title={cameraBlocked ? "The camera is not available" : "No photo taken"}
              body={captureError}
              actionLabel={onSignature ? "Capture a signature instead" : undefined}
              onAction={onSignature ? () => setSigning(true) : undefined}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}
