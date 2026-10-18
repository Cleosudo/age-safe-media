import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { useChildren } from '@/contexts/ChildrenContext';
import { colors, text } from '@/theme/tokens';

/** Boot gate: decides between sign-in, first-run profile creation and the app. */
export default function Index() {
  const { ready, session } = useAuth();
  const { loading, children } = useChildren();

  if (!ready) return <BootSplash label="Waking up your library…" />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (loading && children.length === 0) return <BootSplash label="Loading profiles…" />;
  if (children.length === 0) return <Redirect href={{ pathname: '/children/new', params: { first: '1' } }} />;

  return <Redirect href="/(tabs)" />;
}

function BootSplash({ label }: { label: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <Text style={{ fontSize: 34 }}>🛡️</Text>
      </View>
      <Text style={[text.h2, { marginTop: 10 }]}>Age-Safe Media</Text>
      <Text style={[text.small, { color: colors.muted, marginTop: 2 }]}>{label}</Text>
      <ActivityIndicator color={colors.mint600} style={{ marginTop: 20 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  mark: {
    width: 78,
    height: 78,
    borderRadius: 26,
    backgroundColor: colors.mint100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.mint200,
  },
});
