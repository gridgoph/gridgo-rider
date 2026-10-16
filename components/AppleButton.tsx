import type { AppleFlowResult } from "@/lib/appleSignIn";

export type AppleButtonProps = {
  /** Runs Apple's sheet through Clerk; the screen decides what follows. */
  onPress: (start: () => Promise<AppleFlowResult>) => void;
  disabled?: boolean;
};

/**
 * Sign in with Apple exists on iPhone only, so Android and the web draw
 * nothing. `AppleButton.ios.tsx` is the iPhone button; keeping it in its own
 * file keeps `expo-apple-authentication` out of every other bundle.
 */
export function AppleButton(_props: AppleButtonProps) {
  return null;
}
