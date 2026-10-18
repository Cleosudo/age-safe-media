import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from './ui';
import { colors, radius, spacing, text } from '../theme/tokens';
import type { Child } from '../types/api';

export function ChildSwitcher({
  children,
  activeId,
  onSelect,
  onManage,
  label = 'Reading as',
}: {
  children: Child[];
  activeId: string | null;
  onSelect: (childId: string) => void;
  onManage: () => void;
  label?: string;
}) {
  if (children.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          onPress={onManage}
          accessibilityRole="button"
          accessibilityLabel="Manage child profiles"
          hitSlop={8}
          style={styles.manage}
        >
          <Ionicons name="settings-outline" size={13} color={colors.mint700} />
          <Text style={styles.manageText}>Manage</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="tablist"
      >
        {children.map((child) => {
          const selected = child.id === activeId;
          return (
            <Pressable
              key={child.id}
              onPress={() => onSelect(child.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`Switch to ${child.name}, age ${child.age}`}
              style={({ pressed }) => [
                styles.pill,
                selected && styles.pillSelected,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Avatar emoji={child.avatar} size={26} />
              <View>
                <Text style={[text.tiny, styles.name, selected && { color: colors.white }]}>
                  {child.name}
                </Text>
                <Text
                  style={[
                    styles.age,
                    { color: selected ? 'rgba(255,255,255,0.78)' : colors.muted },
                  ]}
                >
                  age {child.age}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable
          onPress={onManage}
          accessibilityRole="button"
          accessibilityLabel="Add a child profile"
          style={({ pressed }) => [styles.add, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="add" size={18} color={colors.mint700} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...text.tiny, color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
  manage: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  manageText: { ...text.tiny, color: colors.mint700 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.lg },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  pillSelected: { backgroundColor: colors.mint600, borderColor: colors.mint600 },
  name: { color: colors.inkSoft, fontWeight: '800' },
  age: { fontSize: 10, fontWeight: '600' },
  add: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.mint300,
    backgroundColor: colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
