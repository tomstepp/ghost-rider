export interface RouteNode {
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: number;        // Relative milliseconds from start of ride
  distance_from_start: number; // Cumulative meters from start
}

export interface Route {
  id: number;
  name: string;
  created_at: number;       // Unix timestamp
  total_distance: number;   // Meters
  total_time_ms: number;
}

export interface RideHistory {
  id: number;
  route_id: number | null;
  duration_ms: number;
  avg_speed: number;        // m/s
  final_time_delta: number; // Negative = beat ghost, positive = lost
  completed_percentage: number;
  completed_at: number;     // Unix timestamp
  elevation_gain_m?: number;
}

// Live GPS point from location provider
export interface LocationPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;         // Meters — used to discard noisy points
  timestamp: number;        // Unix ms
}

export type RaceStatus = 'idle' | 'recording' | 'racing' | 'paused' | 'finished';

export interface RaceState {
  status: RaceStatus;
  elapsedMs: number;
  distanceMeters: number;
  currentSpeedMs: number;   // m/s
  timeDelta: number | null; // null when no ghost selected
  ghostDistanceMeters: number | null;
  gpsLost: boolean;
  gpsAcquired: boolean;
}
