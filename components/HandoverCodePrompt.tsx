import { Hash } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { DestinationRow } from "@/components/DestinationRow";
import { FormScroll } from "@/components/FormScroll";
import { HandoverCodeCard } from "@/components/HandoverCodeCard";
import { SecondaryButton } from "@/components/SecondaryButton";

type Props = {
  otp: string;
  onChange: (otp: string) => void;
  onClose: () => void;
  disabled?: boolean;
  /** The delivery screen's action bar, so the focused field clears it. */
  stickyActionHeight: number;
  /** The refusal, lockout and escalation notices, as the delivery screen draws them. */
  children?: ReactNode;
};

/**
 * The client's code, full screen, at the drop-off (issue report E68D0D98).
 *
 * Halfway down the delivery screen the field was easy to miss, so it opens by
 * itself when the rider arrives and again when GRIDGO refuses a code: the
 * client is standing there and has to read it again. It takes over the
 * delivery screen's body rather than opening a route, so the code, the
 * refusal and the escalation stay the delivery screen's own state and are
 * submitted exactly as before. The rider can close it and reopen it from the
 * delivery screen.
 */
export function HandoverCodePrompt({
  otp,
  onChange,
  onClose,
  disabled = false,
  stickyActionHeight,
  children,
}: Props) {
  return (
    <FormScroll contentClassName="gg-page gap-6 pb-8 pt-4" stickyActionHeight={stickyActionHeight}>
      <View className="flex-row justify-end">
        <SecondaryButton label="Close" onPress={onClose} />
      </View>
      <HandoverCodeCard otp={otp} onChange={onChange} disabled={disabled} autoFocus />
      {children}
    </FormScroll>
  );
}

/** The way back into the prompt from the delivery screen, with what was typed. */
export function HandoverCodeRow({ otp, onOpen }: { otp: string; onOpen: () => void }) {
  return (
    <View className="gg-card-flush">
      <DestinationRow
        icon={Hash}
        label="Handover code"
        detail="Ask the client to read their code aloud."
        value={/^\d{6}$/.test(otp) ? otp : "Not entered"}
        onPress={onOpen}
        last
      />
    </View>
  );
}
