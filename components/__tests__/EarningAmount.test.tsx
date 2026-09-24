import { act, render, screen } from "@testing-library/react-native";
import { readFileSync } from "fs";
import { join } from "path";
import { StyleSheet } from "react-native";
import { colorScheme } from "react-native-css";
import { compile } from "react-native-css/compiler";
import { StyleCollection } from "react-native-css/native";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

import { EarningAmount } from "@/components/EarningAmount";
import { colors } from "@/constants/theme";

jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  const styled = (name: "View" | "Text") => (props: Record<string, unknown>) =>
    jest.requireActual<typeof import("react-native-css/native")>("react-native-css/native").useCssElement(actual[name], props, { className: "style" });
  return Object.defineProperties({}, {
    ...Object.getOwnPropertyDescriptors(actual),
    View: { value: styled("View") },
    Text: { value: styled("Text") },
  });
});

let stylesheet: ReturnType<ReturnType<typeof compile>["stylesheet"]>;
beforeAll(async () => {
  const from = join(__dirname, "..", "..", "global.css");
  const result = await postcss([tailwindcss({ optimize: false })]).process(readFileSync(from, "utf8"), { from });
  stylesheet = compile(result.css, { inlineVariables: false }).stylesheet();
});
beforeEach(() => { StyleCollection.inject(stylesheet); });
afterEach(async () => { await act(async () => colorScheme.set("light")); });

/** The painted colours, lower-cased so CSS and theme.ts spellings compare. */
async function paint(scheme: "light" | "dark") {
  await act(async () => colorScheme.set(scheme));
  await render(<EarningAmount minor={12500} size="h3" />);
  const ink = StyleSheet.flatten(screen.getByText("₱125.00").props.style);
  const mark = StyleSheet.flatten(screen.getByTestId("earning-mark", { includeHiddenElements: true }).props.style);
  return {
    ink: String(ink.color).toLowerCase(),
    mark: String(mark.backgroundColor).toLowerCase(),
  };
}

/*
  Yellow on white is about 1.3:1 — unreadable. So the rule this component
  exists to keep is: in Light the digits are dark and the yellow sits behind
  them; in Dark the digits themselves are yellow and nothing sits behind.
*/
describe("EarningAmount", () => {
  it("sets dark digits on a yellow mark in Light", async () => {
    const { ink, mark } = await paint("light");

    expect(ink).toBe(colors.light.textPrimary.toLowerCase());
    expect(mark).toBe(colors.light.actionYellow.toLowerCase());
  });

  it("sets yellow digits with no mark in Dark", async () => {
    const { ink, mark } = await paint("dark");

    expect(ink).toBe(colors.dark.actionYellow.toLowerCase());
    expect(mark).toBe("transparent");
  });

  it("keeps the mark out of the accessibility tree", async () => {
    await render(<EarningAmount minor={5000} size="body" />);

    expect(screen.queryByTestId("earning-mark")).toBeNull();
    expect(screen.getByTestId("earning-mark", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("₱50.00")).toBeTruthy();
  });

  it("mirrors the CSS tokens in constants/theme.ts", () => {
    expect(colors.light.earningInk).toBe(colors.light.textPrimary);
    expect(colors.light.earningMark).toBe(colors.light.actionYellow);
    expect(colors.dark.earningInk).toBe(colors.dark.actionYellow);
    expect(colors.dark.earningMark).toBe("transparent");
  });
});
