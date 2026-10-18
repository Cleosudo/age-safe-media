import { Platform, TextStyle } from 'react-native';

/**
 * Design tokens shared by every screen.
 * Keep the palette in sync with backend/app/static/css/admin.css.
 */
export const colors = {
  mint50: '#F2FBF8',
  mint100: '#DDF2EA',
  mint200: '#C2E8DB',
  mint300: '#9FD8C6',
  mint400: '#6FC0A8',
  mint500: '#45A08A',
  mint600: '#368A75',
  mint700: '#2C7563',
  mint900: '#123B33',

  peach: '#FFC9A8',
  peachSoft: '#FFE9DC',
  peachInk: '#9A4F27',
  sky: '#CFE8FF',
  skySoft: '#EAF5FF',
  skyInk: '#2B5D8A',
  lemon: '#FFF3C4',
  lilac: '#E7DEFD',
  rose: '#FFD9E0',

  ink: '#1D2B27',
  inkSoft: '#3B4D47',
  muted: '#6B7F79',
  line: '#E2ECE8',
  surface: '#FFFFFF',
  canvas: '#F5F9F7',
  scrim: 'rgba(13, 40, 34, 0.42)',

  danger: '#D1483F',
  dangerSoft: '#FDECEB',
  success: '#2F855A',
  successSoft: '#E7F6EE',
  warning: '#B7791F',
  warningSoft: '#FDF5E3',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

export const text = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6 },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4 },
  h2: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  small: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  tiny: { fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6 },
} as const satisfies Record<string, TextStyle>;

const softShadow = (opacity: number, radius: number, offsetY: number) => ({
  shadowColor: '#123B33',
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: offsetY },
});

/**
 * React Native shadow presets. Android uses elevation, iOS and web use the
 * shadow* props (react-native-web maps them to box-shadow).
 */
export const shadows = {
  card: Platform.OS === 'android' ? { elevation: 2 } : softShadow(0.07, 16, 6),
  floating: Platform.OS === 'android' ? { elevation: 8 } : softShadow(0.16, 22, 10),
} as const;

export const layout = {
  screenPadding: spacing.lg,
  maxContentWidth: 720,
} as const;

export const gradients = {
  chatUser: [colors.mint600, colors.mint500] as const,
  hero: [colors.mint100, colors.skySoft] as const,
} as const;
