import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PanResponder, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import {
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
  },
  ref,
) {
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [current, setCurrent] = useState<SignatureStroke>([]);
  const [width, setWidth] = useState(0);
  const [restored, setRestored] = useState(false);
  const canvasRef = useRef<View>(null);

  // The responder below is built once, so the callbacks reach it by ref
  // rather than through a closure that would freeze on the first render.
  const onSignedChangeRef = useRef(onSignedChange);
  onSignedChangeRef.current = onSignedChange;
  const onStrokesChangeRef = useRef(onStrokesChange);
  onStrokesChangeRef.current = onStrokesChange;
  const widthRef = useRef(0);

  // A draft is refitted once the pad knows how wide it is, and only once:
  // a restored signature must not be re-applied over strokes drawn since.
  useEffect(() => {
    if (restored || width <= 0) return;
    setRestored(true);
    if (!initialStrokes?.length) return;
    const fitted = scaleStrokes(initialStrokes, initialWidth ?? width, width);
    setStrokes(fitted);
    onSignedChangeRef.current?.(hasEnoughInk(fitted));
  }, [restored, width, initialStrokes, initialWidth]);

  // PanResponder is created once; the handlers read the latest state through
  // the setter callbacks rather than closing over a stale render.
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The pad is inside a ScrollView; claiming the gesture keeps a slow
      // downstroke from scrolling the page instead of drawing.
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        setCurrent([{ x: locationX, y: locationY }]);
      },
      onPanResponderMove: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        setCurrent((points) => [...points, { x: locationX, y: locationY }]);
      },
      onPanResponderRelease: () => {
        setCurrent((points) => {
          if (points.length) {
            setStrokes((all) => {
              const next = [...all, points];
              onSignedChangeRef.current?.(hasEnoughInk(next));
              onStrokesChangeRef.current?.(next, widthRef.current);
              return next;
            });
          }
          return [];
        });
      },
    }),
  ).current;

  useImperativeHandle(ref, () => ({
    clear: () => {
      setStrokes([]);
      setCurrent([]);
      onSignedChangeRef.current?.(false);
      onStrokesChangeRef.current?.([], widthRef.current);
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

  const paths = [...strokes, current].map(strokeToPath).filter(Boolean);
  const empty = paths.length === 0;
  // Where a signature sits on a form: low on the paper, inset from both edges.
  const baselineY = Math.round(height * 0.72);
  const baselineInset = 24;

  return (
    <View className="gap-2">
      <View
        ref={canvasRef}
        collapsable={false}
        onLayout={onLayout}
        style={{ height, backgroundColor: SIGNATURE_PAPER }}
        className="overflow-hidden rounded-field border border-outline"
        accessibilityLabel="Signature pad"
        accessibilityHint={accessibilityHint}
        {...responder.panHandlers}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
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

      {empty ? <Text className="text-caption text-text-muted">{hint}</Text> : null}
    </View>
  );
});
