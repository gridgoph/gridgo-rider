import type { ReactNode } from "react";
import { Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants/theme";

type Props = {
  /** What the sheet is asking, as a heading. */
  title: string;
  /** One or two sentences of consequence. */
  body?: string;
  children?: ReactNode;
  /** The actions. One primary, and the way out. */
  footer: ReactNode;
  /** The labelled way out, announced on the surface. */
  cancelLabel?: string;
};

/**
 * The inside of a sheet route.
 *
 * The navigator owns the presentation — height, physics, drag-to-dismiss, the
 * scrim and the grabber all come from the platform. This only paints the
 * surface and keeps the same rhythm inside every sheet: what is being asked,
 * what it means, then the actions with room around them.
 *
 * Height is left to the content, so the sheet's own `fitToContents` detent can
 * measure it — nothing here may claim `flex-1`.
 *
 * Bottom padding is one page step clear of the home indicator, so the last
 * action is a real target rather than a kiss against it. On iOS the native
 * sheet already lays this content out above the indicator and paints the strip
 * below it (`confirmSheetContentStyle`), so adding the inset here as well
 * stacked a second one under the buttons: a tall empty panel over a band of
 * the wrong colour. Everywhere else the content runs to the bottom edge and
 * carries the inset itself.
 */
export function sheetBottomPadding(os: string, insetBottom: number): number {
  return os === "ios" ? spacing.xl : insetBottom + spacing.xl;
}

export function SheetSurface({ title, body, children, footer, cancelLabel }: Props) {
  const insets = useSafeAreaInsets();

  const surface = (
    <View
      className="rounded-t-card border-t border-outline bg-surface px-4"
      style={{
        paddingTop: Platform.OS === "ios" ? 24 : 16,
        paddingBottom: sheetBottomPadding(Platform.OS, insets.bottom),
      }}
      accessibilityViewIsModal
      accessibilityHint={cancelLabel ? `Or ${cancelLabel}` : undefined}
      testID="sheet-surface"
    >
      <View className="gap-2">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text className="text-body text-text-secondary">{body}</Text> : null}
      </View>

      {children ? <View className="mt-5">{children}</View> : null}

      <View className="mt-6 gap-3">{footer}</View>
    </View>
  );

  if (Platform.OS === "web") {
    return (
      <View className="flex-1 justify-end" style={{ backgroundColor: "transparent" }}>
        {surface}
      </View>
    );
  }

  return surface;
}
