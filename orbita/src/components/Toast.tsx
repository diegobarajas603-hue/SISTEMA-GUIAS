import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/lib/theme';
import { useToast } from '@/store/toast';

import { Glass } from './Glass';

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle } as const;
const TONES = { info: colors.accent, success: colors.success, warning: colors.warning, danger: colors.danger } as const;

export function ToastHost() {
  const { message, tone, key, hide } = useToast();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 3200);
    return () => clearTimeout(t);
  }, [message, key, hide]);

  if (!message) return null;
  const Icon = ICONS[tone];
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Animated.View key={key} entering={FadeInUp.springify().damping(16)} exiting={FadeOutUp}>
        <Glass radius={18} style={styles.toast}>
          <View style={styles.row}>
            <Icon size={18} color={TONES[tone]} />
            <Text style={styles.text}>{message}</Text>
          </View>
        </Glass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 1000 },
  toast: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  text: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
});
