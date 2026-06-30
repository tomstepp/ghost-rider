# GhostRider — Design Document

This document describes how the app is actually built today: the domain model,
the race engine, the provider/repository abstractions, persistence, crash
recovery, audio, and the UI layer. It reflects the shipped code, not the
original brief — for that, see [PROJECT_INIT.md](PROJECT_INIT.md). For setup and
commands, see [README.md](README.md).

---

## 1. Design goals

1. **Glanceability above all.** The active HUD must be readable at a glance while
   moving. One huge number, full-screen color signaling, audio for everything
   that matters.
2. **Distance-anchored comparison.** The ghost race compares rider vs. ghost by
   *distance from start*, never by wall-clock time. You can start late, pause,
   or detour and the delta still means "how far ahead/behind in time you are at
   this point on the route."
3. **Testable core, swappable edges.** The risky logic (geo math, interpolation)
   is pure and unit-tested. GPS and storage sit behind interfaces so they can be
   swapped for simulation, background tracking, or (later) a cloud backend.
4. **Never lose a ride.** Rides are checkpointed as they're recorded and
   recovered after a crash; data can be backed up and restored.
5. **Works locked and backgrounded.** Tracking and audio continue with the
   screen off on real builds.

---

## 2. Domain model

Defined in [`src/types/index.ts`](src/types/index.ts).

```ts
RouteNode  { latitude, longitude, altitude,
             timestamp,            // ms relative to ride start
             distance_from_start } // cumulative meters

Route      { id, name, created_at, total_distance, total_time_ms }

RideHistory{ id, route_id|null, duration_ms, avg_speed (m/s),
             final_time_delta, completed_percentage, completed_at,
             elevation_gain_m? }

LocationPoint { latitude, longitude, altitude, accuracy, timestamp }  // raw GPS

RaceState  { status, elapsedMs, distanceMeters, currentSpeedMs,
             timeDelta|null, ghostDistanceMeters|null,
             gpsLost, gpsAcquired }
```

The central abstraction is the **`RouteNode`**: a route is an ordered array of
nodes where `distance_from_start` is monotonically increasing and `timestamp`
records when the recorder reached that distance. Everything — the delta, the
elastic band, the route-shape overlay, the elevation profile — is derived from
this one array. A `LocationPoint` is the *raw input* (carries `accuracy`, uses
Unix timestamps); a `RouteNode` is the *processed output* (carries cumulative
distance, uses relative timestamps).

---

## 3. Architecture overview

```
        ┌─────────────────────────────────────────────────────────────┐
        │                         App.tsx                              │
        │  screen state machine · race orchestration · audio triggers  │
        │  checkpoint/recovery glue · permission + recovery modals      │
        └───────┬───────────────┬───────────────────┬─────────────────┘
                │               │                   │
   makeProvider()│        useGhostRace()           │ repository
                ▼               ▼                   ▼
     ┌──────────────────┐ ┌──────────────┐ ┌────────────────────────┐
     │ ILocationProvider│ │  race engine │ │   IRideRepository      │
     │  Live            │ │  RaceState + │ │  SqliteRideRepository  │
     │  Background      │─▶│  liveNodes   │ │  (WAL SQLite)          │
     │  Simulated       │ └──────────────┘ └────────────────────────┘
     └──────────────────┘        │
                                 ▼
                   utils: haversine · ghostInterpolation
                          routeGeometry · formatting
```

Three seams keep the system decoupled:

- **`ILocationProvider`** isolates *where points come from*.
- **`useGhostRace`** is the engine that turns points into a `RaceState`.
- **`IRideRepository`** isolates *where data is stored*.

`App.tsx` is the conductor: it owns screen routing, decides which provider to
use, feeds the selected ghost into the hook, reacts to `RaceState` changes by
firing audio, and manages the persistence/recovery lifecycle.

---

## 4. The location provider abstraction

[`ILocationProvider`](src/providers/ILocationProvider.ts):

```ts
interface ILocationProvider {
  start(onPoint: (point: LocationPoint) => void): Promise<void>;
  stop(): Promise<void>;
  readonly timeScale?: number; // recorded-time / wall-time ratio (default 1)
}
```

Three implementations:

| Provider | Source | Background | `timeScale` | Selected when |
|---|---|---|---|---|
| [`LiveLocationProvider`](src/providers/LiveLocationProvider.ts) | `Location.watchPositionAsync` | No | 1 | Running in **Expo Go** |
| [`BackgroundLocationProvider`](src/providers/BackgroundLocationProvider.ts) | `expo-task-manager` background task + foreground service | Yes | 1 | Dev build / production |
| [`SimulatedLocationProvider`](src/providers/SimulatedLocationProvider.ts) | Replays a ghost's `RouteNode[]` | n/a | = playback multiplier | Settings → Simulate GPS is on |

