import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

import { fonts } from '@/lib/theme';

import { PressableScale } from './PressableScale';

function Ring({ delay, size }: { delay: number; size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) }), -1, false));
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - t.value), transform: [{ scale: 1 + t.value * 0.7 }] }));
  return <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

export function SosButton({ onPress, active, size = 200 }: { onPress: () => void; active?: boolean; size?: number }) {
  return (
    <View style={[styles.wrap, { width: size * 1.7, height: size * 1.7 }]}>
      <Ring delay={0} size={size} />
      <Ring delay={800} size={size} />
      <Ring delay={1600} size={size} />
      <PressableScale onPress={onPress} haptic="heavy" scaleTo={0.93} accessibilityRole="button" accessibilityLabel="Activar alerta SOS">
        <LinearGradient colors={['#FF6B85', '#E11D48', '#9F1239']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}>
          <View style={[styles.inner, { width: size - 22, height: size - 22, borderRadius: size }]}>
            <Text style={styles.sos}>SOS</Text>
            <Text style={styles.hint}>{active ? 'Alerta activa' : 'Toca para pedir ayuda'}</Text>
          </View>
        </LinearGradient>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  ring: { position: 'absolute', backgroundColor: 'rgba(255, 77, 109, 0.5)' },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF4D6D',
    shadowOpacity: 0.7,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  inner: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  sos: { color: '#fff', fontFamily: fonts.extrabold, fontSize: 52, letterSpacing: 4 },
  hint: { color: 'rgba(255,255,255,0.85)', fontFamily: fonts.bold, fontSize: 12.5, marginTop: 2 },
});
