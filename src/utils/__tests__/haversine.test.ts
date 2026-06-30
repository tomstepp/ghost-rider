import { haversineDistance } from '../haversine';

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(40.0, -105.0, 40.0, -105.0)).toBe(0);
  });

  it('computes ~111.2 km for 1 degree of latitude', () => {
    const d = haversineDistance(0, 0, 1, 0);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('is symmetric', () => {
    const a = haversineDistance(37.7749, -122.4194, 34.0522, -118.2437);
    const b = haversineDistance(34.0522, -118.2437, 37.7749, -122.4194);
    expect(a).toBeCloseTo(b, 6);
  });

  it('matches a known SF→LA distance (~559 km)', () => {
    const d = haversineDistance(37.7749, -122.4194, 34.0522, -118.2437);
    // Great-circle distance is ~559 km; allow a small tolerance.
    expect(d / 1000).toBeGreaterThan(550);
    expect(d / 1000).toBeLessThan(570);
  });

  it('shrinks longitude distance at higher latitude', () => {
    const atEquator = haversineDistance(0, 0, 0, 1);
    const atSixty = haversineDistance(60, 0, 60, 1);
    // 1° of longitude at 60°N is roughly half the equatorial distance.
    expect(atSixty).toBeLessThan(atEquator);
    expect(atSixty / atEquator).toBeCloseTo(0.5, 1);
  });
});
