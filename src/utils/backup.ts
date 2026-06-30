import { RideHistory, RouteNode } from '../types';
import type { AppSettings } from '../screens/SettingsScreen';

// Bump when the on-disk backup shape changes incompatibly. parseBackup refuses
// to import a file whose version it doesn't recognise rather than silently
// loading partial/garbled data.
export const BACKUP_SCHEMA_VERSION = 1;

// A route plus its full node path. `id` is the route's id at export time; it is
// only meaningful for re-linking ride history on import (see importData), since
// the routes table uses AUTOINCREMENT and ids are reassigned on restore.
export interface BackupRoute {
  id: number;
  name: string;
  created_at: number;
  total_distance: number;
  total_time_ms: number;
  nodes: RouteNode[];
}

// The portion of a backup that lives in SQLite. The repository produces and
// consumes exactly this; settings are layered on at the screen level.
export interface BackupTables {
  routes: BackupRoute[];
  rideHistory: RideHistory[];
}

export interface BackupData extends BackupTables {
  schemaVersion: number;
  exportedAt: number; // Unix ms
  settings: AppSettings | null;
}

export function serializeBackup(input: {
  routes: BackupRoute[];
  rideHistory: RideHistory[];
  settings: AppSettings | null;
}): string {
  const data: BackupData = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    routes: input.routes,
    rideHistory: input.rideHistory,
    settings: input.settings,
  };
  return JSON.stringify(data, null, 2);
}

// Validate and parse a backup file. Throws with a user-facing message on
// anything that isn't a backup this version can safely restore.
export function parseBackup(json: string): BackupData {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('This file is not a valid GhostRider backup (not JSON).');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('This file is not a valid GhostRider backup.');
  }

  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported backup version (${parsed.schemaVersion ?? 'unknown'}). This app restores version ${BACKUP_SCHEMA_VERSION}.`,
    );
  }

  if (!Array.isArray(parsed.routes) || !Array.isArray(parsed.rideHistory)) {
    throw new Error('This backup is missing route or ride data.');
  }

  for (const r of parsed.routes) {
    if (
      !r ||
      typeof r.id !== 'number' ||
      typeof r.name !== 'string' ||
      !Array.isArray(r.nodes)
    ) {
      throw new Error('This backup contains a malformed route.');
    }
  }

  return {
    schemaVersion: parsed.schemaVersion,
    exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : 0,
    routes: parsed.routes,
    rideHistory: parsed.rideHistory,
    settings: parsed.settings ?? null,
  };
}
