import { Text, View } from "react-native";

import { PrivacyPolicyLink } from "@/components/AccountPrivacy";
import { CheckboxRow } from "@/components/CheckboxRow";
import { InlineNotice } from "@/components/InlineNotice";
import { LegalDocumentRow } from "@/components/legal/LegalDocumentRow";
import { SkeletonBlock } from "@/components/Skeleton";
import type { LegalVersion } from "@/lib/api";
import {
  RIDER_AGE_RULE,
  signupAgreementLabel,
  type SignupConsent,
} from "@/lib/legal";
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

/**
 * What a rider agrees to before GRIDGO files their application.
 *
 * The documents come first, so the box below them agrees to something the
 * rider could see and open. The agreement box carries the age declaration —
 * rider accounts are for people 18 and over, said rather than inferred, with
 * no under-18 path (as on gridgo-supplier). It starts unticked and holds the
 * button until it is ticked; the news box is separate, optional, and never
 * stands in the way.
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

      <View className="gap-1">
        <CheckboxRow
          checked={consent.agreed}
          onChange={(agreed) => set({ agreed })}
          disabled={disabled}
          label={signupAgreementLabel(documents)}
          hint={`${RIDER_AGE_RULE} Required to apply.`}
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
