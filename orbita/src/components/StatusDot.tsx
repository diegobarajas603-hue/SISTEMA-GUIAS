import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

interface Props {
  color: string;
  size?: number;
  pulse?: boolean;
}

export function StatusDot({ color, size = 10, pulse = false }: Props) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = pulse ? withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false) : 0;
  }, [pulse, t]);
  const ring = useAnimatedStyle(() => ({
    opacity: pulse ? 0.55 * (1 - t.value) : 0,
    transform: [{ scale: 1 + t.value * 1.6 }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: color }, ring]} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: color }]} />
    </View>
  );
}
