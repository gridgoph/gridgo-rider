import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { PanResponder, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import {
  hasEnoughInk,
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
};

/**
 * Handwritten signature capture.
 *
 * The fallback when the camera cannot run. Drawn on fixed white paper in fixed
 * dark ink in both themes: the PNG leaves the phone and has to stay readable
 * for whoever settles a dispute months later.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { height = 220, onSignedChange },
  ref,
) {
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [current, setCurrent] = useState<SignatureStroke>([]);
  const [width, setWidth] = useState(0);
  const canvasRef = useRef<View>(null);

  // The responder below is built once, so the callback reaches it by ref
  // rather than through a closure that would freeze on the first render.
  const onSignedChangeRef = useRef(onSignedChange);
  onSignedChangeRef.current = onSignedChange;

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
    setWidth(event.nativeEvent.layout.width);
  }

  const paths = [...strokes, current].map(strokeToPath).filter(Boolean);
  const empty = paths.length === 0;

  return (
    <View className="gap-2">
      <View
        ref={canvasRef}
        collapsable={false}
        onLayout={onLayout}
        style={{ height, backgroundColor: SIGNATURE_PAPER }}
        className="overflow-hidden rounded-field border border-outline"
        accessibilityLabel="Signature pad"
        accessibilityHint="Draw the recipient's signature with your finger"
        {...responder.panHandlers}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Rect x={0} y={0} width={width} height={height} fill={SIGNATURE_PAPER} />
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

      {empty ? (
        <Text className="text-caption text-text-muted">
          Hand the phone to the person receiving the package and ask them to sign above.
        </Text>
      ) : null}
    </View>
  );
});
