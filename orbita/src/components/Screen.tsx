import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gradients, spacing, type } from '@/lib/theme';

import { IconButton } from './IconButton';

interface Props {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  back?: boolean;
  right?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}

/** Contenedor base: fondo con degradado sutil, cabecera y área segura. */
export function Screen({ title, subtitle, children, back = true, right, scroll = true, contentStyle, footer }: Props) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + (footer ? 110 : 32) }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1, paddingBottom: insets.bottom }, contentStyle]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <View style={styles.glowA} />
      <View style={styles.glowB} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          {back ? (
            <IconButton icon={ChevronLeft} label="Regresar" size={42} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          ) : (
            <View style={{ width: 42 }} />
          )}
          <View style={{ flex: 1 }} />
          {right}
        </View>
        {title ? (
          <View style={styles.titleWrap}>
            <Text style={type.display}>{title}</Text>
            {subtitle ? <Text style={[type.bodyDim, { marginTop: 6 }]}>{subtitle}</Text> : null}
          </View>
        ) : null}
        {body}
        {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  glowA: {
    position: 'absolute',
    top: -140,
    right: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(124, 92, 255, 0.16)',
  },
  glowB: {
    position: 'absolute',
    top: 180,
    left: -160,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(34, 211, 238, 0.06)',
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: 4 },
  titleWrap: { paddingHorizontal: spacing.xl, paddingTop: 10, paddingBottom: 14 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    backgroundColor: 'rgba(7, 8, 13, 0.92)',
  },
});
