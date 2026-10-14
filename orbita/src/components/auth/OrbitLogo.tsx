import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

/** Isotipo de Órbita: un punto (la persona) dentro de dos anillos (su círculo). */
export function OrbitLogo({ size = 56 }: { size?: number }) {
  return (
    <LinearGradient colors={['#8B6CFF', '#22D3EE']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.box, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <View style={[styles.ring, { width: size * 0.66, height: size * 0.66, borderRadius: size }]} />
      <View style={[styles.ring, { width: size * 0.4, height: size * 0.4, borderRadius: size, opacity: 0.9 }]} />
      <View style={[styles.dot, { width: size * 0.14, height: size * 0.14, borderRadius: size }]} />
      <View style={[styles.sat, { width: size * 0.1, height: size * 0.1, borderRadius: size, top: size * 0.16, right: size * 0.2 }]} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)' },
  dot: { backgroundColor: '#fff' },
  sat: { position: 'absolute', backgroundColor: colors.bg },
});
