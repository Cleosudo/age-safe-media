import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadows, spacing, text } from '../theme/tokens';

type ToastVariant = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), message, variant });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished) setToast(null);
          },
        );
      }, 2800);
    },
    [opacity],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  const palette =
    toast?.variant === 'error'
      ? { bg: colors.dangerSoft, border: '#F5C9C5', fg: '#A6342C' }
      : toast?.variant === 'success'
        ? { bg: colors.successSoft, border: '#BFE6D0', fg: '#1F6B45' }
        : { bg: colors.mint900, border: colors.mint900, fg: colors.white };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { bottom: insets.bottom + 84, opacity, backgroundColor: palette.bg, borderColor: palette.border },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: palette.fg }]} />
          <Text style={[styles.text, { color: palette.fg }]} numberOfLines={3}>
            {toast.message}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    maxWidth: 560,
    alignSelf: 'center',
    ...shadows.floating,
    ...(Platform.OS === 'web' ? { marginHorizontal: 'auto' as unknown as number } : {}),
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { ...text.small, flex: 1, fontWeight: '600' },
});
