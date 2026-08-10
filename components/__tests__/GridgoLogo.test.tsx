import { render, screen } from "@testing-library/react-native";

import {
  GridgoLogo,
  gridgoLogoAccessibilityLabel,
  gridgoLogoMetrics,
  type GridgoLogoRole,
} from "@/components/GridgoLogo";

describe("gridgoLogoAccessibilityLabel", () => {
  it("names each product role as one phrase", () => {
    expect(gridgoLogoAccessibilityLabel("client")).toBe("GRIDGO");
    expect(gridgoLogoAccessibilityLabel("business")).toBe("GRIDGO Business");
    expect(gridgoLogoAccessibilityLabel("supplier")).toBe("GRIDGO Supplier");
    expect(gridgoLogoAccessibilityLabel("rider")).toBe("GRIDGO Rider");
    expect(gridgoLogoAccessibilityLabel("admin")).toBe("GRIDGO Admin");
  });

  it("defaults to the bare client wordmark", () => {
    expect(gridgoLogoAccessibilityLabel()).toBe("GRIDGO");
  });
});

describe("gridgoLogoMetrics", () => {
  // The reason the lockup was wrong twice: the mark was sized independently of
  // the text beside it, so it could only ever be one line tall.
  it("makes the two-line mark exactly as tall as the stacked text block", () => {
    for (const size of [16, 20, 24, 32]) {
      const m = gridgoLogoMetrics(size);
      expect(m.textBlockHeight).toBe(m.wordmarkLineHeight + m.roleLineHeight);
      // Taller than the wordmark line alone — that is the whole fix.
      expect(m.textBlockHeight).toBeGreaterThan(m.wordmarkLineHeight);
    }
  });

  // Every Satoshi cut shares a cap height per em, so the role's cap-height
  // ratio against GRIDGO is exactly its type-size ratio. The reference sheet
  // measures 0.78 — noticeably smaller, but part of the lockup, not a footnote.
  it("sets the role type to the reference's 0.78 cap ratio", () => {
    for (const size of [16, 20, 24, 32]) {
      const m = gridgoLogoMetrics(size);
      expect(m.roleSize / m.wordmarkSize).toBeCloseTo(0.78, 1);
    }
    expect(gridgoLogoMetrics(20).roleSize).toBe(16);
  });

  it("holds the 12px type floor when the ratio would go under it", () => {
    // 0.78 x 14 is 10.9 — the floor wins, and nothing renders below 12px.
    expect(gridgoLogoMetrics(14).roleSize).toBe(12);
    expect(gridgoLogoMetrics(12).roleSize).toBe(12);
  });

  it("gives the wordmark-only lockup its own single-line proportion", () => {
    const m = gridgoLogoMetrics(20);
    expect(m.soloMarkSize).toBeLessThan(m.textBlockHeight);
    expect(m.soloMarkSize).toBeGreaterThan(m.wordmarkLineHeight);
  });
});

