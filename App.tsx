import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Modal, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { resolveTheme, Theme, ThemeProvider } from './src/theme';
import { RaceState, Route, RouteNode } from './src/types';
import { SqliteRideRepository } from './src/storage/SqliteRideRepository';
import { RideCheckpoint } from './src/storage/IRideRepository';
import { getGhostTimeAtDistance, getGhostDistanceAtTime } from './src/utils/ghostInterpolation';
import Constants from 'expo-constants';
import { ILocationProvider } from './src/providers/ILocationProvider';
import { LiveLocationProvider } from './src/providers/LiveLocationProvider';
import { SimulatedLocationProvider } from './src/providers/SimulatedLocationProvider';
import { useGhostRace } from './src/hooks/useGhostRace';
import { RouteListScreen } from './src/screens/RouteListScreen';
import { PreRaceScreen } from './src/screens/PreRaceScreen';
import { RaceHUDScreen } from './src/screens/RaceHUDScreen';
import { PostRaceScreen } from './src/screens/PostRaceScreen';
import { RideHistoryScreen } from './src/screens/RideHistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { usePersistedSettings } from './src/hooks/usePersistedSettings';
import { initAudio, announceTimeDelta, announceGpsLost, playChimeAhead, playChimeBehind, playChimeNeck } from './src/utils/audioService';
import { calcElevationGain } from './src/utils/routeGeometry';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDED_KEY = '@ghost_rider_onboarded';

type AppScreen = 'list' | 'prerace' | 'racing' | 'finished' | 'history' | 'settings' | 'about';

const repository = new SqliteRideRepository();

function createLocationProvider(): ILocationProvider {
  if (Constants.appOwnership === 'expo') {
    return new LiveLocationProvider();
  }
  // Dynamic require prevents the module-level TaskManager.defineTask from
  // running in Expo Go, which doesn't support background tasks
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BackgroundLocationProvider } = require('./src/providers/BackgroundLocationProvider');
  return new BackgroundLocationProvider();
}

const locationProvider = createLocationProvider();

