import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { HeaderHeightContext } from "expo-router/react-navigation";
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
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Send } from "lucide-react-native";

import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { isAtChatEnd, shouldRepinOnResize } from "@/lib/chatScroll";
import { openSupportChatStream } from "@/lib/supportChatStream";
import { useSupportChatStore } from "@/store/supportChat";

/**
 * One Operations conversation. Dispatch news stays in Alerts; this is the desk
 * a rider writes when a drop-off or payout needs a person.
 *
 * A message list over a pinned composer, so the column *shrinks* with the
 * keyboard rather than scrolling to a field. `FormScroll` + `StickyActionBar`
 * got this wrong (gridgo-client#128): `KeyboardAwareScrollView` only scrolls to
 * a focused input inside it, and the composer rode the keyboard outside it, so
 * the keyboard came up over the newest messages and nothing brought them back.
 */
export function SupportChatConversation({ threadId }: { threadId?: string }) {
  const colors = useThemeColors();
  const setUnreadCount = useSupportChatStore((s) => s.setUnreadCount);
  const listRef = useRef<ScrollView>(null);
  // The keyboard pads this screen from its bottom edge, but the view's own
  // layout starts below the stack header — `onLayout` reports y = 0 here. The
  // header's height is that missing distance; without it the padding comes up
  // one header short and the composer sits under the keyboard. Outside a stack
  // (tests) there is no header, so 0.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  // Whether the reader is looking at the newest message. See lib/chatScroll.ts.
  const followingEnd = useRef(true);
  const viewportHeight = useRef<number | null>(null);
  const [activeId, setActiveId] = useState<string | undefined>(threadId);
  const [messages, setMessages] = useState<api.SupportChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

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

  // The keyboard opening (or the composer growing a line) shrinks the
  // transcript from the bottom while its offset stays put, which pushes the
  // newest messages out of sight. Keep them in view — unless the reader had
  // scrolled up into history.
  const keepEndInView = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (shouldRepinOnResize(viewportHeight.current, next, followingEnd.current)) {
      listRef.current?.scrollToEnd({ animated: false });
    }
    viewportHeight.current = next;
  }, []);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const posted = await api.sendSupportChatMessage(body, activeId);
      setActiveId(posted.thread.id);
      setDraft("");
      setMessages((current) => (
        current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message]
      ));
      scrollToLatest(true);
    } catch {
      setError("That did not reach Operations. Try sending it again.");
    } finally {
      setSending(false);
    }
  }, [activeId, draft, scrollToLatest, sending]);

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={{ flex: 1 }}
      >
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
          <View className="gap-1">
            <Text className="text-h2 text-text-primary">Operations</Text>
            <Text className="text-body-lg text-text-secondary">GRIDGO operations</Text>
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
            messages.map((message) => (
              <View key={message.id} className={message.mine ? "items-end" : "items-start"}>
                <View
                  className="max-w-[85%] rounded-field px-3 py-2"
                  style={{
                    backgroundColor: message.mine ? colors.surfaceVariant : colors.surface,
                    borderWidth: 1,
                    borderColor: colors.outline,
                  }}
                >
                  <Text className="text-body text-text-primary">{message.body}</Text>
                </View>
                <Text className="mt-1 text-caption text-text-muted">
                  {message.mine ? "You" : "Operations"}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
        <View className="border-t border-outline bg-surface px-4 pb-3 pt-3">
          <View className="flex-row items-end gap-2">
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
              disabled={sending || !draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: sending || !draft.trim() }}
              className="h-12 w-12 items-center justify-center rounded-pill bg-accent"
              style={{ opacity: sending || !draft.trim() ? 0.38 : 1 }}
            >
              <Send size={18} color={colors.accentOn} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
