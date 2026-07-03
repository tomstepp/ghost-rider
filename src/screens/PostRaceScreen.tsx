import React, { useMemo, useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { RaceState, RouteNode } from '../types';
import { Units, formatDistance, formatPace, formatElapsed, formatElevation } from '../utils/formatting';
import { RouteShape } from '../components/RouteShape';
import { RouteMap, RouteMapHandle } from '../components/RouteMap';
import { ElevationProfile } from '../components/ElevationProfile';
import { calcElevationGain } from '../utils/routeGeometry';
import { Theme, useTheme } from '../theme';
import * as Haptics from 'expo-haptics';

interface Props {
  raceState: RaceState;
  rideNodes: RouteNode[];
  units: Units;
  onSaveAsGhost: (name: string) => Promise<void>;
  onDiscard: () => void;
}

function formatDeltaVerbose(timeDelta: number | null): string {
  if (timeDelta === null) return 'Free ride';
  if (Math.abs(timeDelta) < 1000) return 'NECK AND NECK';
  const sign = timeDelta < 0 ? 'AHEAD by' : 'BEHIND by';
  return `${sign} ${Math.abs(timeDelta / 1000).toFixed(1)}s`;
}

export function PostRaceScreen({ raceState, rideNodes, units, onSaveAsGhost, onDiscard }: Props) {
  const [ghostName, setGhostName] = useState('');
  const [saving, setSaving] = useState(false);
  // Map image baked into the share card during capture (native maps can't be
  // captured by view-shot, so we snapshot the map separately and swap it in).
  const [shareMapUri, setShareMapUri] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const shareCardRef = useRef<View>(null);
  const routeMapRef = useRef<RouteMapHandle>(null);

  const canSave = raceState.elapsedMs > 1000 && raceState.distanceMeters > 0.3048;
  const avgSpeedMs = raceState.distanceMeters / (raceState.elapsedMs / 1000) || 0;
  const hasRoute = rideNodes.length > 1;
  const vizWidth = width - 48;
  const elevationGainM = calcElevationGain(rideNodes);

  const handleSave = async () => {
    if (!ghostName.trim()) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await onSaveAsGhost(ghostName.trim());
    setSaving(false);
  };

  const handleShare = async () => {
    let bakedMap = false;
    try {
      // Bake the real map into the card when possible; otherwise the SVG route
      // (always capturable) stays as the fallback.
      if (hasRoute && routeMapRef.current) {
        const mapUri = await routeMapRef.current.takeSnapshot();
        if (mapUri) {
          setShareMapUri(mapUri);
          bakedMap = true;
          // Let the swapped-in <Image> commit before capturing the card.
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.95 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your ride' });
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      if (bakedMap) setShareMapUri(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>RIDE COMPLETE</Text>

      {hasRoute && (
        <View style={styles.mapReview}>
          <RouteMap ref={routeMapRef} nodes={rideNodes} height={vizWidth * 0.6} interactive />
        </View>
      )}

      {/* Shareable card — captured for share screenshot. Keeps the SVG RouteShape
          because a native MapView renders blank in react-native-view-shot. */}
      <View ref={shareCardRef} style={styles.shareCard} collapsable={false}>
        {hasRoute && (
          <View style={styles.visuals}>
            {shareMapUri ? (
              <Image
                source={{ uri: shareMapUri }}
                style={[styles.shareMapImage, { width: vizWidth, height: vizWidth * 0.5 }]}
                resizeMode="cover"
              />
            ) : (
              <RouteShape nodes={rideNodes} width={vizWidth} height={vizWidth * 0.5} strokeColor="#555" showEndpoints />
            )}
            <View style={styles.elevationWrap}>
              <ElevationProfile nodes={rideNodes} width={vizWidth} height={56} />
            </View>
          </View>
        )}

        <Text
          style={[
            styles.delta,
            raceState.timeDelta !== null && raceState.timeDelta < 0 ? styles.deltaAhead : styles.deltaBehind,
          ]}
        >
          {formatDeltaVerbose(raceState.timeDelta)}
        </Text>

        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatElapsed(raceState.elapsedMs)}</Text>
              <Text style={styles.statLabel}>TIME</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatDistance(raceState.distanceMeters, units)}</Text>
              <Text style={styles.statLabel}>DISTANCE</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatPace(avgSpeedMs, units)}</Text>
              <Text style={styles.statLabel}>AVG PACE</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>↑ {formatElevation(elevationGainM, units)}</Text>
              <Text style={styles.statLabel}>ELEV GAIN</Text>
            </View>
          </View>
        </View>

        <Text style={styles.shareCardBrand}>GhostRider</Text>
      </View>

      <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
        <Text style={styles.shareButtonText}>SHARE RIDE</Text>
      </TouchableOpacity>

      {canSave && (
        <View style={styles.saveSection}>
          <Text style={styles.saveLabel}>SAVE AS GHOST TEMPLATE</Text>
          <TextInput
            style={styles.nameInput}
            placeholder="e.g. Saturday Morning Loop"
            placeholderTextColor="#444"
            value={ghostName}
            onChangeText={setGhostName}
          />
          <TouchableOpacity
            style={[styles.saveButton, !ghostName.trim() && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!ghostName.trim() || saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'SAVING...' : 'SAVE GHOST'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.discardButton} onPress={onDiscard}>
        <Text style={styles.discardText}>DISCARD RIDE</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
  },
  content: {
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 60,
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: t.textMuted,
    letterSpacing: 4,
    marginBottom: 24,
  },
  shareCard: {
    backgroundColor: t.bg,
    width: '100%',
    alignItems: 'center',
    paddingBottom: 20,
  },
  mapReview: {
    width: '100%',
    marginBottom: 24,
  },
  visuals: {
    marginBottom: 24,
    alignItems: 'center',
  },
  shareMapImage: {
    borderRadius: 12,
  },
  elevationWrap: {
    marginTop: 8,
  },
  delta: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 32,
    textAlign: 'center',
  },
  deltaAhead: { color: t.ahead },
  deltaBehind: { color: t.behind },
  statsGrid: {
    gap: 16,
    marginBottom: 24,
    width: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 32,
  },
  stat: { alignItems: 'center' },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: t.text,
  },
  statLabel: {
    fontSize: 10,
    color: t.textMuted,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  shareCardBrand: {
    fontSize: 11,
    fontWeight: '700',
    color: t.textFaint,
    letterSpacing: 3,
  },
  shareButton: {
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    marginBottom: 32,
  },
  shareButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: t.textMuted,
    letterSpacing: 2,
  },
  saveSection: {
    width: '100%',
    marginBottom: 24,
  },
  saveLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: t.textMuted,
    letterSpacing: 2,
    marginBottom: 12,
  },
  nameInput: {
    backgroundColor: t.surface,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: t.text,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: t.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: { backgroundColor: t.surfaceAlt },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: t.accentText,
    letterSpacing: 2,
  },
  discardButton: { paddingVertical: 16 },
  discardText: {
    fontSize: 13,
    color: t.textFaint,
    letterSpacing: 2,
  },
});