const TIME_ANNOUNCEMENT_INTERVAL_MS = 60_000;

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('list');
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [ghostNodes, setGhostNodes] = useState<RouteNode[] | null>(null);
  const [rideNodes, setRideNodes] = useState<RouteNode[]>([]);
  const [locationDenied, setLocationDenied] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Synthetic race summary rebuilt from a recovered checkpoint; when set it
  // stands in for the live hook state on the Post-Race screen.
  const [recoveredSummary, setRecoveredSummary] = useState<RaceState | null>(null);
  const [recoveryPrompt, setRecoveryPrompt] = useState(false);
  const { settings, updateSettings, loaded: settingsLoaded } = usePersistedSettings();
  const systemScheme = useColorScheme();
  const theme = useMemo(
    () => resolveTheme(settings.appearance, systemScheme),
    [settings.appearance, systemScheme],
  );
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const statusBarStyle = theme.mode === 'dark' ? 'light' : 'dark';

  // In simulation mode the selected ghost's recorded path is replayed as the
  // live GPS feed (see Settings → Developer). Resolved fresh at each race start.
  const simulating = settings.simulationEnabled && !!ghostNodes && ghostNodes.length > 1;
  const makeProvider = useCallback((): ILocationProvider => {
    if (settings.simulationEnabled && ghostNodes && ghostNodes.length > 1) {
      return new SimulatedLocationProvider(ghostNodes, settings.simulationSpeed);
    }
    return locationProvider;
  }, [settings.simulationEnabled, settings.simulationSpeed, ghostNodes]);

  const { state, liveNodes, start, stop, pause, resume, reset, getNodes } = useGhostRace(makeProvider, ghostNodes);

  const lastAnnouncedKmRef = useRef(0);
  const lastAnnouncedTimeRef = useRef(0);
  const lastDeltaZoneRef = useRef<'ahead' | 'neck' | 'behind' | null>(null);

  // Crash-recovery checkpoint bookkeeping
  const persistedNodeCountRef = useRef(0);
  const rideStartedAtRef = useRef(0);
  const pendingRecoveryRef = useRef<RideCheckpoint | null>(null);
  const recoveryCheckedRef = useRef(false);

  const effectiveState = recoveredSummary ?? state;

  useEffect(() => {
    initAudio();
    AsyncStorage.getItem(ONBOARDED_KEY).then((val) => {
      if (!val) setShowOnboarding(true);
    });
  }, []);

  const handleOnboardingDone = useCallback(() => {
    AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    setShowOnboarding(false);
  }, []);

  const handleResetOnboarding = useCallback(() => {
    AsyncStorage.removeItem(ONBOARDED_KEY);
    setShowOnboarding(true);
    setScreen('list');
  }, []);

  const handleOpenAbout = useCallback(() => setScreen('about'), []);

  useEffect(() => {
    if (state.gpsLost && settings.audioEnabled) announceGpsLost();
  }, [state.gpsLost, settings.audioEnabled]);

  useEffect(() => {
    if (screen !== 'racing' || state.timeDelta === null || !settings.audioEnabled) return;
    const zone = state.timeDelta < -1000 ? 'ahead' : state.timeDelta > 1000 ? 'behind' : 'neck';
    const prev = lastDeltaZoneRef.current;
    if (prev !== null && prev !== zone) {
      if (zone === 'ahead') playChimeAhead();
      else if (zone === 'behind') playChimeBehind();
      else if (zone === 'neck') playChimeNeck();
    }
    lastDeltaZoneRef.current = zone;
  }, [state.timeDelta, screen, settings.audioEnabled]);

  useEffect(() => {
    if (screen !== 'racing' || state.timeDelta === null || !settings.audioEnabled) return;
    const splitIntervalM = settings.splitIntervalKm * (settings.units === 'mi' ? 1609.34 : 1000);
    const splitsCovered = Math.floor(state.distanceMeters / splitIntervalM);
    const timeSinceLastMs = state.elapsedMs - lastAnnouncedTimeRef.current;
    if (splitsCovered > lastAnnouncedKmRef.current || timeSinceLastMs >= TIME_ANNOUNCEMENT_INTERVAL_MS) {
      announceTimeDelta(state.timeDelta);
      lastAnnouncedKmRef.current = splitsCovered;
      lastAnnouncedTimeRef.current = state.elapsedMs;
    }
  }, [state.distanceMeters, state.elapsedMs, state.timeDelta, screen, settings]);

  // When the app backgrounds, checkpoint the WAL into the main db file so an
  // OS device backup (iCloud / Android Auto Backup) captures a consistent db.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        repository.checkpoint().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // On launch, surface any ride that was being recorded when the app died.
  useEffect(() => {
    if (!settingsLoaded || recoveryCheckedRef.current) return;
    recoveryCheckedRef.current = true;
    repository.getCheckpoint().then((cp) => {
      if (cp && cp.nodes.length >= 2) {
        pendingRecoveryRef.current = cp;
        setRecoveryPrompt(true);
      } else if (cp) {
        // Empty/aborted checkpoint (e.g. permission denied right after start) —
        // nothing worth recovering, so clear it.
        repository.clearCheckpoint();
      }
    });
  }, [settingsLoaded]);

  // Persist newly-recorded nodes incrementally during a race. liveNodes only
  // grows when a node is appended (~every 15m), so writes are infrequent.
  // Simulated rides are checkpointed too, so recovery can be tested via the sim.
  useEffect(() => {
    if (screen !== 'racing') return;
    if (liveNodes.length <= persistedNodeCountRef.current) return;
    const newNodes = liveNodes.slice(persistedNodeCountRef.current);
    persistedNodeCountRef.current = liveNodes.length;
    repository.appendCheckpointNodes(newNodes).catch((e) =>
      console.warn('[GhostRider] checkpoint append failed:', e),
    );
  }, [liveNodes, screen, simulating]);

  const handleSelectRoute = useCallback(async (route: Route) => {
    const nodes = await repository.getRouteNodes(route.id);
    setSelectedRoute(route);
    setGhostNodes(nodes);
    setScreen('prerace');
  }, []);

  const handleStartFreeRide = useCallback(() => {
    setSelectedRoute(null);
    setGhostNodes(null);
    setScreen('prerace');
  }, []);

  const handleGo = useCallback(async () => {
    lastDeltaZoneRef.current = null;
    setRecoveredSummary(null);
    persistedNodeCountRef.current = 0;
    rideStartedAtRef.current = Date.now();
    // Open a fresh checkpoint so a mid-ride crash is recoverable.
    await repository.startCheckpoint(selectedRoute?.id ?? null, rideStartedAtRef.current).catch(() => {});
    setScreen('racing');
    try {
      // The location provider owns permission acquisition; it throws if the
      // foreground permission is denied.
      await start();
    } catch {
      setScreen('prerace');
      setLocationDenied(true);
      repository.clearCheckpoint().catch(() => {});
    }
  }, [start, selectedRoute]);

  const handleCancelPreRace = useCallback(() => {
    setSelectedRoute(null);
    setGhostNodes(null);
    setScreen('list');
  }, []);

  // Writes the ride to history. Called when the user finalizes on the Post-Race
  // screen (save or discard) rather than at STOP, so the same path serves both
  // a normal finish and a recovered ride — and a crash on the summary screen is
  // covered by checkpoint recovery instead of an eager write.
  const saveRideRecord = useCallback(
    async (s: RaceState, nodes: RouteNode[], route: Route | null, startedAt: number) => {
      const totalDistance = s.distanceMeters;
      // Guard against division by zero (instant stop) producing Infinity.
      const elapsedSec = s.elapsedMs / 1000;
      const avgSpeed = elapsedSec > 0 ? totalDistance / elapsedSec : 0;
      // Guard against a zero-distance ghost producing NaN.
      const completedPct = route && route.total_distance > 0
        ? Math.min((totalDistance / route.total_distance) * 100, 100)
        : 100;
      await repository.saveRideHistory({
        route_id: route?.id ?? null,
        duration_ms: s.elapsedMs,
        avg_speed: avgSpeed,
        final_time_delta: s.timeDelta ?? 0,
        completed_percentage: completedPct,
        completed_at: startedAt > 0 ? startedAt + s.elapsedMs : Date.now(),
        elevation_gain_m: calcElevationGain(nodes),
      });
    },
    [],
  );

  const handleStopRace = useCallback(async () => {
    // STOP must always reach the summary screen — stopping GPS and writing
    // history are best-effort, and a failure in either can't be allowed to
    // strand the rider on the HUD.
    const nodes = getNodes();
    setRideNodes([...nodes]);
    try {
      await stop();
    } catch (e) {
      console.warn('[GhostRider] provider stop failed:', e);
    }
    try {
      // History is logged here (a completed ride is always recorded). If this
      // throws, the checkpoint is intentionally left so the ride is recovered
      // on next launch rather than lost.
      await saveRideRecord(state, nodes, selectedRoute, rideStartedAtRef.current);
      await repository.clearCheckpoint();
    } catch (e) {
      console.warn('[GhostRider] saving ride on stop failed:', e);
    }
    setScreen('finished');
  }, [stop, getNodes, state, selectedRoute, saveRideRecord]);

  const handleSaveAsGhost = useCallback(async (name: string) => {
    try {
      await repository.saveRoute(name, rideNodes);
      // A recovered ride never went through STOP, so log its history now.
      // A normal ride was already logged at STOP — don't double-count it.
      if (recoveredSummary) {
        await saveRideRecord(recoveredSummary, rideNodes, selectedRoute, rideStartedAtRef.current);
      }
      await repository.clearCheckpoint();
    } catch (e) {
      console.warn('[GhostRider] save as ghost failed:', e);
    }
    setRecoveredSummary(null);
    reset();
    setScreen('list');
  }, [rideNodes, recoveredSummary, selectedRoute, saveRideRecord, reset]);

  const handleDiscard = useCallback(async () => {
    try {
      // Only a recovered ride still needs its history written here; a normal
      // ride was already logged at STOP.
      if (recoveredSummary) {
        await saveRideRecord(recoveredSummary, rideNodes, selectedRoute, rideStartedAtRef.current);
      }
      await repository.clearCheckpoint();
    } catch (e) {
      console.warn('[GhostRider] discard cleanup failed:', e);
    }
    setRecoveredSummary(null);
    reset();
    setScreen('list');
  }, [recoveredSummary, rideNodes, selectedRoute, saveRideRecord, reset]);

  const handleRecover = useCallback(async () => {
    const cp = pendingRecoveryRef.current;
    setRecoveryPrompt(false);
    if (!cp || cp.nodes.length < 2) return;
    let route: Route | null = null;
    let gNodes: RouteNode[] | null = null;
    if (cp.routeId != null) {
      route = await repository.getRouteById(cp.routeId);
      if (route) gNodes = await repository.getRouteNodes(cp.routeId);
    }
    const last = cp.nodes[cp.nodes.length - 1];
    const distance = last.distance_from_start;
    const elapsed = last.timestamp;
    let timeDelta: number | null = null;
    let ghostDistanceMeters: number | null = null;
    if (gNodes && gNodes.length > 0) {
      const gt = getGhostTimeAtDistance(gNodes, distance);
      if (gt !== null) timeDelta = elapsed - gt;
      ghostDistanceMeters = getGhostDistanceAtTime(gNodes, elapsed);
    }
    rideStartedAtRef.current = cp.startedAt;
    setSelectedRoute(route);
    setGhostNodes(gNodes);
    setRideNodes(cp.nodes);
    setRecoveredSummary({
      status: 'finished',
      elapsedMs: elapsed,
      distanceMeters: distance,
      currentSpeedMs: 0,
      timeDelta,
      ghostDistanceMeters,
      gpsLost: false,
      gpsAcquired: true,
    });
    pendingRecoveryRef.current = null;
    setScreen('finished');
  }, []);

  const handleDiscardRecovery = useCallback(async () => {
    setRecoveryPrompt(false);
    pendingRecoveryRef.current = null;
    await repository.clearCheckpoint();
  }, []);

  // Hold the first paint until persisted settings resolve, otherwise the app
  // briefly renders with DEFAULT_SETTINGS (e.g. miles) and a race could start
  // on the wrong units before AsyncStorage returns.
  if (!settingsLoaded) {
    return (
      <ErrorBoundary>
        <ThemeProvider theme={theme}>
          <StatusBar style={statusBarStyle} />
          <View style={styles.splash} />
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <ThemeProvider theme={theme}>
          <StatusBar style={statusBarStyle} />
          <OnboardingScreen onDone={handleOnboardingDone} />
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
      <StatusBar style={statusBarStyle} />
      {screen === 'list' && (
        <RouteListScreen
          repository={repository}
          onSelectRoute={handleSelectRoute}
          onStartFreeRide={handleStartFreeRide}
          onViewHistory={() => setScreen('history')}
          onOpenSettings={() => setScreen('settings')}
          onOpenAbout={handleOpenAbout}
          units={settings.units}
        />
      )}
      {screen === 'prerace' && (
        <PreRaceScreen
          ghost={selectedRoute}
          ghostNodes={ghostNodes}
          countdownSeconds={settings.countdownSeconds}
          units={settings.units}
          simulated={simulating}
          onGo={handleGo}
          onCancel={handleCancelPreRace}
        />
      )}
      {screen === 'racing' && (
        <RaceHUDScreen
          raceState={state}
          ghostNodes={ghostNodes}
          liveNodes={liveNodes}
          ghostTotalDistance={selectedRoute?.total_distance ?? null}
          units={settings.units}
          riderMarker={settings.riderMarker}
          ghostMarker={settings.ghostMarker}
          simulated={simulating}
          onStop={handleStopRace}
          onPause={pause}
          onResume={resume}
        />
      )}
      {screen === 'finished' && (
        <PostRaceScreen
          raceState={effectiveState}
          rideNodes={rideNodes}
          units={settings.units}
          onSaveAsGhost={handleSaveAsGhost}
          onDiscard={handleDiscard}
        />
      )}
      {screen === 'history' && (
        <RideHistoryScreen
          repository={repository}
          units={settings.units}
          onBack={() => setScreen('list')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          settings={settings}
          onUpdate={updateSettings}
          onBack={() => setScreen('list')}
          repository={repository}
          onDataRestored={() => {
            // The selected ghost may have been replaced/removed by the restore.
            setSelectedRoute(null);
            setGhostNodes(null);
          }}
        />
      )}
      {screen === 'about' && (
        <AboutScreen
          onBack={() => setScreen('list')}
          onResetOnboarding={handleResetOnboarding}
        />
      )}

      <Modal
        visible={locationDenied}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationDenied(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalEmoji}>📍</Text>
            <Text style={styles.modalTitle}>Location Required</Text>
            <Text style={styles.modalBody}>
              GhostRider needs location access to track your ride. Please enable it in Settings.
            </Text>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => {
                setLocationDenied(false);
                Linking.openSettings();
              }}
            >
              <Text style={styles.settingsButtonText}>OPEN SETTINGS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setLocationDenied(false)}
            >
              <Text style={styles.cancelButtonText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={recoveryPrompt}
        transparent
        animationType="fade"
        onRequestClose={handleDiscardRecovery}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalEmoji}>🛟</Text>
            <Text style={styles.modalTitle}>Unfinished Ride</Text>
            <Text style={styles.modalBody}>
              GhostRider closed during a ride. Recover it to review and save, or discard it.
            </Text>
            <TouchableOpacity style={styles.settingsButton} onPress={handleRecover}>
              <Text style={styles.settingsButtonText}>RECOVER RIDE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={handleDiscardRecovery}>
              <Text style={styles.cancelButtonText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: t.bg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: t.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalBox: {
    backgroundColor: t.surface,
    borderRadius: 20,
    padding: 32,
    width: '100%',
    alignItems: 'center',
  },
  modalEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: t.text,
    marginBottom: 12,
    letterSpacing: 1,
  },
  modalBody: {
    fontSize: 15,
    color: t.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  settingsButton: {
    backgroundColor: t.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  settingsButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: t.accentText,
    letterSpacing: 2,
  },
  cancelButton: {
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 15,
    color: t.textMuted,
  },
});
