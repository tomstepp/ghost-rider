import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { IRideRepository } from '../storage/IRideRepository';
import { parseBackup, serializeBackup } from '../utils/backup';
import { Appearance, Theme, useTheme } from '../theme';

export interface MarkerSettings {
  type: 'dot' | 'emoji';
  color: string;
  emoji: string;
}

export interface AppSettings {
  units: 'km' | 'mi';
  appearance: Appearance;
  audioEnabled: boolean;
  splitIntervalKm: number;
  countdownSeconds: number;
  riderMarker: MarkerSettings;
  ghostMarker: MarkerSettings;
  // Developer: replay the selected ghost route as live GPS so the HUD, delta,
  // chimes, and announcements can be tested without riding.
  simulationEnabled: boolean;
  simulationSpeed: number; // multiplier applied to the recorded cadence
}

export const DEFAULT_SETTINGS: AppSettings = {
  units: 'mi',
  appearance: 'system',
  audioEnabled: true,
  splitIntervalKm: 1,
  countdownSeconds: 3,
  riderMarker: { type: 'emoji', color: '#ffffff', emoji: '🔥' },
  ghostMarker: { type: 'emoji', color: '#888888', emoji: '👻' },
  simulationEnabled: false,
  simulationSpeed: 2,
};

interface Props {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
  onBack: () => void;
  repository: IRideRepository;
  // Called after a successful restore so the app can drop any selected ghost /
  // stale screen state that referred to the now-replaced data.
  onDataRestored?: () => void;
}

const SPLIT_OPTIONS = [1, 2, 5];
const COUNTDOWN_OPTIONS = [3, 5, 10];
const SIM_SPEED_OPTIONS = [2, 5, 10, 25];

const PRESET_COLORS = [
  '#ffffff', '#ffc107', '#4caf50', '#f44336',
  '#2196f3', '#ff9800', '#e91e63', '#888888',
];

interface MarkerPickerProps {
  label: string;
  value: MarkerSettings;
  onChange: (m: MarkerSettings) => void;
}

function MarkerPicker({ label, value, onChange }: MarkerPickerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const set = (patch: Partial<MarkerSettings>) => onChange({ ...value, ...patch });

  return (
    <View style={styles.markerSection}>
      <Text style={styles.markerLabel}>{label}</Text>

      {/* Dot / Emoji toggle */}
      <View style={styles.segmented}>
        {(['dot', 'emoji'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.segment, value.type === t && styles.segmentActive]}
            onPress={() => set({ type: t })}
          >
            <Text style={[styles.segmentText, value.type === t && styles.segmentTextActive]}>
              {t === 'dot' ? 'DOT' : 'EMOJI'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {value.type === 'dot' ? (
        <View style={styles.swatches}>
          {PRESET_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.swatch, { backgroundColor: c }, value.color === c && styles.swatchActive]}
              onPress={() => set({ color: c })}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emojiRow}>
          <TextInput
            style={styles.emojiInput}
            value={value.emoji}
            onChangeText={(t) => {
              // Keep only the last grapheme entered so the field stays single-emoji
              const chars = [...t]; // spread splits by Unicode code point
              if (chars.length > 0) set({ emoji: chars[chars.length - 1] });
            }}
            maxLength={4}
            textAlign="center"
            returnKeyType="done"
          />
          <Text style={styles.emojiHint}>Tap to open emoji keyboard</Text>
        </View>
      )}
    </View>
  );
}

