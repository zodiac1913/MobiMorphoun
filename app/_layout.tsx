/**
 * Root layout — initializes config and wraps the app with navigation.
 */

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { loadConfig } from '../src/services/configService';
import { initializeSchedulers } from '../src/services/schedulerService';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        await loadConfig();
        await initializeSchedulers();
      } catch (err) {
        console.error('Init failed:', err);
      }
      setReady(true);
    }
    init();
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#e2e8f0',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#0f0f23' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f23',
  },
});
