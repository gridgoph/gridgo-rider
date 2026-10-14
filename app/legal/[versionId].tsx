import { useLocalSearchParams } from "expo-router";
import { FileDown, Info } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";

import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { SkeletonText } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import type { LegalVersion } from "@/lib/api";
import { changeNote, legalStatusLook, PLACEHOLDER_NOTE, versionLine } from "@/lib/legal";
import { useLegalConsent } from "@/store/legalConsent";
import { useLegalLibrary } from "@/store/legalLibrary";

/**
 * One legal document, exactly the version that was linked.
 *
 * A version ID is a stable link: the apply form, the agreement screen and the
 * library all open the version they showed, so what is read is what is agreed
 * to. It paints at once from whatever list already holds it, then reads the
 * version itself. Text is plain text, set selectable so it can be quoted; a
 * PDF, when GRIDGO published one, opens in the browser from a short-lived link
 * asked for at the tap.
 */
export default function LegalDocumentScreen() {
  const colors = useThemeColors();
  const { versionId } = useLocalSearchParams<{ versionId: string }>();
  const held = useHeldVersion(versionId);
  const [doc, setDoc] = useState<LegalVersion | null>(null);
  const [failed, setFailed] = useState(false);
  const [pdf, setPdf] = useState<"idle" | "opening" | "failed">("idle");

  useEffect(() => {
    if (!versionId) return;
    let live = true;
    api
      .getLegalVersion(versionId)
      .then((read) => {
        if (!live) return;
        setDoc(read);
        setFailed(false);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [versionId]);

  const shown = doc ?? held;

  async function openPdf() {
    if (!shown) return;
    setPdf("opening");
    try {
      const { url } = await api.getLegalVersionPdf(shown.id);
      await Linking.openURL(url);
      setPdf("idle");
    } catch {
      setPdf("failed");
    }
  }

  if (!shown) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-4 pt-6">
          {failed ? (
            <InlineNotice
              tone="error"
              icon="circle-x"
              title="This document did not open"
              body="Check this phone's connection, then go back and open it again."
            />
          ) : (
            <View className="gap-3" accessibilityLabel="Loading the document">
              <SkeletonText width="75%" height={28} />
              <SkeletonText width="50%" />
              <SkeletonText />
              <SkeletonText width="85%" />
            </View>
          )}
        </View>
      </Screen>
    );
  }

  const look = legalStatusLook(shown);
  const change = changeNote(shown);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-5 pb-10 pt-4">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary" accessibilityRole="header">
            {shown.title}
          </Text>
          <Text className="text-body text-text-muted">{versionLine(shown)}</Text>
          <View className="flex-row">
            <StatusChip tone={look.tone} label={look.label} icon={look.icon} />
          </View>
        </View>

        {shown.placeholder ? (
          <View className="gg-panel flex-row items-start gap-3" accessible>
            <View className="pt-0.5">
              <Info size={18} color={colors.textSecondary} strokeWidth={2} />
            </View>
            <Text className="min-w-0 flex-1 text-body text-text-secondary">{PLACEHOLDER_NOTE}</Text>
          </View>
        ) : null}

        {change ? (
          <View className="gap-1">
            <Text className="text-overline text-text-muted">WHAT CHANGED</Text>
            <Text className="text-body-lg text-text-primary">{change}</Text>
          </View>
        ) : null}

        {shown.pdfUrl ? (
          <View className="gap-2">
            <Pressable
              onPress={() => void openPdf()}
              disabled={pdf === "opening"}
              accessibilityRole="link"
              accessibilityLabel={`Open the ${shown.title} as a PDF`}
              className="gg-btn-secondary self-start"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <FileDown size={18} color={colors.textPrimary} strokeWidth={2} />
              <Text className="text-button text-text-primary">
                {pdf === "opening" ? "Opening…" : "Open the PDF"}
              </Text>
            </Pressable>
            {pdf === "failed" ? (
              <Text className="text-caption text-error" accessibilityRole="alert">
                The PDF did not open. Check this phone&apos;s connection and try again.
              </Text>
            ) : null}
          </View>
        ) : null}

        {shown.text.trim() ? (
          <View className="gg-card">
            <Text selectable className="text-body-lg text-text-primary">
              {shown.text}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** The version as a list on screen already has it, so the reader paints at once. */
function useHeldVersion(versionId: string | undefined): LegalVersion | null {
  const fromLibrary = useLegalLibrary(
    (state) => state.documents.find((doc) => doc.id === versionId) ?? null,
  );
  const fromGate = useLegalConsent(
    (state) =>
      state.pending.find((doc) => doc.id === versionId) ??
      state.notices.find((doc) => doc.id === versionId) ??
      null,
  );
  return fromLibrary ?? fromGate;
}
