import { RouteNode } from '../types';

/**
 * Given a ghost route and the user's current distance from start (meters),
 * returns the ghost's elapsed time (ms) at that exact distance via binary
 * search + linear interpolation between the two bounding nodes.
 *
 * Returns null if the user has gone beyond the ghost route.
 */
export function getGhostTimeAtDistance(
  nodes: RouteNode[],
  userDistanceM: number,
): number | null {
  if (nodes.length === 0) return null;

  // User has gone past the end of the ghost route — clamp to ghost's final time
  if (userDistanceM >= nodes[nodes.length - 1].distance_from_start) {
    return nodes[nodes.length - 1].timestamp;
  }

  // User hasn't started moving yet
  if (userDistanceM <= nodes[0].distance_from_start) {
    return nodes[0].timestamp;
  }

  // Binary search for the bounding nodes
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid].distance_from_start <= userDistanceM) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = nodes[lo];
  const b = nodes[hi];
  const span = b.distance_from_start - a.distance_from_start;
  if (span === 0) return a.timestamp;

  const ratio = (userDistanceM - a.distance_from_start) / span;
  return a.timestamp + ratio * (b.timestamp - a.timestamp);
}

/**
 * Given a ghost route and an elapsed time (ms), returns the ghost's
 * distance_from_start at that moment — i.e. where the ghost is right now.
 *
 * Ghost timestamps increase monotonically with distance, so this binary
 * searches for the first node at or after `elapsedMs`. If the ghost has already
 * finished, returns the final node's distance.
 */
export function getGhostDistanceAtTime(
  nodes: RouteNode[],
  elapsedMs: number,
): number | null {
  if (nodes.length === 0) return null;

  const last = nodes[nodes.length - 1];
  if (elapsedMs >= last.timestamp) return last.distance_from_start;
  if (elapsedMs <= nodes[0].timestamp) return nodes[0].distance_from_start;

  // Binary search for the first node whose timestamp >= elapsedMs.
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid].timestamp < elapsedMs) lo = mid + 1;
    else hi = mid;
  }
  return nodes[lo].distance_from_start;
}
