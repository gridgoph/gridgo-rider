import { LockKeyhole, Phone, UserRoundCheck } from "lucide-react-native";
import { Linking, Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";

import { useThemeColors } from "@/hooks/useTheme";
import type { GroupBackupLoad } from "@/hooks/useGroupBackup";
import { backupLockedNote, groupOrderOf } from "@/lib/groupOrder";

type Props = {
  order: { groupOrder?: unknown };
  load: GroupBackupLoad;
  onRetry: () => void;
};

/**
 * The group's backup receiver: locked and calm until the server opens it.
 *
 * Locked, it says when it opens in plain words and offers nothing to tap but
 * a quiet re-check — the host stays the one contact. Unlocked, it shows the
 * name and number the server sent and a call through the phone's dialler
 * (in-app calls reach only the host). The backup receives with the host's
 * same six-digit code. Never yellow: this is a fallback, not the next step.
 */
export function BackupReceiverRow({ order, load, onRetry }: Props) {
  const colors = useThemeColors();
  const group = groupOrderOf(order);
  if (!group || load.status === "off") return null;

  if (load.status === "ready" && load.backup.unlocked) {
    const { name, phone } = load.backup.receiver;
    return (
      <View className="gg-card gap-3" testID="backup-receiver" accessibilityLiveRegion="polite">
        <View className="flex-row items-start gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-pill bg-accent">
            <UserRoundCheck size={18} color={colors.accentOn} strokeWidth={2} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-caption text-text-secondary">Backup receiver, now open</Text>
            <Text className="text-body-lg font-bold text-text-primary">{name}</Text>
            <Text className="text-body text-text-secondary" style={{ fontVariant: ["tabular-nums"] }}>
              {phone}
            </Text>
          </View>
        </View>
        <Text className="text-caption text-text-secondary">
          They receive with the same six-digit code the host has. Ask them to read it to you.
        </Text>
        <Pressable
          onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => undefined)}
          accessibilityRole="button"
          accessibilityLabel={`Call ${name}, the backup receiver`}
          accessibilityHint="Opens your phone's dialler"
          className="gg-btn-secondary"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Phone size={18} color={colors.textPrimary} strokeWidth={2} />
          <Text className="text-button text-text-primary">{`Call ${name}`}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-row items-start gap-3 rounded-field border border-outline-subtle bg-surface-variant p-3" testID="backup-receiver-locked">
      <View className="pt-0.5">
        <LockKeyhole size={18} color={colors.textMuted} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-bold text-text-primary">Backup receiver, locked</Text>
        <Text className="text-caption text-text-secondary">
          {load.status === "error" ? `${load.message} ` : ""}
          {backupLockedNote(group)}
        </Text>
        <Text className="text-caption text-text-muted">
          If no backup was set and the host does not answer, follow the usual failed-delivery steps.
        </Text>
      </View>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Check the backup receiver again"
        className="min-h-11 min-w-11 items-center justify-center px-1"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <Text className="text-caption font-bold text-text-primary">Check</Text>
      </Pressable>
    </View>
  );
}
