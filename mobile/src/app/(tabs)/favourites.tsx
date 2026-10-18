import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChildSwitcher } from '@/components/ChildSwitcher';
import { AppBar, Badge, Button, EmptyState, ErrorState, LoadingState, centredContent } from '@/components/ui';
import { useChildren } from '@/contexts/ChildrenContext';
import { useToast } from '@/contexts/ToastContext';
import { describeError } from '@/lib/errors';
import { favouritesApi } from '@/services/favourites';
import { colors, layout, radius, shadows, spacing, text } from '@/theme/tokens';
import type { Favourite } from '@/types/api';

export default function FavouritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { activeChild, children: profiles, setActiveChild } = useChildren();

  const [items, setItems] = useState<Favourite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!activeChild) {
        setItems([]);
        setLoading(false);
        return;
      }
      if (mode === 'initial') setLoading(true);
      setError(null);
      try {
        const response = await favouritesApi.list(activeChild.id);
        setItems(response.favourites);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeChild],
  );

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load]),
  );

  const remove = async (favourite: Favourite) => {
    if (!activeChild) return;
    setRemoving(favourite.item_id);
    const snapshot = items;
    setItems((current) => current.filter((entry) => entry.item_id !== favourite.item_id));
    try {
      await favouritesApi.remove(activeChild.id, favourite.item_id);
      toast.show('Removed from saved', 'success');
    } catch (err) {
      setItems(snapshot);
      toast.show(describeError(err), 'error');
    } finally {
      setRemoving(null);
    }
  };

  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      toast.show('That link could not be opened.', 'error');
    }
  };

  if (!activeChild) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 60 }]}>
        <EmptyState emoji="👶" title="No child profile yet" message="Create a profile to start saving books and videos." actionLabel="Create profile" onAction={() => router.push('/children/new')} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppBar title="Saved picks" subtitle={`${activeChild.name}’s favourites`} />
      <View style={{ paddingHorizontal: layout.screenPadding }}>
        <ChildSwitcher
          children={profiles}
          activeId={activeChild.id}
          onSelect={(id) => {
            void setActiveChild(id);
          }}
          onManage={() => router.push('/children')}
          label="Showing"
        />
      </View>

      {loading ? (
        <LoadingState label="Opening the favourites shelf…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load('initial')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, centredContent]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load('refresh');
              }}
              tintColor={colors.mint600}
            />
          }
          ListEmptyComponent={
            <EmptyState
              emoji="💛"
              title="Nothing saved yet"
              message="Tap the heart on any recommendation in the chat and it will appear here."
              actionLabel="Go to chat"
              onAction={() => router.push('/(tabs)')}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cover}>
                  <Text style={{ fontSize: 24 }}>{item.item.cover_emoji}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[text.bodyStrong]} numberOfLines={2}>
                    {item.item.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <Badge label={item.item.type === 'book' ? 'Book' : 'Video'} tone={item.item.type === 'book' ? 'sky' : 'peach'} />
                    <Text style={[text.tiny, { color: colors.muted }]} numberOfLines={1}>
                      {item.item.category} · ages {item.item.age_range}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => void remove(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.item.title} from favourites`}
                  hitSlop={8}
                  style={({ pressed }) => [styles.removeButton, pressed && { opacity: 0.7 }]}
                >
                  {removing === item.item_id ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  )}
                </Pressable>
              </View>

              <Text style={[text.small, { color: colors.inkSoft }]} numberOfLines={3}>
                {item.item.summary}
              </Text>

              <View style={styles.links}>
                {item.item.external_links?.nlb ? (
                  <Pressable
                    onPress={() => void openLink(item.item.external_links.nlb!)}
                    accessibilityRole="link"
                    style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="library-outline" size={12} color={colors.mint700} />
                    <Text style={styles.linkText}>NLB Singapore</Text>
                  </Pressable>
                ) : null}
                {item.item.external_links?.open_library ? (
                  <Pressable
                    onPress={() => void openLink(item.item.external_links.open_library!)}
                    accessibilityRole="link"
                    style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="book-outline" size={12} color={colors.mint700} />
                    <Text style={styles.linkText}>Open Library</Text>
                  </Pressable>
                ) : null}
                <Text style={[text.tiny, { color: colors.muted, marginLeft: 'auto' }]}>
                  saved {item.created_at.slice(0, 10)}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      {items.length === 0 && !loading && !error ? null : (
        <View style={{ paddingHorizontal: layout.screenPadding, paddingBottom: spacing.md }}>
          <Button
            label="Find more in the chat"
            variant="soft"
            icon="chatbubbles-outline"
            onPress={() => router.push('/(tabs)')}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, backgroundColor: colors.canvas, justifyContent: 'center' },
  list: { padding: layout.screenPadding, gap: spacing.md, flexGrow: 1 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  cardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  cover: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.mint50,
    borderWidth: 1,
    borderColor: colors.mint100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
  },
  links: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.mint50,
    borderWidth: 1,
    borderColor: colors.mint100,
  },
  linkText: { fontSize: 11, fontWeight: '700', color: colors.mint700 },
});
