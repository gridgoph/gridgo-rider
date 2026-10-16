import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import {
  extendStroke,
  hasEnoughInk,
  scaleStrokes,
  SIGNATURE_BASELINE,
  SIGNATURE_INK,
  SIGNATURE_PAPER,
  SIGNATURE_STROKE_WIDTH,
  strokeToPath,
  type SignatureStroke,
} from "@/lib/signature";

export type SignaturePadHandle = {
  /** Render what is on the pad to a PNG file and return its URI. */
  toPngFile: () => Promise<string>;
  clear: () => void;
  /** Take back the last stroke. */
  undo: () => void;
};

type Props = {
  height?: number;
  /** Fired whenever the pad crosses the "this is actually a signature" line. */
  onSignedChange?: (signed: boolean) => void;
  /**
   * Strokes to start with — a draft restored after the app was killed — in
   * the coordinates of a pad `initialWidth` wide. Refitted to this pad's width.
   */
  initialStrokes?: SignatureStroke[];
  initialWidth?: number;
  /** Every completed stroke, with the pad width they were drawn at. */
  onStrokesChange?: (strokes: SignatureStroke[], width: number) => void;
  /** Who is being asked to sign, shown while the paper is blank. */
  hint?: string;
  /** Draw a form baseline — the hairline and cross a signature sits on. */
  baseline?: boolean;
  /** Who this pad is for, read out by assistive technology. */
  accessibilityHint?: string;
  /**
   * A finger went down on the paper (`true`) or came off it (`false`). The
   * screen holding the pad stops its own scroll in between, so a downstroke
   * draws instead of moving the page.
   */
  onDrawingChange?: (drawing: boolean) => void;
};

