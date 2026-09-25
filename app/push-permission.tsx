import { router } from "expo-router";
import { BadgeCheck, ClipboardCheck, Package, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { useThemeColors } from "@/hooks/useTheme";
import { pushPromptCopy, pushPromptReasons, type PushPromptReason } from "@/lib/push";
import { approvalPresentation, rootStackOwner } from "@/lib/riderApproval";
import { usePush } from "@/store/push";
import { closePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

const REASON_ICONS: Record<PushPromptReason["icon"], LucideIcon> = {
  offer: Package,
  pickup: ClipboardCheck,
  approval: BadgeCheck,
};

/**
 * What notifications bring, asked before the phone asks.
 *
 * `hooks/usePushPrompt.ts` opens this once a signed-in rider reaches the tabs.
 * "Turn on notifications" creates the channel, raises the OS dialog and
 * registers the phone (`usePush.enable`); on a phone that has already refused
 * twice the app cannot raise that dialog, so the same button hands over to the
 * phone's settings instead, and the root push hook re-reads the permission
 * when GRIDGO comes back to the front.
 *
 * A sheet, so dragging it away, the back gesture and "Not now" are one answer.
 */
export default function PushPermissionSheet() {
  // Pinned to the state it opened with: the copy holds still while the OS
  // dialog is up and the sheet animates away after it.
  const [mode] = useState<"undetermined" | "blocked">(() =>
    usePush.getState().permission === "blocked" ? "blocked" : "undetermined",
  );
  const [owner] = useState(() => rootStackOwner(useSession.getState().user));
  const awaitingApproval = useSession((s) => !approvalPresentation(s.user).canWork);
  const busy = usePush((s) => s.busy);
  const enable = usePush((s) => s.enable);
  const colors = useThemeColors();
  const [working, setWorking] = useState(false);

  useEffect(
    () => () => {
      const replaced = rootStackOwner(useSession.getState().user) !== owner;
      closePushPrompt(replaced ? "interrupted" : "answered");
    },
    [owner],
  );

  const copy = pushPromptCopy(mode);
  const reasons = pushPromptReasons(awaitingApproval);

  async function turnOn() {
    setWorking(true);
    try {
      if (mode === "blocked") await Linking.openSettings();
      else await enable();
    } catch {
      // A settings screen that would not open leaves the card on Active to
      // offer it again; nothing here is worth a second error surface.
    } finally {
      setWorking(false);
    }
    router.back();
  }

  return (
    <SheetSurface
      title={copy.title}
      body={copy.body}
      cancelLabel={copy.dismiss}
      footer={
        <>
          <PrimaryButton
            label={working ? (mode === "blocked" ? "Opening…" : "Asking…") : copy.action}
            size="large"
            disabled={working || busy}
            onPress={() => void turnOn()}
          />
          <SecondaryButton
            label={copy.dismiss}
            size="large"
            disabled={working}
            onPress={() => router.back()}
          />
        </>
      }
    >
      <View className="gap-3">
        <View className="rounded-card border border-outline px-4">
          {reasons.map((reason, index) => {
            const Icon = REASON_ICONS[reason.icon];
            const last = index === reasons.length - 1;
            return (
              <View
                key={reason.icon}
                className={
                  last
                    ? "flex-row items-start gap-3 py-3"
                    : "flex-row items-start gap-3 border-b border-outline-subtle py-3"
                }
              >
                <View className="mt-0.5">
                  <Icon size={20} color={colors.textSecondary} strokeWidth={2} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-body font-medium text-text-primary">{reason.title}</Text>
                  <Text className="text-caption text-text-muted">{reason.detail}</Text>
                </View>
              </View>
            );
          })}
        </View>
        <Text className="text-caption text-text-muted">{copy.footnote}</Text>
      </View>
    </SheetSurface>
  );
}
