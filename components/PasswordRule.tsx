import { Text } from "react-native";

import { PASSWORD_RULE } from "@/lib/signup";

type Props = {
  /** What is wrong with the password once it has been checked; `null` shows the rule. */
  problem: string | null;
};

/**
 * The line under a new password: Clerk's rule before the rider types, the
 * shortfall once they have tried. Same caption as `FieldShell`'s hint and
 * error, for the auth screens that keep their overline labels.
 */
export function PasswordRule({ problem }: Props) {
  return problem ? (
    <Text className="text-caption text-error">{problem}</Text>
  ) : (
    <Text className="text-caption text-text-muted">{PASSWORD_RULE}</Text>
  );
}