### Runtime selection

`createLocationProvider()` in [`App.tsx`](App.tsx) picks Live vs. Background by
`Constants.appOwnership === 'expo'`. The background provider is loaded with a
**dynamic `require`**, because `TaskManager.defineTask` runs at module load and
is unsupported in Expo Go — a static import would crash it on launch.

`makeProvider()` adds one more layer: if simulation is enabled and a ghost with
>1 node is selected, it returns a fresh `SimulatedLocationProvider(ghostNodes,
speed)`; otherwise it returns the runtime provider. The factory is resolved
*at `start()`* (via a ref in the hook) so the active provider always reflects the
current settings and selected ghost without coupling provider lifecycle to React
render timing.

### Both real providers degrade gracefully

Each requests foreground permission (throwing if denied — `App.tsx` catches this
and shows the "Location Required" modal) and then *attempts* background ("Always")
permission. If only "While Using" is granted, they fall back to foreground-only
`watchPositionAsync` and warn rather than failing.

### timeScale: keeping simulated speed honest

A simulated ride replays faster than real time. `SimulatedLocationProvider`
emits points at `recordedInterval / speedMultiplier` wall-clock and reports
`timeScale = speedMultiplier`. The hook multiplies elapsed time back up by
`timeScale` and divides instantaneous speed by it, so a 25× replay still shows
the rider's *recorded* speed and a realistic time delta.

---

## 5. The race engine — `useGhostRace`

[`src/hooks/useGhostRace.ts`](src/hooks/useGhostRace.ts) is the heart of the app.
It accepts a provider factory and the selected `ghostNodes`, and returns:

```ts
{ state, liveNodes, start, stop, pause, resume, reset, getNodes }
```

It keeps almost all mutable state in **refs** (not React state) because the
location callback fires often and must avoid stale closures and re-render churn.
React state (`state`, `liveNodes`) exists only for what the UI renders.

### Per-point processing (`handlePoint`)

For each incoming `LocationPoint`:

1. **Accuracy gate** — discard fixes worse than `MIN_ACCURACY_M = 50`.
2. **Pause gate** — ignore points while paused.
3. **GPS-loss bookkeeping** — record the arrival time, mark `gpsAcquired`, clear
   any `gpsLost` flag, and (re)arm a 5 s timer. If it fires, the stale
   `lastPoint` is dropped (so the straight-line gap to the reconnect point isn't
   counted as distance) and `gpsLost` is set.
4. **Distance accumulation** — `haversineDistance` from the last anchor. Movement
   below `MIN_MOVEMENT_M = 3` is treated as jitter: the anchor is *held* (not
   advanced) so slow genuine motion still accumulates across ticks instead of
   being repeatedly discarded.
5. **Speed** — derived from `movedM / Δt` using the actual time between fixes
   (GPS cadence is not a reliable 1 Hz), divided by `timeScale`.
6. **Node recording** — a `RouteNode` is appended only every
   `RECORD_DISTANCE_THRESHOLD_M = 15` of travel (plus the first point). This
   keeps the buffer small while the HUD still updates on every point.
7. **Delta computation** — if a ghost is loaded, compute the time delta and the
   ghost's current position (see §6).

A separate 1 Hz `setInterval` advances `elapsedMs` even when no GPS arrives, so
the elapsed clock never stalls.

### Elapsed time and pause

`elapsedMs = (now - startTime - totalPaused) * timeScale`. Pause records a start
mark and disarms the GPS-lost timer; resume adds the paused span to
`totalPaused` and clears `lastPoint` so the break doesn't register as a distance
jump. `stop()` tears down the interval and provider, then finalizes `status:
'finished'` with the larger of the last-seen and freshly-computed elapsed time.

### Key constants

| Constant | Value | Purpose |
|---|---|---|
| `MIN_ACCURACY_M` | 50 | Drop noisy fixes |
| `GPS_LOST_THRESHOLD_MS` | 5000 | Gap before GPS-lost alert |
| `RECORD_DISTANCE_THRESHOLD_M` | 15 | Node sampling cadence |
| `MIN_MOVEMENT_M` | 3 | Jitter floor (anchor held below it) |

---

## 6. The delta algorithm

This is what makes it a *race*. Two pure functions in
[`ghostInterpolation.ts`](src/utils/ghostInterpolation.ts), both binary searches
over the monotonic ghost arrays:

**`getGhostTimeAtDistance(nodes, userDistanceM)`** — "how long did the ghost take
to reach where I am now?" Binary-search the two nodes bracketing the user's
distance, then linearly interpolate their timestamps:

```
ratio   = (userDistance − a.distance) / (b.distance − a.distance)
ghostMs = a.timestamp + ratio × (b.timestamp − a.timestamp)
```