describe("GridgoLogo", () => {
  /** The single accessible node wrapping mark + wordmark + role. */
  function lockup(role: GridgoLogoRole) {
    return screen.getByLabelText(gridgoLogoAccessibilityLabel(role));
  }

  type JsonNode = {
    type: string;
    props: Record<string, unknown>;
    children: JsonNode[] | null;
  };

  /**
   * The square the mark is drawn into, read off the host tree.
   *
   * `react-native-svg` renders `<Svg>` as a host `RNSVGSvgView` carrying the
   * resolved width and height, which is the number this whole fix is about.
   */
  function markBox() {
    const walk = (node: JsonNode): JsonNode | null => {
      if (node.type === "RNSVGSvgView") return node;
      for (const child of node.children ?? []) {
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    };

    const svg = walk(screen.toJSON() as unknown as JsonNode);
    if (!svg) throw new Error("The lockup rendered no mark.");
    return { width: svg.props.width, height: svg.props.height };
  }

  // @testing-library/react-native 14 made render/unmount async by default.
  it("keeps the bare wordmark when no role is passed", async () => {
    await render(<GridgoLogo />);

    expect(lockup("client")).toBeTruthy();
    // Nested Text splits GRID + GO; match the outer run that contains both.
    expect(screen.getByText(/GRID/)).toBeTruthy();
    expect(screen.getByText("GO")).toBeTruthy();
    expect(screen.queryByText("Rider")).toBeNull();
    expect(screen.queryByText("Supplier")).toBeNull();
    expect(screen.queryByText("Business")).toBeNull();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("keeps the bare wordmark for the client role", async () => {
    await render(<GridgoLogo role="client" />);

    expect(lockup("client")).toBeTruthy();
    expect(screen.queryByText("Business")).toBeNull();
  });

  it.each([
    ["business", "Business"],
    ["supplier", "Supplier"],
    ["rider", "Rider"],
    ["admin", "Admin"],
  ] as const)("renders the %s role as plain type under the wordmark", async (role, label) => {
    await render(<GridgoLogo role={role} />);

    expect(lockup(role)).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("retired the uppercase rider pill for the shared plain-type lockup", async () => {
    await render(<GridgoLogo role="rider" />);

    expect(screen.getByText("Rider")).toBeTruthy();
    expect(screen.queryByText("RIDER")).toBeNull();
  });

  it("stacks the wordmark above the role, both left-aligned in one column", async () => {
    await render(<GridgoLogo role="rider" size={20} />);

    const metrics = gridgoLogoMetrics(20);
    const wordmark = screen.getByText(/GRID/);
    const roleLabel = screen.getByText("Rider");

    // Both text lines live in the same column, to the right of the mark, and
    // carry the explicit line heights the mark height is derived from.
    expect(wordmark.props.style).toEqual(
      expect.objectContaining({
        fontSize: metrics.wordmarkSize,
        lineHeight: metrics.wordmarkLineHeight,
      }),
    );
    expect(roleLabel.props.style).toEqual(
      expect.objectContaining({
        fontSize: metrics.roleSize,
        lineHeight: metrics.roleLineHeight,
      }),
    );
    expect(roleLabel.parent).toBe(wordmark.parent);
  });

  it("lays the mark beside the text column rather than above the role line", async () => {
    await render(<GridgoLogo role="rider" size={20} />);

    const row = lockup("rider");
    // NativeWind classes are not resolved under jest, so the direction is
    // asserted on the class and the computed geometry on the style.
    expect(row.props.className).toContain("flex-row");
    expect(row.props.style).toEqual(
      expect.objectContaining({
        // Mark and text column share a top edge — nothing hangs below the row.
        alignItems: "flex-start",
        columnGap: gridgoLogoMetrics(20).markGap,
      }),
    );
  });

  // The regression this file exists to stop. Reported wrong twice: the mark
  // rendered only as tall as the single GRIDGO line, with the role hung under
  // the whole row. It must span GRIDGO *and* the role word.
  it.each([16, 20, 24, 32])(
    "spans the mark across the whole two-line text block at size %i",
    async (size) => {
      await render(<GridgoLogo role="rider" size={size} />);

      const metrics = gridgoLogoMetrics(size);
      expect(markBox()).toEqual({
        width: metrics.textBlockHeight,
        height: metrics.textBlockHeight,
      });
      expect(markBox().height).toBeGreaterThan(metrics.wordmarkLineHeight);
    },
  );

  it("falls back to the single-line mark when there is no role word", async () => {
    await render(<GridgoLogo role="client" size={20} />);

    const metrics = gridgoLogoMetrics(20);
    expect(markBox()).toEqual({
      width: metrics.soloMarkSize,
      height: metrics.soloMarkSize,
    });
    // Deliberately its own shape, not the two-line block with a row missing.
    expect(markBox().height).toBeLessThan(metrics.textBlockHeight);
  });

  it("exposes a single accessible node for every role variant", async () => {
    const roles: GridgoLogoRole[] = [
      "client",
      "business",
      "supplier",
      "rider",
      "admin",
    ];

    for (const role of roles) {
      const { unmount } = await render(<GridgoLogo role={role} />);
      const node = lockup(role);
      expect(node.props.accessible).toBe(true);
      expect(node.props.accessibilityRole).toBe("image");
      await unmount();
    }
  });
});
