import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar, Avatar, Badge, Button, Card, Chip, EmptyState } from '@/components/ui';
import { useChildren } from '@/contexts/ChildrenContext';
import { useToast } from '@/contexts/ToastContext';
import { confirmAction } from '@/lib/confirm';
import { describeError } from '@/lib/errors';
import { colors, layout, spacing, text } from '@/theme/tokens';

export default function ChildrenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { children, loading, error, refresh, activeChild, setActiveChild, deleteChild } = useChildren();
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const remove = async (childId: string, name: string) => {
    const confirmed = await confirmAction(
      `Delete ${name}?`,
      'The profile, its favourites and its activity history will be removed. This cannot be undone.',
    );
    if (!confirmed) return;
    setDeleting(childId);
    try {
      await deleteChild(childId);
      toast.show(`${name}’s profile was deleted`, 'success');
    } catch (err) {
      toast.show(describeError(err), 'error');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppBar
        title="Child profiles"
        subtitle={`${children.length} profile${children.length === 1 ? '' : 's'}`}
        onBack={() => router.back()}
        right={
          <Pressable
            onPress={() => router.push('/children/new')}
            accessibilityRole="button"
            accessibilityLabel="Add a child profile"
            style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="add" size={18} color={colors.white} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.mint600} style={{ marginTop: spacing.xxl }} />
        ) : error ? (
          <EmptyState emoji="⚠️" title="Could not load profiles" message={error} actionLabel="Retry" onAction={() => void refresh()} />
        ) : children.length === 0 ? (
          <EmptyState
            emoji="👶"
            title="No profiles yet"
            message="Add a child profile so recommendations can match their age."
            actionLabel="Add a profile"
            onAction={() => router.push('/children/new')}
          />
        ) : (
          children.map((child) => {
            const isActive = child.id === activeChild?.id;
            return (
              <Card key={child.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Avatar emoji={child.avatar} size={52} ring={isActive} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.nameRow}>
                      <Text style={text.h3}>{child.name}</Text>
                      {isActive ? <Badge label="Reading now" /> : null}
                    </View>
                    <Text style={[text.small, { color: colors.muted }]}>
                      Age {child.age} · {child.age_band} band · depth {child.age_band_depth}
                    </Text>
                  </View>
                </View>

                <View style={styles.chips}>
                  {child.blocked_categories.length === 0 ? (
                    <Chip label="No categories blocked" />
                  ) : (
                    child.blocked_categories.map((category) => <Chip key={category} label={category} />)
                  )}
                </View>

                <Text style={[text.tiny, { color: colors.muted }]}>
                  {child.preferences.max_recommendations} picks ·{' '}
                  {child.preferences.display_mode === 'title' ? 'titles only' : 'summaries'} ·{' '}
                  {child.preferences.sort === 'relevance'
                    ? 'best match'
                    : child.preferences.sort === 'newest'
                      ? 'newest first'
                      : 'oldest first'}
                </Text>

                <View style={styles.actions}>
                  {!isActive ? (
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
                  ) : null}
                  <Button
                    label="Edit"
                    variant="secondary"
                    size="sm"
                    icon="create-outline"
                    onPress={() => router.push(`/children/${child.id}`)}
                  />
                  <Button
                    label={deleting === child.id ? 'Deleting…' : 'Delete'}
                    variant="ghost"
                    size="sm"
                    loading={deleting === child.id}
                    onPress={() => void remove(child.id, child.name)}
                  />
                </View>
              </Card>
            );
          })
        )}

        <Button label="Add another child" variant="primary" icon="add" onPress={() => router.push('/children/new')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: layout.screenPadding, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { gap: spacing.sm },
  cardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.mint600,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
