import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppBar,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  SectionHeader,
  Sheet,
  TextField,
  centredContent,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useChildren } from '@/contexts/ChildrenContext';
import { useToast } from '@/contexts/ToastContext';
import { describeError } from '@/lib/errors';
import { accountApi } from '@/services/account';
import { apiBaseUrl } from '@/services/api';
import { colors, layout, radius, spacing, text } from '@/theme/tokens';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { parent, meta, authMode, signOut, refreshAccount, busy: authBusy } = useAuth();
  const { children: profiles, activeChild, setActiveChild } = useChildren();

  const [nameSheet, setNameSheet] = useState(false);
  const [nameDraft, setNameDraft] = useState(parent?.display_name ?? '');
  const [savingName, setSavingName] = useState(false);

  const saveName = async () => {
    if (!nameDraft.trim()) {
      toast.show('Name cannot be empty.', 'error');
      return;
    }
    setSavingName(true);
    try {
      await accountApi.updateProfile(nameDraft.trim());
      await refreshAccount();
      setNameSheet(false);
      toast.show('Profile updated', 'success');
    } catch (err) {
      toast.show(describeError(err), 'error');
    } finally {
      setSavingName(false);
    }
  };

  const facts: [string, string][] = [
    ['API base URL', apiBaseUrl()],
    ['Auth mode', authMode === 'firebase' ? 'Firebase Authentication' : 'Local demo session'],
    ['Recommendation model', meta?.active_model ?? 'not reported'],
    ['Backend', meta?.app_name ?? 'Age-Safe Media Recommender'],
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppBar title="Settings" subtitle="Account, profiles and parental controls" />

      <ScrollView contentContainerStyle={[styles.content, centredContent]} showsVerticalScrollIndicator={false}>
        <Card>
          <View style={styles.accountRow}>
            <Avatar emoji={(parent?.display_name || parent?.email || 'P').slice(0, 1).toUpperCase()} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={text.h3}>{parent?.display_name || 'Parent'}</Text>
              <Text style={[text.small, { color: colors.muted }]} numberOfLines={1}>
                {parent?.email}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <Badge
                  label={authMode === 'firebase' ? 'Firebase Auth' : 'Demo auth'}
                  tone={authMode === 'firebase' ? 'mint' : 'sky'}
                  icon={authMode === 'firebase' ? 'lock-closed' : 'flask-outline'}
                />
                <Badge label={`${profiles.length} profile${profiles.length === 1 ? '' : 's'}`} tone="neutral" />
              </View>
            </View>
            <Pressable
              onPress={() => {
                setNameDraft(parent?.display_name ?? '');
                setNameSheet(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit your display name"
              style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="pencil" size={14} color={colors.mint700} />
            </Pressable>
          </View>
        </Card>

        <SectionHeader
          title="Child profiles"
          actionLabel="Add"
          onAction={() => router.push('/children/new')}
          caption="Each profile has its own age, restrictions and preferences"
        />

        {profiles.map((child) => {
          const active = child.id === activeChild?.id;
          return (
            <View key={child.id} style={styles.row}>
              <Pressable
                onPress={() => router.push(`/children/${child.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Manage ${child.name}`}
                style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.75 }]}
              >
                <Avatar emoji={child.avatar} size={42} ring={active} />
                <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={text.bodyStrong}>{child.name}</Text>
                  {active ? <Badge label="Active" /> : null}
                </View>
                <Text style={[text.tiny, { color: colors.muted }]}>
                  Age {child.age} · {child.age_band} band · depth {child.age_band_depth}
                </Text>
                  <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                    {child.blocked_categories.length === 0 ? (
                      <Chip label="No blocks" />
                    ) : (
                      child.blocked_categories.slice(0, 3).map((category) => (
                        <Chip key={category} label={category} />
                      ))
                    )}
                  </View>
                </View>
              </Pressable>
              <View style={styles.rowActions}>
                {!active ? (
                  <Pressable
                    onPress={() => {
                      void setActiveChild(child.id);
                      toast.show(`Now reading as ${child.name}`, 'success');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Switch to ${child.name}`}
                    style={({ pressed }) => [styles.switchButton, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.switchText}>Switch</Text>
                  </Pressable>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
            </View>
          );
        })}

        {profiles.length === 0 ? (
          <Button label="Create the first profile" variant="soft" icon="add" onPress={() => router.push('/children/new')} />
        ) : null}

        <SectionHeader title="About" caption="Diagnostics for demos and the viva" />
        <Card tone="sky">
          {facts.map(([label, value]) => (
            <View key={label} style={styles.aboutRow}>
              <Text style={[text.small, { color: colors.skyInk }]}>{label}</Text>
              <Text style={[text.tiny, styles.aboutValue]} numberOfLines={2}>
                {value}
              </Text>
            </View>
          ))}
          {authMode === 'firebase' ? null : (
            <Text style={[text.tiny, { color: colors.skyInk, marginTop: spacing.sm }]}>
              Add EXPO_PUBLIC_FIREBASE_* variables to switch to real Firebase sign-in.
            </Text>
          )}
        </Card>

        <Button
          label="Sign out"
          variant="secondary"
          icon="log-out-outline"
          loading={authBusy}
          onPress={() => {
            void signOut();
          }}
        />
        <Text style={styles.footer}>Age-Safe Conversational Media Recommendation System · FYP build</Text>
      </ScrollView>

      <Sheet visible={nameSheet} onClose={() => setNameSheet(false)} title="Your name">
        <TextField
          label="Display name"
          value={nameDraft}
          onChangeText={setNameDraft}
          placeholder="Mei Ling Tan"
          autoFocus
        />
        <Button label="Save" onPress={saveName} loading={savingName} icon="checkmark" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: spacing.xxxl, gap: spacing.sm },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  editButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.mint100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switchButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.mint50,
    borderWidth: 1,
    borderColor: colors.mint200,
  },
  switchText: { ...text.tiny, color: colors.mint700 },
  aboutRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: 4 },
  aboutValue: { flex: 1, color: colors.inkSoft, textAlign: 'right' },
  footer: { ...text.tiny, color: colors.muted, textAlign: 'center', marginTop: spacing.md },
});
