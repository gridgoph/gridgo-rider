import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  visible: boolean;
  /** A specific question naming what is about to happen. Never "Are you sure?". */
  question: string;
  /** The consequence, in the rider's terms. */
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The last step before something the rider cannot take back.
 *
 * The question names the specific action and the body names the consequence,
 * because "Are you sure?" asks the rider to remember what they just tapped.
 * The confirm keeps the yellow — inside this sheet it is the only action that
 * matters, and the screen behind it is not interactive.
 */
export function ConfirmDialog({
  visible,
  question,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" }}
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
        onPress={busy ? undefined : onCancel}
      >
        <SafeAreaView edges={["bottom"]}>
          {/* Stops a tap inside the sheet from reaching the scrim behind it. */}
          <Pressable onPress={() => undefined} accessible={false}>
            <View
              className="m-4 gap-4 rounded-card border border-outline bg-surface p-5"
              accessibilityViewIsModal
            >
              <Text className="text-h3 text-text-primary">{question}</Text>
              <Text className="text-body-lg text-text-secondary">{body}</Text>
              <View className="gap-3 pt-1">
                <PrimaryButton
                  label={busy ? "Recording…" : confirmLabel}
                  onPress={onConfirm}
                  disabled={busy}
                  size="large"
                />
                <SecondaryButton label={cancelLabel} onPress={onCancel} disabled={busy} />
              </View>
            </View>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}
