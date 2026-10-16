import { useEffect, useState } from "react";
import { Text } from "react-native";

import { callDurationLabel } from "@/lib/orderCalls";

/** Time on the call, counted from when the voices connected. Ticks once a second. */
export function CallTimer({ since, className }: { since: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  const label = callDurationLabel(now - since);
  return (
    <Text
      className={className}
      style={{ fontVariant: ["tabular-nums"] }}
      accessibilityLabel={`Call time ${label}`}
    >
      {label}
    </Text>
  );
}
