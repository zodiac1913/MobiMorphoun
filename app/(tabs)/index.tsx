/**
 * Main wallpaper screen — buttons at top, info in middle, preview at bottom.
 * Mirrors Metamorphoun's system tray actions.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  Dimensions,
  ScrollView,
  NativeModules,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useFonts } from 'expo-font';
import * as FileSystem from 'expo-file-system';
import {
  generateNewWallpaper,
  recallWallpaper,
  saveAsFavorite,
  getCurrentWallpaperInfo,
} from '../../src/services/wallpaperService';
import { PicHistory } from '../../src/types/config';
import { APP_VERSION } from '../../src/version';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function WallpaperScreen() {
  const [current, setCurrent] = useState<PicHistory | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [fontsLoaded] = useFonts({
    'PermanentMarker': require('../../assets/fonts/PermanentMarker-Regular.ttf'),
    'DejaVuSans-Bold': require('../../assets/fonts/DejaVuSans-Bold.ttf'),
  });

  // Refresh display when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      refreshDisplay();
    }, [])
  );

  // Also poll for changes every 10 seconds (catches background service updates)
  useEffect(() => {
    const interval = setInterval(refreshDisplay, 10000);
    return () => clearInterval(interval);
  }, []);

  function refreshDisplay() {
    // Read wallpaper history from Java service's JSON file
    if (NativeModules.WallpaperServiceManager) {
      NativeModules.WallpaperServiceManager.getHistory().then((json: string) => {
        try {
          const history = JSON.parse(json);
          if (history.length > 0) {
            const latest = history[0];
            setCurrent({
              saveName: latest.saveName,
              originalLocalUri: latest.originalLocalUri,
              filter: latest.filter,
              imageItem: { name: latest.source },
            } as any);
            const uri = latest.saveName;
            if (uri) {
              setImageUri(uri.startsWith('/') ? 'file://' + uri : uri);
            }
          }
        } catch (e) {
          console.warn('Failed to parse history:', e);
        }
      }).catch(() => {
        // Fallback to config-based display
        const info = getCurrentWallpaperInfo();
        setCurrent(info);
        if (info?.saveName) {
          const uri = info.saveName;
          setImageUri(uri.startsWith('/') ? 'file://' + uri : uri);
        }
      });
    } else {
      const info = getCurrentWallpaperInfo();
      setCurrent(info);
      if (info?.saveName) {
        const uri = info.saveName;
        setImageUri(uri.startsWith('/') ? 'file://' + uri : uri);
      }
    }
  }

  const handleNext = useCallback(async () => {
    setLoading(true);
    try {
      // Trigger Java service to change wallpaper
      if (NativeModules.WallpaperServiceManager) {
        await NativeModules.WallpaperServiceManager.changeNow();
        // Wait a moment for the service to finish, then refresh display
        setTimeout(() => {
          refreshDisplay();
          setLoading(false);
        }, 4000);
      } else {
        // Fallback to JS path
        const result = await generateNewWallpaper('ManualNext');
        refreshDisplay();
        setLoading(false);
        if (!result.success) {
          Alert.alert('Error', result.error || 'Failed');
        }
      }
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', String(err));
    }
  }, []);

  const handleLast = useCallback(async () => {
    setLoading(true);
    const result = await recallWallpaper(1);
    if (result.success) {
      refreshDisplay();
    } else {
      Alert.alert('Info', result.error || 'No previous wallpaper available');
    }
    setLoading(false);
  }, []);

  const handleFavorite = useCallback(async () => {
    const saved = await saveAsFavorite(true);
    if (saved) {
      Alert.alert('Saved', 'Wallpaper saved to favorites!');
    } else {
      Alert.alert('Error', 'No wallpaper to save');
    }
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header: title + version */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallpaper</Text>
        <Text style={styles.headerVersion}>v{APP_VERSION}</Text>
      </View>

      {/* Action Buttons — top of screen */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.lastBtn]}
          onPress={handleLast}
          disabled={loading}
          accessibilityLabel="Previous wallpaper"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
          <Text style={styles.actionText}>Last</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.nextBtn]}
          onPress={handleNext}
          disabled={loading}
          accessibilityLabel="Next wallpaper"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-forward" size={22} color="#fff" />
          <Text style={styles.actionText}>Next</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.favBtn]}
          onPress={handleFavorite}
          disabled={loading}
          accessibilityLabel="Save as favorite"
          accessibilityRole="button"
        >
          <Ionicons name="heart" size={22} color="#fff" />
          <Text style={styles.actionText}>Fav</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <Text style={styles.loadingText}>Changing wallpaper...</Text>
      )}

      {/* Source / Filter Info */}
      {current && (
        <View style={styles.infoRow}>
          <View style={styles.infoChip}>
            <Ionicons name="globe-outline" size={14} color="#8b5cf6" />
            <Text style={styles.infoChipText}>
              {current.imageItem?.name || 'Unknown'}
            </Text>
          </View>
          <View style={styles.infoChip}>
            <Ionicons name="color-filter-outline" size={14} color="#8b5cf6" />
            <Text style={styles.infoChipText}>
              {formatFilterName(current.filter) || 'Original'}
            </Text>
          </View>
        </View>
      )}

      {/* Quote */}
      {current?.quoteStatement ? (
        <View style={styles.quoteCard}>
          <Text style={styles.quoteText}>"{current.quoteStatement}"</Text>
          <Text style={styles.quoteAuthor}>— {current.quoteAuthor}</Text>
        </View>
      ) : null}

      {/* Wallpaper Preview */}
      <View style={styles.previewContainer}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={64} color="#4a4a6a" />
            <Text style={styles.placeholderText}>No wallpaper yet</Text>
            <Text style={styles.placeholderSubtext}>
              Tap "Next" to generate one
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function formatFilterName(filter: string | undefined): string {
  if (!filter) return 'Original';
  // Add spaces before capital letters: "BlurSoft" → "Blur Soft"
  return filter.replace(/([a-z])([A-Z])/g, '$1 $2');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    color: '#e2e8f0',
    fontSize: 20,
    fontWeight: '700',
  },
  headerVersion: {
    color: '#64748b',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    marginHorizontal: 4,
    gap: 6,
  },
  lastBtn: { backgroundColor: '#334155' },
  nextBtn: { backgroundColor: '#8b5cf6' },
  favBtn: { backgroundColor: '#ec4899' },
  actionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  loadingText: {
    color: '#8b5cf6',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 5,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  infoChipText: {
    color: '#e2e8f0',
    fontSize: 13,
    flexShrink: 0,
  },
  quoteCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#8b5cf6',
  },
  quoteText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontStyle: 'italic',
    fontFamily: 'DejaVuSans-Bold',
    lineHeight: 20,
  },
  quoteAuthor: {
    color: '#8b5cf6',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
    fontFamily: 'DejaVuSans-Bold',
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
    elevation: 6,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#64748b',
    fontSize: 16,
    marginTop: 12,
  },
  placeholderSubtext: {
    color: '#475569',
    fontSize: 13,
    marginTop: 4,
  },
});
