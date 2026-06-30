import { getGhostTimeAtDistance, getGhostDistanceAtTime } from '../ghostInterpolation';
import { RouteNode } from '../../types';

function node(distance: number, timestamp: number): RouteNode {
  return { latitude: 0, longitude: 0, altitude: 0, distance_from_start: distance, timestamp };
}

// A ghost that covers 100m in 10s, then 100m more in 20s (slows down).
const ghost: RouteNode[] = [
  node(0, 0),
  node(100, 10_000),
  node(200, 30_000),
];

describe('getGhostTimeAtDistance', () => {
  it('returns null for an empty ghost', () => {
    expect(getGhostTimeAtDistance([], 50)).toBeNull();
  });

  it('clamps to the first node before the start', () => {
    expect(getGhostTimeAtDistance(ghost, -10)).toBe(0);
    expect(getGhostTimeAtDistance(ghost, 0)).toBe(0);
  });

  it('clamps to the final time past the end', () => {
    expect(getGhostTimeAtDistance(ghost, 250)).toBe(30_000);
    expect(getGhostTimeAtDistance(ghost, 200)).toBe(30_000);
  });

  it('lands exactly on an interior node', () => {
    expect(getGhostTimeAtDistance(ghost, 100)).toBe(10_000);
  });

  it('linearly interpolates within the first segment', () => {
    // Halfway through 0–100m → 5s
    expect(getGhostTimeAtDistance(ghost, 50)).toBeCloseTo(5_000, 6);
  });

  it('linearly interpolates within the second (slower) segment', () => {
    // Halfway through 100–200m → 10s + half of 20s = 20s
    expect(getGhostTimeAtDistance(ghost, 150)).toBeCloseTo(20_000, 6);
  });

  it('handles a zero-length segment without dividing by zero', () => {
    const dup: RouteNode[] = [node(0, 0), node(100, 5_000), node(100, 8_000), node(200, 12_000)];
    const t = getGhostTimeAtDistance(dup, 100);
    expect(Number.isFinite(t!)).toBe(true);
  });
});

describe('getGhostDistanceAtTime', () => {
  it('returns null for an empty ghost', () => {
    expect(getGhostDistanceAtTime([], 5_000)).toBeNull();
  });

  it('clamps to the start before the ghost begins', () => {
    expect(getGhostDistanceAtTime(ghost, -1)).toBe(0);
    expect(getGhostDistanceAtTime(ghost, 0)).toBe(0);
  });

  it('clamps to the final distance once the ghost has finished', () => {
    expect(getGhostDistanceAtTime(ghost, 30_000)).toBe(200);
    expect(getGhostDistanceAtTime(ghost, 99_000)).toBe(200);
  });

  it('returns the first node at or after the elapsed time', () => {
    // ghost: t=0→0m, t=10s→100m, t=30s→200m
    expect(getGhostDistanceAtTime(ghost, 10_000)).toBe(100);
    // At 5s, the first node at/after is the 10s/100m node.
    expect(getGhostDistanceAtTime(ghost, 5_000)).toBe(100);
    // At 11s, the first node at/after is the 30s/200m node.
    expect(getGhostDistanceAtTime(ghost, 11_000)).toBe(200);
  });

  it('matches a linear-scan reference over many queries', () => {
    const big: RouteNode[] = Array.from({ length: 500 }, (_, i) => node(i * 10, i * 1000));
    for (let q = 0; q < 5000; q += 137) {
      const expected =
        q >= big[big.length - 1].timestamp
          ? big[big.length - 1].distance_from_start
          : (big.find((n) => n.timestamp >= q) ?? big[big.length - 1]).distance_from_start;
      expect(getGhostDistanceAtTime(big, q)).toBe(expected);
    }
  });
});
