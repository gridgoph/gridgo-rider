import { act, render, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { SkeletonBlock, SkeletonCircle, SkeletonText } from "@/components/Skeleton";
import { ConfirmSheetSkeleton, OfferListSkeleton } from "@/components/SkeletonScreens";

const mockReducedMotion = jest.fn(() => false);

jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion(),
}));

/** The sweep only exists once the shape has been measured. */
async function measure(width: number) {
  await act(async () => {
    screen.getByTestId("skeleton-shape").props.onLayout({
      nativeEvent: { layout: { width, height: 14, x: 0, y: 0 } },
    });
  });
}

beforeEach(() => {
  mockReducedMotion.mockReturnValue(false);
});

describe("the shimmer is motion, and motion is optional", () => {
  it("draws a highlight over a measured placeholder", async () => {
    await render(<SkeletonText width="100%" />);

    // Nothing to sweep across until the shape knows how wide it is — the
    // gradient is sized from the measured width, not guessed.
    expect(screen.queryByTestId("skeleton-sweep")).toBeNull();

    await measure(240);
    expect(screen.getByTestId("skeleton-sweep")).toBeTruthy();
  });

  it("holds the space but stays still when the phone asks for less motion", async () => {
    mockReducedMotion.mockReturnValue(true);
    await render(<SkeletonText width="100%" />);

    await measure(240);

    // The placeholder is still there — it is carrying the layout, which is not
    // decoration — but nothing moves across it.
    expect(screen.getByTestId("skeleton-shape")).toBeTruthy();
    expect(screen.queryByTestId("skeleton-sweep")).toBeNull();
  });
});

describe("screen skeletons stand in for their screen", () => {
  it("announces what is loading rather than leaving a silent grey page", async () => {
    await render(<OfferListSkeleton count={1} />);
    expect(screen.getByLabelText("Loading open offers")).toBeTruthy();
  });

  it("keeps a real cancel on a confirmation sheet that is still loading", async () => {
    // A sheet has no header, so this is the only labelled way out during the
    // wait. It has to be a working control, not another placeholder.
    await render(<ConfirmSheetSkeleton cancelLabel="Not yet" onCancel={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Not yet" })).toBeTruthy();
  });

  it("draws the named shapes", async () => {
    await render(
      <View>
        <SkeletonCircle size={32} />
        <SkeletonBlock height={120} />
      </View>,
    );
    expect(screen.getAllByTestId("skeleton-shape")).toHaveLength(2);
  });
});
