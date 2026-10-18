import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { colors, radius, spacing, text } from '../theme/tokens';

export function StatTile({
  emoji,
  label,
  value,
  hint,
  tone = 'mint',
}: {
  emoji: string;
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'mint' | 'sky' | 'peach' | 'lemon';
}) {
  const background = {
    mint: colors.mint100,
    sky: colors.skySoft,
    peach: colors.peachSoft,
    lemon: colors.lemon,
  }[tone];

  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}>
      <View style={[styles.statIcon, { backgroundColor: background }]} accessible={false}>
        <Text style={{ fontSize: 16 }}>{emoji}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function BarChart({
  data,
  height = 150,
  accent = colors.mint500,
  valueSuffix = '',
}: {
  data: { label: string; value: number }[];
  height?: number;
  accent?: string;
  valueSuffix?: string;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const padding = { top: 14, bottom: 24, left: 24, right: 8 };
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(...data.map((point) => point.value), 1);
  const count = Math.max(data.length, 1);
  const slot = Math.max((width - padding.left - padding.right) / count, 1);
  const barWidth = Math.min(slot * 0.56, 30);
  const gridValues = [0, 0.5, 1].map((ratio) => Math.round(max * ratio));
  const labelEvery = count > 7 ? 2 : 1;
  const shortLabel = (label: string) => label.replace(/^wk\s+/i, '').replace(/\s+/g, ' ');

  return (
    <View>
      <Text style={styles.chartCaption}>
        Peak {max}
        {valueSuffix}
      </Text>
      <View onLayout={onLayout} style={{ height }} accessible accessibilityLabel="Activity chart">
        {width > 0 ? (
          <Svg width={width} height={height}>
            {gridValues.map((value, index) => {
              const y = padding.top + chartHeight - (value / max) * chartHeight;
              return (
                <React.Fragment key={`grid-${index}`}>
                  <Line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={y}
                    y2={y}
                    stroke={colors.line}
                    strokeWidth={1}
                    strokeDasharray={index === 0 ? undefined : '3,4'}
                  />
                  <SvgText x={0} y={y + 3} fontSize={9} fill={colors.muted} fontWeight="600">
                    {value}
                  </SvgText>
                </React.Fragment>
              );
            })}
            {data.map((point, index) => {
              const barHeight = Math.max((point.value / max) * chartHeight, point.value > 0 ? 3 : 0);
              const x = padding.left + slot * index + slot / 2 - barWidth / 2;
              const y = padding.top + chartHeight - barHeight;
              const isLast = index === data.length - 1;
              const showLabel = (count - 1 - index) % labelEvery === 0;
              return (
                <React.Fragment key={point.label + index}>
                  <Rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={Math.min(barWidth / 2, 5)}
                    fill={isLast ? accent : colors.mint200}
                  />
                  {showLabel ? (
                    <SvgText
                      x={padding.left + slot * index + slot / 2}
                      y={height - 6}
                      fontSize={8.5}
                      fill={colors.muted}
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {shortLabel(point.label)}
                    </SvgText>
                  ) : null}
                </React.Fragment>
              );
            })}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

export function TopicBars({
  items,
  accent = colors.mint500,
}: {
  items: { label: string; value: number }[];
  accent?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((item) => (
        <View key={item.label} style={styles.topicRow}>
          <Text style={styles.topicLabel} numberOfLines={1}>
            {item.label}
          </Text>
          <View style={styles.topicTrack}>
            <View
              style={[
                styles.topicFill,
                { width: `${Math.max((item.value / max) * 100, 4)}%`, backgroundColor: accent },
              ]}
            />
          </View>
          <Text style={styles.topicValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 2,
    minWidth: 130,
  },
  statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { ...text.h1, marginTop: 6 },
  statLabel: { ...text.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  statHint: { ...text.tiny, color: colors.muted, fontWeight: '500' },
  chartCaption: {
    ...text.tiny,
    color: colors.muted,
    fontWeight: '500',
    textAlign: 'right',
    marginBottom: 2,
  },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topicLabel: { ...text.small, color: colors.inkSoft, width: 118 },
  topicTrack: {
    flex: 1,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: '#EDF4F1',
    overflow: 'hidden',
  },
  topicFill: { height: '100%', borderRadius: radius.pill },
  topicValue: { ...text.tiny, color: colors.muted, width: 26, textAlign: 'right' },
});
