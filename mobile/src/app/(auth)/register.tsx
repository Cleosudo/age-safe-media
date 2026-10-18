import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, TextField } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { colors, radius, shadows, spacing, text } from '@/theme/tokens';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp, busy, error, clearError, authMode, session } = useAuth();
  const toast = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  if (session) return <Redirect href="/" />;

  const submit = async () => {
    clearError();
    const next: { email?: string; password?: string } = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid e-mail address.';
    if (password.length < 6) next.password = 'Use at least 6 characters.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      await signUp(email, password, displayName);
      toast.show('Account created — let’s add your first child profile.', 'success');
      router.replace('/');
    } catch {
      // handled by the auth context
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.backRow} accessibilityRole="link" accessibilityLabel="Back to sign in">
            <Ionicons name="chevron-back" size={18} color={colors.mint700} />
            <Text style={[text.small, { color: colors.mint700, fontWeight: '700' }]}>Back to sign in</Text>
          </Pressable>
        </Link>

        <Text style={[text.display, { color: colors.ink }]}>Create your parent account</Text>
        <Text style={[text.body, { color: colors.muted }]}>
          One account holds all of your children’s profiles, preferences and reading activity.
        </Text>

        <View style={styles.card}>
          <TextField
            label="Your name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Mei Ling"
            icon="person-outline"
            autoComplete="name"
            returnKeyType="next"
          />
          <TextField
            label="E-mail"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setErrors((current) => ({ ...current, email: undefined }));
            }}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            icon="mail-outline"
            error={errors.email}
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setErrors((current) => ({ ...current, password: undefined }));
            }}
            placeholder="At least 6 characters"
            secureTextEntry
            autoComplete="new-password"
            icon="lock-closed-outline"
            error={errors.password}
            onSubmitEditing={submit}
            returnKeyType="go"
          />

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={[text.small, { color: colors.danger, flex: 1 }]}>{error}</Text>
            </View>
          ) : null}

          <Button label="Create account" onPress={submit} loading={busy} fullWidth size="lg" icon="sparkles-outline" />

          <Text style={[text.tiny, { color: colors.muted, textAlign: 'center' }]}>
            Your child never signs in. Only you manage profiles, limits and reports.
          </Text>
        </View>

        {authMode === 'demo' ? (
          <View style={styles.demoNote}>
            <Text style={[text.tiny, { color: colors.skyInk }]}>
              Demo mode: accounts are stored locally on this device until Firebase credentials are configured.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  container: { paddingHorizontal: spacing.xl, gap: spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.sm,
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
  demoNote: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#CFE4F7',
    padding: spacing.md,
  },
});
