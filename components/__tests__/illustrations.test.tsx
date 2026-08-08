import { processColor } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { illustrations } from "@/components/illustrations";
import type { IllustrationPalette } from "@/components/illustrations/palette";

const palette: IllustrationPalette = {
  ink: "#1A1A1A",
  shade: "#4A4A4A",
  mid: "#7A7A7A",
  tint: "#DCDCDC",
  highlight: "#FFFFFF",
};

describe("rider illustrations", () => {
  it.each(Object.keys(illustrations) as (keyof typeof illustrations)[])(
    "%s renders with the shared palette and no crash",
    async (name) => {
      const { Component } = illustrations[name];
      const { unmount } = await render(
        <Component width={200} height={160} palette={palette} />,
      );
      await unmount();
    },
  );

  it("registers only the three rider beats", () => {
    expect(Object.keys(illustrations).sort()).toEqual(
      ["mobile_guy", "postman", "scooter"].sort(),
    );
  });

  it("scooter paths use processed palette ink, not a source hex", async () => {
    const { Component } = illustrations.scooter;
    const { unmount } = await render(
      <Component width={100} height={80} palette={palette} />,
    );
    const paths =
      screen.root?.queryAll((n: { type: unknown }) => n.type === "RNSVGPath") ?? [];
    expect(paths.length).toBeGreaterThan(0);
    const ink = processColor(palette.ink);
    const fills = paths
      .map((n: { props?: { fill?: { payload?: number } } }) => n.props?.fill?.payload)
      .filter((p: number | undefined): p is number => typeof p === "number");
    expect(fills).toContain(ink);
    await unmount();
  });
});
