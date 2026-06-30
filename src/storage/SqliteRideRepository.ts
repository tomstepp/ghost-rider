import * as SQLite from 'expo-sqlite';
import { Route, RouteNode, RideHistory } from '../types';
import { IRideRepository, RideCheckpoint } from './IRideRepository';
import { BackupRoute, BackupTables } from '../utils/backup';

const DB_NAME = 'ghost_rider.db';

export class SqliteRideRepository implements IRideRepository {
  private db: SQLite.SQLiteDatabase;

  constructor() {
    this.db = SQLite.openDatabaseSync(DB_NAME);
    this.init();
  }

  private init() {
    // foreign_keys is a per-connection pragma and a no-op inside a transaction,
    // so set it on its own before any schema work to make ON DELETE CASCADE active.
    this.db.execSync('PRAGMA foreign_keys = ON;');
    this.db.execSync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS routes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        total_distance  REAL NOT NULL,
        total_time_ms   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS route_nodes (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id            INTEGER NOT NULL,
        latitude            REAL NOT NULL,
        longitude           REAL NOT NULL,
        altitude            REAL NOT NULL,
        timestamp           INTEGER NOT NULL,
        distance_from_start REAL NOT NULL,
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_route_nodes_route_distance
        ON route_nodes (route_id, distance_from_start);

      CREATE TABLE IF NOT EXISTS ride_history (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id             INTEGER,
        duration_ms          INTEGER NOT NULL,
        avg_speed            REAL NOT NULL,
        final_time_delta     REAL,
        completed_percentage REAL NOT NULL,
        completed_at         INTEGER NOT NULL
      );

      -- Crash-recovery checkpoint: at most one in-progress ride at a time.
      -- The single meta row (id = 1) marks that a ride is being recorded.
      CREATE TABLE IF NOT EXISTS ride_checkpoint_meta (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        route_id    INTEGER,
        started_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ride_checkpoint_nodes (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude            REAL NOT NULL,
        longitude           REAL NOT NULL,
        altitude            REAL NOT NULL,
        timestamp           INTEGER NOT NULL,
        distance_from_start REAL NOT NULL
      );
    `);
    // Additive migration: add elevation_gain_m if not present yet
    try {
      this.db.execSync('ALTER TABLE ride_history ADD COLUMN elevation_gain_m REAL');
    } catch {
      // Column already exists — safe to ignore
    }
    // One-time cleanup: earlier builds deleted routes without an active
    // foreign_keys pragma, leaving node rows orphaned. Purge them.
    this.db.execSync(
      'DELETE FROM route_nodes WHERE route_id NOT IN (SELECT id FROM routes);',
    );
  }

  async getAllRoutes(): Promise<Route[]> {
    return this.db.getAllAsync<Route>('SELECT * FROM routes ORDER BY created_at DESC');
  }

  async getRouteById(id: number): Promise<Route | null> {
    return this.db.getFirstAsync<Route>('SELECT * FROM routes WHERE id = ?', [id]);
  }

  async getRouteNodes(routeId: number): Promise<RouteNode[]> {
    return this.db.getAllAsync<RouteNode>(
      'SELECT latitude, longitude, altitude, timestamp, distance_from_start FROM route_nodes WHERE route_id = ? ORDER BY distance_from_start ASC',
      [routeId],
    );
  }

  async saveRoute(name: string, nodes: RouteNode[]): Promise<number> {
    const totalDistance = nodes[nodes.length - 1]?.distance_from_start ?? 0;
    const totalTimeMs = nodes[nodes.length - 1]?.timestamp ?? 0;
    const createdAt = Date.now();

    // Insert the route row and all of its nodes atomically. Under WAL each
    // statement would otherwise be its own commit — slow for long rides and
    // non-atomic (a mid-loop failure would leave a partial route).
    let routeId = 0;
    await this.db.withTransactionAsync(async () => {
      const result = await this.db.runAsync(
        'INSERT INTO routes (name, created_at, total_distance, total_time_ms) VALUES (?, ?, ?, ?)',
        [name, createdAt, totalDistance, totalTimeMs],
      );
      routeId = result.lastInsertRowId;

      const stmt = await this.db.prepareAsync(
        'INSERT INTO route_nodes (route_id, latitude, longitude, altitude, timestamp, distance_from_start) VALUES (?, ?, ?, ?, ?, ?)',
      );
      try {
        for (const node of nodes) {
          await stmt.executeAsync([
            routeId,
            node.latitude,
            node.longitude,
            node.altitude,
            node.timestamp,
            node.distance_from_start,
          ]);
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });

    return routeId;
  }

  async renameRoute(id: number, name: string): Promise<void> {
    await this.db.runAsync('UPDATE routes SET name = ? WHERE id = ?', [name, id]);
  }

  async deleteRoute(id: number): Promise<void> {
    await this.db.runAsync('DELETE FROM routes WHERE id = ?', [id]);
  }

  async saveRideHistory(entry: Omit<RideHistory, 'id'>): Promise<number> {
    const result = await this.db.runAsync(
      `INSERT INTO ride_history
        (route_id, duration_ms, avg_speed, final_time_delta, completed_percentage, completed_at, elevation_gain_m)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.route_id,
        entry.duration_ms,
        entry.avg_speed,
        entry.final_time_delta,
        entry.completed_percentage,
        entry.completed_at,
        entry.elevation_gain_m ?? null,
      ],
    );
    return result.lastInsertRowId;
  }

