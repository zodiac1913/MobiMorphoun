/**
 * Quotes screen — current quote, refresh/save, and scrollable
 * library list with on/off switches for each quote bank.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getConfig, saveConfig } from '../../src/services/configService';
import {
  saveFavoriteQuote,
  updateCurrentQuote,
  Quote,
} from '../../src/services/quoteService';
import { MobiConfig } from '../../src/types/config';

export default function QuotesScreen() {
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [config, setLocalConfig] = useState<MobiConfig>(getConfig());
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const cfg = getConfig();
      setLocalConfig({ ...cfg });
      if (cfg.currentQuoteStatement) {
        setCurrentQuote({
          statement: cfg.currentQuoteStatement,
          author: cfg.currentQuoteAuthor,
        });
      }
    }, [])
  );

  const refreshQuote = useCallback(async () => {
    setLoading(true);
    const quote = await updateCurrentQuote();
    setCurrentQuote(quote);
    setLoading(false);
  }, []);

  const handleSaveFavorite = useCallback(async () => {
    if (!currentQuote) return;
    await saveFavoriteQuote(currentQuote);
    Alert.alert('Saved', 'Quote saved to favorites!');
  }, [currentQuote]);

  const toggleLibrary = async (index: number, value: boolean) => {
    const updated = { ...config };
    updated.textLibraries = [...updated.textLibraries];
    updated.textLibraries[index] = { ...updated.textLibraries[index], use: value };
    setLocalConfig(updated);
    await saveConfig(updated);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Current Quote Card */}
      <View style={styles.quoteCard}>
        {currentQuote ? (
          <>
            <Text style={styles.quoteText}>"{currentQuote.statement}"</Text>
            <Text style={styles.quoteAuthor}>— {currentQuote.author}</Text>
          </>
        ) : (
          <Text style={styles.placeholderText}>No quote loaded</Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.refreshBtn]}
          onPress={refreshQuote}
          disabled={loading}
          accessibilityLabel="New quote"
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.actionText}>New Quote</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.saveBtn]}
          onPress={handleSaveFavorite}
          disabled={!currentQuote}
          accessibilityLabel="Save quote"
          accessibilityRole="button"
        >
          <Ionicons name="bookmark" size={20} color="#fff" />
          <Text style={styles.actionText}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* Libraries with on/off switches */}
      <Text style={styles.sectionTitle}>Quote Libraries</Text>
      {config.textLibraries.map((lib, index) => (
        <View key={lib.name} style={styles.libraryItem}>
          <View style={styles.libraryInfo}>
            <Text style={styles.libraryName}>{lib.title}</Text>
            <Text style={styles.libraryCreator}>{lib.creators}</Text>
          </View>
          <Switch
            value={lib.use}
            onValueChange={(val) => toggleLibrary(index, val)}
            trackColor={{ true: '#8b5cf6', false: '#334155' }}
            thumbColor={lib.use ? '#fff' : '#94a3b8'}
          />
        </View>
      ))}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  content: {
    padding: 16,
  },
  quoteCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  quoteText: {
    color: '#e2e8f0',
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 24,
    marginBottom: 10,
  },
  quoteAuthor: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '600',
  },
  placeholderText: {
    color: '#64748b',
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    gap: 6,
  },
  refreshBtn: { backgroundColor: '#8b5cf6' },
  saveBtn: { backgroundColor: '#ec4899' },
  actionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  libraryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  libraryInfo: {
    flex: 1,
  },
  libraryName: {
    color: '#e2e8f0',
    fontSize: 14,
  },
  libraryCreator: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
});
