import { useCallback, useContext, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ImagePlus, Lock, Send, UserRound, X } from "lucide-react-native";

import { ChatPhoto } from "@/components/ChatPhoto";
import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { addChatPhotos, pickChatImages, uploadChatImage, type ChatPhotoDraft } from "@/lib/chatImages";
import { isAtChatEnd, shouldRepinOnResize } from "@/lib/chatScroll";
import {
  DELIVERY_CHAT_IMAGE_PURPOSE,
  DELIVERY_CHAT_POLL_MS,
  DELIVERY_MESSAGE_MAX,
  deliveryChatNotice,
  deliveryChatUnavailable,
  deliverySendError,
  senderLabel,
  type DeliveryChatMessage,
  type DeliveryChatSummary,
  type DeliveryChatUnavailable,
} from "@/lib/deliveryChat";

/**
 * The rider's side of one delivery's conversation with the client.
 *
 * Text and photos, and no call button: neither side ever sees the other's number.
 * Like the support chat, the message list is the viewport and the composer is
 * pinned under it, so the column shrinks with the keyboard (see
 * `__tests__/keyboardAvoidance.test.ts`). New messages arrive by polling while
 * the screen is in front; the client's first message of a burst also lands as
 * an alert.
 */
export function DeliveryChatConversation({
  orderId,
  onBackToTrip,
}: {
  orderId: string;
  onBackToTrip: () => void;
}) {
  const colors = useThemeColors();
  const listRef = useRef<ScrollView>(null);
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const followingEnd = useRef(true);
  const viewportHeight = useRef<number | null>(null);
  const sequence = useRef(0);
  const [chat, setChat] = useState<DeliveryChatSummary | null>(null);
  const [messages, setMessages] = useState<DeliveryChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<DeliveryChatUnavailable | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, setPending] = useState<ChatPhotoDraft[]>([]);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await api.getDeliveryChat(orderId);
      if (current !== sequence.current) return;
      setChat(result.chat);
      setUnavailable(null);
      setLoadError(null);
      setMessages((previous) => {
        const changed =
          result.messages.length !== previous.length ||
          result.messages.some((row, index) => row.id !== previous[index]?.id);
        if (changed && followingEnd.current) {
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: previous.length > 0 }));
        }
        return changed ? result.messages : previous;
      });
    } catch (err) {
      if (current !== sequence.current) return;
      const closed = deliveryChatUnavailable(err);
      if (closed) {
        // Removed, reassigned, or never a door delivery: drop what was shown.
        setUnavailable(closed);
        setChat(null);
        setMessages([]);
      } else {
        setLoadError("Could not load your messages. Check your connection and try again.");
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [orderId]);

  useLiveRefresh(["notifications", "orders"], load);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), DELIVERY_CHAT_POLL_MS);
      return () => {
        sequence.current++;
        clearInterval(timer);
      };
    }, [load]),
  );

  const trackEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    followingEnd.current = isAtChatEnd({
      offsetY: contentOffset.y,
      viewportHeight: layoutMeasurement.height,
      contentHeight: contentSize.height,
    });
  }, []);

  const keepEndInView = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (shouldRepinOnResize(viewportHeight.current, next, followingEnd.current)) {
      listRef.current?.scrollToEnd({ animated: false });
    }
    viewportHeight.current = next;
  }, []);

  const pickPhoto = useCallback(async () => {
    try {
      const added = addChatPhotos(pending, await pickChatImages());
      if (!added.ok) {
        setSendError(added.error);
        return;
      }
      setSendError(null);
      setPending(added.pending);
    } catch {
      setSendError("Could not add that photo. Try again.");
    }
  }, [pending]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if ((!body && !pending.length) || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const fileIds: string[] = [];
      for (const asset of pending) {
        fileIds.push(await uploadChatImage(asset, DELIVERY_CHAT_IMAGE_PURPOSE));
      }
      const posted = fileIds.length
        ? await api.sendDeliveryMessage(orderId, body, { attachmentFileIds: fileIds })
        : await api.sendDeliveryMessage(orderId, body);
      setDraft("");
      setPending([]);
      setChat(posted.chat);
      setMessages((current) =>
        current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message],
      );
      followingEnd.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      console.warn("[delivery-chat] Send failed:", err instanceof Error ? err.message : "Unknown error");
      setSendError(deliverySendError(err));
      // A refusal can mean the delivery was just recorded; re-read to say so.
      void load();
    } finally {
      setSending(false);
    }
  }, [draft, load, orderId, pending, sending]);

  const canSend = !sending && Boolean(draft.trim() || pending.length);
  const open = chat?.status === "open";

  if (unavailable) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-4 pt-6">
          <View className="gg-panel items-center gap-2 py-8">
            <Text className="text-center text-body-lg font-medium text-text-primary">{unavailable.title}</Text>
            <Text className="text-center text-body text-text-secondary">{unavailable.body}</Text>
          </View>
          <SecondaryButton label="Back to the trip" onPress={onBackToTrip} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={{ flex: 1 }}>
        <ScrollView
          ref={listRef}
          testID="delivery-chat-transcript"
          className="flex-1"
          contentContainerClassName="gg-page grow gap-3 pb-3 pt-4"
          keyboardShouldPersistTaps="handled"
          onScroll={trackEnd}
          scrollEventThrottle={32}
          onLayout={keepEndInView}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="h-11 w-11 items-center justify-center rounded-pill"
              style={{ backgroundColor: colors.surfaceVariant }}
            >
              <UserRound size={20} color={colors.textPrimary} strokeWidth={2} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-h3 text-text-primary">The client</Text>
              <Text className="text-caption text-text-muted">
                {open ? "On this delivery" : chat ? "Delivered" : " "}
              </Text>
            </View>
          </View>

          {chat ? (
            <View
              className="flex-row items-start gap-2 rounded-field px-3 py-2"
              style={{ backgroundColor: colors.surfaceVariant }}
              accessible
              accessibilityLabel={deliveryChatNotice(chat)}
            >
              <Lock size={14} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 3 }} />
              <Text className="flex-1 text-caption text-text-secondary">{deliveryChatNotice(chat)}</Text>
            </View>
          ) : null}

          {loadError && !chat ? (
            <InlineNotice
              tone="error"
              icon="circle-x"
              title="Could not load messages"
              body={loadError}
              actionLabel="Try again"
              onAction={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : null}

          <View className="flex-1 justify-end gap-3">
            {loading && !chat ? null : messages.length === 0 && chat ? (
              <View className="gg-panel items-center py-8">
                <Text className="text-body-lg font-medium text-text-primary">No messages yet</Text>
                <Text className="mt-2 text-center text-body text-text-secondary">
                  {open
                    ? "Ask the client for a gate, a landmark, or who will receive the package."
                    : "Nobody wrote during this delivery."}
                </Text>
              </View>
            ) : (
              messages.map((message) => (
                <View
                  key={message.id}
                  className={message.mine ? "max-w-[80%] items-end self-end" : "max-w-[80%] items-start self-start"}
                >
                  <View
                    className="rounded-card px-3 py-2"
                    style={{
                      backgroundColor: message.mine ? colors.accent : colors.surface,
                      borderWidth: message.mine ? 0 : 1,
                      borderColor: colors.outline,
                    }}
                  >
                    {message.body ? (
                      <Text
                        className="text-body"
                        style={{ color: message.mine ? colors.accentOn : colors.textPrimary }}
                      >
                        {message.body}
                      </Text>
                    ) : null}
                    {message.attachments?.map((attachment) => (
                      <View key={attachment.fileId} className={message.body ? "mt-2" : undefined}>
                        <ChatPhoto attachment={attachment} />
                      </View>
                    ))}
                  </View>
                  <Text className="mt-1 text-caption text-text-muted">
                    {senderLabel(message)} · {timeOf(message.createdAt)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {open ? (
          <View className="border-t border-outline bg-surface px-4 pb-3 pt-3">
            {sendError ? (
              <Text className="mb-2 text-caption text-error" accessibilityLiveRegion="polite">
                {sendError}
              </Text>
            ) : null}
            {pending.length ? (
              <View className="mb-2 flex-row items-center gap-2">
                <Text className="min-w-0 flex-1 text-caption text-text-muted" numberOfLines={1}>
                  {pending.length === 1 ? pending[0].name : `${pending.length} photos ready to send`}
                </Text>
                <Pressable
                  onPress={() => setPending([])}
                  disabled={sending}
                  accessibilityRole="button"
                  accessibilityLabel={pending.length === 1 ? "Remove the photo" : "Remove the photos"}
                  className="h-11 w-11 items-center justify-center"
                >
                  <X size={16} color={colors.textMuted} strokeWidth={2} />
                </Pressable>
              </View>
            ) : null}
            <View className="flex-row items-end gap-2">
              <Pressable
                onPress={() => void pickPhoto()}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Add photos"
                accessibilityState={{ disabled: sending }}
                className="h-12 w-12 items-center justify-center rounded-pill"
                style={{ borderWidth: 1, borderColor: colors.outline, opacity: sending ? 0.38 : 1 }}
              >
                <ImagePlus size={18} color={colors.textPrimary} strokeWidth={2} />
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Write to the client"
                accessibilityLabel="Message the client"
                multiline
                maxLength={DELIVERY_MESSAGE_MAX}
                editable={!sending}
                className="min-h-12 min-w-0 flex-1 rounded-field border border-outline bg-surface px-3 py-2 text-body text-text-primary"
                placeholderTextColor={colors.textMuted}
              />
              <Pressable
                onPress={() => void send()}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !canSend }}
                className="h-12 w-12 items-center justify-center rounded-pill bg-accent"
                style={{ opacity: canSend ? 1 : 0.38 }}
              >
                <Send size={18} color={colors.accentOn} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        ) : chat ? (
          <View className="gg-page pb-3 pt-2">
            <SecondaryButton label="Back to the trip" onPress={onBackToTrip} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function timeOf(at: string): string {
  return new Date(at).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}
