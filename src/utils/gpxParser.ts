import { RouteNode } from '../types';
import { haversineDistance } from './haversine';

interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
  timeMs: number | null;
}

function extractAttr(tag: string, attr: string): string | null {
  const match = new RegExp(`${attr}="([^"]+)"`).exec(tag);
  return match ? match[1] : null;
}

function extractTag(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  return match ? match[1].trim() : null;
}

export interface GpxParseResult {
  nodes: RouteNode[];
  name: string | null;
  hasTimestamps: boolean;
}

function extractPoints(gpxString: string, tagName: string): GpxPoint[] {
  const regex = new RegExp(`<${tagName}([^>]+)>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  const pts: GpxPoint[] = [];
  let m;
  while ((m = regex.exec(gpxString)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const lat = parseFloat(extractAttr(attrs, 'lat') ?? '');
    const lon = parseFloat(extractAttr(attrs, 'lon') ?? '');
    if (isNaN(lat) || isNaN(lon)) continue;
    const eleStr = extractTag(inner, 'ele');
    const timeStr = extractTag(inner, 'time');
    pts.push({
      lat,
      lon,
      ele: eleStr ? parseFloat(eleStr) : 0,
      timeMs: timeStr ? new Date(timeStr).getTime() : null,
    });
  }
  return pts;
}

export function parseGpx(gpxString: string): GpxParseResult {
  const name = extractTag(gpxString, 'name');

  // Try track points first (<trkpt>), fall back to route points (<rtept>)
  let points = extractPoints(gpxString, 'trkpt');
  if (points.length < 2) {
    points = extractPoints(gpxString, 'rtept');
  }

  if (points.length < 2) {
    throw new Error(
      `Found ${points.length} point(s) in GPX. ` +
        'Export a recorded ride (not a planned route) from RideWithGPS or Strava.'
    );
  }

  const hasTimestamps = points.every((p) => p.timeMs !== null);
  const startMs = hasTimestamps ? points[0].timeMs! : 0;

  const nodes: RouteNode[] = [];
  let distanceFromStart = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      distanceFromStart += haversineDistance(prev.lat, prev.lon, p.lat, p.lon);
    }

    // If no timestamps, derive time from distance assuming 20 km/h average
    const timestamp = hasTimestamps
      ? p.timeMs! - startMs
      : (distanceFromStart / (20000 / 3600)) * 1000;

    nodes.push({
      latitude: p.lat,
      longitude: p.lon,
      altitude: p.ele,
      timestamp,
      distance_from_start: distanceFromStart,
    });
  }

  return { nodes, name, hasTimestamps };
}
