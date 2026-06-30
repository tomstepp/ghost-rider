import {
  formatDistance,
  formatSpeed,
  formatElapsed,
  formatElevation,
  formatPace,
  formatDelta,
} from '../formatting';

describe('formatDistance', () => {
  it('formats km with two decimals above 1km', () => {
    expect(formatDistance(1500, 'km')).toBe('1.50 km');
  });
  it('formats meters below 1km', () => {
    expect(formatDistance(450, 'km')).toBe('450 m');
  });
  it('formats miles above 0.1mi', () => {
    expect(formatDistance(1609.34, 'mi')).toBe('1.00 mi');
  });
  it('falls back to feet below 0.1mi', () => {
    expect(formatDistance(30, 'mi')).toBe('98 ft');
  });
});

describe('formatSpeed', () => {
  it('converts m/s to km/h', () => {
    expect(formatSpeed(10, 'km')).toBe('36.0 km/h');
  });
  it('converts m/s to mph', () => {
    expect(formatSpeed(10, 'mi')).toBe('22.4 mph');
  });
});

describe('formatElapsed', () => {
  it('formats sub-hour as m:ss', () => {
    expect(formatElapsed(65_000)).toBe('1:05');
  });
  it('formats hour+ as h:mm:ss', () => {
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });
  it('formats zero', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });
});

describe('formatElevation', () => {
  it('formats meters', () => {
    expect(formatElevation(123.4, 'km')).toBe('123 m');
  });
  it('formats feet', () => {
    expect(formatElevation(100, 'mi')).toBe('328 ft');
  });
});

describe('formatPace', () => {
  it('returns placeholder below threshold speed', () => {
    expect(formatPace(0.05, 'km')).toBe('--:--');
  });
  it('formats km pace', () => {
    // 5 m/s → 1000/5 = 200s/km = 3:20 /km
    expect(formatPace(5, 'km')).toBe('3:20 /km');
  });
  it('formats mi pace', () => {
    // 5 m/s → 1609.34/5 = 321.9s/mi = 5:21 /mi
    expect(formatPace(5, 'mi')).toBe('5:21 /mi');
  });
});

describe('formatDelta', () => {
  it('returns -- for null', () => {
    expect(formatDelta(null)).toBe('--');
  });
  it('shows a minus sign when ahead (negative)', () => {
    expect(formatDelta(-2500)).toBe('-2.5s');
  });
  it('shows a plus sign when behind (positive)', () => {
    expect(formatDelta(2500)).toBe('+2.5s');
  });
});
