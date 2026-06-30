import { LocationPoint } from '../types';

export interface ILocationProvider {
  start(onPoint: (point: LocationPoint) => void): Promise<void>;
  stop(): Promise<void>;
  // Ratio of recorded (virtual) time to wall-clock playback time. 1 for live
  // GPS; a simulated provider replaying faster than real time reports its
  // multiplier here so the race hook can recover the recorded timeline (keeping
  // speed and time delta realistic regardless of playback rate).
  readonly timeScale?: number;
}