  async getRideHistory(): Promise<RideHistory[]> {
    return this.db.getAllAsync<RideHistory>(
      'SELECT * FROM ride_history ORDER BY completed_at DESC',
    );
  }

  async deleteRideHistory(id: number): Promise<void> {
    await this.db.runAsync('DELETE FROM ride_history WHERE id = ?', [id]);
  }

  async startCheckpoint(routeId: number | null, startedAt: number): Promise<void> {
    // Replace any prior checkpoint atomically so a stale ride can't bleed into
    // the new one.
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM ride_checkpoint_nodes');
      await this.db.runAsync('DELETE FROM ride_checkpoint_meta');
      await this.db.runAsync(
        'INSERT INTO ride_checkpoint_meta (id, route_id, started_at) VALUES (1, ?, ?)',
        [routeId, startedAt],
      );
    });
  }

  async appendCheckpointNodes(nodes: RouteNode[]): Promise<void> {
    if (nodes.length === 0) return;
    await this.db.withTransactionAsync(async () => {
      const stmt = await this.db.prepareAsync(
        'INSERT INTO ride_checkpoint_nodes (latitude, longitude, altitude, timestamp, distance_from_start) VALUES (?, ?, ?, ?, ?)',
      );
      try {
        for (const node of nodes) {
          await stmt.executeAsync([
            node.latitude,
            node.longitude,
            node.altitude,
            node.timestamp,
            node.distance_from_start,
          ]);
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });
  }

  async getCheckpoint(): Promise<RideCheckpoint | null> {
    const meta = await this.db.getFirstAsync<{ route_id: number | null; started_at: number }>(
      'SELECT route_id, started_at FROM ride_checkpoint_meta WHERE id = 1',
    );
    if (!meta) return null;
    const nodes = await this.db.getAllAsync<RouteNode>(
      'SELECT latitude, longitude, altitude, timestamp, distance_from_start FROM ride_checkpoint_nodes ORDER BY id ASC',
    );
    return { routeId: meta.route_id ?? null, startedAt: meta.started_at, nodes };
  }

  async clearCheckpoint(): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM ride_checkpoint_nodes');
      await this.db.runAsync('DELETE FROM ride_checkpoint_meta');
    });
  }

  async checkpoint(): Promise<void> {
    // TRUNCATE folds the WAL back into the main db file and resets it, leaving
    // the .db self-consistent for whatever the OS backup snapshots.
    await this.db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  }

  async exportData(): Promise<BackupTables> {
    const routeRows = await this.db.getAllAsync<Route>(
      'SELECT * FROM routes ORDER BY created_at ASC',
    );
    const routes: BackupRoute[] = [];
    for (const r of routeRows) {
      routes.push({
        id: r.id,
        name: r.name,
        created_at: r.created_at,
        total_distance: r.total_distance,
        total_time_ms: r.total_time_ms,
        nodes: await this.getRouteNodes(r.id),
      });
    }
    const rideHistory = await this.getRideHistory();
    return { routes, rideHistory };
  }

  async importData(data: BackupTables): Promise<void> {
    // Replace-all restore. The whole thing runs in one transaction so a failure
    // mid-import leaves the existing data untouched rather than half-replaced.
    await this.db.withTransactionAsync(async () => {
      // Wipe current data, including any in-progress checkpoint — it belongs to
      // the dataset being replaced.
      await this.db.runAsync('DELETE FROM ride_history');
      await this.db.runAsync('DELETE FROM route_nodes');
      await this.db.runAsync('DELETE FROM routes');
      await this.db.runAsync('DELETE FROM ride_checkpoint_nodes');
      await this.db.runAsync('DELETE FROM ride_checkpoint_meta');

      // routes.id is AUTOINCREMENT, so restored routes get fresh ids. Track the
      // old→new mapping to re-link ride history below.
      const idMap = new Map<number, number>();
      const nodeStmt = await this.db.prepareAsync(
        'INSERT INTO route_nodes (route_id, latitude, longitude, altitude, timestamp, distance_from_start) VALUES (?, ?, ?, ?, ?, ?)',
      );
      try {
        for (const r of data.routes) {
          const res = await this.db.runAsync(
            'INSERT INTO routes (name, created_at, total_distance, total_time_ms) VALUES (?, ?, ?, ?)',
            [r.name, r.created_at, r.total_distance, r.total_time_ms],
          );
          const newId = res.lastInsertRowId;
          idMap.set(r.id, newId);
          for (const n of r.nodes) {
            await nodeStmt.executeAsync([
              newId,
              n.latitude,
              n.longitude,
              n.altitude,
              n.timestamp,
              n.distance_from_start,
            ]);
          }
        }
      } finally {
        await nodeStmt.finalizeAsync();
      }

      const histStmt = await this.db.prepareAsync(
        `INSERT INTO ride_history
          (route_id, duration_ms, avg_speed, final_time_delta, completed_percentage, completed_at, elevation_gain_m)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      try {
        for (const h of data.rideHistory) {
          // Rides may legitimately have no route (route_id null); a dangling
          // reference to a route not in the backup also becomes null rather
          // than a broken foreign key.
          const mapped =
            h.route_id == null ? null : idMap.get(h.route_id) ?? null;
          await histStmt.executeAsync([
            mapped,
            h.duration_ms,
            h.avg_speed,
            h.final_time_delta,
            h.completed_percentage,
            h.completed_at,
            h.elevation_gain_m ?? null,
          ]);
        }
      } finally {
        await histStmt.finalizeAsync();
      }
    });
  }
}
