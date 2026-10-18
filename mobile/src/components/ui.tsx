import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, radius, shadows, spacing, text } from '../theme/tokens';

export const centredContent = {
  width: '100%' as const,
  maxWidth: layout.maxContentWidth,
  alignSelf: 'center' as const,
};

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */
export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: React.ReactElement<typeof RefreshControl>;
  contentStyle?: ViewStyle;
  avoidKeyboard?: boolean;
  footer?: React.ReactNode;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  refreshControl,
  contentStyle,
  avoidKeyboard = false,
  footer,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        centredContent,
        padded && { paddingHorizontal: layout.screenPadding },
        { paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, centredContent, padded && { paddingHorizontal: layout.screenPadding }, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {body}
          {footer}
        </KeyboardAvoidingView>
      ) : (
        <>
          {body}
          {footer}
        </>
      )}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* App bar                                                                    */
/* -------------------------------------------------------------------------- */
export function AppBar({
  title,
  subtitle,
  onBack,
  right,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={[styles.appBar, compact && { paddingBottom: spacing.xs }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
      ) : null}
      <View style={styles.flex}>
        <Text style={text.h1} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={[text.small, { color: colors.muted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}) {
  const palette = {
    primary: { bg: colors.mint600, fg: colors.white, border: colors.mint600 },
    secondary: { bg: colors.white, fg: colors.inkSoft, border: colors.line },
    ghost: { bg: 'transparent', fg: colors.mint700, border: 'transparent' },
    danger: { bg: colors.danger, fg: colors.white, border: colors.danger },
    soft: { bg: colors.mint100, fg: colors.mint700, border: colors.mint100 },
  }[variant];

  const sizing = {
    sm: { height: 38, paddingHorizontal: 12, font: text.small },
    md: { height: 48, paddingHorizontal: 18, font: text.body },
    lg: { height: 54, paddingHorizontal: 22, font: text.h3 },
  }[size];

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          height: sizing.height,
          paddingHorizontal: sizing.paddingHorizontal,
          opacity: disabled ? 0.5 : pressed ? 0.86 : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={palette.fg} /> : null}
          <Text style={[sizing.font, { color: palette.fg, fontWeight: '700' }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  active = false,
  size = 40,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  active?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        active && { backgroundColor: colors.mint100, borderColor: colors.mint200 },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.46)} color={active ? colors.mint700 : colors.inkSoft} />
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */
export function Card({
  children,
  onPress,
  style,
  tone = 'default',
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  tone?: 'default' | 'mint' | 'peach' | 'sky';
}) {
  const background = { default: colors.white, mint: colors.mint50, peach: colors.peachSoft, sky: colors.skySoft }[tone];
  const content = <View style={[styles.card, { backgroundColor: background }, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  caption,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  caption?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flex}>
        <Text style={text.h3}>{title}</Text>
        {caption ? <Text style={[text.tiny, { color: colors.muted }]}>{caption}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={[text.small, { color: colors.mint700, fontWeight: '700' }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.sm }} />;
}

/* -------------------------------------------------------------------------- */
/* Badges & chips                                                             */
/* -------------------------------------------------------------------------- */
export function Badge({
  label,
  tone = 'mint',
  icon,
}: {
  label: string;
  tone?: 'mint' | 'peach' | 'sky' | 'neutral' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const palette = {
    mint: { bg: colors.mint100, fg: colors.mint700 },
    peach: { bg: colors.peachSoft, fg: colors.peachInk },
    sky: { bg: colors.skySoft, fg: colors.skyInk },
    neutral: { bg: '#F3F6F5', fg: colors.inkSoft },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={palette.fg} /> : null}
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  emoji,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  emoji?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: colors.mint600, borderColor: colors.mint600 },
        pressed && !disabled && styles.pressed,
        disabled && { opacity: 0.55 },
      ]}
    >
      {emoji ? <Text style={{ fontSize: 13 }}>{emoji}</Text> : null}
      <Text
        style={[
          text.tiny,
          { color: selected ? colors.white : colors.inkSoft, fontWeight: '700' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */
export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  rightSlot?: React.ReactNode;
}

export function TextField({ label, error, hint, icon, rightSlot, ...inputProps }: TextFieldProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View
        style={[
          styles.inputShell,
          focused && { borderColor: colors.mint400, backgroundColor: colors.white },
          error ? { borderColor: colors.danger, backgroundColor: colors.dangerSoft } : null,
        ]}
      >
        {icon ? <Ionicons name={icon} size={18} color={focused ? colors.mint600 : colors.muted} /> : null}
        <TextInput
          {...inputProps}
          style={styles.input}
          placeholderTextColor={colors.muted}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          accessibilityLabel={label ?? inputProps.placeholder}
        />
        {rightSlot}
      </View>
      {error ? (
        <Text style={[text.tiny, { color: colors.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[text.tiny, { color: colors.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.segment,
              size === 'sm' && { paddingVertical: 6 },
              selected && styles.segmentSelected,
              pressed && styles.pressed,
            ]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={13}
                color={selected ? colors.mint700 : colors.muted}
              />
            ) : null}
            <Text
              style={[
                text.tiny,
                { color: selected ? colors.mint700 : colors.muted, fontWeight: selected ? '800' : '600' },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
}) {
  return (
    <View style={styles.stepper}>
      {label ? <Text style={[text.small, { color: colors.inkSoft, fontWeight: '600' }]}>{label}</Text> : null}
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel="Fewer recommendations"
          style={({ pressed }) => [styles.stepperButton, (pressed || value <= min) && { opacity: 0.45 }]}
        >
          <Ionicons name="remove" size={16} color={colors.mint700} />
        </Pressable>
        <Text style={[text.bodyStrong, { minWidth: 26, textAlign: 'center' }]}>{value}</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel="More recommendations"
          style={({ pressed }) => [styles.stepperButton, (pressed || value >= max) && { opacity: 0.45 }]}
        >
          <Ionicons name="add" size={16} color={colors.mint700} />
        </Pressable>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.state} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.mint600} />
      <Text style={[text.small, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  emoji = '🌱',
  title,
  message,
  actionLabel,
  onAction,
}: {
  emoji?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.state}>
      <Text style={{ fontSize: 40 }} accessible={false}>
        {emoji}
      </Text>
      <Text style={[text.h3, { textAlign: 'center' }]}>{title}</Text>
      {message ? (
        <Text style={[text.small, { color: colors.muted, textAlign: 'center', maxWidth: 320 }]}>{message}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="soft" size="sm" style={{ marginTop: spacing.sm }} />
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.state}>
      <Text style={{ fontSize: 36 }} accessible={false}>
        ⚠️
      </Text>
      <Text style={[text.h3, { textAlign: 'center' }]}>Something went wrong</Text>
      <Text style={[text.small, { color: colors.muted, textAlign: 'center', maxWidth: 340 }]}>{message}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" size="sm" icon="refresh" /> : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Bottom sheet                                                               */
/* -------------------------------------------------------------------------- */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={text.h2}>{title}</Text>
            <IconButton icon="close" onPress={onClose} label="Close" />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.lg }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */
export function Avatar({
  emoji,
  size = 44,
  ring = false,
  dimmed = false,
}: {
  emoji: string;
  size?: number;
  ring?: boolean;
  dimmed?: boolean;
}) {
  const fontSize = useMemo(() => Math.round(size * 0.5), [size]);
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: dimmed ? 0.55 : 1,
        },
        ring && { borderWidth: 2, borderColor: colors.mint500 },
      ]}
      accessible={false}
    >
      <Text style={{ fontSize }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.canvas },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.72 },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  fullWidth: { alignSelf: 'stretch' },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },

  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    ...shadows.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { ...text.tiny, fontWeight: '800' },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },

  fieldLabel: { ...text.tiny, color: colors.inkSoft, fontWeight: '700' },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  input: {
    ...text.body,
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    color: colors.ink,
  },

  segmented: {
    flexDirection: 'row',
    backgroundColor: '#EDF4F1',
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  segmentSelected: {
    backgroundColor: colors.white,
    ...shadows.card,
  },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.mint100,
    alignItems: 'center',
    justifyContent: 'center',
  },

  state: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },

  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    maxHeight: '86%',
    gap: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    marginBottom: spacing.xs,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  avatar: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
