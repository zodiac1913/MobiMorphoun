/**
 * History screen — shows last 8 wallpapers with toggle between rendered/original.
 * Each card displays the rendered image (with filter+quote) by default,
 * with a switch to flip to the original unfiltered image.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  Switch,
  Dimensions,
  NativeModules,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

interface HistoryEntry {
  saveName: string;
  originalLocalUri: string;
  filter: string;
  source: string;
  timestamp: number;
}

export default function HistoryScreen() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showOriginal, setShowOriginal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  function loadHistory() {
    if (NativeModules.WallpaperServiceManager) {
      NativeModules.WallpaperServiceManager.getHistory()
        .then((json: string) => {
          try {
            const parsed = JSON.parse(json);
            setHistory(Array.isArray(parsed) ? parsed : []);
          } catch {
            setHistory([]);
          }
        })
        .catch(() => setHistory([]));
    }
  }

  function getImageUri(item: HistoryEntry): string | null {
    const path = showOriginal ? item.originalLocalUri : item.saveName;
    if (!path) return null;
    return path.startsWith('/') ? 'file://' + path : path;
  }

  if (history.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="time-outline" size={64} color="#4a4a6a" />
        <Text style={styles.emptyText}>No history yet</Text>
        <Text style={styles.emptySubtext}>
          Change a wallpaper to start building history
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Toggle switch for rendered vs original */}
      <View style={styles.toggleRow}>
        <Text style={[styles.toggleLabel, !showOriginal && styles.toggleLabelActive]}>
          Rendered
        </Text>
        <Switch
          value={showOriginal}
          onValueChange={setShowOriginal}
          trackColor={{ false: '#6366f1', true: '#22c55e' }}
          thumbColor="#ffffff"
          accessibilityLabel="Toggle between rendered and original images"
        />
        <Text style={[styles.toggleLabel, showOriginal && styles.toggleLabelActive]}>
          Original
        </Text>
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={history}
        numColumns={2}
        keyExtractor={(_, index) => String(index)}
        renderItem={({ item, index }) => {
          const uri = getImageUri(item);
          return (
            <View style={styles.card}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={styles.cardImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.cardPlaceholder}>
                  <Ionicons name="image-outline" size={32} color="#4a4a6a" />
                </View>
              )}
              <View style={styles.cardInfo}>
                <Text style={styles.cardSource} numberOfLines={1}>
                  {item.source || 'Unknown'}
                </Text>
                <Text style={styles.cardFilter} numberOfLines={1}>
                  {item.filter || 'Original'}
                </Text>
              </View>
              {index === 0 && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentText}>Current</Text>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  toggleLabel: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: 10,
  },
  toggleLabelActive: {
    color: '#ffffff',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f23',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 18,
    marginTop: 12,
  },
  emptySubtext: {
    color: '#475569',
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    width: CARD_WIDTH,
    marginRight: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  cardImage: {
    width: '100%',
    height: CARD_WIDTH * 1.4,
  },
  cardPlaceholder: {
    width: '100%',
    height: CARD_WIDTH * 1.4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2d2d44',
  },
  cardInfo: {
    padding: 8,
  },
  cardSource: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  cardFilter: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  currentBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#6366f1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  currentText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
