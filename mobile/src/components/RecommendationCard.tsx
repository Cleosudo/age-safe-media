import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Chip } from './ui';
import { colors, radius, shadows, spacing, text } from '../theme/tokens';
import type { DisplayMode, FeedbackRating, Recommendation } from '../types/api';

export function RecommendationCard({
  item,
  displayMode,
  feedback,
  busyAction,
  onToggleFavourite,
  onFeedback,
  onOpenLink,
}: {
  item: Recommendation;
  displayMode: DisplayMode;
  feedback?: FeedbackRating;
  busyAction?: 'favourite' | 'up' | 'down' | null;
  onToggleFavourite: () => void;
  onFeedback: (rating: FeedbackRating) => void;
  onOpenLink: (url: string, label: string) => void;
}) {
  const compact = displayMode === 'title';
  const links = [
    item.external_links?.nlb ? { label: 'NLB', url: item.external_links.nlb, icon: 'library-outline' as const } : null,
    item.external_links?.open_library
      ? { label: 'Open Library', url: item.external_links.open_library, icon: 'book-outline' as const }
      : null,
  ].filter(Boolean) as { label: string; url: string; icon: 'library-outline' | 'book-outline' }[];

  return (
    <View style={styles.card} accessibilityLabel={`Recommendation: ${item.title}`}>
      <View style={styles.topRow}>
        <View style={styles.cover} accessible={false}>
          <Text style={styles.coverEmoji}>{item.cover_emoji}</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={[text.bodyStrong, styles.title]} numberOfLines={compact ? 1 : 2}>
            {item.title}
          </Text>
          <View style={styles.metaRow}>
            <Badge label={item.type === 'book' ? 'Book' : 'Video'} tone={item.type === 'book' ? 'sky' : 'peach'} />
            <Text style={styles.meta} numberOfLines={1}>
              {item.category} · ages {item.age_range} · {item.year}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onToggleFavourite}
          accessibilityRole="button"
          accessibilityLabel={item.is_favourite ? `Remove ${item.title} from favourites` : `Save ${item.title} to favourites`}
          accessibilityState={{ selected: item.is_favourite, busy: busyAction === 'favourite' }}
          hitSlop={8}
          style={({ pressed }) => [styles.heart, pressed && { opacity: 0.7 }]}
        >
          {busyAction === 'favourite' ? (
            <ActivityIndicator size="small" color={colors.mint600} />
          ) : (
            <Ionicons
              name={item.is_favourite ? 'heart' : 'heart-outline'}
              size={21}
              color={item.is_favourite ? '#D9534F' : colors.muted}
            />
          )}
        </Pressable>
      </View>

      {!compact && item.summary ? (
        <Text style={[text.small, styles.summary]} numberOfLines={4}>
          {item.summary}
        </Text>
      ) : null}

      {!compact && item.matched_tags.length > 0 ? (
        <View style={styles.tags}>
          {item.matched_tags.slice(0, 4).map((tag) => (
            <Chip key={tag} label={`#${tag}`} />
          ))}
          {item.match_type === 'discovery' ? <Chip label="Discovery" emoji="✨" /> : null}
        </View>
      ) : null}

      {!compact && item.explanation ? (
        <View style={styles.explanation}>
          <Text style={styles.bulb}>💡</Text>
          <Text style={[text.tiny, styles.explanationText]}>{item.explanation}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <View style={styles.feedback}>
          <Text style={styles.actionsLabel}>Useful?</Text>
          <Pressable
            onPress={() => onFeedback('up')}
            accessibilityRole="button"
            accessibilityLabel={`${item.title} was useful`}
            accessibilityState={{ selected: feedback === 'up' }}
            hitSlop={6}
            style={({ pressed }) => [
              styles.reactButton,
              feedback === 'up' && styles.reactButtonActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons
              name={feedback === 'up' ? 'thumbs-up' : 'thumbs-up-outline'}
              size={15}
              color={feedback === 'up' ? colors.mint700 : colors.muted}
            />
          </Pressable>
          <Pressable
            onPress={() => onFeedback('down')}
            accessibilityRole="button"
            accessibilityLabel={`${item.title} was not useful`}
            accessibilityState={{ selected: feedback === 'down' }}
            hitSlop={6}
            style={({ pressed }) => [
              styles.reactButton,
              feedback === 'down' && { backgroundColor: colors.dangerSoft, borderColor: '#F3C7C2' },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons
              name={feedback === 'down' ? 'thumbs-down' : 'thumbs-down-outline'}
              size={15}
              color={feedback === 'down' ? colors.danger : colors.muted}
            />
          </Pressable>
        </View>

        {links.length > 0 ? (
          <View style={styles.links}>
            {links.map((link) => (
              <Pressable
                key={link.label}
                onPress={() => onOpenLink(link.url, link.label)}
                accessibilityRole="link"
                accessibilityLabel={`Open ${item.title} on ${link.label}`}
                style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name={link.icon} size={12} color={colors.mint700} />
                <Text style={styles.linkText}>{link.label}</Text>
                <Ionicons name="open-outline" size={11} color={colors.mint600} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  topRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  cover: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.mint50,
    borderWidth: 1,
    borderColor: colors.mint100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEmoji: { fontSize: 26 },
  titleBlock: { flex: 1, gap: 4 },
  title: { color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  meta: { ...text.tiny, color: colors.muted, flexShrink: 1 },
  heart: { padding: 4 },
  summary: { color: colors.inkSoft },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  explanation: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.mint50,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  bulb: { fontSize: 13 },
  explanationText: { flex: 1, color: colors.inkSoft },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionsLabel: { ...text.tiny, color: colors.muted },
  reactButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactButtonActive: { backgroundColor: colors.mint100, borderColor: colors.mint200 },
  links: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  linkButton: {
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
