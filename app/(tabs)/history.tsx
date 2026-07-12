/**
 * History screen — shows last 5 wallpapers with recall option.
 * Mirrors Metamorphoun's picHistories functionality.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getConfig } from '../../src/services/configService';
import { recallWallpaper } from '../../src/services/wallpaperService';
import { PicHistory } from '../../src/types/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

export default function HistoryScreen() {
  const [history, setHistory] = useState<PicHistory[]>([]);

  useFocusEffect(
    useCallback(() => {
      const config = getConfig();
      setHistory(config.picHistories || []);
    }, [])
  );

  const handleRecall = async (index: number) => {
    const result = await recallWallpaper(index);
    if (result.success) {
      Alert.alert('Done', 'Wallpaper recalled!');
    } else {
      Alert.alert('Error', result.error || 'Failed to recall');
    }
  };

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
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={history}
      numColumns={2}
      keyExtractor={(_, index) => String(index)}
      renderItem={({ item, index }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => handleRecall(index)}
          accessibilityLabel={`Recall wallpaper ${index + 1}`}
          accessibilityRole="button"
        >
          {item.saveName ? (
            <Image
              source={{ uri: item.saveName }}
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
              {item.imageItem?.name || 'Unknown'}
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
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
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
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  cardFilter: {
    color: '#8b5cf6',
    fontSize: 11,
    marginTop: 2,
  },
  currentBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#22c55e',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currentText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
