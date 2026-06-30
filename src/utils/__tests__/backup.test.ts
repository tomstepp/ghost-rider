import {
  BACKUP_SCHEMA_VERSION,
  parseBackup,
  serializeBackup,
} from '../backup';
import { RideHistory } from '../../types';

const settings = {
  units: 'mi' as const,
  audioEnabled: true,
  splitIntervalKm: 1,
  countdownSeconds: 3,
  riderMarker: { type: 'emoji' as const, color: '#fff', emoji: '🔥' },
  ghostMarker: { type: 'emoji' as const, color: '#888', emoji: '👻' },
  simulationEnabled: false,
  simulationSpeed: 2,
};

const routes = [
  {
    id: 7,
    name: 'Morning Loop',
    created_at: 1700000000000,
    total_distance: 1234.5,
    total_time_ms: 600000,
    nodes: [
      { latitude: 40, longitude: -105, altitude: 1600, timestamp: 0, distance_from_start: 0 },
      { latitude: 40.001, longitude: -105, altitude: 1605, timestamp: 30000, distance_from_start: 111 },
    ],
  },
];

const rideHistory: RideHistory[] = [
  {
    id: 1,
    route_id: 7,
    duration_ms: 590000,
    avg_speed: 5.2,
    final_time_delta: -10,
    completed_percentage: 100,
    completed_at: 1700000600000,
    elevation_gain_m: 12,
  },
  // A free ride with no ghost — route_id must survive as null.
  {
    id: 2,
    route_id: null,
    duration_ms: 120000,
    avg_speed: 4,
    final_time_delta: 0,
    completed_percentage: 100,
    completed_at: 1700000700000,
  },
];

describe('backup serialize/parse', () => {
  it('round-trips routes, ride history, and settings', () => {
    const json = serializeBackup({ routes, rideHistory, settings });
    const parsed = parseBackup(json);

    expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsed.routes).toEqual(routes);
    expect(parsed.rideHistory).toEqual(rideHistory);
    expect(parsed.settings).toEqual(settings);
  });

  it('preserves a null route_id on orphaned rides', () => {
    const parsed = parseBackup(serializeBackup({ routes, rideHistory, settings }));
    expect(parsed.rideHistory[1].route_id).toBeNull();
  });

  it('allows a backup with no settings', () => {
    const parsed = parseBackup(serializeBackup({ routes, rideHistory, settings: null }));
    expect(parsed.settings).toBeNull();
  });

  it('rejects non-JSON input', () => {
    expect(() => parseBackup('not json {')).toThrow();
  });

  it('rejects an unsupported schema version', () => {
    const bad = JSON.stringify({ schemaVersion: 999, routes: [], rideHistory: [] });
    expect(() => parseBackup(bad)).toThrow(/version/i);
  });

  it('rejects a backup missing the routes array', () => {
    const bad = JSON.stringify({ schemaVersion: BACKUP_SCHEMA_VERSION, rideHistory: [] });
    expect(() => parseBackup(bad)).toThrow();
  });

  it('rejects a malformed route', () => {
    const bad = JSON.stringify({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      routes: [{ id: 1, name: 'x' /* missing nodes */ }],
      rideHistory: [],
    });
    expect(() => parseBackup(bad)).toThrow(/malformed/i);
  });
});
