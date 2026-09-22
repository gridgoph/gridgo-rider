import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SupportChatConversation } from "@/components/SupportChatConversation";
import { useThemeColors } from "@/hooks/useTheme";
import { CHAT_LIST_ROUTE, isChatThreadId } from "@/lib/chatThreads";

/**
 * One Operations conversation from history.
 */
export default function ChatThreadScreen() {
  const { thread: peer } = useLocalSearchParams<{ thread?: string }>();
  const router = useRouter();
  const colors = useThemeColors();

  const exitToChat = () => router.replace(CHAT_LIST_ROUTE);
  const headerEscape = !router.canGoBack() ? (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            onPress={exitToChat}
            accessibilityRole="button"
            accessibilityLabel="Back to chat"
            hitSlop={12}
            className="flex-row items-center gap-1 pr-3"
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body-lg text-text-primary">Chat</Text>
          </Pressable>
        ),
      }}
    />
  ) : null;

  if (!isChatThreadId(peer)) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page gap-4 pt-6">
          <View className="gg-panel items-center py-8">
            <Text className="text-body-lg font-medium text-text-primary">No such conversation</Text>
            <Text className="mt-2 text-center text-body text-text-secondary">
              Open your chat history to pick one, or start a new chat.
            </Text>
            <View className="mt-4 w-full max-w-xs">
              <SecondaryButton label="Open chat history" onPress={exitToChat} />
            </View>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <>
      {headerEscape}
      <SupportChatConversation threadId={peer} />
    </>
  );
}