/**
 * Handwritten signature capture.
 *
 * Drawn on fixed white paper in fixed dark ink in both themes: the PNG leaves
 * the phone and has to stay readable for whoever settles a dispute months
 * later. Two places use it — the delivery fallback when the camera cannot run,
 * and the supplier's handoff signature at the shop counter.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  {
    height = 220,
    onSignedChange,
    initialStrokes,
    initialWidth,
    onStrokesChange,
    hint = "Hand the phone to the person receiving the package and ask them to sign above.",
    baseline = false,
    accessibilityHint = "Draw the recipient's signature with your finger",
    onDrawingChange,
  },
  ref,
) {
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [current, setCurrent] = useState<SignatureStroke>([]);
  const [width, setWidth] = useState(0);
  const [restored, setRestored] = useState(false);
  const canvasRef = useRef<View>(null);
  // The stroke under the finger, read and written by the gesture between
  // renders. State alone would hand each event the points as of the last
  // render, and a fast stroke outruns renders.
  const currentRef = useRef<SignatureStroke>([]);
  const strokesRef = useRef<SignatureStroke[]>([]);

  const onSignedChangeRef = useRef(onSignedChange);
  onSignedChangeRef.current = onSignedChange;
  const onStrokesChangeRef = useRef(onStrokesChange);
  onStrokesChangeRef.current = onStrokesChange;
  const onDrawingChangeRef = useRef(onDrawingChange);
  onDrawingChangeRef.current = onDrawingChange;
  const widthRef = useRef(0);

  function commitStrokes(next: SignatureStroke[]) {
    strokesRef.current = next;
    setStrokes(next);
    onSignedChangeRef.current?.(hasEnoughInk(next));
    onStrokesChangeRef.current?.(next, widthRef.current);
  }

  // A draft is refitted once the pad knows how wide it is, and only once:
  // a restored signature must not be re-applied over strokes drawn since.
  useEffect(() => {
    if (restored || width <= 0) return;
    setRestored(true);
    if (!initialStrokes?.length) return;
    const fitted = scaleStrokes(initialStrokes, initialWidth ?? width, width);
    strokesRef.current = fitted;
    setStrokes(fitted);
    onSignedChangeRef.current?.(hasEnoughInk(fitted));
  }, [restored, width, initialStrokes, initialWidth]);

  // A Gesture Handler pan rather than a PanResponder. A PanResponder is
  // granted on the JS thread, and on Android the page's native scroll view
  // decides on the UI thread: a downstroke that crossed the touch slop before
  // JS answered went to the scroll, so the page moved and the stroke broke
  // off. This pan is decided natively and activates on the first movement, so
  // the scroll never gets the finger. `onFinalize` closes the stroke however
  // the gesture ends, so a tap still leaves its dot.
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .runOnJS(true)
        .onBegin((event) => {
          currentRef.current = [{ x: event.x, y: event.y }];
          setCurrent(currentRef.current);
          onDrawingChangeRef.current?.(true);
        })
        .onUpdate((event) => {
          const next = extendStroke(currentRef.current, {
            x: event.x,
            y: event.y,
          });
          if (next === currentRef.current) return;
          currentRef.current = next;
          setCurrent(next);
        })
        .onFinalize(() => {
          const points = currentRef.current;
          currentRef.current = [];
          setCurrent([]);
          onDrawingChangeRef.current?.(false);
          if (points.length) commitStrokes([...strokesRef.current, points]);
        })
        .withTestId("signature-pad"),
    // The handlers reach every callback through a ref, so one gesture serves
    // the pad's whole life.
    [],
  );

  useImperativeHandle(ref, () => ({
    clear: () => {
      currentRef.current = [];
      setCurrent([]);
      commitStrokes([]);
    },
    undo: () => {
      if (!strokesRef.current.length) return;
      commitStrokes(strokesRef.current.slice(0, -1));
    },
    toPngFile: async () => {
      if (!canvasRef.current) throw new Error("signature_pad_not_ready");
      return captureRef(canvasRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
    },
  }));

  function onLayout(event: LayoutChangeEvent) {
    widthRef.current = event.nativeEvent.layout.width;
    setWidth(event.nativeEvent.layout.width);
  }

  // Finished strokes are drawn once; only the one under the finger is
  // rebuilt as it moves.
  const donePaths = useMemo(() => strokes.map(strokeToPath).filter(Boolean), [strokes]);
  const currentPath = strokeToPath(current);
  const paths = currentPath ? [...donePaths, currentPath] : donePaths;
  const empty = paths.length === 0;
  // Where a signature sits on a form: low on the paper, inset from both edges.
  const baselineY = Math.round(height * 0.72);
  const baselineInset = 24;

  return (
    <View className="gap-2">
      <GestureDetector gesture={gesture}>
        <View
          ref={canvasRef}
          collapsable={false}
          onLayout={onLayout}
          style={{ height, backgroundColor: SIGNATURE_PAPER }}
          className="overflow-hidden rounded-field border border-outline"
          accessible
          accessibilityLabel="Signature pad"
          accessibilityHint={accessibilityHint}
        >
          {width > 0 ? (
            // The paper, not the ink, is what the finger touches, so every
            // sample is measured against the pad rather than a stroke under it.
            <Svg width={width} height={height} pointerEvents="none">
              <Rect x={0} y={0} width={width} height={height} fill={SIGNATURE_PAPER} />
              {baseline ? (
                <>
                  <Line
                    x1={baselineInset}
                    y1={baselineY}
                    x2={width - baselineInset}
                    y2={baselineY}
                    stroke={SIGNATURE_BASELINE}
                    strokeWidth={1}
                  />
                  <Path
                    d={`M${baselineInset} ${baselineY - 10} l6 6 m0 -6 l-6 6`}
                    stroke={SIGNATURE_BASELINE}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    fill="none"
                  />
                </>
              ) : null}
              {paths.map((d, index) => (
                <Path
                  key={index}
                  d={d}
                  stroke={SIGNATURE_INK}
                  strokeWidth={SIGNATURE_STROKE_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </Svg>
          ) : null}
        </View>
      </GestureDetector>

      {empty ? <Text className="text-caption text-text-muted">{hint}</Text> : null}
    </View>
  );
});
