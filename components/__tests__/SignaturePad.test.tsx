import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { MIN_SIGNATURE_INK, type SignatureStroke } from "@/lib/signature";

/**
 * The pad's own gesture, driven through Gesture Handler's test harness: a
 * finger down, a run of moves, and up. What a screen relies on is that the
 * whole run becomes one stroke, that the page is told to hold still for the
 * length of it, and that a stroke can be taken back.
 */

const WIDTH = 320;

async function renderPad(props: Partial<React.ComponentProps<typeof SignaturePad>> = {}) {
  const ref = createRef<SignaturePadHandle>();
  const onStrokesChange = jest.fn<void, [SignatureStroke[], number]>();
  const onSignedChange = jest.fn<void, [boolean]>();
  const onDrawingChange = jest.fn<void, [boolean]>();
  await render(
    <SignaturePad
      ref={ref}
      onStrokesChange={onStrokesChange}
      onSignedChange={onSignedChange}
      onDrawingChange={onDrawingChange}
      {...props}
    />,
  );
  await fireEvent(screen.getByLabelText("Signature pad"), "layout", {
    nativeEvent: { layout: { width: WIDTH, height: 220, x: 0, y: 0 } },
  });
  return { ref, onStrokesChange, onSignedChange, onDrawingChange };
}

/** One finger stroke: down at the first point, through the rest, and up. */
async function draw(points: { x: number; y: number }[]) {
  const [first, ...rest] = points;
  await act(async () => {
    fireGestureHandler(getByGestureTestId("signature-pad"), [
      { state: State.BEGAN, x: first!.x, y: first!.y },
      { state: State.ACTIVE, x: first!.x, y: first!.y },
      ...rest.map((p) => ({ x: p.x, y: p.y })),
      { state: State.END, x: rest.at(-1)?.x ?? first!.x, y: rest.at(-1)?.y ?? first!.y },
    ]);
  });
}

function line(from: number, to: number, y = 100) {
  const points = [];
  for (let x = from; x <= to; x += 10) points.push({ x, y });
  return points;
}

describe("SignaturePad", () => {
  it("takes the finger on first contact and keeps it if the stroke runs off the paper", async () => {
    await renderPad();
    // Activating on the first movement is what beats the page's own scroll
    // to the finger; one pointer, so a resting palm does not join the stroke.
    expect(getByGestureTestId("signature-pad").config).toMatchObject({
      minDist: 0,
      maxPointers: 1,
      shouldCancelWhenOutside: false,
    });
  });

  it("records a whole finger run as one stroke, at the pad's width", async () => {
    const { onStrokesChange } = await renderPad();
    await draw(line(20, 200));

    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    const [strokes, width] = onStrokesChange.mock.calls[0]!;
    expect(width).toBe(WIDTH);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]![0]).toEqual({ x: 20, y: 100 });
    expect(strokes[0]!.at(-1)).toEqual({ x: 200, y: 100 });
  });

  it("tells the screen the pen is down for exactly the length of the stroke", async () => {
    const { onDrawingChange } = await renderPad();
    await draw(line(20, 60));
    expect(onDrawingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("drops jitter from a finger resting on the glass", async () => {
    const { onStrokesChange } = await renderPad();
    await draw([
      { x: 50, y: 50 },
      { x: 50.4, y: 50.3 },
      { x: 50.2, y: 49.8 },
      { x: 80, y: 50 },
    ]);
    expect(onStrokesChange.mock.calls[0]![0][0]).toEqual([
      { x: 50, y: 50 },
      { x: 80, y: 50 },
    ]);
  });

  it("keeps a tap as a dot, which is ink but not a signature", async () => {
    const { onStrokesChange, onSignedChange } = await renderPad();
    await draw([{ x: 30, y: 30 }]);
    expect(onStrokesChange.mock.calls[0]![0]).toEqual([[{ x: 30, y: 30 }]]);
    expect(onSignedChange).toHaveBeenLastCalledWith(false);
  });

  it("calls it signed once there is enough ink, and undo takes back only the last stroke", async () => {
    const { ref, onStrokesChange, onSignedChange } = await renderPad();
    await draw(line(10, 10 + MIN_SIGNATURE_INK));
    expect(onSignedChange).toHaveBeenLastCalledWith(true);
    await draw(line(10, 60, 150));
    expect(onStrokesChange.mock.calls.at(-1)![0]).toHaveLength(2);

    await act(async () => ref.current?.undo());
    expect(onStrokesChange.mock.calls.at(-1)![0]).toHaveLength(1);
    expect(onSignedChange).toHaveBeenLastCalledWith(true);

    await act(async () => ref.current?.undo());
    expect(onStrokesChange.mock.calls.at(-1)![0]).toEqual([]);
    expect(onSignedChange).toHaveBeenLastCalledWith(false);
  });

  it("clears everything", async () => {
    const { ref, onStrokesChange, onSignedChange } = await renderPad();
    await draw(line(10, 200));
    await draw(line(10, 200, 150));
    await act(async () => ref.current?.clear());
    expect(onStrokesChange.mock.calls.at(-1)![0]).toEqual([]);
    expect(onSignedChange).toHaveBeenLastCalledWith(false);
  });

  it("draws on top of a restored draft rather than replacing it", async () => {
    const restored: SignatureStroke[] = [line(10, 200)];
    const { onStrokesChange } = await renderPad({ initialStrokes: restored, initialWidth: WIDTH });
    await draw(line(10, 60, 150));
    expect(onStrokesChange.mock.calls.at(-1)![0]).toHaveLength(2);
  });
});
