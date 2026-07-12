/**
 * Quotes screen — shows current quote, allows refreshing,
 * saving favorites, and managing quote libraries.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getConfig } from '../../src/services/configService';
import {
  getRandomQuote,
  saveFavoriteQuote,
  updateCurrentQuote,
  Quote,
} from '../../src/services/quoteService';

export default function QuotesScreen() {
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const config = getConfig();

  useEffect(() => {
    if (config.currentQuoteStatement) {
      setCurrentQuote({
        statement: config.currentQuoteStatement,
        author: config.currentQuoteAuthor,
      });
    } else {
      refreshQuote();
    }
  }, []);

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

  return (
    <View style={styles.container}>
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
          <Ionicons name="refresh" size={24} color="#fff" />
          <Text style={styles.actionText}>New Quote</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.saveBtn]}
          onPress={handleSaveFavorite}
          disabled={!currentQuote}
          accessibilityLabel="Save quote"
          accessibilityRole="button"
        >
          <Ionicons name="bookmark" size={24} color="#fff" />
          <Text style={styles.actionText}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* Libraries */}
      <Text style={styles.sectionTitle}>Quote Libraries</Text>
      <FlatList
        data={config.textLibraries}
        keyExtractor={item => item.name}
        renderItem={({ item }) => (
          <View style={styles.libraryItem}>
            <View style={styles.libraryInfo}>
              <Text style={styles.libraryName}>{item.title}</Text>
              <Text style={styles.libraryCreator}>by {item.creators}</Text>
            </View>
            <View
              style={[styles.badge, item.use ? styles.badgeActive : styles.badgeInactive]}
            >
              <Text style={styles.badgeText}>{item.use ? 'ON' : 'OFF'}</Text>
            </View>
          </View>
        )}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    padding: 16,
  },
  quoteCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  quoteText: {
    color: '#e2e8f0',
    fontSize: 18,
    fontStyle: 'italic',
    lineHeight: 26,
    marginBottom: 12,
  },
  quoteAuthor: {
    color: '#8b5cf6',
    fontSize: 15,
    fontWeight: '600',
  },
  placeholderText: {
    color: '#64748b',
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  refreshBtn: { backgroundColor: '#8b5cf6' },
  saveBtn: { backgroundColor: '#ec4899' },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 1,
  },
  libraryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  libraryInfo: { flex: 1 },
  libraryName: { color: '#e2e8f0', fontSize: 15 },
  libraryCreator: { color: '#64748b', fontSize: 12, marginTop: 2 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeActive: { backgroundColor: '#22c55e33' },
  badgeInactive: { backgroundColor: '#64748b33' },
  badgeText: { color: '#e2e8f0', fontSize: 11, fontWeight: '700' },
});
