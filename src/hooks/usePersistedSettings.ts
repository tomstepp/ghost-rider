import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, DEFAULT_SETTINGS } from '../screens/SettingsScreen';

const SETTINGS_KEY = '@ghost_rider_settings';

export function usePersistedSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((json) => {
      if (json) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(json) });
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const updateSettings = (next: AppSettings) => {
    setSettings(next);
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };

  return { settings, updateSettings, loaded };
}
