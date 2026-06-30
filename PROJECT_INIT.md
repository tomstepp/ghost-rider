# GhostRacer (Bike HUD App) — Original Project Brief

> **Historical document.** This is the original product/engineering brief that
> kicked off the project. It is preserved as-is to record the initial intent and
> has drifted from the shipped code in places. For the current architecture see
> [DESIGN.md](DESIGN.md); to get up and running see [README.md](README.md).
>
> Notable drift from this brief: the app ships as **GhostRider**; audio uses
> `expo-audio` + `expo-speech` (not `expo-av`); GPS fixes are discarded above
> **50 m** accuracy (not 20 m); the path is sampled by distance (a node ~every
> 15 m) rather than a fixed 1 Hz; and crash recovery, GPX import/export, and full
> data backup/restore were added after this was written.

## 1. Project Overview

**GhostRacer** is a minimalist, high-contrast, handlebar-mounted cycling heads-up display (HUD) mobile application. It allows a cyclist to race against their own "ghost"—a previously recorded route containing time-series location data.

The application must prioritize **"glanceability" and safety**. It is designed to be used while moving, meaning complex maps or small typography are forbidden during an active session. The interface must leverage huge text, dynamic background color shifts, and audio cues to keep the rider informed through peripheral vision and sound.

## 2. Technical Stack

* **Framework:** React Native via **Expo** (TypeScript)

* **Location Tracking:** `expo-location` (configured for high-accuracy background and foreground tracking)

* **State Management:** React Context or a clean custom hook architecture (`useGhostRace`)

* **Audio/TTS:** `expo-av` (required for audio playback through a locked screen on iOS)

* **Storage:** SQLite via `expo-sqlite` to store ride history and ghost templates

## 3. Data Model & Core Logic

The app compares the current user's live position against a historical "ghost" route based on **distance from start**, not absolute wall-clock time.

### Route Node Structure

A route consists of an array of sequential nodes sampled at **1-second intervals** during a live ride:

```typescript
interface RouteNode {
  latitude: number;
  longitude: number;
  altitude: number;         // Meters above sea level
  timestamp: number;        // Relative milliseconds from start
  distance_from_start: number; // Cumulative meters from the start of the ride
}
```

### Distance Calculation

Cumulative distance between consecutive GPS points is calculated using the **Haversine formula**. This is computed incrementally as each new GPS point arrives during recording:

```
Δlat = lat2 - lat1 (in radians)
Δlon = lon2 - lon1 (in radians)
a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlon/2)
distance = 2 × R × arcsin(√a)   where R = 6,371,000 meters
```

A ride must exceed **10 feet (3.05 meters)** and **10 seconds** before it is eligible to be saved as a ghost template.

### The Delta Algorithm

1. Every second, calculate the user's current `distanceFromStart` by accumulating Haversine distances between consecutive live GPS coordinates.

2. Use a **binary search** on the ghost route's `distance_from_start` array to find the two bounding nodes that bracket the user's current distance.

3. **Linearly interpolate** between those two nodes to get the ghost's elapsed time at that exact distance:

   ```
   ratio = (userDistance - node[i].distance) / (node[i+1].distance - node[i].distance)
   ghostTimeAtDistance = node[i].timestamp + ratio × (node[i+1].timestamp - node[i].timestamp)
   ```

4. Calculate `timeDelta = userElapsedTime - ghostTimeAtDistance`.

   * **Negative (-) value:** User is *ahead* of the ghost (faster).
   * **Positive (+) value:** User is *behind* the ghost (slower).

### GPS Signal Loss & Route Deviation

* **Signal Loss:** If no valid GPS point is received for **more than 5 seconds**, display a visual warning on the HUD and play an audio alert. Pause delta calculations until signal is restored.

* **Accuracy Threshold:** GPS points with an accuracy reading worse than **20 meters** are discarded.

* **Off-Route Behavior:** Strict route following is not enforced. The rider may deviate from the recorded path (e.g., detour, wrong turn). The delta algorithm continues to operate using distance and time — the ghost's position on the map is what changes.

* **Large Deviation:** If the user's position deviates significantly from the ghost route (threshold TBD), stop attempting to plot real GPS coordinates on any map overlay and fall back to a straight-line distance representation.

## 4. App Navigation & Screen Flow

```
Home (Route List)
  ├── [No routes saved] → Empty state with "Start a Ride" CTA
  ├── [Routes exist] → List of saved ghost templates
  │     └── Tap a route → Pre-Race Screen → Active Race HUD → Post-Race Summary
  └── "Start New Ride" (no ghost) → Active Recording → Post-Race Summary
                                                             └── Save as Ghost? → Route List
```

### Screen Descriptions

| Screen | Purpose |
|---|---|
| **Home / Route List** | Lists saved ghost templates. Empty state for new users. |
| **Pre-Race** | GPS lock confirmation, ghost selection, countdown before race start. |
| **Active Race HUD** | Core riding screen (see Section 5). |
| **Post-Race Summary** | Final time delta, avg speed, distance. Option to save ride as a ghost template. |
| **Settings** | Units (km/mi), audio on/off, split announcement interval. |

> **TODO:** Race against multiple ghosts simultaneously from the same shared route. Each ghost would be rendered as a separate indicator on the elastic band visualizer.

## 5. UI/UX Design Requirements

