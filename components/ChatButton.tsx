import { useRouter } from "expo-router";
import { MessageSquare } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { useSupportChatStore } from "@/store/supportChat";

export function ChatButton() {
  const router = useRouter();
  const colors = useThemeColors();
  const unread = useSupportChatStore((s) => s.unreadCount);
  const badge = unread > 9 ? "9+" : String(unread);

  return (
    <Pressable
      onPress={() => router.push("/chat")}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Chat, ${unread} unread` : "Chat"}
      testID="chat-button"
      className="h-11 w-11 items-center justify-center rounded-pill border border-outline bg-surface"
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <View accessibilityElementsHidden>
        <MessageSquare size={20} color={colors.textPrimary} strokeWidth={2} />
        {unread > 0 ? (
          <View className="absolute -right-2.5 -top-1.5 min-h-4 min-w-4 items-center justify-center rounded-pill bg-error px-1">
            <Text
              className="text-caption"
              style={{
                includeFontPadding: false,
                fontSize: 10,
                lineHeight: 12,
                color: colors.surface,
              }}
            >
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
