import { useCallback, useEffect, useRef, useState } from 'react';
import { LocationPoint, RaceState, RouteNode } from '../types';
import { ILocationProvider } from '../providers/ILocationProvider';
import { haversineDistance } from '../utils/haversine';
import { getGhostTimeAtDistance, getGhostDistanceAtTime } from '../utils/ghostInterpolation';

const MIN_ACCURACY_M = 50;
const GPS_LOST_THRESHOLD_MS = 5000;
const RECORD_DISTANCE_THRESHOLD_M = 15; // ~2-3s at 15 mph
// Movement below this from the last anchor is treated as GPS jitter and not
// accumulated. The anchor is held (not advanced) until movement clears the
// floor, so slow genuine motion accumulates across ticks rather than being lost.
const MIN_MOVEMENT_M = 3;

const INITIAL_STATE: RaceState = {
  status: 'idle',
  elapsedMs: 0,
  distanceMeters: 0,
  currentSpeedMs: 0,
  timeDelta: null,
  ghostDistanceMeters: null,
  gpsLost: false,
  gpsAcquired: false,
};

export function useGhostRace(
  makeProvider: () => ILocationProvider,
  ghostNodes: RouteNode[] | null,
) {
  const [state, setState] = useState<RaceState>(INITIAL_STATE);
  const [liveNodes, setLiveNodes] = useState<RouteNode[]>([]);

  // The factory is resolved fresh at start() so the active provider reflects
  // the latest settings/route (e.g. a SimulatedLocationProvider seeded with the
  // current ghost's nodes) without coupling provider lifecycle to render timing.
  const makeProviderRef = useRef(makeProvider);
  const activeProviderRef = useRef<ILocationProvider | null>(null);
  // Recorded-time / wall-time ratio of the active provider (>1 when a simulated
  // ride is replayed faster than real time). Used to keep elapsed time and
  // speed at the recorded pace regardless of playback rate.
  const timeScaleRef = useRef(1);

  // Refs for values used inside the location callback (avoids stale closures)
  const startTimeRef = useRef<number | null>(null);
  const lastPointRef = useRef<LocationPoint | null>(null);
  const accumulatedDistanceRef = useRef(0);
  const lastGpsTimeRef = useRef<number>(Date.now());
  const gpsLostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nodesRef = useRef<RouteNode[]>([]);
  const lastSavedDistanceRef = useRef(0);
  const ghostNodesRef = useRef(ghostNodes);

  // Pause state
  const isPausedRef = useRef(false);
  const pauseStartMsRef = useRef(0);
  const totalPausedMsRef = useRef(0);
  const gpsAcquiredRef = useRef(false);

  useEffect(() => {
    ghostNodesRef.current = ghostNodes;
  }, [ghostNodes]);

  useEffect(() => {
    makeProviderRef.current = makeProvider;
  }, [makeProvider]);

  const handlePoint = useCallback((point: LocationPoint) => {
    if (point.accuracy > MIN_ACCURACY_M) return;
    if (isPausedRef.current) return;

    const now = Date.now();
    lastGpsTimeRef.current = now;

    if (!gpsAcquiredRef.current) {
      gpsAcquiredRef.current = true;
      setState((s) => ({ ...s, gpsAcquired: true }));
    }

    // Clear GPS-lost state
    if (gpsLostTimerRef.current) {
      clearTimeout(gpsLostTimerRef.current);
      gpsLostTimerRef.current = null;
    }
    setState((s) => (s.gpsLost ? { ...s, gpsLost: false } : s));

    // Schedule GPS-lost alert
    gpsLostTimerRef.current = setTimeout(() => {
      // Drop the stale fix so the straight-line gap to the reconnect point
      // isn't counted as distance once the signal returns.
      lastPointRef.current = null;
      setState((s) => ({ ...s, gpsLost: true }));
    }, GPS_LOST_THRESHOLD_MS);

    if (!startTimeRef.current) {
      startTimeRef.current = now;
    }

    const timeScale = timeScaleRef.current;
    const elapsedMs = (now - startTimeRef.current - totalPausedMsRef.current) * timeScale;
    const prev = lastPointRef.current;

    // Accumulate distance and derive speed from the actual time between fixes
    // (GPS cadence is not a reliable 1 Hz: points can be batched in the
    // background, dropped, or delivered after a gap).
    let deltaM = 0;
    let currentSpeedMs = 0;
    if (prev) {
      const movedM = haversineDistance(prev.latitude, prev.longitude, point.latitude, point.longitude);
      if (movedM >= MIN_MOVEMENT_M) {
        deltaM = movedM;
        accumulatedDistanceRef.current += movedM;
        const dtSec = (point.timestamp - prev.timestamp) / 1000;
        // Divide out the playback compression so simulated speed reflects the
        // recorded rider speed, not the sped-up replay.
        currentSpeedMs = dtSec > 0 ? (movedM / dtSec) / timeScale : 0;
        lastPointRef.current = point; // advance the anchor only on real movement
      }
      // else: below the noise floor — hold the anchor and report zero speed
    } else {
      lastPointRef.current = point;
    }

    const distanceMeters = accumulatedDistanceRef.current;

    // Save node only when we've moved far enough (keeps buffer small, HUD still updates every point)
    const distSinceLastSave = distanceMeters - lastSavedDistanceRef.current;
    if (nodesRef.current.length === 0 || distSinceLastSave >= RECORD_DISTANCE_THRESHOLD_M) {
      nodesRef.current.push({
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude,
        timestamp: elapsedMs,
        distance_from_start: distanceMeters,
      });
      lastSavedDistanceRef.current = distanceMeters;
      setLiveNodes([...nodesRef.current]);
    }

    // Calculate time delta against ghost
    let timeDelta: number | null = null;
    let ghostDistanceMeters: number | null = null;
    const ghost = ghostNodesRef.current;
    if (ghost && ghost.length > 0) {
      const ghostTimeMs = getGhostTimeAtDistance(ghost, distanceMeters);
      if (ghostTimeMs !== null) {
        timeDelta = elapsedMs - ghostTimeMs;
        // Where the ghost is right now, by distance (binary search on time).
        ghostDistanceMeters = getGhostDistanceAtTime(ghost, elapsedMs);
      }
    }

    setState((s) => ({
      ...s,
      elapsedMs,
      distanceMeters,
      currentSpeedMs,
      timeDelta: timeDelta !== null ? timeDelta : s.timeDelta,
      ghostDistanceMeters: ghostDistanceMeters !== null ? ghostDistanceMeters : s.ghostDistanceMeters,
    }));
  }, []);

  const start = useCallback(async () => {
    const raceStartMs = Date.now();
    startTimeRef.current = raceStartMs;
    lastPointRef.current = null;
    accumulatedDistanceRef.current = 0;
    nodesRef.current = [];
    lastSavedDistanceRef.current = 0;
    isPausedRef.current = false;
    pauseStartMsRef.current = 0;
    totalPausedMsRef.current = 0;
    gpsAcquiredRef.current = false;
    setLiveNodes([]);
    setState({ ...INITIAL_STATE, status: 'racing' });

    // Tick elapsed time every second regardless of GPS cadence
    timerIntervalRef.current = setInterval(() => {
      if (!startTimeRef.current || isPausedRef.current) return;
      const elapsed = (Date.now() - startTimeRef.current - totalPausedMsRef.current) * timeScaleRef.current;
      setState((s) => s.status === 'racing' ? { ...s, elapsedMs: elapsed } : s);
    }, 1000);

    const provider = makeProviderRef.current();
    activeProviderRef.current = provider;
    timeScaleRef.current = provider.timeScale ?? 1;
    try {
      await provider.start(handlePoint);
    } catch (err) {
      console.error('[GhostRider] Failed to start location provider:', err);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setState(INITIAL_STATE);
      throw err;
    }
  }, [handlePoint]);

  const stop = useCallback(async () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    await activeProviderRef.current?.stop();
    if (gpsLostTimerRef.current) {
      clearTimeout(gpsLostTimerRef.current);
      gpsLostTimerRef.current = null;
    }
    const currentPauseMs = isPausedRef.current ? Date.now() - pauseStartMsRef.current : 0;
    const finalElapsedMs = startTimeRef.current
      ? Date.now() - startTimeRef.current - totalPausedMsRef.current - currentPauseMs
      : 0;
    isPausedRef.current = false;
    setState((s) => ({ ...s, status: 'finished', elapsedMs: Math.max(s.elapsedMs, finalElapsedMs) }));
  }, []);

  const reset = useCallback(() => {
    startTimeRef.current = null;
    lastPointRef.current = null;
    timeScaleRef.current = 1;
    accumulatedDistanceRef.current = 0;
    nodesRef.current = [];
    lastSavedDistanceRef.current = 0;
    isPausedRef.current = false;
    pauseStartMsRef.current = 0;
    totalPausedMsRef.current = 0;
    gpsAcquiredRef.current = false;
    setLiveNodes([]);
    setState(INITIAL_STATE);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeProviderRef.current?.stop();
      if (gpsLostTimerRef.current) clearTimeout(gpsLostTimerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const pause = useCallback(() => {
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    pauseStartMsRef.current = Date.now();
    // Disarm the GPS-lost timer so it can't fire (badge + spoken alert) while
    // paused; handlePoint reschedules it on the first point after resume.
    if (gpsLostTimerRef.current) {
      clearTimeout(gpsLostTimerRef.current);
      gpsLostTimerRef.current = null;
    }
    setState((s) => ({ ...s, status: 'paused', gpsLost: false }));
  }, []);

  const resume = useCallback(() => {
    if (!isPausedRef.current) return;
    totalPausedMsRef.current += Date.now() - pauseStartMsRef.current;
    isPausedRef.current = false;
    lastPointRef.current = null; // prevent distance jump after break
    setState((s) => ({ ...s, status: 'racing' }));
  }, []);

  const getNodes = useCallback(() => nodesRef.current, []);

  return { state, liveNodes, start, stop, pause, resume, reset, getNodes };
}
