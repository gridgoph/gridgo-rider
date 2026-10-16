import { fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { StickyActionBar, StickyActionFallback } from "@/components/StickyActionBar";

const INSETS = { top: 47, left: 0, right: 0, bottom: 34 };

function renderBar(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: INSETS }}
    >
      {ui}
    </SafeAreaProvider>,
  );
}

function Action() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Confirm delivery">
      <Text>Confirm delivery</Text>
    </Pressable>
  );
}

/** The bar's painted surface: the view the note and the action sit in. */
function surface() {
  return screen.getByRole("button", { name: "Confirm delivery" }).parent!;
}

describe("the action bar every delivery step shares (gridgo-rider#117)", () => {
  it("puts the note above the action, so the button is always the last thing in the bar", async () => {
    await renderBar(
      <StickyActionBar note="Photograph the package at the door.">
        <Action />
      </StickyActionBar>,
    );

    const children = surface().children as { props: { children?: unknown } }[];
    expect(children).toHaveLength(2);
    expect(screen.getByText("Photograph the package at the door.")).toBeTruthy();
    expect(children[0].props.children).toBe("Photograph the package at the door.");
    expect(children[1]).toBe(screen.getByRole("button", { name: "Confirm delivery" }));
  });

  it("renders the action alone when there is nothing to say about it", async () => {
    await renderBar(
      <StickyActionBar note={null}>
        <Action />
      </StickyActionBar>,
    );
    expect(surface().children).toHaveLength(1);
  });

  it("paints through the bottom safe area, the same 12dp above it on every step", async () => {
    await renderBar(
      <StickyActionBar>
        <Action />
      </StickyActionBar>,
    );
    const style = StyleSheet.flatten(surface().props.style) as Record<string, unknown>;
    expect(style.paddingBottom).toBe(12 + INSETS.bottom);
  });

  it("reports its height, so a focused field clears the bar as well as the keyboard", async () => {
    const onHeight = jest.fn();
    await renderBar(
      <StickyActionBar onHeight={onHeight}>
        <Action />
      </StickyActionBar>,
    );
    fireEvent(surface(), "layout", { nativeEvent: { layout: { height: 128 } } });
    expect(onHeight).toHaveBeenCalledWith(128);
  });
});

describe("the bar before the job is on screen", () => {
  it("holds the slot without a button while the job loads", async () => {
    await renderBar(
      <StickyActionBar>
        <StickyActionFallback loading onBack={jest.fn()} />
      </StickyActionBar>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers the way back in the same place once the job failed to load", async () => {
    const onBack = jest.fn();
    await renderBar(
      <StickyActionBar>
        <StickyActionFallback loading={false} onBack={onBack} />
      </StickyActionBar>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Back to the trip" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
