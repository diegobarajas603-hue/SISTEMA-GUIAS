import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/IconButton';
import { colors, gradients, type } from '@/lib/theme';

import { OrbitLogo } from './OrbitLogo';

export function AuthShell({ title, subtitle, children, back, logo = true }: { title: string; subtitle?: string; children: ReactNode; back?: boolean; logo?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <View style={styles.glow} />
      <View style={styles.glow2} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {back ? <IconButton icon={ChevronLeft} label="Regresar" size={42} onPress={() => router.back()} /> : null}
          <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
            {logo ? <OrbitLogo size={64} /> : null}
            <Text style={[type.display, { marginTop: logo ? 22 : 4 }]}>{title}</Text>
            {subtitle ? <Text style={[type.bodyDim, { marginTop: 8, lineHeight: 21 }]}>{subtitle}</Text> : null}
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={{ gap: 16 }}>
            {children}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  glow: { position: 'absolute', top: -120, left: -80, width: 360, height: 360, borderRadius: 180, backgroundColor: 'rgba(124,92,255,0.20)' },
  glow2: { position: 'absolute', bottom: -160, right: -120, width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(34,211,238,0.08)' },
  content: { paddingHorizontal: 24, gap: 28, flexGrow: 1 },
  header: { marginTop: 24 },
});
