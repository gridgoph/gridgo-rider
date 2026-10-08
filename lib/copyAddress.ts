import { Clipboard } from "react-native";

/** RN 0.86 still ships this native module; no new native dependency is needed. */
export async function copyAddress(address: string): Promise<void> {
  Clipboard.setString(address);
}
