# GhostRider 🚴‍👻

A minimalist, high-contrast cycling **heads-up display** for racing against your
own "ghost" — a previously recorded ride. Mount your phone on the handlebars,
pick a saved route, and a single huge number tells you whether you're **ahead**
or **behind** the ghost, with the whole screen tinting green or red so you can
read it in your peripheral vision.

> **Heads up on names.** The product, the Expo app, and this repo are all
> **GhostRider** (renamed from "GhostRacer" to avoid a clash with an existing
> app on the Google Play Store). The original brief — still written as
> GhostRacer — is preserved in [PROJECT_INIT.md](PROJECT_INIT.md); the detailed
> architecture is in [DESIGN.md](DESIGN.md). This file is the developer
> onboarding guide.

---

## Table of contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Running on a device](#running-on-a-device-expo-go-vs-dev-build)
- [Project structure](#project-structure)
- [Architecture in one minute](#architecture-in-one-minute)
- [Testing](#testing)
- [Simulating a ride (no bike required)](#simulating-a-ride-no-bike-required)
- [Building & releasing (EAS)](#building--releasing-eas)
- [Common tasks & commands](#common-tasks--commands)
- [Conventions & gotchas](#conventions--gotchas)

---

## What it does

- **Record** a ride with GPS and save it as a reusable **ghost template**.
- **Race** a saved ghost: the HUD compares your live position against the ghost
  by *distance from start*, not wall-clock time, so it works even if you start
  late or pause.
- **Glanceable HUD**: one massive time-delta number, dynamic green/red/black
  background, an "elastic band" gap visualizer, route-shape and elevation
  overlays.
- **Audio & haptics**: spoken split announcements, state-change chimes
  (ahead/behind/neck-and-neck), and a GPS-lost alert — all usable with the
  screen locked.
- **Survives crashes**: an in-progress ride is checkpointed to SQLite and
  offered for recovery on next launch.
- **Owns your data**: local SQLite, manual JSON backup/restore, and GPX
  import/export.

---

## Tech stack

| Concern | Choice |
|---|---|
| Framework | **Expo SDK 54** + React Native 0.81, React 19, TypeScript (strict) |
| Navigation | A single `useState` screen switch in [`App.tsx`](App.tsx) — no nav library |
| Location | `expo-location` (foreground watch + background task via `expo-task-manager`) |
| Storage | `expo-sqlite` (WAL mode) for rides; `@react-native-async-storage/async-storage` for settings/onboarding flags |
| Audio | `expo-audio` (chimes/beeps) + `expo-speech` (TTS) + `expo-haptics` |
| Graphics | `react-native-svg` for route shape, elevation profile, elastic band |
| Files | `expo-file-system`, `expo-document-picker`, `expo-sharing` for backup & GPX |
| Tests | Jest via `jest-expo` |
| Builds | EAS Build (`eas.json`) |

> ⚠️ **Expo SDK 54 has breaking changes from earlier versions.** Always check the
> exact versioned docs at <https://docs.expo.dev/versions/v54.0.0/> before adding
> or upgrading a dependency. This is a hard project rule (see `AGENTS.md`).

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Start the Metro bundler / Expo dev server
npm start

# 3. Run the test suite
npm test
```

`npm start` opens the Expo CLI. From there press `i` (iOS simulator), `a`
(Android emulator), or scan the QR code — but read the next section first,
because GPS features behave differently depending on **how** you run it.

---

## Running on a device: Expo Go vs. dev build

The app **detects its runtime** and swaps the location provider accordingly (see
`createLocationProvider()` in [`App.tsx`](App.tsx)):

| Runtime | Location provider | Background GPS? | Use it for |
|---|---|---|---|
| **Expo Go** (`Constants.appOwnership === 'expo'`) | `LiveLocationProvider` (foreground `watchPositionAsync`) | ❌ pauses when backgrounded | Fast iteration on UI, the delta algorithm, audio, and **simulation** |
| **Dev build / production** | `BackgroundLocationProvider` (`expo-task-manager` foreground service) | ✅ continues with screen locked | Real on-bike testing |

Why the split? `BackgroundLocationProvider` calls `TaskManager.defineTask` at
module load, which isn't supported in Expo Go. It's loaded with a **dynamic
`require`** so that module never even evaluates under Expo Go.

**Practical workflow:** do almost all development in Expo Go using the GPS
**simulator** (below). Only when you need genuine background tracking do you need
a custom dev build:

```bash
# One-time per device: build & install a dev client that includes native modules
npx eas build --profile development --platform ios   # or android
```

---

## Project structure

```
ghost-rider/
├── App.tsx                 # Root component: screen routing, race orchestration,
│                           #   crash-recovery + checkpoint glue, audio triggers
├── index.ts                # registerRootComponent entrypoint
├── app.json                # Expo config (perms, plugins, bundle ids, icons)
├── eas.json                # EAS Build profiles (preview / production)
├── babel.config.js         # babel-preset-expo
├── tsconfig.json           # strict; "@/*" path alias → src/*
├── scripts/
│   └── gen-beeps.js        # Generates assets/beep-{low,high}.wav (run with node)
├── assets/                 # Icons, splash, and audio (chimes + beeps)
└── src/
    ├── types/index.ts      # Core domain types (RouteNode, Route, RaceState, …)
    ├── hooks/
    │   ├── useGhostRace.ts        # ⭐ the race engine (see DESIGN.md)
    │   └── usePersistedSettings.ts
    ├── providers/          # ILocationProvider + 3 implementations
    │   ├── ILocationProvider.ts
    │   ├── LiveLocationProvider.ts        # Expo Go foreground watch
    │   ├── BackgroundLocationProvider.ts  # dev/prod background task
    │   └── SimulatedLocationProvider.ts   # replays a recorded ghost
    ├── storage/            # IRideRepository + SQLite implementation
    │   ├── IRideRepository.ts
    │   └── SqliteRideRepository.ts
    ├── screens/            # One file per screen (plain components, no router)
    │   ├── RouteListScreen.tsx    OnboardingScreen.tsx
    │   ├── PreRaceScreen.tsx      RaceHUDScreen.tsx
    │   ├── PostRaceScreen.tsx     RideHistoryScreen.tsx
    │   ├── SettingsScreen.tsx     AboutScreen.tsx
    ├── components/         # ElasticBand, RouteShape, ElevationProfile, ErrorBoundary
    └── utils/
        ├── haversine.ts            ghostInterpolation.ts   # core math
        ├── routeGeometry.ts        formatting.ts
        ├── audioService.ts         backup.ts
        ├── gpxExporter.ts          gpxParser.ts
        └── __tests__/              # Jest unit tests for the pure utils
```

> Note: `ios/` and `android/` are **generated** (Continuous Native Generation)
> and git-ignored. Never hand-edit them — change `app.json` and rebuild.

---

## Architecture in one minute

The whole app is wired through three interfaces so the hard parts stay testable
and swappable. See [DESIGN.md](DESIGN.md) for the deep dive.

```
                       ┌────────────────────────┐
   GPS / replay  ───▶  │  ILocationProvider     │  Live | Background | Simulated
                       └───────────┬────────────┘
                                   │ onPoint(LocationPoint)
                                   ▼
                       ┌────────────────────────┐
                       │  useGhostRace (hook)    │  Haversine accumulation,
                       │  → RaceState            │  GPS-loss tracking, pause,
                       └───────────┬────────────┘  binary-search delta vs ghost
                                   │ state + liveNodes
                  ┌────────────────┼────────────────┐
                  ▼                ▼                 ▼
            RaceHUDScreen     App.tsx audio    IRideRepository
            (the display)     (chimes/TTS)     (SQLite persistence + checkpoint)
```

- **`ILocationProvider`** — the only thing that knows about GPS. Pick the
  implementation by runtime, or inject `SimulatedLocationProvider` to replay a
  ghost as if it were live.
- **`useGhostRace`** — the engine. Consumes location points, computes distance,
  speed, elapsed time, and the **time delta** vs. the ghost, and emits a
  `RaceState`. Pure logic lives in `utils/` so it can be unit-tested.
- **`IRideRepository`** — the only thing that knows about storage. Today it's
  `SqliteRideRepository`; a future cloud repo can drop in unchanged.

---

## Testing

Unit tests cover the **pure logic** (math, parsing, formatting, serialization) —
the parts where bugs are silent and dangerous. UI and native modules are not
tested in CI.

```bash
npm test                 # run everything (jest-expo preset)
npx jest --watch         # watch mode
npx jest haversine       # run one suite by name
npx jest -t "interpolat" # run tests matching a description
```

Tests live in `src/utils/__tests__/*.test.ts`. Current coverage:

| Suite | What it guards |
|---|---|
| `haversine.test.ts` | Distance math correctness |
| `ghostInterpolation.test.ts` | Binary-search + interpolation for the delta (the heart of the app) |
| `routeGeometry.test.ts` | SVG projection, elevation gain, node sampling |
| `formatting.test.ts` | Units, pace, elapsed time, delta strings |
| `backup.test.ts` | Backup serialize/parse + version guarding |
| `gpxParser.test.ts` | GPX import (trkpt/rtept, missing timestamps) |

**When adding logic, put the math in `utils/` and add a test.** The hooks,
providers, and screens deliberately delegate to these pure functions so the
risky parts are covered without a device.

---

## Simulating a ride (no bike required)

You can exercise the entire race pipeline — delta, HUD tinting, chimes, spoken
splits, even crash-recovery — from your desk:

1. Record (or import) at least one ghost route so there's something to replay.
2. **Settings → Developer → Simulate GPS** → on, and pick a **playback speed**
   (2× / 5× / 10× / 25×).
3. Select that ghost and start a race.

Under the hood, `SimulatedLocationProvider` replays the ghost's `RouteNode[]` as
the live feed. It reports a `timeScale` equal to the playback multiplier, and
`useGhostRace` divides that back out — so speed and time-delta read at the
*recorded* pace even though wall-clock time is compressed. Because simulated
rides also write checkpoints, you can test recovery by killing the app
mid-simulation.

---

## Building & releasing (EAS)

Build profiles are defined in [`eas.json`](eas.json):

```bash
# Install the CLI (or use npx)
npm i -g eas-cli

# Internal test build (Android APK you can sideload)
eas build --profile preview --platform android

# Store builds
eas build --profile production --platform android   # AAB (Play Store)
eas build --profile production --platform ios        # device IPA (not simulator)

# Custom dev client with native modules (needed for background GPS)
eas build --profile development --platform ios
```

Versioning is **local** (`appVersionSource: "local"`): bump `version` in
`app.json` and the per-platform `buildNumber` / `versionCode` yourself before a
store build. The EAS project id is committed in `app.json`.

---

## Common tasks & commands

| I want to… | Command / file |
|---|---|
| Start the dev server | `npm start` |
| Run on iOS / Android natively | `npm run ios` / `npm run android` |
| Run on web | `npm run web` |
| Run tests | `npm test` |
| Regenerate countdown beeps | `node scripts/gen-beeps.js` |
| Change a permission / plugin | edit `app.json`, then rebuild the native app |
| Add a domain type | `src/types/index.ts` |
| Change the race math | `src/utils/` (+ a test) → consumed by `useGhostRace` |
| Add a screen | new file in `src/screens/`, then wire it into the `AppScreen` switch in `App.tsx` |
| Change the DB schema | `SqliteRideRepository.init()` (use an additive `ALTER TABLE` migration like `elevation_gain_m`) |

---

## Conventions & gotchas

- **Path alias:** `@/*` maps to `src/*` (see `tsconfig.json`). Most code uses
  relative imports today; either is fine.
- **Strict TypeScript** is on. Keep it green.
- **Settings gate first paint.** `App.tsx` renders a black splash until
  `usePersistedSettings` resolves, so a race never starts on the wrong units.
- **STOP must always reach the summary.** Stopping GPS and writing history are
  best-effort and wrapped in try/catch — a failure there must never strand the
  rider on the HUD. History is written when the ride is finalized, and a
  surviving checkpoint is the recovery safety net.
- **GPS quirks are handled in `useGhostRace`:** fixes worse than 50 m accuracy
  are dropped, sub-3 m movement is treated as jitter, and a >5 s gap raises the
  GPS-lost state (and drops the stale fix so the reconnect gap isn't counted).
- **Audio must work backgrounded:** `initAudio()` sets `playsInSilentMode` and
  `shouldPlayInBackground`; `app.json` declares the `audio` + `location`
  iOS background modes and the matching Android foreground-service permissions.
- **Don't edit `ios/`/`android/`** — they're generated and ignored.

For the *why* behind any of this, read [DESIGN.md](DESIGN.md).
