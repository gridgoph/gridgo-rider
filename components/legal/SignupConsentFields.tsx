import { Text, View } from "react-native";

import { PrivacyPolicyLink } from "@/components/AccountPrivacy";
import { CheckboxRow } from "@/components/CheckboxRow";
import { InlineNotice } from "@/components/InlineNotice";
import { LegalDocumentRow } from "@/components/legal/LegalDocumentRow";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonBlock } from "@/components/Skeleton";
import type { LegalVersion } from "@/lib/api";
import { joinTitles, type SignupConsent } from "@/lib/legal";
import type { LegalLibraryStatus } from "@/store/legalLibrary";

type Props = {
  consent: SignupConsent;
  onChange: (next: SignupConsent) => void;
  /** Rider Agreement, Terms and Privacy, as GRIDGO has them in effect now. */
  documents: LegalVersion[] | null;
  status: LegalLibraryStatus;
  onRetry: () => void;
  disabled?: boolean;
};

const AGE_SEGMENTS = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No, under 18" },
] as const;

/**
 * What a rider agrees to before GRIDGO files their application.
 *
 * The documents come first, so the box below them agrees to something the
 * rider could see and open. Then the age question — asked, never inferred —
 * with the guardian's box only for someone under 18. The agreement box starts
 * unticked and holds the button until it is ticked; the news box is separate,
 * optional, and never stands in the way.
 */
export function SignupConsentFields({
  consent,
  onChange,
  documents,
  status,
  onRetry,
  disabled = false,
}: Props) {
  const set = (patch: Partial<SignupConsent>) => onChange({ ...consent, ...patch });
  const titles = documents
    ? joinTitles(documents)
    : "Rider Agreement, Terms of Service and Privacy Notice";
  const age = consent.adult === null ? "" : consent.adult ? "yes" : "no";

  return (
    <View className="gap-5">
      <View className="gap-3">
        <View className="gap-1">
          <Text className="text-overline text-text-muted">BEFORE YOU APPLY</Text>
          <Text className="text-caption text-text-secondary">
            Open each one to read it. Agreeing below is recorded against these exact versions.
          </Text>
        </View>
        {documents ? (
          <View className="gg-card-flush">
            {documents.map((doc, index) => (
              <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} />
            ))}
          </View>
        ) : status === "failed" ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="GRIDGO's terms did not load"
            body="You need to read them before you apply. Check this phone's connection."
            actionLabel="Try again"
            onAction={onRetry}
          />
        ) : status === "unsupported" ? (
          <PrivacyPolicyLink />
        ) : (
          <View accessibilityLabel="Loading GRIDGO's terms">
            <SkeletonBlock height={216} />
          </View>
        )}
      </View>

      <SegmentedControl<"yes" | "no" | "">
        label="Are you 18 or older?"
        segments={AGE_SEGMENTS}
        value={age}
        onChange={(id) => set(id === "yes" ? { adult: true, guardian: false } : { adult: false })}
        disabled={disabled}
      />
      {consent.adult === false ? (
        <CheckboxRow
          checked={consent.guardian}
          onChange={(guardian) => set({ guardian })}
          disabled={disabled}
          label="My parent or guardian has read these terms and agrees to my riding with GRIDGO"
          hint="Required for anyone under 18."
        />
      ) : null}

      <View className="gap-1">
        <CheckboxRow
          checked={consent.agreed}
          onChange={(agreed) => set({ agreed })}
          disabled={disabled}
          label={`I agree to the ${titles}`}
          hint="Required to apply."
          testID="signup-agree"
        />
        <CheckboxRow
          checked={consent.marketing}
          onChange={(marketing) => set({ marketing })}
          disabled={disabled}
          label="Send me GRIDGO news and offers"
          hint="Optional. Leave it unticked and nothing changes about your application."
        />
      </View>
    </View>
  );
}
