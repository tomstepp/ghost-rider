import React, { useMemo } from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { Theme, useTheme } from '../theme';

const PRIVACY_POLICY_URL = 'https://docs.google.com/document/d/e/2PACX-1vRErAZb8d26NE11uWIk_JELmffpuku8g2auclEQbCsR0fj6oZh1DYM5BbFptNNQC-5tQ2iIPExDc0-4/pub';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

interface Props {
  onBack: () => void;
  onResetOnboarding: () => void;
}

export function AboutScreen({ onBack, onResetOnboarding }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ABOUT</Text>
      </View>

      <View style={styles.iconRow}>
        <Image source={require('../../assets/icon.png')} style={styles.icon} />
        <View>
          <Text style={styles.appName}>GhostRider</Text>
          <Text style={styles.version}>Version {APP_VERSION}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.row} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          <Text style={styles.rowLabel}>Privacy Policy</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={onResetOnboarding}>
          <Text style={styles.rowLabel}>Show intro again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
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
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
  appName: {
    fontSize: 20,
    fontWeight: '800',
    color: t.text,
  },
  version: {
    fontSize: 14,
    color: t.textMuted,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 28,
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
  },
  rowChevron: {
    fontSize: 20,
    color: t.textMuted,
  },
});