export function SettingsScreen({ settings, onUpdate, onBack, repository, onDataRestored }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const set = (patch: Partial<AppSettings>) => onUpdate({ ...settings, ...patch });
  const [busy, setBusy] = useState<null | 'backup' | 'restore'>(null);

  const handleBackup = async () => {
    try {
      setBusy('backup');
      const { routes, rideHistory } = await repository.exportData();
      const json = serializeBackup({ routes, rideHistory, settings });
      const date = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `ghost-rider-backup-${date}.json`);
      // The filename is deterministic per day, so clear a prior export first.
      if (file.exists) file.delete();
      file.create();
      file.write(json);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Back up GhostRider data',
      });
    } catch (e) {
      Alert.alert('Backup Failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const handleRestorePress = () => {
    Alert.alert(
      'Restore from backup?',
      'This replaces ALL current routes, ride history, and settings with the contents of the backup file. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: doRestore },
      ],
    );
  };

  const doRestore = async () => {
    try {
      setBusy('restore');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const content = await (await fetch(result.assets[0].uri)).text();
      const data = parseBackup(content);
      await repository.importData({ routes: data.routes, rideHistory: data.rideHistory });
      if (data.settings) onUpdate({ ...DEFAULT_SETTINGS, ...data.settings });
      onDataRestored?.();

      const routeWord = data.routes.length === 1 ? 'route' : 'routes';
      const rideWord = data.rideHistory.length === 1 ? 'ride' : 'rides';
      Alert.alert(
        'Restore Complete',
        `Restored ${data.routes.length} ${routeWord} and ${data.rideHistory.length} ${rideWord}.`,
      );
    } catch (e) {
      Alert.alert('Restore Failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>SETTINGS</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DISPLAY</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Units</Text>
          <View style={styles.segmented}>
            {(['km', 'mi'] as const).map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.segment, settings.units === u && styles.segmentActive]}
                onPress={() => set({ units: u })}
              >
                <Text style={[styles.segmentText, settings.units === u && styles.segmentTextActive]}>
                  {u.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Appearance</Text>
          <View style={styles.segmented}>
            {(['dark', 'light', 'system'] as const).map((a) => (
              <TouchableOpacity
                key={a}
                style={[styles.segment, settings.appearance === a && styles.segmentActive]}
                onPress={() => set({ appearance: a })}
              >
                <Text style={[styles.segmentText, settings.appearance === a && styles.segmentTextActive]}>
                  {a === 'system' ? 'AUTO' : a.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AUDIO</Text>
        <View style={styles.row}>
          <View>
            <Text style={styles.rowLabel}>Audio announcements</Text>
            <Text style={styles.rowSub}>Speed updates & state changes</Text>
          </View>
          <Switch
            value={settings.audioEnabled}
            onValueChange={(v) => set({ audioEnabled: v })}
            trackColor={{ false: theme.borderStrong, true: theme.ahead }}
            thumbColor="#fff"
          />
        </View>

        {settings.audioEnabled && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Split announcement every</Text>
            <View style={styles.segmented}>
              {SPLIT_OPTIONS.map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.segment, settings.splitIntervalKm === val && styles.segmentActive]}
                  onPress={() => set({ splitIntervalKm: val })}
                >
                  <Text style={[styles.segmentText, settings.splitIntervalKm === val && styles.segmentTextActive]}>
                    {val}{settings.units}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Countdown length</Text>
          <View style={styles.segmented}>
            {COUNTDOWN_OPTIONS.map((val) => (
              <TouchableOpacity
                key={val}
                style={[styles.segment, settings.countdownSeconds === val && styles.segmentActive]}
                onPress={() => set({ countdownSeconds: val })}
              >
                <Text style={[styles.segmentText, settings.countdownSeconds === val && styles.segmentTextActive]}>
                  {val}s
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MARKERS</Text>
        <MarkerPicker
          label="You"
          value={settings.riderMarker}
          onChange={(m) => set({ riderMarker: m })}
        />
        <View style={styles.markerDivider} />
        <MarkerPicker
          label="Ghost"
          value={settings.ghostMarker}
          onChange={(m) => set({ ghostMarker: m })}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DATA</Text>
        <TouchableOpacity
          style={[styles.dataButton, busy !== null && styles.dataButtonDisabled]}
          onPress={handleBackup}
          disabled={busy !== null}
        >
          {busy === 'backup' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.dataButtonText}>Back up all data</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.dataHint}>
          Saves your routes, ride history, and settings to a file you can store in
          iCloud Drive, Google Drive, or Files.
        </Text>

        <TouchableOpacity
          style={[styles.dataButton, busy !== null && styles.dataButtonDisabled]}
          onPress={handleRestorePress}
          disabled={busy !== null}
        >
          {busy === 'restore' ? (
            <ActivityIndicator color="#f44336" />
          ) : (
            <Text style={[styles.dataButtonText, styles.dataButtonTextDanger]}>
              Restore from backup
            </Text>
          )}
        </TouchableOpacity>
        <Text style={styles.dataHint}>
          Replaces everything currently in the app with a backup file.
        </Text>

        <Text style={[styles.dataHint, styles.dataFootnote]}>
          Your rides are also included in your phone's automatic device backup
          (iCloud or Google), so they return when you restore or set up a new
          phone. Use a manual backup to move data sooner or keep your own copy.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DEVELOPER</Text>
        <View style={styles.row}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>Simulate GPS</Text>
            <Text style={styles.rowSub}>Replays the selected ghost as your live ride — no real GPS needed</Text>
          </View>
          <Switch
            value={settings.simulationEnabled}
            onValueChange={(v) => set({ simulationEnabled: v })}
            trackColor={{ false: theme.borderStrong, true: theme.warning }}
            thumbColor="#fff"
          />
        </View>

        {settings.simulationEnabled && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Playback speed</Text>
            <View style={styles.segmented}>
              {SIM_SPEED_OPTIONS.map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.segment, settings.simulationSpeed === val && styles.segmentActive]}
                  onPress={() => set({ simulationSpeed: val })}
                >
                  <Text style={[styles.segmentText, settings.simulationSpeed === val && styles.segmentTextActive]}>
                    {val}×
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

    </ScrollView>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
  },
  content: {
    paddingBottom: 60,
  },
  header: {
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  backButton: {
    marginBottom: 12,
    paddingVertical: 8,
  },
  backText: {
    fontSize: 20,
    color: t.textMuted,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: t.text,
    letterSpacing: 3,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: t.textMuted,
    letterSpacing: 2,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  rowLabel: {
    fontSize: 16,
    color: t.text,
    fontWeight: '500',
    flex: 1,
    marginRight: 16,
  },
  rowTextWrap: {
    flex: 1,
    marginRight: 16,
  },
  rowSub: {
    fontSize: 12,
    color: t.textMuted,
    marginTop: 2,
  },
  segmented: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.borderStrong,
  },
  segmentActive: {
    backgroundColor: t.accent,
    borderColor: t.accent,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: t.textMuted,
  },
  segmentTextActive: {
    color: t.accentText,
  },

  // Data backup / restore
  dataButton: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  dataButtonDisabled: {
    opacity: 0.5,
  },
  dataButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: t.text,
    letterSpacing: 1,
  },
  dataButtonTextDanger: {
    color: t.behind,
  },
  dataHint: {
    fontSize: 12,
    color: t.textMuted,
    marginTop: 8,
    lineHeight: 17,
  },
  dataFootnote: {
    marginTop: 18,
    color: t.textFaint,
  },

  // Marker picker
  markerSection: {
    paddingVertical: 16,
    gap: 12,
  },
  markerDivider: {
    height: 1,
    backgroundColor: t.border,
  },
  markerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: t.textSecondary,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  swatchActive: {
    borderWidth: 3,
    borderColor: t.text,
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emojiInput: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    fontSize: 30,
    color: t.text,
  },
  emojiHint: {
    fontSize: 13,
    color: t.textMuted,
  },
});
