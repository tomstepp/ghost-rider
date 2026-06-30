import { RouteNode } from '../types';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Use a fixed, reasonable start time so exported timestamps are valid ISO dates.
// The absolute date doesn't matter for re-import — only relative deltas do.
const EXPORT_EPOCH_MS = Date.UTC(2000, 0, 1);

export function exportGpx(nodes: RouteNode[], name: string): string {
  const trkpts = nodes
    .map((n) => {
      const time = new Date(EXPORT_EPOCH_MS + n.timestamp).toISOString();
      return (
        `      <trkpt lat="${n.latitude.toFixed(7)}" lon="${n.longitude.toFixed(7)}">\n` +
        `        <ele>${n.altitude.toFixed(1)}</ele>\n` +
        `        <time>${time}</time>\n` +
        `      </trkpt>`
      );
    })
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="GhostRider" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <trk>\n` +
    `    <name>${escapeXml(name)}</name>\n` +
    `    <trkseg>\n` +
    `${trkpts}\n` +
    `    </trkseg>\n` +
    `  </trk>\n` +
    `</gpx>`
  );
}
