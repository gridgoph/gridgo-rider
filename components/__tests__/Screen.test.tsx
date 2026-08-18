import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Screen } from "@/components/Screen";

const INSETS = { top: 47, left: 0, right: 0, bottom: 34 };

function renderScreen(edges?: readonly ("top" | "right" | "bottom" | "left")[]) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: INSETS,
      }}
    >
      <Screen edges={edges}>
        <Text>Hi</Text>
      </Screen>
    </SafeAreaProvider>,
  );
}

function shellStyle(): Record<string, unknown> {
  const parent = screen.getByText("Hi").parent;
  return StyleSheet.flatten(parent?.props.style) as Record<string, unknown>;
}

describe("Screen", () => {
  it("applies provider insets on the first frame, so a push does not drop from the top", async () => {
    await renderScreen(["top"]);
    const style = shellStyle();
    expect(style.paddingTop).toBe(47);
    expect(style.paddingBottom).toBe(0);
  });

  it("insets only the edges the screen asked for", async () => {
    await renderScreen(["bottom"]);
    const bottom = shellStyle();
    expect(bottom.paddingTop).toBe(0);
    expect(bottom.paddingBottom).toBe(34);
  });
});
