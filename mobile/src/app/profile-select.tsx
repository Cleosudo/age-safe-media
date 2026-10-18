import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar, Avatar, Badge, Button, EmptyState } from '@/components/ui';
import { useChildren } from '@/contexts/ChildrenContext';
import { useToast } from '@/contexts/ToastContext';
import { colors, layout, radius, shadows, spacing, text } from '@/theme/tokens';

export default function ProfileSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { children, activeChild, setActiveChild } = useChildren();

  const choose = async (id: string, name: string) => {
    await setActiveChild(id);
    toast.show(`Now reading as ${name}`, 'success');
    router.back();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppBar
        title="Who's reading?"
        subtitle="Switch profile — each one has its own age and restrictions"
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children.length === 0 ? (
          <EmptyState
            emoji="👶"
            title="No profiles yet"
            message="Create a profile to personalise recommendations."
            actionLabel="Create profile"
            onAction={() => router.replace('/children/new')}
          />
        ) : (
          children.map((child) => {
            const active = child.id === activeChild?.id;
            return (
              <Pressable
                key={child.id}
                onPress={() => void choose(child.id, child.name)}
                accessibilityRole="button"
                accessibilityLabel={`Read as ${child.name}, age ${child.age}`}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [styles.card, active && styles.cardActive, pressed && { opacity: 0.8 }]}
              >
                <Avatar emoji={child.avatar} size={62} ring={active} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.nameRow}>
                    <Text style={text.h2}>{child.name}</Text>
                    {active ? <Badge label="Active" /> : null}
                  </View>
                  <Text style={[text.small, { color: colors.muted }]}>
                    Age {child.age} · {child.age_band} band
                  </Text>
                  <Text style={[text.tiny, { color: colors.muted }]}>
                    {child.blocked_categories.length === 0
                      ? 'No topics blocked'
                      : `${child.blocked_categories.length} topic${child.blocked_categories.length === 1 ? '' : 's'} blocked`}
                    {' · '}
                    {child.preferences.max_recommendations} picks per answer
                  </Text>
                </View>
                <View style={[styles.chevron, active && { backgroundColor: colors.mint600, borderColor: colors.mint600 }]}>
                  <Text style={{ color: active ? colors.white : colors.mint700, fontWeight: '900' }}>✓</Text>
                </View>
              </Pressable>
            );
          })
        )}

        <Button label="Manage profiles" variant="secondary" icon="settings-outline" onPress={() => router.replace('/children')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: layout.screenPadding, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    ...shadows.card,
  },
  cardActive: { borderColor: colors.mint400, backgroundColor: colors.mint50 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.mint200,
    backgroundColor: colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
