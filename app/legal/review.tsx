import { useRouter } from "expo-router";
import { LockKeyhole, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { CheckboxRow } from "@/components/CheckboxRow";
import { DestinationRow } from "@/components/DestinationRow";
import { InlineNotice } from "@/components/InlineNotice";
import { LegalDocumentRow } from "@/components/legal/LegalDocumentRow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useConfirmedSignOut } from "@/hooks/useConfirmedSignOut";
import { useThemeColors } from "@/hooks/useTheme";
import { gateBody, gateHeading, joinTitles } from "@/lib/legal";
import { useLegalConsent } from "@/store/legalConsent";
import { useLegalNotices } from "@/store/legalNotices";
import { useSession } from "@/store/session";

/**
 * Terms to agree to, before anything else in the app opens.
 *
 * Reached only through the launch and the auth gate, which close every
 * ordinary screen while `GET /me/legal/pending` says `blocking` — on the first
 * sign-in of a rider Operations invited (nothing was agreed when they were
 * made), and on the next open after GRIDGO publishes a change that matters.
 * What stays open is what a rider needs in order to decide: each document,
 * their own data, and the way out. Signing out is never behind the box.
 *
 * Each document says when it has been opened from here, so a rider reading
 * three in a row can see where they are. The box starts unticked and is drawn
 * again unticked whenever the set of versions on screen changes, so a version
 * that took effect mid-read is never agreed to by a tick given to the one
 * before it. On agreeing, the auth gate moves the rider on to Active.
 */
export default function LegalReviewScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const userId = useSession((state) => state.user?.id ?? null);
  const pending = useLegalConsent((state) => state.pending);
  const notices = useLegalConsent((state) => state.notices);
  const accepting = useLegalConsent((state) => state.accepting);
  const error = useLegalConsent((state) => state.error);
  const signOut = useConfirmedSignOut();

  const signature = pending.map((doc) => doc.id).join("|");
  const [agreedTo, setAgreedTo] = useState<string | null>(null);
  const agreed = agreedTo === signature;
  const [opened, setOpened] = useState<readonly string[]>([]);

  async function agree() {
    if (!agreed) return;
    const done = await useLegalConsent.getState().accept();
    // Editorial notices were on this screen too; they need no second showing.
    if (done && userId) {
      useLegalNotices.getState().markSeen(
        userId,
        useLegalConsent.getState().notices.map((doc) => doc.id),
      );
    }
  }

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-8 pb-10 pt-6">
        <View className="gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-pill bg-surface-variant">
            <ShieldCheck size={24} color={colors.textPrimary} strokeWidth={2} />
          </View>
          <Text className="text-h1 text-text-primary" accessibilityRole="header">
            {gateHeading(pending)}
          </Text>
          <Text className="text-body-lg text-text-secondary">{gateBody(pending)}</Text>
        </View>

        <View className="gap-2">
          <Text className="text-overline text-text-muted">NEEDS YOUR AGREEMENT</Text>
          <View className="gg-card-flush">
            {pending.map((doc, index) => (
              <LegalDocumentRow
                key={doc.id}
                doc={doc}
                divided={index > 0}
                showChange
                opened={opened.includes(doc.id)}
                onOpen={() =>
                  setOpened((seen) => (seen.includes(doc.id) ? seen : [...seen, doc.id]))
                }
              />
            ))}
          </View>
        </View>

        {notices.length ? (
          <View className="gap-2">
            <Text className="text-overline text-text-muted">ALSO UPDATED, NOTHING TO AGREE TO</Text>
            <View className="gg-card-flush">
              {notices.map((doc, index) => (
                <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} />
              ))}
            </View>
          </View>
        ) : null}

        <View className="gap-4">
          <CheckboxRow
            checked={agreed}
            onChange={(next) => setAgreedTo(next ? signature : null)}
            disabled={accepting || pending.length === 0}
            label={`I have read and agree to the ${joinTitles(pending)}`}
            hint="GRIDGO records which versions you agreed to, and when."
            testID="legal-agree"
          />
          {error ? (
            <InlineNotice tone="error" icon="circle-x" title="Not agreed yet" body={error} />
          ) : null}
          <PrimaryButton
            label={accepting ? "Saving your agreement…" : "Agree and continue"}
            disabled={!agreed || accepting || pending.length === 0}
            onPress={() => void agree()}
            size="large"
          />
        </View>

        <View className="gap-3">
          <View className="gg-card-flush">
            <DestinationRow
              icon={LockKeyhole}
              label="Your data"
              detail="See, correct or delete what GRIDGO holds about you, without agreeing first"
              onPress={() => router.push("/privacy")}
              last
            />
          </View>
          <SecondaryButton label="Sign out" disabled={accepting} onPress={() => void signOut()} />
        </View>
      </ScrollView>
    </Screen>
  );
}
