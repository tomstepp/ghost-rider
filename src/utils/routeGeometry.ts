import { RouteNode } from '../types';

export interface SvgPoint { x: number; y: number; }

/**
 * Convert RouteNode lat/lon to SVG coordinates within a bounding box.
 * Corrects longitude scale for latitude so the route shape looks proportional.
 */
export function nodesToSvgPoints(
  nodes: RouteNode[],
  width: number,
  height: number,
  padding = 8,
): SvgPoint[] {
  if (nodes.length < 2) return [];

  const lats = nodes.map((n) => n.latitude);
  const lons = nodes.map((n) => n.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Correct for longitude shrinkage at higher latitudes
  const avgLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((avgLat * Math.PI) / 180);

  const latRange = maxLat - minLat || 0.0001;
  const lonRange = (maxLon - minLon) * lonScale || 0.0001;

  const w = width - padding * 2;
  const h = height - padding * 2;

  const scale = Math.min(w / lonRange, h / latRange);
  const offsetX = (w - lonRange * scale) / 2;
  const offsetY = (h - latRange * scale) / 2;

  return nodes.map((n) => ({
    x: padding + offsetX + (n.longitude - minLon) * lonScale * scale,
    y: padding + offsetY + (maxLat - n.latitude) * scale, // flip Y: lat increases up, SVG y increases down
  }));
}

export function svgPointsToPolylineStr(points: SvgPoint[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/** Interpolate the SVG position along the route at a given distance. */
export function svgPointAtDistance(
  svgPoints: SvgPoint[],
  nodes: RouteNode[],
  distanceM: number,
): SvgPoint | null {
  if (!svgPoints.length || !nodes.length) return null;

  // Binary search
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid].distance_from_start < distanceM) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return svgPoints[0];

  const prev = nodes[lo - 1];
  const curr = nodes[lo];
  const segLen = curr.distance_from_start - prev.distance_from_start;
  const t = segLen > 0 ? (distanceM - prev.distance_from_start) / segLen : 0;
  return {
    x: svgPoints[lo - 1].x + t * (svgPoints[lo].x - svgPoints[lo - 1].x),
    y: svgPoints[lo - 1].y + t * (svgPoints[lo].y - svgPoints[lo - 1].y),
  };
}

/** Build a filled SVG path for the elevation profile. Returns null if elevation data is flat. */
export function nodesToElevationPath(
  nodes: RouteNode[],
  width: number,
  height: number,
  padding = 6,
): string | null {
  if (nodes.length < 2) return null;

  const alts = nodes.map((n) => n.altitude);
  const minAlt = Math.min(...alts);
  const maxAlt = Math.max(...alts);
  if (maxAlt - minAlt < 5) return null; // flat — not worth showing

  const totalDist = nodes[nodes.length - 1].distance_from_start;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const altRange = maxAlt - minAlt;

  const pts = nodes.map((n) => ({
    x: padding + (n.distance_from_start / totalDist) * w,
    y: padding + (1 - (n.altitude - minAlt) / altRange) * h,
  }));

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  // Close into a filled area
  const lastX = (padding + w).toFixed(1);
  const baseY = (padding + h).toFixed(1);
  return `${line} L${lastX},${baseY} L${padding},${baseY} Z`;
}

/** X position (0–width) for a given distance on the elevation chart. */
export function elevationXAtDistance(
  nodes: RouteNode[],
  width: number,
  distanceM: number,
  padding = 6,
): number {
  const totalDist = nodes[nodes.length - 1].distance_from_start || 1;
  const fraction = Math.min(distanceM / totalDist, 1);
  return padding + fraction * (width - padding * 2);
}

/** Sum of positive altitude deltas — ignores GPS jitter below 2m. */
export function calcElevationGain(nodes: RouteNode[]): number {
  const NOISE_THRESHOLD_M = 2;
  let gain = 0;
  for (let i = 1; i < nodes.length; i++) {
    const delta = nodes[i].altitude - nodes[i - 1].altitude;
    if (delta > NOISE_THRESHOLD_M) gain += delta;
  }
  return gain;
}

/** Thin a node array to at most maxPoints for thumbnail/preview rendering. */
export function sampleNodes(nodes: RouteNode[], maxPoints: number): RouteNode[] {
  if (nodes.length <= maxPoints) return nodes;
  const step = Math.ceil(nodes.length / maxPoints);
  const sampled = nodes.filter((_, i) => i % step === 0);
  // Always include the last node
  if (sampled[sampled.length - 1] !== nodes[nodes.length - 1]) {
    sampled.push(nodes[nodes.length - 1]);
  }
  return sampled;
}
