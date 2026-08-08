import { render, screen } from "@testing-library/react-native";

import {
  GridgoLogo,
  gridgoLogoAccessibilityLabel,
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

describe("GridgoLogo", () => {
  // @testing-library/react-native 14 made render/unmount async by default.
  it("keeps the bare wordmark when no role is passed", async () => {
    await render(<GridgoLogo />);

    const lockup = screen.getByLabelText("GRIDGO");
    expect(lockup).toBeTruthy();
    // Nested Text splits GRID + GO; match the outer run that contains both.
    expect(screen.getByText(/GRID/)).toBeTruthy();
    expect(screen.getByText("GO")).toBeTruthy();
    expect(screen.queryByText("RIDER")).toBeNull();
    expect(screen.queryByText("Supplier")).toBeNull();
    expect(screen.queryByText("Business")).toBeNull();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("keeps the bare wordmark for the client role", async () => {
    await render(<GridgoLogo role="client" />);

    expect(screen.getByLabelText("GRIDGO")).toBeTruthy();
    expect(screen.queryByText("Business")).toBeNull();
  });

  it.each([
    ["business", "Business", "GRIDGO Business"],
    ["supplier", "Supplier", "GRIDGO Supplier"],
    ["admin", "Admin", "GRIDGO Admin"],
  ] as const)(
    "renders the %s role as plain type under the wordmark",
    async (role, label, a11y) => {
      await render(<GridgoLogo role={role} />);

      expect(screen.getByLabelText(a11y)).toBeTruthy();
      expect(screen.getByText(label)).toBeTruthy();
      // Pill is rider-only — plain roles must not show RIDER.
      expect(screen.queryByText("RIDER")).toBeNull();
    },
  );

  it("renders the rider role as an uppercase RIDER pill", async () => {
    await render(<GridgoLogo role="rider" />);

    expect(screen.getByLabelText("GRIDGO Rider")).toBeTruthy();
    expect(screen.getByText("RIDER")).toBeTruthy();
    // No plain-type role labels mixed in.
    expect(screen.queryByText("Supplier")).toBeNull();
    expect(screen.queryByText("Business")).toBeNull();
    expect(screen.queryByText("Admin")).toBeNull();
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
      const label = gridgoLogoAccessibilityLabel(role);
      const node = screen.getByLabelText(label);
      expect(node.props.accessible).toBe(true);
      expect(node.props.accessibilityRole).toBe("image");
      await unmount();
    }
  });
});
