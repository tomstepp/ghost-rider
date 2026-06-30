import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { RaceState, RouteNode } from '../types';
import { ElasticBand } from '../components/ElasticBand';
import { RouteShape } from '../components/RouteShape';
import { ElevationProfile } from '../components/ElevationProfile';
import { Units, formatDistance, formatSpeed, formatElapsed, formatDelta, formatPace } from '../utils/formatting';
import { MarkerSettings } from './SettingsScreen';

const AHEAD_COLOR = '#032b13';
const BEHIND_COLOR = '#360808';
const NEUTRAL_COLOR = '#000000';
const DELTA_THRESHOLD_MS = 1000;

function getDeltaColor(timeDelta: number | null): string {
  if (timeDelta === null) return NEUTRAL_COLOR;
  if (timeDelta < -DELTA_THRESHOLD_MS) return AHEAD_COLOR;
  if (timeDelta > DELTA_THRESHOLD_MS) return BEHIND_COLOR;
  return NEUTRAL_COLOR;
}

interface Props {
  raceState: RaceState;
  ghostNodes: RouteNode[] | null;
  liveNodes: RouteNode[];
  ghostTotalDistance: number | null;
  units: Units;
  riderMarker: MarkerSettings;
  ghostMarker: MarkerSettings;
  simulated?: boolean;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function RaceHUDScreen({ raceState, ghostNodes, liveNodes, ghostTotalDistance, units, riderMarker, ghostMarker, simulated = false, onStop, onPause, onResume }: Props) {
  useKeepAwake();
  const { width } = useWindowDimensions();
  const isPaused = raceState.status === 'paused';
  const bgColor = isPaused ? '#0a0a0a' : getDeltaColor(raceState.timeDelta);
  const hasGhost = ghostNodes && ghostNodes.length > 1;
  const [vizMode, setVizMode] = useState<'route' | 'elevation'>('route');

  const vizWidth = width - 32;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {simulated && (
        <View style={styles.simBadge}>
          <Text style={styles.simText}>SIM</Text>
        </View>
      )}
      {!raceState.gpsAcquired && (
        <View style={[styles.gpsAlert, styles.gpsAcquiring]}>
          <Text style={styles.gpsAlertText}>WAITING FOR GPS…</Text>
        </View>
      )}
      {raceState.gpsAcquired && raceState.gpsLost && (
        <View style={styles.gpsAlert}>
          <Text style={styles.gpsAlertText}>GPS SIGNAL LOST</Text>
        </View>
      )}
      {isPaused && (
        <View style={styles.pausedBadge}>
          <Text style={styles.pausedText}>PAUSED</Text>
        </View>
      )}

      {/* Visualization panel — tap to toggle between route shape and elevation */}
      {hasGhost ? (
        <TouchableOpacity activeOpacity={0.8} onPress={() => setVizMode((m) => m === 'route' ? 'elevation' : 'route')}>
          {vizMode === 'route' ? (
            <RouteShape
              nodes={ghostNodes}
              width={vizWidth}
              height={140}
              riderDistanceM={raceState.distanceMeters}
              ghostDistanceM={raceState.ghostDistanceMeters ?? undefined}
              riderMarker={riderMarker}
              ghostMarker={ghostMarker}
              strokeColor="#333"
              padding={12}
            />
          ) : (
            <ElevationProfile
              nodes={ghostNodes}
              width={vizWidth}
              height={140}
              riderDistanceM={raceState.distanceMeters}
              ghostDistanceM={raceState.ghostDistanceMeters ?? undefined}
              riderMarker={riderMarker}
              ghostMarker={ghostMarker}
            />
          )}
          {/* Page dots */}
          <View style={styles.dots}>
            <View style={[styles.dot, vizMode === 'route' && styles.dotActive]} />
            <View style={[styles.dot, vizMode === 'elevation' && styles.dotActive]} />
          </View>
        </TouchableOpacity>
      ) : liveNodes.length > 1 ? (
        <RouteShape
          nodes={liveNodes}
          width={vizWidth}
          height={140}
          riderDistanceM={raceState.distanceMeters}
          riderMarker={riderMarker}
          strokeColor="#333"
          padding={12}
        />
      ) : (
        <ElasticBand
          userDistance={raceState.distanceMeters}
          ghostDistance={raceState.ghostDistanceMeters}
          totalDistance={ghostTotalDistance}
        />
      )}

      <Text style={styles.timeDelta}>
        {formatDelta(raceState.timeDelta)}
      </Text>

      <View style={styles.metricsGrid}>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatSpeed(raceState.currentSpeedMs, units)}</Text>
            <Text style={styles.metricLabel}>SPEED</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatPace(raceState.currentSpeedMs, units)}</Text>
            <Text style={styles.metricLabel}>PACE</Text>
          </View>
        </View>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatDistance(raceState.distanceMeters, units)}</Text>
            <Text style={styles.metricLabel}>DISTANCE</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatElapsed(raceState.elapsedMs)}</Text>
            <Text style={styles.metricLabel}>TIME</Text>
          </View>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.pauseButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            isPaused ? onResume() : onPause();
          }}
        >
          <Text style={styles.pauseText}>{isPaused ? 'RESUME' : 'PAUSE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.stopButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onStop();
          }}
        >
          <Text style={styles.stopText}>STOP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  simBadge: {
    position: 'absolute',
    top: 60,
    left: 16,
    backgroundColor: '#b37800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 2,
  },
  gpsAlert: {
    position: 'absolute',
    top: 60,
    backgroundColor: '#ff4444',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  gpsAcquiring: {
    backgroundColor: '#b37800',
  },
  gpsAlertText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
  },
  pausedBadge: {
    position: 'absolute',
    top: 60,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pausedText: {
    color: '#888',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 3,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#333',
  },
  dotActive: {
    backgroundColor: '#888',
  },
  timeDelta: {
    fontSize: 96,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -2,
    textAlign: 'center',
    marginTop: 8,
  },
  metricsGrid: {
    marginTop: 24,
    gap: 16,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 48,
    justifyContent: 'center',
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 36,
    gap: 16,
  },
  pauseButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#555',
  },
  pauseText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#aaa',
    letterSpacing: 2,
  },
  stopButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  stopText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#555',
    letterSpacing: 2,
  },
});
