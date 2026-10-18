import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarPicker, CategoryPicker } from '@/components/ChildFormPieces';
import { AppBar, Button, Card, SectionHeader, Stepper, TextField } from '@/components/ui';
import { useChildren } from '@/contexts/ChildrenContext';
import { useToast } from '@/contexts/ToastContext';
import { describeError } from '@/lib/errors';
import { colors, layout, spacing, text } from '@/theme/tokens';

const DEFAULT_AVATARS = ['🦄', '🚀', '🐼', '🦊', '🐨', '🐳', '🦕', '🌈', '⚽', '🎨', '🐣', '🧸'];

function bandForAge(age: number): string {
  if (age <= 5) return '3-5';
  if (age <= 8) return '6-8';
  if (age <= 11) return '9-11';
  return '12-14';
}

export default function NewChildScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const { meta, children: profiles, createChild } = useChildren();

  const isFirst = first === '1' || profiles.length === 0;
  const [name, setName] = useState('');
  const [age, setAge] = useState(7);
  const [avatar, setAvatar] = useState('🦄');
  const [blocked, setBlocked] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError('Give the profile a name.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createChild({
        name: name.trim(),
        age,
        avatar,
        blocked_categories: blocked,
        age_band_depth: 2,
      });
      toast.show(`${name.trim()}’s profile is ready`, 'success');
      if (isFirst) router.replace('/(tabs)');
      else router.back();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <AppBar
          title={isFirst ? 'Add your first child' : 'New child profile'}
          subtitle={isFirst ? 'This takes about 20 seconds' : 'Profiles keep recommendations age-appropriate'}
          onBack={isFirst ? undefined : () => router.back()}
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: spacing.lg }}>
            <TextField
              label="Name or nickname"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError(null);
              }}
              placeholder="Amelia"
              icon="happy-outline"
              autoCapitalize="words"
              error={error ?? undefined}
              maxLength={24}
            />

            <View style={{ gap: spacing.sm }}>
              <Stepper label="Age" value={age} min={1} max={17} onChange={setAge} />
              <Text style={[text.tiny, { color: colors.muted }]}>
                {age} years old · {bandForAge(age)} reading band. You can change this later.
              </Text>
            </View>

            <View style={{ gap: spacing.sm }}>
              <Text style={styles.label}>Pick an avatar</Text>
              <AvatarPicker avatars={meta?.avatars ?? DEFAULT_AVATARS} value={avatar} onChange={setAvatar} />
            </View>
          </Card>

          <SectionHeader
            title="Block sensitive topics"
            caption="Optional — the backend enforces these before anything reaches the child"
          />
          {meta ? (
            <CategoryPicker
              meta={meta}
              selected={blocked}
              onToggle={(category) =>
                setBlocked((current) =>
                  current.includes(category)
                    ? current.filter((entry) => entry !== category)
                    : [...current, category],
                )
              }
            />
          ) : null}

          <Button
            label={isFirst ? 'Create profile and start' : 'Save profile'}
            onPress={submit}
            loading={submitting}
            size="lg"
            icon={isFirst ? 'rocket-outline' : 'checkmark'}
          />
          <Text style={[text.tiny, { color: colors.muted, textAlign: 'center' }]}>
            Only you can see this profile. Your child never signs in.
          </Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: spacing.xxxl, gap: spacing.md },
  label: { ...text.tiny, color: colors.inkSoft, fontWeight: '700' },
});
