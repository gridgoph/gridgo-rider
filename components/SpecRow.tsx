import { Text, View } from "react-native";

type Props = {
  label: string;
  value: string;
  /** Drop the hairline on the last row so it does not double the card edge. */
  last?: boolean;
};

/**
 * One line of a specification: what it is on the left, what it is set to on
 * the right, closed by a hairline. Used wherever the app states the agreed
 * facts of a job — size, material, quantity, deadline.
 */
export function SpecRow({ label, value, last = false }: Props) {
  return (
    <View
      className={
        last
          ? "flex-row items-baseline justify-between gap-4 py-3"
          : "flex-row items-baseline justify-between gap-4 border-b border-outline-subtle py-3"
      }
    >
      <Text className="text-body text-text-secondary">{label}</Text>
      <Text className="shrink text-body text-text-primary">{value}</Text>
    </View>
  );
}
