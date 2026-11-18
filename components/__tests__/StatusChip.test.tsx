import { render, screen } from "@testing-library/react-native";

import { STATUS_CHIP_TONES, StatusChip } from "@/components/StatusChip";
import { colors as palette } from "@/constants/theme";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("StatusChip", () => {
  // @testing-library/react-native 14 made render/unmount async by default
  // (see its "Migration to 14.0" notes). The brief's assertions are
  // unchanged; only await was added so they run after render settles.
  it("states the status in words, so colour never carries meaning alone", async () => {
    await render(<StatusChip tone="success" label="Approved" icon="circle-check" />);

    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("renders an icon beside the label", async () => {
    await render(<StatusChip tone="error" label="Blocked" icon="circle-x" />);

    expect(screen.getByTestId("status-chip-icon")).toBeTruthy();
  });

  it("accepts every icon in the registry", async () => {
    const icons = [
      "circle-check",
      "triangle-alert",
      "circle-x",
      "clock",
      "square-pen",
      "bell",
    ] as const;

    for (const icon of icons) {
      const { unmount } = await render(<StatusChip tone="neutral" label={icon} icon={icon} />);
      expect(screen.getByTestId("status-chip-icon")).toBeTruthy();
      await unmount();
    }
  });

  // The labels are 12px caption text, so every tone must reach AA (4.5:1) on
  // the card surface it sits on, in both themes (cash review P2-2: light
  // warning text was 2.65:1).
  it.each(["light", "dark"] as const)("sets every tone's words at AA contrast on the %s surface", (mode) => {
    for (const [tone, style] of Object.entries(STATUS_CHIP_TONES)) {
      const ratio = contrast(palette[mode][style.label], palette[mode].surface);
      expect({ tone, ok: ratio >= 4.5 }).toEqual({ tone, ok: true });
    }
  });

  it("keeps a warning chip's colour on its border and icon, and its words in ink", async () => {
    await render(<StatusChip tone="warning" label="Low balance" icon="triangle-alert" />);
    expect(screen.getByText("Low balance").props.className).toContain("text-text-primary");
    expect(screen.getByText("Low balance").props.className).not.toContain("text-warning");
    expect(STATUS_CHIP_TONES.warning.border).toBe("border-warning");
    expect(STATUS_CHIP_TONES.warning.token).toBe("warning");
  });
});
