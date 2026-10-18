import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, text } from '../theme/tokens';
import type { ChatMessage } from '../types/api';

export function ChatBubble({
  message,
  childAvatar,
  childName,
}: {
  message: ChatMessage;
  childAvatar: string;
  childName: string;
}) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser ? (
        <View style={styles.assistantAvatar} accessible={false}>
          <Text style={{ fontSize: 16 }}>{childAvatar}</Text>
        </View>
      ) : null}
      <View style={styles.bubbleColumn}>
        {!isUser ? <Text style={styles.author}>{childName}&apos;s guide</Text> : null}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text
            style={[
              text.body,
              { color: isUser ? colors.white : colors.ink },
            ]}
            accessibilityLabel={`${isUser ? 'You' : childName} said: ${message.content}`}
          >
            {message.content}
          </Text>
        </View>
        {message.blocked ? (
          <View style={styles.blocked}>
            <Text style={styles.blockedText}>Blocked by the safety filter</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function TypingIndicator({ childAvatar }: { childAvatar: string }) {
  const dots = [useRef(new Animated.Value(0.35)).current, useRef(new Animated.Value(0.35)).current, useRef(new Animated.Value(0.35)).current];

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(dot, { toValue: 1, duration: 320, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(dot, { toValue: 0.35, duration: 320, useNativeDriver: Platform.OS !== 'web' }),
          Animated.delay((2 - index) * 140),
        ]),
      ),
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dots]);

  return (
    <View style={[styles.row, styles.rowAssistant]} accessibilityLabel="Assistant is typing">
      <View style={styles.assistantAvatar} accessible={false}>
        <Text style={{ fontSize: 16 }}>{childAvatar}</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        {dots.map((dot, index) => (
          <Animated.View key={index} style={[styles.dot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, alignItems: 'flex-end' },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  assistantAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleColumn: { maxWidth: '82%', gap: 4 },
  author: { ...text.tiny, color: colors.muted, marginLeft: 2 },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg },
  bubbleUser: {
    backgroundColor: colors.mint600,
    borderBottomRightRadius: 6,
  },
  bubbleAssistant: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: 6,
  },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.mint500 },
  blocked: {
    alignSelf: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  blockedText: { fontSize: 10.5, fontWeight: '700', color: colors.danger },
});