```
timeDelta = userElapsedMs − ghostMs
  timeDelta < 0  → rider is AHEAD (faster)
  timeDelta > 0  → rider is BEHIND (slower)
```

Clamps: before the ghost's start → its first timestamp; past its end → its final
timestamp.

**`getGhostDistanceAtTime(nodes, elapsedMs)`** — "where is the ghost *right
now*?" Binary-search by timestamp to get the ghost's `distance_from_start`. This
drives the elastic-band gap and the ghost marker on the route/elevation
overlays.

Because the comparison is purely distance↔time over the recorded arrays, the
rider may detour or deviate freely — the delta keeps working; only the ghost's
plotted position changes.

---

## 7. Persistence — `IRideRepository` / SQLite

[`IRideRepository`](src/storage/IRideRepository.ts) defines ghost-template CRUD,
ride-history logging, the crash-recovery checkpoint API, and full
backup/restore. [`SqliteRideRepository`](src/storage/SqliteRideRepository.ts) is
the only implementation; the interface exists so a `CloudRideRepository` could be
dropped in without touching the race logic.

### Schema (WAL mode)

| Table | Role |
|---|---|
| `routes` | Ghost templates (name, created_at, total_distance, total_time_ms) |
| `route_nodes` | Time-series path, FK → routes `ON DELETE CASCADE`, indexed on `(route_id, distance_from_start)` for fast binary-search loads |
| `ride_history` | Performance log; `elevation_gain_m` added via additive migration |
| `ride_checkpoint_meta` | Single-row (`id = 1`) marker of an in-progress ride |
| `ride_checkpoint_nodes` | Nodes of the in-progress ride |

Implementation notes:

- **`PRAGMA foreign_keys = ON`** is set on its own *before* any schema work —
  it's a per-connection pragma and a no-op inside a transaction, so it must run
  first for `ON DELETE CASCADE` to be active. A one-time startup sweep purges
  rows orphaned by earlier builds that deleted routes without it.
- **Additive migrations**: new columns are added with a `try/catch`-wrapped
  `ALTER TABLE ... ADD COLUMN` (see `elevation_gain_m`). The catch swallows the
  "column exists" error so init is idempotent.
- **Atomic multi-row writes**: saving a route, appending checkpoint nodes, and
  importing a backup each run inside `withTransactionAsync` with a prepared
  statement. Under WAL, per-statement commits would be slow and leave partial
  data on failure.

### OS-backup checkpointing

`checkpoint()` runs `PRAGMA wal_checkpoint(TRUNCATE)` to fold the WAL back into
the main `.db` file. `App.tsx` calls it whenever the app backgrounds, so an
iCloud / Android Auto Backup snapshots a self-consistent database.

---

## 8. Crash recovery

A ride is recoverable end-to-end without any explicit "save while riding" step:

1. **On start** (`handleGo`): `startCheckpoint(routeId, startedAt)` opens a fresh
   checkpoint, atomically clearing any prior one.
2. **During the ride**: an effect watches `liveNodes`; each time it grows
   (~every 15 m) the new nodes are appended via `appendCheckpointNodes`. Writes
   are infrequent and incremental. Simulated rides checkpoint too, so recovery is
   testable from the desk.
3. **On normal STOP**: history is written and the checkpoint cleared. If history
   writing throws, the checkpoint is intentionally *left* so the ride is
   recovered next launch rather than lost.
4. **On next launch**: once settings load, `getCheckpoint()` is read. A
   checkpoint with ≥2 nodes raises the **"Unfinished Ride"** modal; an
   empty/aborted one is silently cleared.
5. **Recover** (`handleRecover`): rebuilds a synthetic `RaceState` from the last
   checkpoint node — distance and elapsed come straight from it, and if the ghost
   still exists the final `timeDelta` and ghost position are recomputed. The user
   lands on the Post-Race summary to save or discard. A recovered ride logs its
   history at finalize time (it never went through STOP), guarded so a normal
   ride isn't double-counted.

---

## 9. Audio, speech & haptics

[`audioService.ts`](src/utils/audioService.ts) wraps `expo-audio`,
`expo-speech`, and `expo-haptics`. `initAudio()` (called once at launch)
configures the session for `playsInSilentMode`, `shouldPlayInBackground`, and
`mixWithOthers` so cues play through the silent switch, with the screen locked,
and over the rider's music.

`App.tsx` derives audio from `RaceState` transitions:

- **State-change chimes**: the delta is bucketed into `ahead` (< −1 s), `neck`
  (±1 s), `behind` (> +1 s); crossing a boundary plays the matching chime + a
  light haptic.
