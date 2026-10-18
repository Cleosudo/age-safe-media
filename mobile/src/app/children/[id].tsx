import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarPicker, CategoryPicker, DepthPicker } from '@/components/ChildFormPieces';
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  SectionHeader,
  SegmentedControl,
  Stepper,
  TextField,
} from '@/components/ui';
import { useChildren } from '@/contexts/ChildrenContext';
import { useToast } from '@/contexts/ToastContext';
import { confirmAction } from '@/lib/confirm';
import { describeError } from '@/lib/errors';
import { colors, layout, spacing, text } from '@/theme/tokens';
import type { SortMode } from '@/types/api';

const DEFAULT_AVATARS = ['🦄', '🚀', '🐼', '🦊', '🐨', '🐳', '🦕', '🌈', '⚽', '🎨', '🐣', '🧸'];

export default function EditChildScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    children,
    meta,
    activeChild,
    updateChild,
    saveRestrictions,
    savePreferences,
    deleteChild,
    setActiveChild,
  } = useChildren();

  const child = useMemo(() => children.find((entry) => entry.id === id) ?? null, [children, id]);

  const [name, setName] = useState(child?.name ?? '');
  const [age, setAge] = useState(child?.age ?? 7);
  const [avatar, setAvatar] = useState(child?.avatar ?? '🦄');
  const [blocked, setBlocked] = useState<string[]>(child?.blocked_categories ?? []);
  const [depth, setDepth] = useState<1 | 2 | 3>((child?.age_band_depth as 1 | 2 | 3) ?? 2);
  const [count, setCount] = useState(child?.preferences.max_recommendations ?? 5);
  const [displayMode, setDisplayMode] = useState<'summary' | 'title'>(
    child?.preferences.display_mode ?? 'summary',
  );
  const [sort, setSort] = useState<SortMode>(child?.preferences.sort ?? 'relevance');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!child) return;
    setName(child.name);
    setAge(child.age);
    setAvatar(child.avatar);
    setBlocked(child.blocked_categories);
    setDepth((child.age_band_depth as 1 | 2 | 3) ?? 2);
    setCount(child.preferences.max_recommendations);
    setDisplayMode(child.preferences.display_mode);
    setSort(child.preferences.sort);
  }, [child?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!child) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <AppBar title="Profile" onBack={() => router.back()} />
        <EmptyState
          emoji="🔍"
          title="Profile not found"
          message="It may have been deleted on another device."
          actionLabel="Back to profiles"
          onAction={() => router.replace('/children')}
        />
      </View>
    );
  }

  const save = async () => {
    if (!name.trim()) {
      toast.show('Name cannot be empty.', 'error');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        updateChild(child.id, { name: name.trim(), age, avatar }),
        saveRestrictions(child.id, { blocked_categories: blocked, age_band_depth: depth }),
        savePreferences(child.id, {
          max_recommendations: count,
          display_mode: displayMode,
          sort,
        }),
      ]);
      toast.show('Profile updated', 'success');
      router.back();
    } catch (err) {
      toast.show(describeError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const confirmed = await confirmAction(
      `Delete ${child.name}?`,
      'The profile, its favourites and its activity history will be removed.',
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteChild(child.id);
      toast.show('Profile deleted', 'success');
      router.replace('/children');
    } catch (err) {
      toast.show(describeError(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <AppBar
          title={child.name}
          subtitle={`Age ${child.age} · ${child.age_band} band`}
          onBack={() => router.back()}
          right={
            activeChild?.id === child.id ? undefined : (
              <Button
                label="Read as"
                variant="soft"
                size="sm"
                icon="swap-horizontal"
                onPress={() => {
                  void setActiveChild(child.id);
                  toast.show(`Now reading as ${child.name}`, 'success');
                }}
              />
            )
          }
        />

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: spacing.lg }}>
            <TextField label="Name" value={name} onChangeText={setName} maxLength={24} icon="happy-outline" />
            <Stepper label="Age" value={age} min={1} max={17} onChange={setAge} />
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.label}>Avatar</Text>
              <AvatarPicker avatars={meta?.avatars ?? DEFAULT_AVATARS} value={avatar} onChange={setAvatar} />
            </View>
          </Card>

          <SectionHeader
            title="Parental restrictions"
            caption="Enforced by the backend — the app only displays what it receives"
          />
          <Card style={{ gap: spacing.md }}>
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
            <View style={styles.divider} />
            <Text style={styles.label}>Age-band depth</Text>
            <DepthPicker meta={meta} value={depth} onChange={setDepth} />
            <Text style={[text.tiny, { color: colors.muted }]}>
              Depth controls how far beyond the age band the recommender may reach. Blocked categories are always
              excluded regardless of depth.
            </Text>
          </Card>

          <SectionHeader title="Output preferences" caption="Applies to every answer for this child" />
          <Card style={{ gap: spacing.md }}>
            <Stepper label="Recommendations per answer" value={count} min={1} max={10} onChange={setCount} />
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.label}>Display mode</Text>
              <SegmentedControl
                value={displayMode}
                onChange={setDisplayMode}
                options={[
                  { value: 'summary', label: 'Summary' },
                  { value: 'title', label: 'Titles only' },
                ]}
              />
            </View>
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.label}>Sort by</Text>
              <SegmentedControl
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'relevance', label: 'Best match' },
                  { value: 'newest', label: 'Newest' },
                  { value: 'oldest', label: 'Oldest' },
                ]}
              />
            </View>
          </Card>

          <Button label="Save changes" onPress={save} loading={saving} size="lg" icon="checkmark" />
          <Button
            label={deleting ? 'Deleting…' : 'Delete this profile'}
            variant="ghost"
            icon="trash-outline"
            loading={deleting}
            onPress={() => void remove()}
          />
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
  divider: { height: 1, backgroundColor: colors.line },
});
