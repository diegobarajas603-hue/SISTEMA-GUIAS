import type { LucideIcon } from 'lucide-react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, radius } from '@/lib/theme';

interface Props extends TextInputProps {
  label?: string;
  icon?: LucideIcon;
  error?: string | null;
  hint?: string;
}

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, icon: Icon, error, hint, secureTextEntry, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, { borderColor }, focused && styles.focused]}>
        {Icon ? <Icon size={18} color={focused ? colors.primary : colors.textMuted} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          secureTextEntry={hidden}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}>
            {hidden ? <Eye size={18} color={colors.textMuted} /> : <EyeOff size={18} color={colors.textMuted} />}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textDim, marginLeft: 4 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
  },
  focused: { backgroundColor: 'rgba(124, 92, 255, 0.07)' },
  input: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 16, height: '100%' },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13, marginLeft: 4 },
  hint: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12, marginLeft: 4 },
});
