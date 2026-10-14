import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { colors, spacing, type } from '@/lib/theme';

import { Button } from './Button';
import { Glass } from './Glass';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  icon?: LucideIcon;
  tone?: 'primary' | 'danger';
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Tocar fuera / botón atrás. Por defecto, igual que cancelar. */
  onDismiss?: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({ visible, title, message, icon: Icon, tone = 'primary', confirmLabel, cancelLabel = 'Cancelar', loading, onConfirm, onCancel, onDismiss, children }: Props) {
  const accent = tone === 'danger' ? colors.danger : colors.primary;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss ?? onCancel} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss ?? onCancel} />
        <Animated.View entering={ZoomIn.springify().damping(18)} style={styles.center}>
          <Glass radius={28} intensity={60} style={styles.card}>
            <View style={styles.body}>
              {Icon ? (
                <View style={[styles.icon, { backgroundColor: `${accent}26` }]}>
                  <Icon size={28} color={accent} strokeWidth={2.2} />
                </View>
              ) : null}
              <Text style={[type.title, { textAlign: 'center' }]}>{title}</Text>
              {message ? <Text style={[type.bodyDim, { textAlign: 'center', lineHeight: 21 }]}>{message}</Text> : null}
              {children}
              <View style={{ gap: 10, alignSelf: 'stretch', marginTop: 8 }}>
                <Button title={confirmLabel} variant={tone === 'danger' ? 'danger' : 'primary'} onPress={onConfirm} loading={loading} />
                <Button title={cancelLabel} variant="ghost" onPress={onCancel} />
              </View>
            </View>
          </Glass>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.xl },
  center: { width: '100%' },
  card: {},
  body: { padding: 24, gap: 12, alignItems: 'center' },
  icon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
