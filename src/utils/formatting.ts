export type Units = 'km' | 'mi';

export function formatDistance(meters: number, units: Units = 'km'): string {
  if (units === 'mi') {
    const miles = meters / 1609.34;
    if (miles >= 0.1) return `${miles.toFixed(2)} mi`;
    const feet = meters * 3.28084;
    return `${Math.round(feet)} ft`;
  }
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export function formatSpeed(metersPerSecond: number, units: Units = 'km'): string {
  if (units === 'mi') {
    return `${(metersPerSecond * 2.23694).toFixed(1)} mph`;
  }
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatElevation(meters: number, units: Units): string {
  if (units === 'mi') return `${Math.round(meters * 3.28084)} ft`;
  return `${Math.round(meters)} m`;
}

export function formatPace(metersPerSecond: number, units: Units): string {
  if (metersPerSecond < 0.1) return '--:--';
  const secondsPerUnit = units === 'mi' ? 1609.34 / metersPerSecond : 1000 / metersPerSecond;
  const min = Math.floor(secondsPerUnit / 60);
  const sec = Math.floor(secondsPerUnit % 60);
  return `${min}:${String(sec).padStart(2, '0')} /${units === 'mi' ? 'mi' : 'km'}`;
}

export function formatDelta(timeDelta: number | null): string {
  if (timeDelta === null) return '--';
  const sign = timeDelta < 0 ? '-' : '+';
  return `${sign}${Math.abs(timeDelta / 1000).toFixed(1)}s`;
}
