import { useState } from "react";
import { Pressable as NativePressable, type GestureResponderEvent, type PressableProps } from "react-native";

/**
 * React Native's `Pressable`, for any pressable that carries a `className`
 * and also wants a `style={({ pressed }) => …}` function.
 *
 * On a phone, NativeWind (react-native-css) merges `className` and `style`
 * into one array, `[classStyle, styleFunction]`. React Native only calls
 * `style` when `style` is itself a function, so the function inside the array
 * is dropped: no pressed feedback, and any size, colour or opacity it set is
 * lost. Jest and Expo web do not go through that merge, so they still draw it
 * and only a phone shows the difference (issue report 8DC78D1F: here the 44×44
 * close buttons, the map's surface buttons and the busy dimming were lost).
 *
 * This keeps the pressed state itself and hands the native `Pressable` a plain
 * style object, which merges with `className` everywhere. Behaviour is
 * otherwise React Native's own: a disabled control never reports pressed, and
 * a press cancelled by a scroll ends on `onPressOut`.
 *
 * `components/__tests__/pressableStyle.test.tsx` fails if a pressable imported
 * from `react-native` pairs `className` with a style function again.
 */
export function Pressable({ style, onPressIn, onPressOut, ...rest }: PressableProps) {
  const [pressed, setPressed] = useState(false);

  if (typeof style !== "function") {
    return <NativePressable {...rest} onPressIn={onPressIn} onPressOut={onPressOut} style={style} />;
  }

  // Not an inline literal: Expo's web typings (pulled in by the generated
  // `expo-env.d.ts`) add a required `hovered`, and React Native's own type
  // has no such field, so a literal fails one of the two typechecks.
  const state = { pressed, hovered: false };

  return (
    <NativePressable
      {...rest}
      onPressIn={(event: GestureResponderEvent) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={style(state)}
    />
  );
}
