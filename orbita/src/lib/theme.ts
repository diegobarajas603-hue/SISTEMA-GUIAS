import { Platform } from 'react-native';

export const colors = {
  bg: '#07080D',
  bgElevated: '#0E1018',
  surface: 'rgba(20, 22, 32, 0.72)',
  surfaceSolid: '#141620',
  surfaceHigh: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.09)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  text: '#F4F6FF',
  textDim: '#A3ABC2',
  textMuted: '#646C84',
  primary: '#7C5CFF',
  primarySoft: 'rgba(124, 92, 255, 0.18)',
  accent: '#22D3EE',
  accentSoft: 'rgba(34, 211, 238, 0.16)',
  success: '#34D399',
  successSoft: 'rgba(52, 211, 153, 0.16)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251, 191, 36, 0.16)',
  danger: '#FF4D6D',
  dangerSoft: 'rgba(255, 77, 109, 0.16)',
  offline: '#4B5263',
  overlay: 'rgba(3, 4, 8, 0.6)',
} as const;

export const gradients = {
  primary: ['#8B6CFF', '#5B3DF5'] as const,
  accent: ['#3BE3F7', '#7C5CFF'] as const,
  danger: ['#FF6B85', '#E11D48'] as const,
  screen: ['#0B0D16', '#07080D'] as const,
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 30, letterSpacing: -0.6, color: colors.text },
  title: { fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.3, color: colors.text },
  heading: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  body: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  bodyDim: { fontFamily: fonts.medium, fontSize: 14, color: colors.textDim },
  caption: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted },
  overline: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 13,
    color: colors.textDim,
  },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  }),
} as const;

/** Colores disponibles para perfiles y círculos. */
export const palette = ['#7C5CFF', '#22D3EE', '#34D399', '#F472B6', '#FBBF24', '#60A5FA', '#F87171', '#A78BFA'];
