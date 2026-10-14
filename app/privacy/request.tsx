import { useLocalSearchParams, useRouter } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { legalDate, openRequestOf, PRIVACY_KINDS } from "@/lib/legal";
import { usePrivacyRequests } from "@/store/privacyRequests";

const MAX_DETAILS = 4000;

/**
 * See my data / Correct my data: what will happen, an optional (or, for a
 * correction, needed) note, and one send.
 *
 * Deletion is not here: it goes through Delete account, which checks it is
 * the account holder before anything is sent.
 */
export default function PrivacyRequestScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === "correction" ? "correction" : "access";
  const copy = PRIVACY_KINDS[kind];

  const sending = usePrivacyRequests((state) => state.sending);
  const error = usePrivacyRequests((state) => state.error);
  const sent = usePrivacyRequests((state) => state.sent);
  const requests = usePrivacyRequests((state) => state.requests);
  const [details, setDetails] = useState("");

  useEffect(() => {
    usePrivacyRequests.getState().clearSend();
    return () => usePrivacyRequests.getState().clearSend();
  }, []);

  const open = openRequestOf(requests, kind);
  const missingDetails = copy.detailsRequired && !details.trim();

  if (sent) {
    const due = legalDate(sent.dueAt);
    return (
      <Screen edges={["bottom"]}>
        <FormScroll contentClassName="gg-page gap-8 pb-10 pt-4">
          <View className="gap-3" accessibilityLiveRegion="polite">
            <CircleCheck size={32} color={colors.success} strokeWidth={2} />
            <Text className="text-h2 text-text-primary" accessibilityRole="header">
              Request sent
            </Text>
            <Text className="text-body-lg text-text-primary">
              {due ? `GRIDGO will answer by ${due}.` : "GRIDGO will answer as soon as it can."}
            </Text>
            <Text className="text-body text-text-secondary">
              Operations check it is you first, so they may contact you on your sign-in email. You
              can follow it on Your data.
            </Text>
          </View>
          <SecondaryButton label="Back to Your data" onPress={() => router.back()} />
        </FormScroll>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <FormScroll contentClassName="gg-page gap-6 pb-10 pt-4">
        <View className="gap-3">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            {copy.title}
          </Text>
          <Text className="text-body-lg text-text-secondary">{copy.explain}</Text>
        </View>

        {open ? (
          <InlineNotice
            tone="info"
            icon="clock"
            title={`You already asked on ${legalDate(open.requestedAt) ?? "an earlier day"}`}
            body={`That request is still open${
              legalDate(open.dueAt) ? `, due by ${legalDate(open.dueAt)}` : ""
            }. Send another only if you have something to add.`}
          />
        ) : null}

        <View className="gap-2">
          <Text className="text-overline text-text-muted">
            {copy.detailsLabel.toUpperCase()}
            {copy.detailsRequired ? "" : " (OPTIONAL)"}
          </Text>
          <TextInput
            value={details}
            onChangeText={setDetails}
            editable={!sending}
            multiline
            maxLength={MAX_DETAILS}
            className="min-h-24 rounded-field border border-outline bg-surface px-3 py-3 text-body text-text-primary"
            placeholder={copy.detailsRequired ? "What is wrong, and what it should be" : undefined}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={copy.detailsLabel}
            testID="privacy-details"
          />
          <Text className="text-caption text-text-muted">{copy.detailsHelper}</Text>
        </View>

        {error ? <InlineNotice tone="error" icon="circle-x" title="Not sent" body={error} /> : null}

        <View className="gap-3">
          <PrimaryButton
            label={sending ? "Sending…" : "Send request"}
            disabled={sending || missingDetails}
            onPress={() => void usePrivacyRequests.getState().send(kind, details)}
            size="large"
          />
          <SecondaryButton label="Cancel" disabled={sending} onPress={() => router.back()} />
        </View>
      </FormScroll>
    </Screen>
  );
}
