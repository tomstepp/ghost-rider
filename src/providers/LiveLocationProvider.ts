import * as Location from 'expo-location';
import { LocationPoint } from '../types';
import { ILocationProvider } from './ILocationProvider';

export class LiveLocationProvider implements ILocationProvider {
  private subscription: Location.LocationSubscription | null = null;

  async start(onPoint: (point: LocationPoint) => void): Promise<void> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Foreground location permission denied.');
    }

    // Background ("Always") permission lets tracking continue with the screen
    // off, but it's optional — fall back to foreground-only tracking when the
    // user grants only "While Using", mirroring BackgroundLocationProvider.
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.warn('[GhostRider] Background location denied — tracking will pause when the app is backgrounded.');
    }

    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (loc) => {
        onPoint({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude ?? 0,
          accuracy: loc.coords.accuracy ?? 999,
          timestamp: loc.timestamp,
        });
      },
    );
  }

  async stop(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
  }
}
