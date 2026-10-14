import { useFocusEffect, useRouter } from "expo-router";
import { LockKeyhole } from "lucide-react-native";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";

import { DestinationRow } from "@/components/DestinationRow";
import { InlineNotice } from "@/components/InlineNotice";
import { LegalDocumentRow } from "@/components/legal/LegalDocumentRow";
import { Screen } from "@/components/Screen";
import { SkeletonBlock } from "@/components/Skeleton";
import { libraryOrder } from "@/lib/legal";
import { useLegalLibrary } from "@/store/legalLibrary";

/**
 * Account > Legal & Privacy: every document GRIDGO has in effect for riders,
 * read from the API so a newly published version is here without an update.
 *
 * Each row says its version and whether it is still placeholder text. Below
 * the documents is the way to the rider's own data — the half of privacy that
 * is something they can do rather than something they can read.
 */
export default function LegalLibraryScreen() {
  const router = useRouter();
  const documents = useLegalLibrary((state) => state.documents);
  const status = useLegalLibrary((state) => state.status);

  useFocusEffect(
    useCallback(() => {
      void useLegalLibrary.getState().load({ force: true });
    }, []),
  );

  const ordered = libraryOrder(documents);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-10 pt-4">
        <Text className="text-body-lg text-text-secondary">
          What you agreed to, and the policies GRIDGO works by. When a document changes in a way
          that matters, GRIDGO asks you to agree again before your next job.
        </Text>

        <View className="gap-2">
          <Text className="text-overline text-text-muted" accessibilityRole="header">
            DOCUMENTS
          </Text>
          {ordered.length ? (
            <View className="gg-card-flush">
              {ordered.map((doc, index) => (
                <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} />
              ))}
            </View>
          ) : status === "failed" ? (
            <InlineNotice
              tone="error"
              icon="circle-x"
              title="The documents did not load"
              body="Check this phone's connection."
              actionLabel="Try again"
              onAction={() => void useLegalLibrary.getState().load({ force: true })}
            />
          ) : status === "unsupported" ? (
            <InlineNotice
              tone="neutral"
              icon="info"
              title="Not published in the app yet"
              body="GRIDGO has not put its documents in the app yet. They will appear here."
            />
          ) : (
            <View accessibilityLabel="Loading the documents">
              <SkeletonBlock height={320} />
            </View>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-overline text-text-muted" accessibilityRole="header">
            YOUR PRIVACY
          </Text>
          <View className="gg-card-flush">
            <DestinationRow
              icon={LockKeyhole}
              label="Your data"
              detail="See, correct or delete the personal data GRIDGO holds about you"
              onPress={() => router.push("/privacy")}
              last
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
