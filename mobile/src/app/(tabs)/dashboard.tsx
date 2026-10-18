import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChildSwitcher } from '@/components/ChildSwitcher';
import { BarChart, StatTile, TopicBars } from '@/components/charts';
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionHeader,
  SegmentedControl,
  centredContent,
} from '@/components/ui';
import { useChildren } from '@/contexts/ChildrenContext';
import { describeError } from '@/lib/errors';
import { reportsApi } from '@/services/reports';
import { colors, layout, radius, spacing, text } from '@/theme/tokens';
import type { Report, ReportRange } from '@/types/api';

const RANGE_OPTIONS: { value: ReportRange; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeChild, children: profiles, setActiveChild } = useChildren();

  const [range, setRange] = useState<ReportRange>('weekly');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!activeChild) {
        setLoading(false);
        return;
      }
      if (mode === 'initial') setLoading(true);
      setError(null);
      try {
        const response = await reportsApi.activity(activeChild.id, range);
        setReport(response);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeChild, range],
  );

  // refresh whenever the tab regains focus (new activity, new restrictions, …)
  useFocusEffect(
    useCallback(() => {
      void load(report === null ? 'initial' : 'refresh');
    }, [load]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!activeChild) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 60 }]}>
        <EmptyState
          emoji="👶"
          title="No child profile yet"
          message="Add a profile to see what your child has been exploring."
          actionLabel="Create profile"
          onAction={() => router.push('/children/new')}
        />
      </View>
    );
  }

  const totals = report?.totals;
  const feedbackTotal = (totals?.positive_feedback ?? 0) + (totals?.negative_feedback ?? 0);
  const positiveShare = feedbackTotal > 0 ? Math.round(((totals?.positive_feedback ?? 0) / feedbackTotal) * 100) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppBar title="Insights" subtitle={`${activeChild.name}’s activity`} />
      <View style={{ paddingHorizontal: layout.screenPadding }}>
        <ChildSwitcher
          children={profiles}
          activeId={activeChild.id}
          onSelect={(id) => {
            void setActiveChild(id);
          }}
          onManage={() => router.push('/children')}
          label="Report for"
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, centredContent]}
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
        showsVerticalScrollIndicator={false}
      >
        <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />

        {loading ? (
          <LoadingState label="Crunching the numbers…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load('initial')} />
        ) : !report || (totals?.searches ?? 0) + (totals?.recommendations ?? 0) === 0 ? (
          <EmptyState
            emoji="🪄"
            title="No activity in this period"
            message="When your child chats with the guide, their topics and recommendations appear here."
            actionLabel="Open the chat"
            onAction={() => router.push('/(tabs)')}
          />
        ) : (
          <>
            <View style={styles.statGrid}>
              <StatTile emoji="🔍" label="Searches" value={totals?.searches ?? 0} hint="questions asked" />
              <StatTile emoji="📚" label="Picks shown" value={totals?.recommendations ?? 0} tone="sky" hint="recommendations" />
              <StatTile emoji="💛" label="Saved" value={totals?.favourites ?? 0} tone="peach" hint="favourites" />
              <StatTile emoji="📅" label="Active days" value={totals?.active_days ?? 0} tone="lemon" hint="in this period" />
            </View>

            <Card>
              <SectionHeader title="Search activity" caption={report.range_title} />
              <BarChart
                data={report.series.map((bucket) => ({ label: bucket.label, value: bucket.searches }))}
                accent={colors.mint500}
                valueSuffix=" searches"
              />
              <View style={styles.legendRow}>
                <View style={styles.legendDot} />
                <Text style={[text.tiny, { color: colors.muted }]}>Questions asked per {range === 'monthly' ? 'month' : range === 'weekly' ? 'week' : 'day'}</Text>
              </View>
            </Card>

            <Card>
              <SectionHeader title="Topics explored" caption="Most frequent searches" />
              {report.topics.length > 0 ? (
                <TopicBars items={report.topics.slice(0, 6).map((topic) => ({ label: topic.topic, value: topic.count }))} />
              ) : (
                <Text style={[text.small, { color: colors.muted }]}>
                  No topic keywords were captured yet.
                </Text>
              )}
            </Card>

            <Card tone="mint">
              <SectionHeader title="Did the picks land?" />
              {positiveShare === null ? (
                <Text style={[text.small, { color: colors.inkSoft }]}>
                  Thumbs-up and thumbs-down feedback will show up here.
                </Text>
              ) : (
                <>
                  <View style={styles.feedbackRow}>
                    <Text style={[text.h1, { color: colors.mint700 }]}>{positiveShare}%</Text>
                    <Text style={[text.small, { color: colors.inkSoft, flex: 1 }]}>
                      of {feedbackTotal} rated recommendation{feedbackTotal === 1 ? '' : 's'} were marked useful
                    </Text>
                  </View>
                  <View style={styles.feedbackBar}>
                    <View style={[styles.feedbackFill, { flex: Math.max(totals?.positive_feedback ?? 0, 0.001) }]} />
                    <View
                      style={[
                        styles.feedbackFill,
                        styles.feedbackFillNegative,
                        { flex: Math.max(totals?.negative_feedback ?? 0, 0.001) },
                      ]}
                    />
                  </View>
                  <Text style={[text.tiny, { color: colors.muted }]}>
                    👍 {totals?.positive_feedback ?? 0} · 👎 {totals?.negative_feedback ?? 0}
                  </Text>
                </>
              )}
            </Card>

            <Button
              label="Manage parental restrictions"
              variant="secondary"
              icon="shield-checkmark-outline"
              onPress={() => router.push(`/children/${activeChild.id}`)}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, backgroundColor: colors.canvas, justifyContent: 'center' },
  content: { padding: layout.screenPadding, gap: spacing.md, paddingBottom: spacing.xxxl },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mint500 },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  feedbackBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radius.pill,
    overflow: 'hidden',
    gap: 2,
    marginVertical: spacing.sm,
  },
  feedbackFill: { backgroundColor: colors.mint400, borderRadius: radius.pill },
  feedbackFillNegative: { backgroundColor: colors.peach },
});