The active racing screen must adhere to strict outdoor visibility guidelines:

* **Color Palette:** Pure dark mode. Background `#000000`, primary text `#FFFFFF`.

* **Dynamic Backgrounds:** The background color must dynamically transition to signify status via peripheral vision:

  * **User is Ahead (`timeDelta < -1.0s`):** Deep green tint (`#032b13`).
  * **User is Behind (`timeDelta > 1.0s`):** Deep crimson/orange tint (`#360808`).
  * **Neck-and-Neck (Within 1 sec):** Pure black (`#000000`).

* **Typography:** The `timeDelta` display must be the largest element on the screen (font size `72pt+`, ultra-bold). Limit decimals to a single tenths place (e.g., `-3.4s`).

* **The "Elastic Band" Visualizer:** A simple, full-height vertical progress bar on the left or right edge of the screen.

  * Contains two indicators: a solid white dot (Current User) and a hollow/ghostly white ring (Ghost).
  * The relative distance between them scales dynamically based on the current physical gap in meters.
  * Exact scaling and clamping behavior is best-effort for v1 and will be refined through on-bike testing.

## 6. Feature & Functional Requirements

### Phase 1: Storage & Management

* Every completed ride (whether racing a ghost or not) can be saved as a **Ghost Template** for future racing.
* A simple menu screen to select an existing ghost to race against.
* Rides are recorded at **1 Hz** (one GPS sample per second).

### Phase 2: Active Race HUD

* **Screen Lock Prevention:** Keep the device screen awake during an active session (`expo-keep-awake`).

* **Massive Core Metrics:** Display only four numbers:

  1. `Time Delta` (Ahead/Behind — Massive, Center)
  2. `Current Speed` (km/h or mph, user-configurable)
  3. `Distance Covered`
  4. `Elapsed Time`

### Phase 3: Audio & Non-Visual Feedback

* **Audio Announcements:** Use `expo-av` TTS to read out split updates (e.g., *"1.5 seconds ahead"*) every 1 kilometer or every 60 seconds (configurable in Settings).

* **State Change Chimes:** Play a high-pitched double-beep when transitioning from behind to ahead, and a low-pitched tone when dropping behind.

* **GPS Alert:** A distinct audio alert when GPS signal is lost for more than 5 seconds.

* `expo-av` must be configured with `staysActiveInBackground: true` so audio works when the screen is locked.

## 7. Simulation Layer

A `SimulatedLocationProvider` will be built to replay a previously recorded `RouteNode[]` array at a configurable speed multiplier (1×, 2×, 5×). This satisfies the same interface as the live `expo-location` provider, making the entire delta algorithm, HUD rendering, and audio system testable without riding.

```typescript
interface ILocationProvider {
  start(onPoint: (point: LocationPoint) => void): void;
  stop(): void;
}

// Implementations:
class LiveLocationProvider implements ILocationProvider { ... }   // expo-location
class SimulatedLocationProvider implements ILocationProvider { ... } // replays RouteNode[]
```

The active provider is injected into `useGhostRace`, enabling a dev-mode toggle to switch between live and simulated GPS.

## 8. Storage & Sync Strategy (Modular)

* **Current Implementation:** All data is written to a local SQLite database on the device using `expo-sqlite`.

* **Future-Proofing:** A `IRideRepository` TypeScript interface decouples the core race logic from the storage implementation. This ensures a future `CloudRideRepository` (Firebase or Supabase) can be swapped in without touching the HUD or delta calculation logic.

> **TODO:** GPX import/export for compatibility with Strava, Garmin, and Komoot. Deferred to a future phase — v1 relies entirely on rides recorded through the app.

### Proposed SQLite Schema

#### 1. `routes` Table (Ghost Templates)

```sql
id            INTEGER PRIMARY KEY
name          TEXT        -- e.g., "Saturday Morning Loop"
created_at    INTEGER     -- Unix timestamp
total_distance REAL       -- Total length in meters
total_time_ms INTEGER     -- Total duration of the recorded ghost ride
```

#### 2. `route_nodes` Table (Time-Series Data)

```sql
id                 INTEGER PRIMARY KEY
route_id           INTEGER  -- Foreign key to routes.id
latitude           REAL
longitude          REAL
altitude           REAL     -- Meters above sea level
timestamp          INTEGER  -- Milliseconds from start of ride
distance_from_start REAL   -- Cumulative meters from start
```

*Index on `(route_id, distance_from_start)` for fast binary search lookups during a race.*

#### 3. `ride_history` Table (Performance Log)

```sql
id                  INTEGER PRIMARY KEY
route_id            INTEGER  -- Which ghost was raced (nullable if no ghost)
duration_ms         INTEGER  -- Total ride time
avg_speed           REAL     -- Average speed in m/s
final_time_delta    REAL     -- Final timeDelta at finish (negative = beat the ghost)
completed_percentage REAL   -- % of ghost route completed (handles DNFs)
completed_at        INTEGER  -- Unix timestamp
```

## 9. Permissions

* **Background Location:** The app requires `Always On` location permission (`expo-location` `requestBackgroundPermissionsAsync`). If the user denies background location, the app must display a blocking error screen explaining that background GPS is required for the app to function while riding.

* **Audio:** Standard audio permission via `expo-av` audio session configuration.
