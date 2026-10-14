import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Eye, PencilLine, Trash2 } from "lucide-react-native";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";

import { DestinationRow } from "@/components/DestinationRow";
import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import {
  DELETION_ROW,
  PRIVACY_KINDS,
  privacyKindTitle,
  privacyRequestLine,
  privacyStatusLook,
  RETENTION_NOTE,
} from "@/lib/legal";
import { usePrivacyRequests } from "@/store/privacyRequests";

function requestHref(kind: "access" | "correction"): Href {
  return { pathname: "/privacy/request", params: { kind } } as Href;
}

/**
 * Your data: the three things a rider can ask of GRIDGO about their personal
 * data, and what became of each request.
 *
 * Every action sends a request to Operations, who check it is the account
 * holder and answer by hand — nothing here exports, edits or deletes by
 * itself, and the screen says so rather than letting a tap look like it did.
 * The records GRIDGO must keep are said up front, beside the delete. Open
 * while terms wait to be agreed: asking about your data never waits on a box.
 */
export default function PrivacyScreen() {
  const router = useRouter();
  const requests = usePrivacyRequests((state) => state.requests);
  const status = usePrivacyRequests((state) => state.status);

  useFocusEffect(
    useCallback(() => {
      void usePrivacyRequests.getState().load();
    }, []),
  );

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-10 pt-4">
        <Text className="text-body-lg text-text-secondary">
          Each of these sends a request to GRIDGO Operations. They check it is you, do it by hand,
          and show the answer here.
        </Text>

        <View className="gg-card-flush">
          <DestinationRow
            icon={Eye}
            label={PRIVACY_KINDS.access.title}
            detail={PRIVACY_KINDS.access.detail}
            onPress={() => router.push(requestHref("access"))}
          />
          <DestinationRow
            icon={PencilLine}
            label={PRIVACY_KINDS.correction.title}
            detail={PRIVACY_KINDS.correction.detail}
            onPress={() => router.push(requestHref("correction"))}
          />
          <DestinationRow
            icon={Trash2}
            label={DELETION_ROW.title}
            detail={DELETION_ROW.detail}
            onPress={() => router.push("/delete-account")}
            last
          />
        </View>

        <View className="gg-panel gap-1">
          <Text className="text-body font-bold text-text-primary">What GRIDGO keeps</Text>
          <Text className="text-body text-text-secondary">{RETENTION_NOTE}</Text>
        </View>

        <View className="gap-2">
          <Text className="text-overline text-text-muted" accessibilityRole="header">
            YOUR REQUESTS
          </Text>
          {requests.length ? (
            <View className="gg-card-flush">
              {requests.map((request, index) => {
                const look = privacyStatusLook(request.status);
                const line = privacyRequestLine(request);
                return (
                  <View
                    key={request.id}
                    accessible
                    accessibilityLabel={`${privacyKindTitle(request.kind)}. ${look.label}. ${line}`}
                    className={
                      index > 0
                        ? "gap-2 border-t border-outline-subtle px-4 py-3"
                        : "gap-2 px-4 py-3"
                    }
                  >
                    <View className="flex-row flex-wrap items-center justify-between gap-2">
                      <Text className="text-body-lg font-bold text-text-primary">
                        {privacyKindTitle(request.kind)}
                      </Text>
                      <StatusChip tone={look.tone} label={look.label} icon={look.icon} />
                    </View>
                    <Text className="text-caption text-text-muted">{line}</Text>
                    {request.resolution?.trim() ? (
                      <Text className="text-body text-text-secondary">{request.resolution}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : status === "failed" ? (
            <InlineNotice
              tone="error"
              icon="circle-x"
              title="Your requests did not load"
              body="Check this phone's connection."
              actionLabel="Try again"
              onAction={() => void usePrivacyRequests.getState().load()}
            />
          ) : status === "ready" ? (
            <View className="gg-card">
              <Text className="text-body text-text-secondary">
                No requests yet. Anything you send shows here, with the date GRIDGO answers by.
              </Text>
            </View>
          ) : (
            <SkeletonBlock height={80} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
