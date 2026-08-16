// A pressable that gives tactile feedback — a gentle scale-down + dim on press-in,
// springing back on release. The one micro-interaction reused everywhere a tap happens,
// so every button/chip/row feels physical without repeating Animated wiring per screen.
//
// SHARED-SAFE: pure react-native Animated (useNativeDriver — transform/opacity only),
// no extra deps. Renders identically on web (react-native-web animates the transform)
// and native.
import React, { useRef } from "react";
import {
  AccessibilityRole,
  Animated,
  Pressable,
  StyleProp,
  ViewStyle,
} from "react-native";

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** How far to scale on press-in (default 0.96). */
  scaleTo?: number;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean };
  testID?: string;
  hitSlop?: number;
}

export default function PressableScale({
  children,
  onPress,
  disabled,
  style,
  scaleTo = 0.96,
  accessibilityRole,
  accessibilityLabel,
  accessibilityState,
  testID,
  hitSlop,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animate = (toScale: number, toOpacity: number) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: toScale,
        useNativeDriver: true,
        speed: 40,
        bounciness: 0,
      }),
      Animated.timing(opacity, {
        toValue: toOpacity,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animate(scaleTo, 0.85)}
      onPressOut={() => animate(1, 1)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      testID={testID}
      hitSlop={hitSlop}
    >
      <Animated.View style={[style, { transform: [{ scale }], opacity }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
