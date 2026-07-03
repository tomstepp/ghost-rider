import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import * as Location from 'expo-location';
import { Route, RouteNode } from '../types';
import { RouteMap } from '../components/RouteMap';
import { ElevationProfile } from '../components/ElevationProfile';
import { announceCountdown } from '../utils/audioService';
import { calcElevationGain } from '../utils/routeGeometry';
import { Units, formatDistance, formatElapsed, formatElevation } from '../utils/formatting';
import { Theme, useTheme } from '../theme';

interface Props {
  ghost: Route | null;
  ghostNodes: RouteNode[] | null;
  countdownSeconds: number;
  units: Units;
  simulated?: boolean;
  onGo: () => void;
  onCancel: () => void;
}

export function PreRaceScreen({ ghost, ghostNodes, countdownSeconds, units, simulated = false, onGo, onCancel }: Props) {
  const [gpsReady, setGpsReady] = useState(simulated);
  const [count, setCount] = useState(countdownSeconds);
  // The countdown no longer auto-runs — it begins only after the rider taps
  // START, so they can review the route/stats first.
  const [started, setStarted] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const gpsPulse = useRef(new Animated.Value(1)).current;
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const elevationGainM = useMemo(
    () => ghostNodes && ghostNodes.length > 1 ? calcElevationGain(ghostNodes) : 0,
    [ghostNodes],
  );

  // Wait for first accurate GPS fix before starting countdown.
  // Falls open immediately if permission not granted yet (handleGo will request it).
  useEffect(() => {
    if (simulated) return; // no real fix to wait for — countdown starts immediately
    let active = true;
    let sub: Location.LocationSubscription | null = null;
    const timeoutId = setTimeout(() => { if (active) setGpsReady(true); }, 30_000);

    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (active) setGpsReady(true);
        clearTimeout(timeoutId);
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          if (active && (loc.coords.accuracy ?? 999) < 50) {
            setGpsReady(true);
            active = false;
            sub?.remove();
            clearTimeout(timeoutId);
          }
        },
      );
    })().catch(() => { if (active) setGpsReady(true); });

    return () => {
      active = false;
      sub?.remove();
      clearTimeout(timeoutId);
    };
  }, [simulated]);

  // Pulse animation while waiting for GPS
  useEffect(() => {
    if (gpsReady) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(gpsPulse, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(gpsPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [gpsReady, gpsPulse]);

  // Countdown — runs only after START is tapped and GPS is ready
  useEffect(() => {
    if (!started || !gpsReady) return;
    announceCountdown(count);
    if (count === 0) {
      onGo();
      return;
    }
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, started, gpsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasNodes = ghostNodes && ghostNodes.length > 1;
  const mapSize = width - 48;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {ghost ? 'RACING AGAINST' : 'FREE RIDE'}
      </Text>
      {ghost && (
        <Text style={styles.ghostName}>{ghost.name}</Text>
      )}

      {ghost && (
        <View style={styles.routeStats}>
          <View style={styles.routeStat}>
            <Text style={styles.routeStatValue}>{formatDistance(ghost.total_distance, units)}</Text>
            <Text style={styles.routeStatLabel}>DISTANCE</Text>
          </View>
          <View style={styles.routeStatDivider} />
          <View style={styles.routeStat}>
            <Text style={styles.routeStatValue}>{formatElapsed(ghost.total_time_ms)}</Text>
            <Text style={styles.routeStatLabel}>GHOST TIME</Text>
          </View>
          {elevationGainM > 0 && (
            <>
              <View style={styles.routeStatDivider} />
              <View style={styles.routeStat}>
                <Text style={styles.routeStatValue}>↑ {formatElevation(elevationGainM, units)}</Text>
                <Text style={styles.routeStatLabel}>ELEV GAIN</Text>
              </View>
            </>
          )}
        </View>
      )}

      {hasNodes && (
        <View style={styles.visuals}>
          <RouteMap
            nodes={ghostNodes}
            height={mapSize * 0.55}
            style={{ width: mapSize }}
          />
          <View style={styles.elevationContainer}>
            <ElevationProfile
              nodes={ghostNodes}
              width={mapSize}
              height={56}
            />
          </View>
        </View>
      )}

      {started ? (
        <>
          {gpsReady ? (
            <Animated.Text style={[styles.countdown, { transform: [{ scale: scaleAnim }] }]}>
              {count === 0 ? 'GO!' : count}
            </Animated.Text>
          ) : (
            <Animated.Text style={[styles.gpsIndicator, { opacity: gpsPulse }]}>●</Animated.Text>
          )}
          <Text style={styles.sublabel}>
            {gpsReady ? `Starting in ${count}s…` : 'Acquiring GPS…'}
          </Text>
        </>
      ) : (
        <Text style={styles.sublabel}>
          {gpsReady ? 'Ready when you are' : 'Acquiring GPS…'}
        </Text>
      )}

      <View style={styles.bottomButtons}>
        {started ? (
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.startNowButton} onPress={() => setStarted(true)}>
              <Text style={styles.startNowText}>START</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: t.textMuted,
    letterSpacing: 3,
    marginBottom: 8,
  },
  ghostName: {
    fontSize: 20,
    fontWeight: '700',
    color: t.text,
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  routeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  routeStat: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  routeStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: t.text,
  },
  routeStatLabel: {
    fontSize: 10,
    color: t.textMuted,
    letterSpacing: 1.5,
    marginTop: 3,
  },
  routeStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: t.border,
  },
  visuals: {
    marginBottom: 24,
    alignItems: 'center',
  },
  elevationContainer: {
    marginTop: 8,
  },
  countdown: {
    fontSize: 120,
    fontWeight: '900',
    color: t.text,
    lineHeight: 130,
  },
  gpsIndicator: {
    fontSize: 80,
    color: t.textMuted,
    lineHeight: 110,
  },
  sublabel: {
    fontSize: 14,
    color: t.textFaint,
    marginTop: 16,
    letterSpacing: 1,
  },
  bottomButtons: {
    position: 'absolute',
    bottom: 80,
    alignItems: 'center',
    gap: 16,
  },
  startNowButton: {
    backgroundColor: t.accent,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  startNowText: {
    fontSize: 15,
    fontWeight: '900',
    color: t.accentText,
    letterSpacing: 2,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: t.textMuted,
    letterSpacing: 2,
  },
});
