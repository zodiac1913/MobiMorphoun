/**
 * Config Service
 * Handles loading, saving, and migrating the MobiMorphoun configuration.
 * Uses AsyncStorage for persistence (mirrors Metamorphoun's JSON config file approach).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MobiConfig, DEFAULT_CONFIG } from '../types/config';

const CONFIG_KEY = '@mobimorphoun_config';

let configInstance: MobiConfig | null = null;

export async function loadConfig(): Promise<MobiConfig> {
  try {
    const stored = await AsyncStorage.getItem(CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<MobiConfig>;
      // Merge with defaults to handle new fields from updates
      configInstance = { ...DEFAULT_CONFIG, ...parsed };
      migrateConfig(configInstance);
      return configInstance;
    }
  } catch (err) {
    console.warn('Failed to load config, using defaults:', err);
  }

  configInstance = { ...DEFAULT_CONFIG };
  await saveConfig(configInstance);
  return configInstance;
}

export async function saveConfig(config: MobiConfig): Promise<void> {
  try {
    configInstance = config;
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

export function getConfig(): MobiConfig {
  if (!configInstance) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return configInstance;
}

export function setConfig(config: MobiConfig): void {
  configInstance = config;
}

export async function updateConfigField<K extends keyof MobiConfig>(
  key: K,
  value: MobiConfig[K]
): Promise<void> {
  const config = getConfig();
  config[key] = value;
  await saveConfig(config);
}

/**
 * Migrate config to add new inherent sources/libraries from updates
 */
function migrateConfig(config: MobiConfig): void {
  // Ensure all inherent image sources exist
  for (const defaultImg of DEFAULT_CONFIG.images) {
    if (defaultImg.inherent && !config.images.find(i => i.name === defaultImg.name)) {
      config.images.push(defaultImg);
    }
  }

  // Remove stale inherent sources that were dropped/renamed in updates
  // (e.g. the old "Unsplash" source replaced by "Pexels"). We keep any
  // non-inherent (user-added) sources intact.
  const validInherentSources = new Set(
    DEFAULT_CONFIG.images.filter(i => i.inherent).map(i => i.name)
  );
  config.images = config.images.filter(
    img => !img.inherent || validInherentSources.has(img.name)
  );

  // Ensure all inherent text libraries exist
  for (const defaultLib of DEFAULT_CONFIG.textLibraries) {
    if (defaultLib.inherent && !config.textLibraries.find(t => t.name === defaultLib.name)) {
      config.textLibraries.push(defaultLib);
    }
  }

  // Remove stale inherent text libraries dropped/renamed in updates
  const validInherentLibs = new Set(
    DEFAULT_CONFIG.textLibraries.filter(t => t.inherent).map(t => t.name)
  );
  config.textLibraries = config.textLibraries.filter(
    lib => !lib.inherent || validInherentLibs.has(lib.name)
  );
}

export async function resetConfig(): Promise<MobiConfig> {
  configInstance = { ...DEFAULT_CONFIG };
  await saveConfig(configInstance);
  return configInstance;
}
