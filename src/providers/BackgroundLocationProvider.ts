import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { LocationPoint } from '../types';
import { ILocationProvider } from './ILocationProvider';

const LOCATION_TASK_NAME = 'ghost-rider-location';

let _onLocation: ((point: LocationPoint) => void) | null = null;

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
  if (error) {
    console.warn('[GhostRider] Location task error:', error.message);
    return;
  }
  if (!data || !_onLocation) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) return;
  const loc = locations[locations.length - 1];
  _onLocation({
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    altitude: loc.coords.altitude ?? 0,
    accuracy: loc.coords.accuracy ?? 999,
    timestamp: loc.timestamp,
  });
});

export class BackgroundLocationProvider implements ILocationProvider {
  private subscription: Location.LocationSubscription | null = null;

  async start(onPoint: (point: LocationPoint) => void): Promise<void> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission denied.');
    }

    _onLocation = onPoint;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

    if (bgStatus === 'granted') {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'GhostRider',
          notificationBody: 'Tracking your ride…',
          notificationColor: '#ffffff',
        },
      });
    } else {
      // Foreground-only fallback when "Always Allow" is not granted
      console.warn('[GhostRider] Background location denied — falling back to foreground tracking.');
      this.subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          if (_onLocation) {
            _onLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              altitude: loc.coords.altitude ?? 0,
              accuracy: loc.coords.accuracy ?? 999,
              timestamp: loc.timestamp,
            });
          }
        },
      );
    }
  }

  async stop(): Promise<void> {
    _onLocation = null;
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  }
}
