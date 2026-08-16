// Onboarding progress dots — the Zeigarnik nudge: a visible "you're N of M through this"
// that pulls the user to finish. The active dot widens into a pill and takes the accent;
// the rest stay small and dim. Animated width/color so advancing feels alive.
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors, radius } from "../theme";

export default function ProgressDots({
  total,
  index,
}: {
  total: number;
  index: number;
}) {
  return (
    <View style={styles.row} accessibilityLabel={`Step ${index + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <Dot key={i} active={i === index} done={i < index} />
      ))}
    </View>
  );
}

function Dot({ active, done }: { active: boolean; done: boolean }) {
  const w = useRef(new Animated.Value(active ? 22 : 7)).current;

  useEffect(() => {
    Animated.spring(w, {
      toValue: active ? 22 : 7,
      useNativeDriver: false, // width can't use the native driver
      speed: 20,
      bounciness: 6,
    }).start();
  }, [active, w]);

  return (
    <Animated.View
      style={[
        styles.dot,
        { width: w },
        active ? styles.active : done ? styles.done : styles.idle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { height: 7, borderRadius: radius.pill },
  active: { backgroundColor: colors.accent },
  done: { backgroundColor: colors.accentLine },
  idle: { backgroundColor: colors.lineStrong },
});
