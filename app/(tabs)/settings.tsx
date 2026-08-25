/**
 * Settings screen — mirrors Metamorphoun's web settings UI.
 * Configures scheduling, image sources, filters, quote overlay, etc.
 */

import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Pressable,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MobiConfig, WallpaperTarget, ImageSizing, TextBoxLocation } from '../../src/types/config';
import { getConfig, saveConfig, resetConfig } from '../../src/services/configService';
import { restartServiceWithInterval, syncImageSourcesToNative } from '../../src/services/schedulerService';

/**
 * Button that fires on tap and repeats while held down.
 */
function RepeatButton({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRepeat = () => {
    onPress();
    intervalRef.current = setInterval(onPress, 150);
  };

  const stopRepeat = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  return (
    <Pressable onPressIn={startRepeat} onPressOut={stopRepeat}>
      {children}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const [config, setLocalConfig] = useState<MobiConfig>(getConfig());

  useFocusEffect(
    useCallback(() => {
      setLocalConfig({ ...getConfig() });
    }, [])
  );

  const updateField = async <K extends keyof MobiConfig>(key: K, value: MobiConfig[K]) => {
    const updated = { ...config, [key]: value };
    setLocalConfig(updated);
    await saveConfig(updated);

    // Restart service when wallpaper interval changes
    if (key === 'changeMinutes') {
      await restartServiceWithInterval(value as number);
    }

    // Sync image sources to native service when they change
    if (key === 'images') {
      await syncImageSourcesToNative(updated);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Settings',
      'Are you sure you want to reset all settings to defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const fresh = await resetConfig();
            setLocalConfig(fresh);
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Scheduling */}
      <Text style={styles.sectionTitle}>Scheduling</Text>
      <View style={styles.card}>
        <SettingRow
          label="Change on startup"
          value={
            <Switch
              value={config.changeWallpaperOnStartup}
              onValueChange={v => updateField('changeWallpaperOnStartup', v)}
              trackColor={{ true: '#8b5cf6', false: '#334155' }}
            />
          }
        />
        <SettingRow
          label={`Change every ${config.changeMinutes} min`}
          value={
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={() => updateField('changeMinutes', Math.max(1, config.changeMinutes - 1))}
                accessibilityLabel="Decrease interval"
              >
                <Ionicons name="remove-circle" size={28} color="#8b5cf6" />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{config.changeMinutes}</Text>
              <TouchableOpacity
                onPress={() => updateField('changeMinutes', config.changeMinutes + 1)}
                accessibilityLabel="Increase interval"
              >
                <Ionicons name="add-circle" size={28} color="#8b5cf6" />
              </TouchableOpacity>
            </View>
          }
        />
      </View>

      {/* Image Sources */}
      <Text style={styles.sectionTitle}>Image Sources</Text>
      <View style={styles.card}>
        {config.images.map((img, idx) => (
          <SettingRow
            key={img.name}
            label={img.title}
            value={
              <Switch
                value={img.use}
                onValueChange={v => {
                  const images = [...config.images];
                  images[idx] = { ...images[idx], use: v };
                  updateField('images', images);
                }}
                trackColor={{ true: '#8b5cf6', false: '#334155' }}
              />
            }
          />
        ))}
      </View>

      {/* Filters */}
      <Text style={styles.sectionTitle}>Filters</Text>
      <View style={styles.card}>
        <FilterToggle label="Original" field="wallpaperFilterOriginal" config={config} update={updateField} />
        <FilterToggle label="Blur (Soft)" field="wallpaperFilterBlurSoft" config={config} update={updateField} />
        <FilterToggle label="Blur (Hard)" field="wallpaperFilterBlurHard" config={config} update={updateField} />
        <FilterToggle label="Pixelate" field="wallpaperFilterPixelate" config={config} update={updateField} />
        <FilterToggle label="Monochrome" field="wallpaperFilterMonochrome" config={config} update={updateField} />
        <FilterToggle label="Cartoon" field="wallpaperFilterCartoon" config={config} update={updateField} />
        <FilterToggle label="Wavy" field="wallpaperFilterWavy" config={config} update={updateField} />
        <FilterToggle label="Vortex" field="wallpaperFilterVortex" config={config} update={updateField} />
        <FilterToggle label="Mosaic" field="wallpaperFilterMosaic" config={config} update={updateField} />
        <FilterToggle label="Jigsaw" field="wallpaperFilterJigsawPuzzle" config={config} update={updateField} />
        <FilterToggle label="Graffiti" field="wallpaperFilterGraffiti" config={config} update={updateField} />
        <FilterToggle label="Oilify" field="wallpaperFilterOilify" config={config} update={updateField} />
      </View>

      {/* Quote Overlay */}
      <Text style={styles.sectionTitle}>Quote Overlay</Text>
      <View style={styles.card}>
        <SettingRow
          label="Show text overlay"
          value={
            <Switch
              value={config.showTextOverlay}
              onValueChange={v => updateField('showTextOverlay', v)}
              trackColor={{ true: '#8b5cf6', false: '#334155' }}
            />
          }
        />
        <SettingRow
          label={`Quote changes every ${config.textChangeMinutes} min`}
          value={
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={() => updateField('textChangeMinutes', Math.max(1, config.textChangeMinutes - 1))}
                accessibilityLabel="Decrease quote interval"
              >
                <Ionicons name="remove-circle" size={28} color="#8b5cf6" />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{config.textChangeMinutes}</Text>
              <TouchableOpacity
                onPress={() => updateField('textChangeMinutes', config.textChangeMinutes + 1)}
                accessibilityLabel="Increase quote interval"
              >
                <Ionicons name="add-circle" size={28} color="#8b5cf6" />
              </TouchableOpacity>
            </View>
          }
        />
        <SettingRow
          label="Random appearance"
          value={
            <Switch
              value={config.quoteAppearanceRandom}
              onValueChange={v => updateField('quoteAppearanceRandom', v)}
              trackColor={{ true: '#8b5cf6', false: '#334155' }}
            />
          }
        />
        <SettingRow
          label={`Max quote length: ${config.quoteMaxChars || 200} chars`}
          value={
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={() => updateField('quoteMaxChars', Math.max(50, (config.quoteMaxChars || 200) - 25))}
                accessibilityLabel="Decrease max chars"
              >
                <Ionicons name="remove-circle" size={28} color="#8b5cf6" />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{config.quoteMaxChars || 200}</Text>
              <TouchableOpacity
                onPress={() => updateField('quoteMaxChars', (config.quoteMaxChars || 200) + 25)}
                accessibilityLabel="Increase max chars"
              >
                <Ionicons name="add-circle" size={28} color="#8b5cf6" />
              </TouchableOpacity>
            </View>
          }
        />
      </View>

      {/* Wallpaper Target (Android only) */}
      <Text style={styles.sectionTitle}>Wallpaper Target</Text>
      <View style={styles.card}>
        {(['home', 'lock', 'both'] as WallpaperTarget[]).map(target => (
          <TouchableOpacity
            key={target}
            style={[styles.optionRow, config.wallpaperTarget === target && styles.optionSelected]}
            onPress={() => updateField('wallpaperTarget', target)}
          >
            <Text style={styles.optionText}>{target.charAt(0).toUpperCase() + target.slice(1)} Screen</Text>
            {config.wallpaperTarget === target && (
              <Ionicons name="checkmark-circle" size={20} color="#8b5cf6" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Reset */}
      <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
        <Ionicons name="trash-outline" size={20} color="#ef4444" />
        <Text style={styles.resetText}>Reset All Settings</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// Helper components
function SettingRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      {value}
    </View>
  );
}

function FilterToggle({
  label,
  field,
  config,
  update,
}: {
  label: string;
  field: keyof MobiConfig;
  config: MobiConfig;
  update: (key: keyof MobiConfig, value: boolean) => void;
}) {
  return (
    <SettingRow
      label={label}
      value={
        <Switch
          value={config[field] as boolean}
          onValueChange={v => update(field, v)}
          trackColor={{ true: '#8b5cf6', false: '#334155' }}
        />
      }
    />
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
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
  },
  settingLabel: {
    color: '#e2e8f0',
    fontSize: 15,
    flex: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperValue: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginVertical: 2,
  },
  optionSelected: {
    backgroundColor: '#8b5cf620',
  },
  optionText: {
    color: '#e2e8f0',
    fontSize: 15,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef444440',
  },
  resetText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
});
