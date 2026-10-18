import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble, TypingIndicator } from '@/components/ChatBubble';
import { ChildSwitcher } from '@/components/ChildSwitcher';
import { RecommendationCard } from '@/components/RecommendationCard';
import {
  AppBar,
  Button,
  IconButton,
  LoadingState,
  SegmentedControl,
  Sheet,
  Stepper,
  centredContent,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useChildren } from '@/contexts/ChildrenContext';
import { useToast } from '@/contexts/ToastContext';
import { describeError } from '@/lib/errors';
import { chatApi } from '@/services/chat';
import { catalogueApi } from '@/services/catalogue';
import { favouritesApi } from '@/services/favourites';
import { colors, layout, radius, shadows, spacing, text } from '@/theme/tokens';
import type {
  ChatMessage,
  Child,
  FeedbackRating,
  HistoryMessage,
  Recommendation,
  SortMode,
} from '@/types/api';

const FALLBACK_SUGGESTIONS = [
  'Show me dinosaur books',
  'Something about space',
  'Ocean animals please',
  'How do plants grow?',
];

function welcomeMessage(child: Child): ChatMessage {
  return {
    id: `welcome-${child.id}`,
    role: 'assistant',
    content: `Hi ${child.name}! I'm your story buddy. Ask me about anything you're curious about — dinosaurs, space, the ocean, or how things work — and I'll find books and videos that are just right for you.`,
  };
}


/**
 * Re-attach recommendation cards to messages restored from the server.
 * The transcript itself is stored as text; the recommendation metadata is
 * stored alongside each assistant message so cards survive an app restart.
 */
