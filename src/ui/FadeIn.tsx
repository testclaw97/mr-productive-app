// A gentle entrance: fade up + settle. Wrap any view to give it a calm arrival instead
// of a hard cut. Reused by onboarding steps (re-keyed per step so each one animates in)
// and by tab pages. Pure Animated (native driver — opacity + translateY only).
import React, { useEffect, useRef } from "react";
import { Animated, StyleProp, ViewStyle } from "react-native";

export default function FadeIn({
  children,
  style,
  delay = 0,
  distance = 12,
  duration = 340,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  distance?: number;
  duration?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay,
        useNativeDriver: true,
        speed: 12,
        bounciness: 4,
      }),
    ]).start();
  }, [opacity, translateY, delay, duration]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
