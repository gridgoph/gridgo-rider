import { Eraser, Undo2 } from "lucide-react-native";
import type { Ref } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { Pressable } from "@/components/Pressable";

import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { StatusChip } from "@/components/StatusChip";
import { TextField } from "@/components/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import { uploadStatusLine, type EvidenceUpload } from "@/lib/proofEvidence";

type Props = {
  padRef: Ref<SignaturePadHandle>;
  signerName: string;
  onSignerName: (name: string) => void;
  inked: boolean;
  onSignedChange: (signed: boolean) => void;
  onInkChange: (inked: boolean) => void;
  onDrawingChange: (drawing: boolean) => void;
  upload: EvidenceUpload;
  onClear: () => void;
  onUndo: () => void;
  disabled?: boolean;
};

/**
 * The receiving person signs the receipt on the rider's phone.
 *
 * Their name, then the pad — white paper and dark ink in both themes, because
 * the image leaves the phone (`SignaturePad`). This is the client's
 * acknowledgement and is separate from the shop's handoff signature at
 * pick-up; it never stands in for the door photo or a handover code.
 */
export function ReceiptSignature({
  padRef,
  signerName,
  onSignerName,
  inked,
  onSignedChange,
  onInkChange,
  onDrawingChange,
  upload,
  onClear,
  onUndo,
  disabled = false,
}: Props) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const padHeight = Math.min(260, Math.max(200, Math.round((width - 80) * 0.55)));
  const status = uploadStatusLine(upload, "signature");

  return (
    <View className="gap-3" testID="receipt-signature">
      <View className="gap-2">
        <Text className="text-caption text-text-secondary">Name of the person receiving</Text>
        <TextField
          value={signerName}
          onChange={onSignerName}
          placeholder="Who is receiving the package"
          accessibilityLabel="Name of the person receiving the package"
          kind="name"
          editable={!disabled}
        />
      </View>

      <SignaturePad
        ref={padRef}
        height={padHeight}
        baseline
        onSignedChange={onSignedChange}
        onStrokesChange={(strokes) => onInkChange(strokes.length > 0)}
        onDrawingChange={onDrawingChange}
        hint="Hand the phone over and ask them to sign on the line."
        accessibilityHint="The person receiving the package draws their signature with a finger"
      />

      <View className="flex-row items-center justify-between gap-3">
        {status ? <StatusChip tone={status.tone} label={status.label} icon={status.icon} /> : <View />}
        <View className="flex-row items-center gap-1">
          <PadControl
            label="Undo"
            spoken="Undo the last stroke of the signature"
            onPress={onUndo}
            disabled={disabled || !inked}
            icon={<Undo2 size={16} color={colors.textSecondary} strokeWidth={2} />}
          />
          <PadControl
            label="Clear"
            spoken="Clear the signature"
            onPress={onClear}
            disabled={disabled || !inked}
            icon={<Eraser size={16} color={colors.textSecondary} strokeWidth={2} />}
          />
        </View>
      </View>
      {status?.tone === "error" && status.detail ? <Text className="text-body text-error">{status.detail}</Text> : null}
    </View>
  );
}

function PadControl({
  label,
  spoken,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  spoken: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled }}
      className={disabled ? "min-h-11 flex-row items-center gap-2 px-2 opacity-40" : "min-h-11 flex-row items-center gap-2 px-2"}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {icon}
      <Text className="text-button text-text-secondary">{label}</Text>
    </Pressable>
  );
}
