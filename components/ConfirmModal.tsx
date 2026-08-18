import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmSheetBody } from "@/components/ConfirmSheetBody";
import { radius, spacing } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  visible: boolean;
  question: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

/**
 * A confirmation that sits over the screen that asked it.
 *
 * `formSheet` is the right native presentation when the stack actually sheets.
 * On this Android development build it does not: the confirm route paints
 * into the same view as Account, with no scrim and no surface. React Native's
 * `Modal` is the supported overlay that works in that binary — dimmed
 * background, Android back dismisses, TalkBack treats it as a dialog.
 */
export function ConfirmModal({
  visible,
  question,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
  children,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy ? undefined : onCancel}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      {/*
        A Modal is its own window. Insets from the screen behind it are the
        tab bar's, not the home indicator's — which is why the first pass sat
        on the system gesture. Measure again inside this window.
      */}
      <SafeAreaProvider>
        <ConfirmModalSheet
          question={question}
          body={body}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          busy={busy}
          busyLabel={busyLabel}
          onConfirm={onConfirm}
          onCancel={onCancel}
        >
          {children}
        </ConfirmModalSheet>
      </SafeAreaProvider>
    </Modal>
  );
}

function ConfirmModalSheet({
  question,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
  children,
}: Omit<Props, "visible">) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  // Inset plus one page step, so the last button never kisses the home bar.
  const padBottom = insets.bottom + spacing.xl;

  return (
    <View className="flex-1 justify-end">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        disabled={busy}
        onPress={onCancel}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: colors.scrim,
        }}
      />
      <View
        accessibilityRole="none"
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingBottom: padBottom,
        }}
      >
        <View className="items-center pb-1 pt-2" accessibilityElementsHidden>
          <View className="h-1 w-10 rounded-pill bg-outline" />
        </View>
        <ConfirmSheetBody
          question={question}
          body={body}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          busy={busy}
          busyLabel={busyLabel}
          onConfirm={onConfirm}
          onCancel={onCancel}
        >
          {children}
        </ConfirmSheetBody>
      </View>
    </View>
  );
}
