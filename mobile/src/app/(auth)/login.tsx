import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, TextField } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { colors, radius, shadows, spacing, text } from '@/theme/tokens';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, busy, error, clearError, authMode, session } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState(authMode === 'demo' ? 'parent@demo.sg' : '');
  const [password, setPassword] = useState(authMode === 'demo' ? 'demo1234' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  if (session) return <Redirect href="/" />;

  const validate = () => {
    const next: { email?: string; password?: string } = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid e-mail address.';
    if (password.length < 6) next.password = 'At least 6 characters.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    clearError();
    if (!validate()) return;
    try {
      await signIn(email, password);
      toast.show('Welcome back!', 'success');
      router.replace('/');
    } catch {
      // error surfaces through the auth context
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <Text style={{ fontSize: 26 }}>🛡️</Text>
          </View>
          <View>
            <Text style={text.h2}>Age-Safe Media</Text>
            <Text style={[text.tiny, { color: colors.muted }]}>Grown-ups sign in here</Text>
          </View>
        </View>

        <Text style={[text.display, styles.headline]}>A safer way for your child to explore books and videos.</Text>
        <Text style={[text.body, styles.subhead]}>
          Chat with a friendly guide, get age-appropriate recommendations and see exactly why each one was chosen.
        </Text>

        <View style={styles.card}>
          <TextField
            label="E-mail"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setFieldErrors((current) => ({ ...current, email: undefined }));
            }}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            icon="mail-outline"
            error={fieldErrors.email}
            returnKeyType="next"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            icon="lock-closed-outline"
            error={fieldErrors.password}
            returnKeyType="go"
            onSubmitEditing={submit}
            rightSlot={
              <Pressable
                onPress={() => setShowPassword((current) => !current)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
            }
          />

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={[text.small, { color: colors.danger, flex: 1 }]}>{error}</Text>
            </View>
          ) : null}

          <Button label="Sign in" onPress={submit} loading={busy} fullWidth size="lg" icon="log-in-outline" />

          <View style={styles.switchRow}>
            <Text style={[text.small, { color: colors.muted }]}>New here?</Text>
            <Link href="/(auth)/register" asChild>
              <Pressable accessibilityRole="link">
                <Text style={[text.small, { color: colors.mint700, fontWeight: '800' }]}>Create a parent account</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {authMode === 'demo' ? (
          <View style={styles.demoNote}>
            <Text style={styles.demoTitle}>Demo mode</Text>
            <Text style={[text.tiny, { color: colors.skyInk }]}>
              Firebase is not configured, so sign-in uses the local demo account. Any e-mail with a 6+ character
              password works — the pre-filled one opens a family with two child profiles.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  container: { paddingHorizontal: spacing.xl, gap: spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.mint100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.mint200,
  },
  headline: { color: colors.ink, marginTop: spacing.sm },
  subhead: { color: colors.muted, marginTop: -spacing.sm },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 },
  demoNote: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#CFE4F7',
    padding: spacing.md,
    gap: 4,
  },
  demoTitle: { ...text.tiny, color: colors.skyInk, letterSpacing: 0.6, textTransform: 'uppercase' },
});
