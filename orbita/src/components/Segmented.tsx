import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, radius } from '@/lib/theme';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = width / options.length;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withSpring(index * segment, { damping: 20, stiffness: 220 });
  }, [index, segment, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 8)}>
      {width > 0 ? <Animated.View style={[styles.thumb, { width: segment }, thumb]} /> : null}
      {options.map((o) => (
        <Pressable key={o.value} style={styles.item} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: o.value === value }}>
          <Text style={[styles.label, o.value === value && styles.active]} numberOfLines={1}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.45)',
  },
  item: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.textDim },
  active: { color: colors.text },
});
