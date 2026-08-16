// The Mr. Productive mascot — the packaged app icon (the upward chevron), presented in a
// soft accent-glow disc. One component so the brand face is identical on the onboarding
// hero, the boot splash, and anywhere else it appears. A static bundled asset via
// require(): carries no user data, never becomes markup.
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { colors, radius } from "../theme";

const MASCOT = require("../../assets/icon.png");

export default function Mascot({ size = 96 }: { size?: number }) {
  const ring = size + Math.round(size * 0.42);
  return (
    <View
      style={[
        styles.halo,
        {
          width: ring,
          height: ring,
          borderRadius: ring / 2,
        },
      ]}
    >
      <Image
        source={MASCOT}
        style={{ width: size, height: size, borderRadius: radius.xxl }}
        accessibilityLabel="Mr. Productive"
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentLine,
  },
});