- **Split announcements**: TTS speaks the delta ("3.4 seconds ahead") every
  `splitIntervalKm` of distance **or** every 60 s, whichever comes first
  (`lastAnnouncedKmRef` / `lastAnnouncedTimeRef`).
- **GPS-lost alert**: spoken when `state.gpsLost` flips true.
- **Countdown**: the Pre-Race screen plays low beeps on each tick and a high beep
  on GO; a fresh player is created per tick (a finished player can't replay) and
  the GO player is held at module scope so it survives the screen unmount.

All audio respects the `audioEnabled` setting. Beep WAVs are generated by
[`scripts/gen-beeps.js`](scripts/gen-beeps.js); chimes are committed assets.

---

## 10. UI layer

There is **no navigation library**. `App.tsx` holds an `AppScreen` union
(`'list' | 'prerace' | 'racing' | 'finished' | 'history' | 'settings' |
'about'`) in state and conditionally renders one screen, with the location and
recovery modals layered on top. First paint is gated on settings loading (black
splash) so a race can't start on the wrong units. Onboarding shows once, gated by
an AsyncStorage flag.

| Screen | Role |
|---|---|
| `OnboardingScreen` | First-run walkthrough (one-time) |
| `RouteListScreen` | Saved ghosts, empty state, entry to free ride / history / settings / about |
| `PreRaceScreen` | GPS-lock confirmation + countdown before GO |
| `RaceHUDScreen` | The active display: huge delta, tinting, elastic band, overlays |
| `PostRaceScreen` | Summary; save-as-ghost or discard; handles recovered rides |
| `RideHistoryScreen` | Past rides, per-route enrichment |
| `SettingsScreen` | Units, audio, markers, backup/restore, GPS simulator |
| `AboutScreen` | App info + reset-onboarding |

**HUD signaling** follows the brief: pure-black base, green tint when ahead, red
when behind, with the time delta as the dominant element. The **elastic band**
([`ElasticBand.tsx`](src/components/ElasticBand.tsx)) shows a rider dot and ghost
ring whose gap scales with the physical distance between them.
[`RouteShape`](src/components/RouteShape.tsx) and
[`ElevationProfile`](src/components/ElevationProfile.tsx) render SVG overlays from
the node array via [`routeGeometry.ts`](src/utils/routeGeometry.ts), with markers
positioned by interpolating along distance. An
[`ErrorBoundary`](src/components/ErrorBoundary.tsx) wraps the whole tree so a
render crash shows a fallback instead of a white screen.

Presentation helpers (units, speed, pace, elapsed, delta strings) live in
[`formatting.ts`](src/utils/formatting.ts) and are unit-tested.

---

## 11. Data portability

- **JSON backup/restore** ([`backup.ts`](src/utils/backup.ts)): `exportData`
  serializes every route + nodes + ride history; settings are layered in at the
  screen level. `parseBackup` validates shape and refuses an unknown
  `schemaVersion` (currently `1`) rather than importing garbage. Restore is
  **replace-all** in one transaction, remapping route ids (they're
  AUTOINCREMENT) so ride history re-links correctly; a dangling reference becomes
  `null` rather than a broken FK. Files are shared out via `expo-sharing` and
  pulled in via `expo-document-picker`.
- **GPX** ([`gpxExporter.ts`](src/utils/gpxExporter.ts) /
  [`gpxParser.ts`](src/utils/gpxParser.ts)): export writes standard `<trkpt>`
  GPX with a fixed export epoch (only relative deltas matter). Import parses
  `<trkpt>` (falling back to `<rtept>`), rebuilds cumulative distance via
  Haversine, and — when timestamps are missing — synthesizes them assuming a
  20 km/h average so the route is still raceable.

---

## 12. Testing strategy

Unit tests target the **pure, high-risk logic** where bugs are silent: geo math,
ghost interpolation, route geometry, formatting, backup (de)serialization, and
GPX parsing. Hooks, providers, and screens deliberately delegate to these
functions, so the dangerous parts are covered without a device or native
modules. UI and provider integration are verified manually — primarily through
the GPS **simulator**, which drives the real engine, HUD, audio, and recovery end
to end. Run with `npm test` (jest-expo). See [README.md](README.md#testing) for
the per-suite breakdown.

---

## 13. Known simplifications & future work

- **Large-deviation map fallback** from the brief is not implemented; the delta
  stays distance/time based regardless of how far the rider strays.
- **Multiple simultaneous ghosts** and **cloud sync** are intentionally
  un-built; the `IRideRepository` seam exists to make the latter additive.
- **Node sampling is distance-based** (~every 15 m), not a fixed 1 Hz, trading a
  little temporal resolution for a much smaller buffer on long rides.
- **No automated UI/E2E tests** — the simulator is the manual substitute.