async function hydrateHistory(history: HistoryMessage[]): Promise<ChatMessage[]> {
  const wanted = new Set<string>();
  history.forEach((message) => {
    message.meta?.recommendations?.forEach((entry) => wanted.add(entry.id));
  });

  let items = new Map<string, Recommendation>();
  if (wanted.size > 0) {
    try {
      const response = await catalogueApi.byIds([...wanted]);
      items = new Map(
        response.items.map((item) => [
          item.id,
          {
            ...item,
            score: 0,
            matched_tags: [],
            match_type: 'discovery' as const,
            explanation: '',
            is_favourite: false,
          },
        ]),
      );
    } catch {
      items = new Map();
    }
  }

  return history.map((message) => {
    const metadata = message.meta?.recommendations ?? [];
    const recommendations = metadata
      .map((entry) => {
        const base = items.get(entry.id);
        if (!base) return null;
        return {
          ...base,
          matched_tags: entry.matched_tags ?? [],
          match_type: entry.match_type ?? ('discovery' as const),
          explanation: entry.explanation ?? '',
        } satisfies Recommendation;
      })
      .filter((entry): entry is Recommendation => entry !== null);

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      blocked: message.meta?.blocked ?? false,
      recommendations: recommendations.length ? recommendations : undefined,
    };
  });
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { meta } = useAuth();
  const { activeChild, children: profiles, setActiveChild, savePreferences } = useChildren();

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Record<string, FeedbackRating>>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [busyItem, setBusyItem] = useState<{ id: string; action: 'favourite' | 'up' | 'down' } | null>(null);

  const childId = activeChild?.id ?? null;

  /* ------------------------------------------------------------ history -- */
  useEffect(() => {
    if (!activeChild) return;
    let cancelled = false;
    setHistoryLoading(true);
    setError(null);
    setMessages([]);
    setConversationId(null);
    setFavouriteIds([]);
    setFeedback({});
    setSuggestions([]);

    (async () => {
      try {
        const [history, suggestionResponse, favourites] = await Promise.all([
          chatApi.history(activeChild.id),
          chatApi.suggestions(activeChild.id),
          favouritesApi.list(activeChild.id),
        ]);
        if (cancelled) return;
        setConversationId(history.conversation_id);
        setFavouriteIds(favourites.favourites.map((entry) => entry.item_id));

        const restored = await hydrateHistory(history.messages);
        if (cancelled) return;
        setMessages(restored.length ? restored : [welcomeMessage(activeChild)]);
        setSuggestions(
          [...(suggestionResponse.topics ?? []), ...(suggestionResponse.suggested_replies ?? [])].slice(0, 6),
        );
      } catch (err) {
        if (cancelled) return;
        setError(describeError(err));
        setMessages([welcomeMessage(activeChild)]);
        setSuggestions(FALLBACK_SUGGESTIONS);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeChild?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 140);
    return () => clearTimeout(timer);
  }, [messages]);

  /* --------------------------------------------------------------- chat -- */
  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || !activeChild || sending) return;
      setInput('');
      setSending(true);
      setError(null);
      setLastPrompt(text);

      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: text,
      };
      setMessages((current) => [...current, optimistic]);

      try {
        const response = await chatApi.send({
          child_id: activeChild.id,
          message: text,
          conversation_id: conversationId,
          preferences: activeChild.preferences,
        });
        setConversationId(response.conversation_id);
        setFavouriteIds(response.favourite_ids);
        setFeedback(response.feedback);
        setSuggestions(response.suggested_replies.slice(0, 5));
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: response.reply,
            recommendations: response.recommendations,
            blocked: response.safety.blocked,
          },
        ]);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setSending(false);
      }
    },
    [activeChild, conversationId, input, sending],
  );

  /* --------------------------------------------------------- favourites -- */
  const toggleFavourite = useCallback(
    async (item: Recommendation) => {
      if (!activeChild) return;
      const wasFavourite = favouriteIds.includes(item.id);
      setBusyItem({ id: item.id, action: 'favourite' });
      setFavouriteIds((current) =>
        wasFavourite ? current.filter((id) => id !== item.id) : [...current, item.id],
      );
      setMessages((current) =>
        current.map((message) =>
          message.recommendations
            ? {
                ...message,
                recommendations: message.recommendations.map((entry) =>
                  entry.id === item.id ? { ...entry, is_favourite: !wasFavourite } : entry,
                ),
              }
            : message,
        ),
      );

      try {
        const response = wasFavourite
          ? await favouritesApi.remove(activeChild.id, item.id)
          : await favouritesApi.add(activeChild.id, item.id);
        setFavouriteIds(response.favourite_ids);
        toast.show(wasFavourite ? 'Removed from saved' : 'Saved to favourites', 'success');
      } catch (err) {
        setFavouriteIds((current) =>
          wasFavourite ? [...current, item.id] : current.filter((id) => id !== item.id),
        );
        setMessages((current) =>
          current.map((message) =>
            message.recommendations
              ? {
                  ...message,
                  recommendations: message.recommendations.map((entry) =>
                    entry.id === item.id ? { ...entry, is_favourite: wasFavourite } : entry,
                  ),
                }
              : message,
          ),
        );
        toast.show(describeError(err), 'error');
      } finally {
        setBusyItem(null);
      }
    },
    [activeChild, favouriteIds, toast],
  );

  const sendFeedback = useCallback(
    async (item: Recommendation, rating: FeedbackRating) => {
      if (!activeChild) return;
      const previous = feedback[item.id];
      setBusyItem({ id: item.id, action: rating });
      setFeedback((current) => ({ ...current, [item.id]: rating }));
      try {
        const response = await favouritesApi.feedback(activeChild.id, item.id, rating);
        setFeedback(response.feedback_map);
        toast.show(
          rating === 'up' ? 'Noted — more like this!' : 'Thanks, we’ll show fewer like this.',
          'success',
        );
      } catch (err) {
        setFeedback((current) => {
          const next = { ...current };
          if (previous) next[item.id] = previous;
          else delete next[item.id];
          return next;
        });
        toast.show(describeError(err), 'error');
      } finally {
        setBusyItem(null);
      }
    },
    [activeChild, feedback, toast],
  );

  const openLink = useCallback(
    async (url: string, label: string) => {
      try {
        const supported = await Linking.canOpenURL(url);
        if (!supported) throw new Error(`${label} is not available on this device.`);
        await Linking.openURL(url);
      } catch (err) {
        toast.show((err as Error).message ?? 'Could not open that link.', 'error');
      }
    },
    [toast],
  );

  const updatePreferences = useCallback(
    async (patch: { max_recommendations?: number; display_mode?: 'summary' | 'title'; sort?: SortMode; show_explanations?: boolean }) => {
      if (!activeChild) return;
      try {
        await savePreferences(activeChild.id, patch);
      } catch (err) {
        toast.show(describeError(err), 'error');
      }
    },
    [activeChild, savePreferences, toast],
  );

  const quickReplies = useMemo(() => {
    const unique: string[] = [];
    for (const suggestion of suggestions.length ? suggestions : FALLBACK_SUGGESTIONS) {
      if (!unique.includes(suggestion)) unique.push(suggestion);
    }
    return unique.slice(0, 6);
  }, [suggestions]);

  if (!activeChild) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 40 }]}>
        <Text style={{ fontSize: 40 }}>👶</Text>
        <Text style={text.h2}>No child profile yet</Text>
        <Text style={[text.small, { color: colors.muted, textAlign: 'center' }]}>
          Create a profile so the guide knows the right age group.
        </Text>
        <Button label="Create a profile" onPress={() => router.push('/children/new')} icon="add" />
      </View>
    );
  }

  const prefs = activeChild.preferences;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppBar
        title={`Hi, ${activeChild.name.split(' ')[0]}`}
        subtitle={`${activeChild.avatar} Age ${activeChild.age} · ${activeChild.age_band} band`}
        right={
          <View style={styles.headerActions}>
            <IconButton icon="options-outline" label="Output preferences" onPress={() => setPrefsOpen(true)} />
            <IconButton icon="people-outline" label="Switch child profile" onPress={() => router.push('/profile-select')} />
          </View>
        }
      />

      <View style={{ paddingHorizontal: layout.screenPadding }}>
        <ChildSwitcher
          children={profiles}
          activeId={childId}
          onSelect={(id) => {
            void setActiveChild(id);
          }}
          onManage={() => router.push('/children')}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {historyLoading ? (
          <View style={styles.flex}>
            <LoadingState label="Finding your last conversation…" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={styles.flex}
            contentContainerStyle={[styles.listContent, centredContent]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={
              sending ? <TypingIndicator childAvatar={activeChild.avatar} /> : <View style={{ height: 8 }} />
            }
            renderItem={({ item }) => (
              <View>
                <ChatBubble message={item} childAvatar={activeChild.avatar} childName={activeChild.name} />
                {item.recommendations && item.recommendations.length > 0 ? (
                  <View style={styles.recommendations}>
                    <View style={styles.recHeader}>
                      <Text style={styles.recHeaderText}>
                        {item.recommendations.length} pick{item.recommendations.length === 1 ? '' : 's'}
                      </Text>
                      <Text style={styles.recHeaderHint}>
                        {prefs.display_mode === 'title' ? 'Titles only' : 'Tap ♥ to save'}
                      </Text>
                    </View>
                    {item.recommendations.map((recommendation) => (
                      <RecommendationCard
                        key={recommendation.id}
                        item={{ ...recommendation, is_favourite: favouriteIds.includes(recommendation.id) }}
                        displayMode={prefs.display_mode}
                        feedback={feedback[recommendation.id]}
                        busyAction={busyItem?.id === recommendation.id ? busyItem.action : null}
                        onToggleFavourite={() => {
                          void toggleFavourite(recommendation);
                        }}
                        onFeedback={(rating) => {
                          void sendFeedback(recommendation, rating);
                        }}
                        onOpenLink={(url, label) => {
                          void openLink(url, label);
                        }}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            )}
          />
        )}

        {error ? (
          <View style={styles.errorBar} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
            <Text style={[text.tiny, { color: colors.danger, flex: 1 }]} numberOfLines={2}>
              {error}
            </Text>
            {lastPrompt ? (
              <Pressable
                onPress={() => {
                  void send(lastPrompt);
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry the last message"
                style={styles.retry}
              >
                <Text style={[text.tiny, { color: colors.danger, fontWeight: '800' }]}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickScroll}
          contentContainerStyle={styles.quickRow}
          keyboardShouldPersistTaps="handled"
        >
          {quickReplies.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => {
                void send(suggestion);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Ask: ${suggestion}`}
              style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.7 }]}
            >
              <Text style={[text.tiny, { color: colors.mint700, fontWeight: '700' }]}>{suggestion}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[styles.composer, centredContent]}>
          <View style={styles.inputShell}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={`Ask about dinosaurs, space, oceans…`}
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={300}
              multiline
              accessibilityLabel="Type your question"
              onSubmitEditing={() => {
                void send();
              }}
              blurOnSubmit={false}
            />
          </View>
          <Pressable
            onPress={() => {
              void send();
            }}
            disabled={!input.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={({ pressed }) => [
              styles.sendButton,
              (!input.trim() || sending) && { opacity: 0.45 },
              pressed && { opacity: 0.8 },
            ]}
          >
            {sending ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Ionicons name="arrow-up" size={20} color={colors.white} />
            )}
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>
          Recommendations are filtered on the server by age and your parental restrictions.
        </Text>
      </KeyboardAvoidingView>

      <Sheet visible={prefsOpen} onClose={() => setPrefsOpen(false)} title="How results appear">
        <Text style={[text.small, { color: colors.muted }]}>
          Saved for {activeChild.name}. The next answer from the guide uses these settings.
        </Text>
        <Stepper
          label="Number of recommendations"
          value={prefs.max_recommendations}
          min={1}
          max={meta?.max_recommendations ?? 10}
          onChange={(value) => {
            void updatePreferences({ max_recommendations: value });
          }}
        />
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.sheetLabel}>Display mode</Text>
          <SegmentedControl
            value={prefs.display_mode}
            onChange={(value) => {
              void updatePreferences({ display_mode: value });
            }}
            options={[
              { value: 'summary', label: 'Summary' },
              { value: 'title', label: 'Titles only' },
            ]}
          />
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.sheetLabel}>Sort by</Text>
          <SegmentedControl
            value={prefs.sort}
            onChange={(value) => {
              void updatePreferences({ sort: value });
            }}
            options={[
              { value: 'relevance', label: 'Best match' },
              { value: 'newest', label: 'Newest' },
              { value: 'oldest', label: 'Oldest' },
            ]}
          />
        </View>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[text.small, { fontWeight: '700' }]}>Show explanations</Text>
            <Text style={[text.tiny, { color: colors.muted }]}>
              Why each item was recommended, in plain language.
            </Text>
          </View>
          <Switch
            value={prefs.show_explanations}
            onValueChange={(value) => {
              void updatePreferences({ show_explanations: value });
            }}
            trackColor={{ true: colors.mint400, false: '#D8E4E0' }}
            thumbColor={colors.white}
            accessibilityLabel="Show explanations"
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.canvas },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  recommendations: { marginLeft: 38, gap: spacing.sm, marginBottom: spacing.lg, marginTop: -4 },
  recHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recHeaderText: { ...text.tiny, color: colors.inkSoft, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  recHeaderHint: { ...text.tiny, color: colors.muted },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    marginHorizontal: layout.screenPadding,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#F5C9C5',
  },
  retry: { paddingHorizontal: 8, paddingVertical: 2 },
  quickScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 52 },
  quickRow: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
  },
  quickChip: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.mint200,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xs,
  },
  inputShell: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
    ...shadows.card,
  },
  input: {
    ...text.body,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    maxHeight: 110,
    color: colors.ink,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.mint600,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
  disclaimer: {
    ...text.tiny,
    color: colors.muted,
    fontWeight: '500',
    textAlign: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    paddingHorizontal: layout.screenPadding,
  },
  sheetLabel: { ...text.tiny, color: colors.inkSoft, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
