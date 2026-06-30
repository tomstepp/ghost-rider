import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import MapView, {
  LatLng,
  Marker,
  Polyline,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
} from 'react-native-maps';
import { RouteNode } from '../types';
import { latLngAtDistance, nodesToRegion, sampleNodes } from '../utils/routeGeometry';
import { DARK_MAP_STYLE } from './mapStyle';

interface Props {
  nodes: RouteNode[];
  height: number;
  /** Allow pan/zoom/rotate. Off by default so previews read as static cards. */
  interactive?: boolean;
  routeColor?: string;
  /** Optional live markers placed by distance-from-start along the route. */
  riderDistanceM?: number;
  ghostDistanceM?: number;
  style?: StyleProp<ViewStyle>;
  /** Fired once the basemap has finished loading (tiles rendered). */
  onLoaded?: () => void;
}

export interface RouteMapHandle {
  /**
   * Capture the current map as a PNG and return its file URI, or null if the
   * map isn't ready / the native snapshot fails. Used to bake the map into a
   * shareable image, since a live MapView can't be captured by view-shot.
   */
  takeSnapshot: () => Promise<string | null>;
}

// Cap polyline vertices — Google/Apple polylines get heavy past a few hundred
// points, and at preview zoom the extra detail isn't visible anyway.
const MAX_POLYLINE_POINTS = 600;
const EDGE_PADDING = { top: 28, right: 28, bottom: 28, left: 28 };

function Dot({ color, hollow = false }: { color: string; hollow?: boolean }) {
  return (
    <View
      style={[
        styles.dot,
        { borderColor: color, backgroundColor: hollow ? 'transparent' : color },
      ]}
    />
  );
}

/**
 * Renders a recorded route on a real basemap (Apple Maps on iOS, Google Maps on
 * Android) with start/finish markers and an optional rider/ghost overlay.
 * Returns null when there aren't enough points to draw a line.
 */
export const RouteMap = forwardRef<RouteMapHandle, Props>(function RouteMap(
  {
    nodes,
    height,
    interactive = false,
    routeColor = '#ffffff',
    riderDistanceM,
    ghostDistanceM,
    style,
    onLoaded,
  },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  // Tracks whether the map has finished its first tile load. takeSnapshot()
  // rejects on a not-yet-loaded map (common right after a modal mounts one),
  // so we wait for this before capturing.
  const loadedRef = useRef(false);

  const coords = useMemo<LatLng[]>(
    () =>
      sampleNodes(nodes, MAX_POLYLINE_POINTS).map((n) => ({
        latitude: n.latitude,
        longitude: n.longitude,
      })),
    [nodes],
  );
  const region = useMemo(() => nodesToRegion(nodes), [nodes]);

  useImperativeHandle(
    ref,
    () => ({
      async takeSnapshot() {
        if (!mapRef.current || coords.length < 2) return null;
        // Wait (up to ~2.5s) for the map to finish loading — snapshotting a
        // half-loaded map either rejects or yields blank tiles.
        for (let i = 0; i < 25 && !loadedRef.current; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        try {
          return await mapRef.current.takeSnapshot({
            format: 'png',
            quality: 0.9,
            result: 'file',
          });
        } catch (err) {
          // Surface it rather than silently falling back, so failures are debuggable.
          console.warn('RouteMap.takeSnapshot failed:', err);
          return null;
        }
      },
    }),
    [coords],
  );

  const rider = riderDistanceM != null ? latLngAtDistance(nodes, riderDistanceM) : null;
  const ghost = ghostDistanceM != null ? latLngAtDistance(nodes, ghostDistanceM) : null;

  // initialRegion gives a correct first paint; fitToCoordinates tightens the
  // frame to the actual polyline once the map is laid out.
  const markLoaded = useCallback(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    onLoaded?.();
  }, [onLoaded]);

  const handleReady = useCallback(() => {
    if (coords.length < 2) return;
    mapRef.current?.fitToCoordinates(coords, { edgePadding: EDGE_PADDING, animated: false });
    // Apple Maps doesn't fire onMapLoaded reliably; onMapReady is dependable there.
    if (Platform.OS === 'ios') markLoaded();
  }, [coords, markLoaded]);

  // Android: fires once tiles have rendered — the right moment to allow a snapshot.
  const handleLoaded = useCallback(() => {
    markLoaded();
  }, [markLoaded]);

  if (!region || coords.length < 2) return null;

  return (
    <View style={[styles.container, { height }, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={region}
        onMapReady={handleReady}
        onMapLoaded={handleLoaded}
        customMapStyle={DARK_MAP_STYLE}
        userInterfaceStyle="dark"
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
        toolbarEnabled={false}
        loadingEnabled
        loadingBackgroundColor="#000000"
        pointerEvents={interactive ? 'auto' : 'none'}
      >
        <Polyline coordinates={coords} strokeColor={routeColor} strokeWidth={4} />

        <Marker coordinate={coords[0]} anchor={CENTER} tracksViewChanges={false}>
          <Dot color="#4caf50" />
        </Marker>
        <Marker coordinate={coords[coords.length - 1]} anchor={CENTER} tracksViewChanges={false}>
          <Dot color="#f44336" />
        </Marker>

        {ghost && (
          <Marker coordinate={ghost} anchor={CENTER} tracksViewChanges={false}>
            <Dot color="#ffffff" hollow />
          </Marker>
        )}
        {rider && (
          <Marker coordinate={rider} anchor={CENTER} tracksViewChanges={false}>
            <Dot color="#ffffff" />
          </Marker>
        )}
      </MapView>
    </View>
  );
});

const CENTER = { x: 0.5, y: 0.5 };

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
});
