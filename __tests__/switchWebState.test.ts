import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  react-native-web 0.21 ignores `accessibilityState` and reads only aria-*
  props, so a switch styled from tokens announced "Online, switch" in a
  browser with no on or off (PR 207 review). Native gets the state either way;
  this keeps the web half from being dropped. Every role="switch" Pressable
  must also pass `aria-checked`.
*/
const SWITCHES = ["components/OnlineSwitch.tsx", "components/MapStatusStrip.tsx"];

it.each(SWITCHES)("%s gives its switch an aria-checked state", (file) => {
  const source = readFileSync(join(__dirname, "..", file), "utf8");
  expect(source).toMatch(/accessibilityRole=\{?[^}\n]*"switch"/);
  expect(source).toMatch(/aria-checked=\{/);
});
