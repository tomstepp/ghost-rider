import { Route, RouteNode, RideHistory } from '../types';
import { BackupTables } from '../utils/backup';

export interface IRideRepository {
  // Ghost templates
  getAllRoutes(): Promise<Route[]>;
  getRouteById(id: number): Promise<Route | null>;
  getRouteNodes(routeId: number): Promise<RouteNode[]>;
  saveRoute(name: string, nodes: RouteNode[]): Promise<number>; // returns new route id
  renameRoute(id: number, name: string): Promise<void>;
  deleteRoute(id: number): Promise<void>;

  // Ride history
  saveRideHistory(entry: Omit<RideHistory, 'id'>): Promise<number>;
  getRideHistory(): Promise<RideHistory[]>;
  deleteRideHistory(id: number): Promise<void>;

  // Crash-recovery checkpoint — a single in-progress ride persisted as it's
  // recorded, so an app kill mid-ride can be recovered on next launch.
  startCheckpoint(routeId: number | null, startedAt: number): Promise<void>;
  appendCheckpointNodes(nodes: RouteNode[]): Promise<void>;
  getCheckpoint(): Promise<RideCheckpoint | null>;
  clearCheckpoint(): Promise<void>;

  // Full-data backup: serialise/replace every route, its nodes, and ride
  // history. Settings live outside SQLite and are handled at the screen level.
  exportData(): Promise<BackupTables>;
  importData(data: BackupTables): Promise<void>; // replace-all

  // Flush the WAL into the main .db file so an OS device backup (iCloud /
  // Android Auto Backup) snapshots a self-consistent database. Call when the
  // app backgrounds.
  checkpoint(): Promise<void>;
}

export interface RideCheckpoint {
  routeId: number | null;
  startedAt: number;     // Unix ms when the ride began
  nodes: RouteNode[];
}
