import {
  calcElevationGain,
  sampleNodes,
  nodesToElevationPath,
  svgPointAtDistance,
  nodesToSvgPoints,
  latLngAtDistance,
  nodesToRegion,
} from '../routeGeometry';
import { RouteNode } from '../../types';

function node(distance: number, altitude = 0): RouteNode {
  return {
    latitude: 40 + distance / 100000,
    longitude: -105,
    altitude,
    timestamp: distance * 100,
    distance_from_start: distance,
  };
}

describe('calcElevationGain', () => {
  it('sums only positive deltas above the noise threshold', () => {
    const nodes = [node(0, 100), node(10, 105), node(20, 104), node(30, 110)];
    // +5 (counted), -1 (ignored), +6 (counted) = 11
    expect(calcElevationGain(nodes)).toBe(11);
  });

  it('ignores sub-2m jitter', () => {
    const nodes = [node(0, 100), node(10, 101), node(20, 101.5)];
    expect(calcElevationGain(nodes)).toBe(0);
  });

  it('returns 0 for fewer than two nodes', () => {
    expect(calcElevationGain([node(0, 100)])).toBe(0);
  });
});

describe('sampleNodes', () => {
  it('returns the array unchanged when within budget', () => {
    const nodes = [node(0), node(10), node(20)];
    expect(sampleNodes(nodes, 5)).toBe(nodes);
  });

  it('thins to at most maxPoints (plus the forced last node)', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => node(i));
    const sampled = sampleNodes(nodes, 10);
    expect(sampled.length).toBeLessThanOrEqual(11);
    // Always includes the final node.
    expect(sampled[sampled.length - 1]).toBe(nodes[nodes.length - 1]);
  });
});

describe('nodesToElevationPath', () => {
  it('returns null for flat routes', () => {
    const nodes = [node(0, 100), node(10, 101), node(20, 102)];
    expect(nodesToElevationPath(nodes, 200, 50)).toBeNull();
  });

  it('returns a closed path for routes with relief', () => {
    const nodes = [node(0, 100), node(10, 130), node(20, 110)];
    const path = nodesToElevationPath(nodes, 200, 50);
    expect(path).toMatch(/^M/);
    expect(path).toMatch(/Z$/);
  });
});

describe('svgPointAtDistance', () => {
  it('interpolates between SVG points along the route', () => {
    const nodes = [node(0), node(100), node(200)];
    const svgPoints = nodesToSvgPoints(nodes, 100, 100);
    const mid = svgPointAtDistance(svgPoints, nodes, 50);
    expect(mid).not.toBeNull();
    expect(Number.isFinite(mid!.x)).toBe(true);
    expect(Number.isFinite(mid!.y)).toBe(true);
  });

  it('returns null when there are no points', () => {
    expect(svgPointAtDistance([], [], 10)).toBeNull();
  });
});

describe('latLngAtDistance', () => {
  it('interpolates lat/lng midway between two nodes', () => {
    // node(d).latitude === 40 + d/100000, longitude fixed at -105
    const nodes = [node(0), node(100), node(200)];
    const mid = latLngAtDistance(nodes, 50);
    expect(mid).not.toBeNull();
    expect(mid!.latitude).toBeCloseTo(40 + 50 / 100000, 10);
    expect(mid!.longitude).toBeCloseTo(-105, 10);
  });

  it('clamps to the first node before the start', () => {
    const nodes = [node(0), node(100)];
    expect(latLngAtDistance(nodes, -10)).toEqual({ latitude: 40, longitude: -105 });
  });

  it('clamps to the last node past the end', () => {
    const nodes = [node(0), node(100)];
    const end = latLngAtDistance(nodes, 999);
    expect(end!.latitude).toBeCloseTo(40 + 100 / 100000, 10);
  });

  it('returns null when there are no nodes', () => {
    expect(latLngAtDistance([], 10)).toBeNull();
  });
});

describe('nodesToRegion', () => {
  it('centers on the route and applies a margin to the deltas', () => {
    const nodes = [node(0), node(100), node(200)];
    const region = nodesToRegion(nodes, 0)!;
    expect(region.latitude).toBeCloseTo(40 + 100 / 100000, 10);
    expect(region.longitude).toBeCloseTo(-105, 10);
    // Below the floor → clamped to the minimum delta.
    expect(region.latitudeDelta).toBeGreaterThanOrEqual(0.003);
  });

  it('enforces a minimum delta for a single-point route', () => {
    const region = nodesToRegion([node(0)])!;
    expect(region.latitudeDelta).toBe(0.003);
    expect(region.longitudeDelta).toBe(0.003);
  });

  it('returns null with no nodes', () => {
    expect(nodesToRegion([])).toBeNull();
  });
});
