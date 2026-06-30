import { LocationPoint, RouteNode } from '../types';
import { ILocationProvider } from './ILocationProvider';

const GPS_ACCURACY_M = 5; // Simulated accuracy

export class SimulatedLocationProvider implements ILocationProvider {
  private nodes: RouteNode[];
  private speedMultiplier: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startTimeMs: number = 0;
  private rideStartAt: number = 0;

  // Points are emitted at recordedInterval / speedMultiplier wall-clock, so
  // wall time is compressed by this factor relative to the recorded ride. The
  // hook multiplies it back out to keep speed and delta at the recorded pace.
  readonly timeScale: number;

  constructor(nodes: RouteNode[], speedMultiplier = 1) {
    this.nodes = nodes;
    this.speedMultiplier = speedMultiplier;
    this.timeScale = speedMultiplier;
  }

  async start(onPoint: (point: LocationPoint) => void): Promise<void> {
    if (this.nodes.length === 0) return;

    this.rideStartAt = Date.now();
    this.startTimeMs = this.nodes[0].timestamp;
    let index = 0;

    const tick = () => {
      if (index >= this.nodes.length) return;

      const node = this.nodes[index];
      const realElapsed = (Date.now() - this.rideStartAt) * this.speedMultiplier;
      const nodeRelativeMs = node.timestamp - this.startTimeMs;

      onPoint({
        latitude: node.latitude,
        longitude: node.longitude,
        altitude: node.altitude,
        accuracy: GPS_ACCURACY_M,
        timestamp: Date.now(),
      });

      index++;
      if (index < this.nodes.length) {
        const nextNode = this.nodes[index];
        const delay =
          (nextNode.timestamp - node.timestamp) / this.speedMultiplier;
        this.timer = setTimeout(tick, delay);
      }
    };

    tick();
  }

  async stop(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
