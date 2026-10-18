import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from './ui';
import { colors, radius, spacing, text } from '../theme/tokens';
import type { ChildMeta } from '../types/api';

export function AvatarPicker({
  avatars,
  value,
  onChange,
}: {
  avatars: string[];
  value: string;
  onChange: (avatar: string) => void;
}) {
  return (
    <View style={styles.avatarGrid} accessibilityRole="radiogroup">
      {avatars.map((avatar) => {
        const selected = avatar === value;
        return (
          <Pressable
            key={avatar}
            onPress={() => onChange(avatar)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`Choose avatar ${avatar}`}
            style={({ pressed }) => [
              styles.avatarOption,
              selected && styles.avatarSelected,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={{ fontSize: 22 }}>{avatar}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function CategoryPicker({
  meta,
  selected,
  onToggle,
}: {
  meta: ChildMeta | null;
  selected: string[];
  onToggle: (category: string) => void;
}) {
  const options = meta?.sensitivity_categories ?? [];
  return (
    <View style={{ gap: spacing.sm }}>
      {options.map((option) => {
        const active = selected.includes(option.id);
        return (
          <Pressable
            key={option.id}
            onPress={() => onToggle(option.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`Block ${option.label}`}
            style={({ pressed }) => [
              styles.categoryRow,
              active && styles.categoryActive,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={{ fontSize: 18 }}>{option.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[text.small, { fontWeight: '700', color: colors.ink }]}>{option.label}</Text>
              <Text style={[text.tiny, { color: colors.muted }]}>{option.description}</Text>
            </View>
            <View style={[styles.checkbox, active && styles.checkboxActive]}>
              {active ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DepthPicker({
  meta,
  value,
  onChange,
}: {
  meta: ChildMeta | null;
  value: 1 | 2 | 3;
  onChange: (depth: 1 | 2 | 3) => void;
}) {
  const options = meta?.depth_options ?? [
    { value: 1 as const, label: 'Strict', description: 'Only items inside the age band' },
    { value: 2 as const, label: 'Balanced', description: 'Age band plus neighbouring years' },
    { value: 3 as const, label: 'Explorer', description: 'Wider age window' },
  ];
  return (
    <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${option.label}: ${option.description}`}
            style={({ pressed }) => [
              styles.depthRow,
              active && styles.depthActive,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View
              style={[
                styles.radio,
                active && { borderColor: colors.mint600, backgroundColor: colors.mint600 },
              ]}
            >
              {active ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[text.small, { fontWeight: '700' }]}>{option.label}</Text>
              <Text style={[text.tiny, { color: colors.muted }]}>{option.description}</Text>
            </View>
            <Chip label={`depth ${option.value}`} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  avatarOption: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelected: {
    borderColor: colors.mint500,
    backgroundColor: colors.mint50,
    borderWidth: 2,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  categoryActive: { borderColor: colors.mint300, backgroundColor: colors.mint50 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.mint600, borderColor: colors.mint600 },
  checkmark: { color: colors.white, fontSize: 13, fontWeight: '900' },
  depthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  depthActive: { borderColor: colors.mint300, backgroundColor: colors.mint50 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
});
