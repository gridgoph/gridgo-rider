import { CircleFadingArrowUp } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, BackHandler, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { installChannel } from "@/lib/buildDistribution";
import { UPDATE_REQUIRED_COPY as COPY } from "@/lib/minimumBuild";
import { tryOpenDestination, updateDestination } from "@/lib/releasePush";
import { useUpdateRequired } from "@/store/updateRequired";

type Props = {
  /**
   * `full`: nothing is in hand and the whole app is closed. `step`: a job is
   * in hand, so only this custody step is, and the copy says the trip is safe.
   */
  variant: "full" | "step";
  /** Put focus on "Update now" as the panel appears (the whole-app block). */
  takeFocus?: boolean;
};

/** Move keyboard focus (web) or screen-reader focus (native) onto `view`. */
function focusOn(view: View | null): void {
  if (!view) return;
  if (Platform.OS === "web") {
    (view as unknown as { focus?: () => void }).focus?.();
    return;
  }
  AccessibilityInfo.sendAccessibilityEvent(view, "focus");
}

/**
 * "Update GRIDGO", and the one button that does it (`lib/minimumBuild.ts`).
 *
 * One glyph, one line, one yellow button. The button opens this install's own
 * way to update — the Play listing, the side-load APK, or TestFlight — and
 * never another channel's. The installed version sits under it in muted type,
 * for whoever the rider calls.
 */
export function UpdateRequiredPanel({ variant, takeFocus = false }: Props) {
  const colors = useThemeColors();
  const button = useRef<View>(null);

  useEffect(() => {
    if (takeFocus) focusOn(button.current);
  }, [takeFocus]);
  const installed = useUpdateRequired((s) => s.installed);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  async function update() {
    setOpening(true);
    setFailed(false);
    const opened = await tryOpenDestination(updateDestination(installChannel()), (url) =>
      Linking.openURL(url),
    );
    setFailed(!opened);
    setOpening(false);
  }

  return (
    <View className="flex-1 items-center justify-center gap-6 px-4">
      <View
        className="h-24 w-24 items-center justify-center rounded-pill border border-outline bg-surface"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <CircleFadingArrowUp size={44} color={colors.textPrimary} strokeWidth={1.75} />
      </View>
      <View className="w-full max-w-80 items-center gap-2">
        <Text accessibilityRole="header" className="text-center text-h2 text-text-primary">
          {COPY.title}
        </Text>
        <Text className="text-center text-body-lg text-text-secondary">
          {variant === "full" ? COPY.fullBody : COPY.stepBody}
        </Text>
      </View>
      <View className="w-full max-w-80 gap-3">
        <PrimaryButton
          ref={button}
          label={opening ? COPY.opening : COPY.action}
          size="large"
          disabled={opening}
          onPress={() => void update()}
        />
        {failed ? (
          <Text accessibilityLiveRegion="polite" className="text-center text-body text-error">
            {COPY.openFailed}
          </Text>
        ) : installed ? (
          <Text className="text-center text-caption text-text-muted">
            {COPY.installed(installed.versionName)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The whole-app block: over every screen, swallowing touches and the Android
 * back button. Drawn over the navigator rather than replacing it, so nothing
 * under it unmounts and nothing typed is lost.
 */
export function UpdateRequiredOverlay() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: colors.canvas,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
      accessibilityViewIsModal
    >
      <UpdateRequiredPanel variant="full" takeFocus />
    </View>
  );
}

/**
 * The app under the whole-app block: still mounted, so nothing is lost, but
 * out of reach. A screen reader skips it (`accessibilityElementsHidden` on
 * iOS, `no-hide-descendants` on Android) and on web it is `inert`, so Tab
 * cannot land on a control the block covers. Always rendered, so turning the
 * block on or off never remounts the navigator.
 */
export function UpdateBlockedContent({ blocked, children }: { blocked: boolean; children: ReactNode }) {
  const root = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = root.current as unknown as { inert?: boolean } | null;
    if (node) node.inert = blocked;
  }, [blocked]);

  return (
    <View
      ref={root}
      style={{ flex: 1 }}
      accessibilityElementsHidden={blocked}
      importantForAccessibility={blocked ? "no-hide-descendants" : "auto"}
    >
      {children}
    </View>
  );
}
