import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { File, Info, Send } from "lucide-react-native";

import { ChatAvatar } from "@/components/ChatAvatar";
import { ChatPhoto } from "@/components/ChatPhoto";
import { ConversationDetails } from "@/components/ConversationDetails";
import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { isAtChatEnd, shouldRepinOnResize } from "@/lib/chatScroll";
import {
  SUPPORT_CHAT_IMAGE_MAX_COUNT,
  pickChatImages,
  uploadChatImage,
  validateChatImageAsset,
} from "@/lib/chatImages";
import { openSupportChatStream } from "@/lib/supportChatStream";
import { useSupportChatStore } from "@/store/supportChat";

/**
 * The composer sits at the bottom of this screen and has to ride the
 * keyboard rather than scrolling to a field. `FormScroll` + `StickyActionBar`
 * got this wrong (gridgo-client#128): `KeyboardAwareScrollView` only scrolls to
 * a focused input inside it, and the composer rode the keyboard outside it, so
 * the keyboard came up over the newest messages and nothing brought them back.
 */
export function SupportChatConversation({ threadId }: { threadId?: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const setUnreadCount = useSupportChatStore((s) => s.setUnreadCount);
  const listRef = useRef<ScrollView>(null);
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const followingEnd = useRef(true);
  const viewportHeight = useRef<number | null>(null);
  const [activeId, setActiveId] = useState<string | undefined>(threadId);
  const [messages, setMessages] = useState<api.SupportChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<api.SupportChatMessage[]>([]);
  const [photos, setPhotos] = useState<api.SupportChatAttachment[]>([]);
  const [pending, setPending] = useState<Array<{ uri: string; name: string; mimeType: string }>>([]);

  const scrollToLatest = useCallback((animated: boolean) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  }, []);

  const adopt = useCallback((next: api.SupportChatMessage[]) => {
    setMessages(next);
    scrollToLatest(false);
  }, [scrollToLatest]);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (threadId) {
        const detail = await api.getSupportChatThread(threadId);
        setActiveId(detail.thread.id);
        adopt(detail.messages);
        const read = await api.markSupportChatRead(detail.thread.id);
        if (typeof read.unreadCount === "number") setUnreadCount(read.unreadCount);
        else {
          const me = await api.getSupportChatMe();
          setUnreadCount(me.unreadCount ?? me.threads?.reduce((sum, row) => sum + row.unreadCount, 0) ?? 0);
        }
        return;
      }
      const me = await api.getSupportChatMe();
      setActiveId(me.thread?.id);
      adopt(me.messages);
      if (me.thread) {
        const read = await api.markSupportChatRead(me.thread.id);
        setUnreadCount(read.unreadCount ?? me.unreadCount ?? 0);
      } else {
        setUnreadCount(me.unreadCount ?? 0);
      }
    } catch (err) {
      setError(api.apiErrorMessage(err, "Could not open Operations."));
    } finally {
      setLoading(false);
    }
  }, [adopt, setUnreadCount, threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const stream = openSupportChatStream({
      onEvent: (event) => {
        if (activeId && event.thread.id !== activeId) return;
        setActiveId(event.thread.id);
        setMessages((current) => (
          current.some((row) => row.id === event.message.id) ? current : [...current, event.message]
        ));
        if (event.message.mine) return;
        void api.markSupportChatRead(event.thread.id).then((result) => {
          if (typeof result.unreadCount === "number") setUnreadCount(result.unreadCount);
        }).catch(() => {});
        scrollToLatest(true);
      },
    });
    return () => stream.close();
  }, [activeId, scrollToLatest, setUnreadCount]);

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

  const send = useCallback(async () => {
    const body = draft.trim();
    if ((!body && !pending.length) || sending) return;
    setSending(true);
    setError(null);
    try {
      const fileIds: string[] = [];
      for (const asset of pending) {
        fileIds.push(await uploadChatImage(asset));
      }
      const posted = fileIds.length
        ? await api.sendSupportChatMessage(body, activeId, { attachmentFileIds: fileIds })
        : await api.sendSupportChatMessage(body, activeId);
      setActiveId(posted.thread.id);
      setDraft("");
      setPending([]);
      setMessages((current) => (
        current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message]
      ));
      scrollToLatest(true);
    } catch {
      setError("That did not reach Operations. Try sending it again.");
    } finally {
      setSending(false);
    }
  }, [activeId, draft, pending, scrollToLatest, sending]);

  const canSend = !sending && Boolean(draft.trim() || pending.length);

  useEffect(() => {
    const id = threadId || activeId;
    if (!id) {
      setPhotos([]);
      return;
    }
    let cancelled = false;
    void api.getSupportChatThread(id, { media: true })
      .then((detail) => {
        if (!cancelled) setPhotos(detail.messages.flatMap((message) => message.attachments ?? []));
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, threadId, messages.length]);

  useEffect(() => {
    const id = threadId || activeId;
    if (!id || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    void api.getSupportChatThread(id, { q: searchQuery })
      .then((detail) => {
        if (!cancelled) setSearchResults(detail.messages);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, searchQuery, threadId]);

  const removeChat = useCallback(() => {
    if (!activeId) return;
    Alert.alert(
      "Are you sure you want to delete this chat?",
      "This conversation and its photos are removed for everyone in it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void api.deleteSupportChatThread(activeId)
              .then(() => router.back())
              .catch((err) => setError(api.apiErrorMessage(err, "Could not delete this chat.")));
          },
        },
      ],
    );
  }, [activeId, router]);

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={{ flex: 1 }}
      >
        {detailsOpen ? (
          <View className="gg-page flex-1 pt-4">
            <ConversationDetails
              name="Operations"
              subtitle="GRIDGO operations"
              imageUrl={messages.find((message) => !message.mine)?.senderImageUrl}
              searchValue={query}
              onSearchValueChange={setQuery}
              searchResults={searchResults}
              photos={photos}
              onDelete={removeChat}
              onClose={() => setDetailsOpen(false)}
            />
          </View>
        ) : (
          <>
        <ScrollView
          ref={listRef}
          testID="support-chat-transcript"
          className="flex-1"
          contentContainerClassName="gg-page grow justify-end gap-3 pb-3 pt-4"
          keyboardShouldPersistTaps="handled"
          onScroll={trackEnd}
          scrollEventThrottle={32}
          onLayout={keepEndInView}
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-h2 text-text-primary">Operations</Text>
              <Text className="text-body-lg text-text-secondary">GRIDGO operations</Text>
            </View>
            {activeId ? (
              <Pressable
                onPress={() => setDetailsOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Conversation details"
                className="h-11 w-11 items-center justify-center"
              >
                <Info size={18} color={colors.textPrimary} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
          {error ? (
            <InlineNotice
              tone="error"
              icon="circle-x"
              title="Could not load chat"
              body={error}
              actionLabel="Try again"
              onAction={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : null}
          {!loading && messages.length === 0 ? (
            <View className="gg-panel items-center py-8">
              <Text className="text-body-lg font-medium text-text-primary">No messages yet</Text>
              <Text className="mt-2 text-center text-body text-text-secondary">
                Ask about a drop-off, a payout, or anything the desk needs to settle.
              </Text>
            </View>
          ) : (
            messages.map((message) => {
              const name = message.mine ? "You" : "Operations";
              return (
                <View
                  key={message.id}
                  className={`flex-row items-end gap-2 ${message.mine ? "justify-end" : "justify-start"}`}
                >
                  {message.mine ? null : (
                    <ChatAvatar name={name} imageUrl={message.senderImageUrl} />
                  )}
                  <View className={message.mine ? "max-w-[75%] items-end" : "max-w-[75%] items-start"}>
                    <View
                      className="rounded-field px-3 py-2"
                      style={{
                        backgroundColor: message.mine ? colors.surfaceVariant : colors.surface,
                        borderWidth: 1,
                        borderColor: colors.outline,
                      }}
                    >
                      {message.body ? (
                        <Text className="text-body text-text-primary">{message.body}</Text>
                      ) : null}
                      {message.attachments?.map((attachment) => (
                        <View key={attachment.fileId} className={message.body ? "mt-2" : undefined}>
                          <ChatPhoto attachment={attachment} />
                        </View>
                      ))}
                    </View>
                    <Text className="mt-1 text-caption text-text-muted">{name}</Text>
                  </View>
                  {message.mine ? (
                    <ChatAvatar name={name} imageUrl={message.senderImageUrl} />
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
        <View className="border-t border-outline bg-surface px-4 pb-3 pt-3">
          {pending.length ? (
            <Text className="mb-2 text-caption text-text-muted">
              {pending.length === 1 ? pending[0].name : `${pending.length} photos ready to send`}
            </Text>
          ) : null}
          <View className="flex-row items-end gap-2">
            <Pressable
              onPress={() => {
                void pickChatImages().then((assets) => {
                  const next = [...pending];
                  for (const asset of assets) {
                    const problem = validateChatImageAsset(asset);
                    if (problem) {
                      setError(problem);
                      return;
                    }
                    if (next.length >= SUPPORT_CHAT_IMAGE_MAX_COUNT) {
                      setError(`A message can include up to ${SUPPORT_CHAT_IMAGE_MAX_COUNT} photos.`);
                      return;
                    }
                    next.push({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
                  }
                  setPending(next);
                }).catch((err) => setError(api.apiErrorMessage(err, "Could not add that photo.")));
              }}
              accessibilityRole="button"
              accessibilityLabel="Add photos"
              className="h-12 w-12 items-center justify-center rounded-pill"
              style={{ borderWidth: 1, borderColor: colors.outline }}
            >
              <File size={18} color={colors.textPrimary} strokeWidth={2} />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write to Operations"
              accessibilityLabel="Message Operations"
              multiline
              maxLength={4000}
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
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
