import { parseGpx } from '../gpxParser';

const withTimestamps = `<?xml version="1.0"?>
<gpx><trk><name>Morning Loop</name><trkseg>
  <trkpt lat="40.0000" lon="-105.0000"><ele>1600</ele><time>2024-01-01T00:00:00Z</time></trkpt>
  <trkpt lat="40.0010" lon="-105.0000"><ele>1605</ele><time>2024-01-01T00:00:30Z</time></trkpt>
  <trkpt lat="40.0020" lon="-105.0000"><ele>1610</ele><time>2024-01-01T00:01:00Z</time></trkpt>
</trkseg></trk></gpx>`;

const noTimestamps = `<gpx><trk><trkseg>
  <trkpt lat="40.0000" lon="-105.0000"><ele>1600</ele></trkpt>
  <trkpt lat="40.0010" lon="-105.0000"><ele>1605</ele></trkpt>
</trkseg></trk></gpx>`;

const routeOnly = `<gpx><rte>
  <rtept lat="40.0000" lon="-105.0000"><ele>1600</ele><time>2024-01-01T00:00:00Z</time></rtept>
  <rtept lat="40.0010" lon="-105.0000"><ele>1605</ele><time>2024-01-01T00:00:30Z</time></rtept>
</rte></gpx>`;

describe('parseGpx', () => {
  it('parses track points with timestamps', () => {
    const { nodes, name, hasTimestamps } = parseGpx(withTimestamps);
    expect(hasTimestamps).toBe(true);
    expect(name).toBe('Morning Loop');
    expect(nodes).toHaveLength(3);
    // First node is relative time 0.
    expect(nodes[0].timestamp).toBe(0);
    // Second point is 30s later.
    expect(nodes[1].timestamp).toBe(30_000);
    // Distance accumulates monotonically.
    expect(nodes[2].distance_from_start).toBeGreaterThan(nodes[1].distance_from_start);
  });

  it('reports missing timestamps and synthesizes time from distance', () => {
    const { nodes, hasTimestamps } = parseGpx(noTimestamps);
    expect(hasTimestamps).toBe(false);
    expect(nodes[0].timestamp).toBe(0);
    // Derived timestamp must increase with distance.
    expect(nodes[1].timestamp).toBeGreaterThan(0);
  });

  it('falls back to route points when no track points exist', () => {
    const { nodes, hasTimestamps } = parseGpx(routeOnly);
    expect(nodes).toHaveLength(2);
    expect(hasTimestamps).toBe(true);
  });

  it('throws when there are fewer than two points', () => {
    expect(() => parseGpx('<gpx><trk><trkseg></trkseg></trk></gpx>')).toThrow();
  });
});
