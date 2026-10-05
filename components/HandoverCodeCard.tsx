import { Text, View } from "react-native";

import { DangerButton } from "@/components/DangerButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import {
  handoverCodeGroups,
  spokenHandoverCode,
  type CodeMatch,
} from "@/lib/handoverCode";

type Props = {
  otp: string;
  match: CodeMatch;
  onMatch: () => void;
  onMismatch: () => void;
  onCheckAgain: () => void;
  disabled?: boolean;
};

export const CODES_MATCH_LABEL = "Codes match";
export const CODES_DIFFER_LABEL = "Codes don't match";
export const CHECK_AGAIN_LABEL = "Check the codes again";

const BORDER: Record<CodeMatch, string> = {
  unchecked: "border-accent",
  match: "border-success",
  mismatch: "border-error",
};

// A mismatch carries no line of its own: the notice under the card says what
// to do, and saying it twice only slows the rider down.
const INSTRUCTION: Record<CodeMatch, string | null> = {
  unchecked:
    "Ask the client to open GRIDGO and show you their code. Hand the package over only if all six digits are the same.",
  match: "The client's code is the same as yours. Hand the package over.",
  mismatch: null,
};

/**
 * The handover code at the door, sized to be read in a hurry.
 *
 * The code is the one loud thing on the card: Satoshi Black at 56, two groups
 * of three in tabular digits, ink on the plain surface in both themes — no
 * yellow, so it cannot be mistaken for a button, and nothing tinted behind it
 * to lose contrast in sunlight. It sits in the trained-moment family with the
 * receipt and sign-off cards (heavy border, overline, instruction), and the
 * border takes the answer's colour once the rider has given one.
 *
 * The two answers are a pair, not a primary: the screen's yellow stays on
 * Confirm delivery, or on Escalate once the codes differ.
 */
export function HandoverCodeCard({
  otp,
  match,
  onMatch,
  onMismatch,
  onCheckAgain,
  disabled = false,
}: Props) {
  const [first, second] = handoverCodeGroups(otp);

  return (
    <View className={`gap-4 rounded-card border-2 bg-surface p-6 ${BORDER[match]}`}>
      <View className="gap-1">
        <Text className="text-overline text-text-muted">CHECK WITH THE CLIENT</Text>
        <Text className="text-h3 text-text-primary">Handover code</Text>
      </View>

      <View
        className="flex-row justify-center gap-6 py-2"
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Your handover code: ${spokenHandoverCode(otp)}`}
      >
        {[first, second].map((group, index) => (
          <Text
            key={index}
            className="text-code text-text-primary"
            style={{ fontVariant: ["tabular-nums"] }}
            maxFontSizeMultiplier={1.4}
            numberOfLines={1}
          >
            {group}
          </Text>
        ))}
      </View>

      {match !== "unchecked" ? (
        <View className="flex-row">
          {match === "match" ? (
            <StatusChip tone="success" icon="circle-check" label={CODES_MATCH_LABEL} />
          ) : (
            <StatusChip tone="error" icon="circle-x" label={CODES_DIFFER_LABEL} />
          )}
        </View>
      ) : null}

      {INSTRUCTION[match] ? (
        <Text className="text-body-lg text-text-secondary">{INSTRUCTION[match]}</Text>
      ) : null}

      {match === "unchecked" ? (
        <View className="gap-3">
          <SecondaryButton
            label={CODES_MATCH_LABEL}
            onPress={onMatch}
            disabled={disabled}
            size="large"
          />
          <DangerButton
            label={CODES_DIFFER_LABEL}
            onPress={onMismatch}
            disabled={disabled}
            size="large"
          />
        </View>
      ) : (
        <SecondaryButton label={CHECK_AGAIN_LABEL} onPress={onCheckAgain} disabled={disabled} />
      )}
    </View>
  );
}
