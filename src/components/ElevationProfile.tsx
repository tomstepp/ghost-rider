import React, { useMemo } from 'react';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { RouteNode } from '../types';
import { MarkerSettings } from '../screens/SettingsScreen';
import { elevationXAtDistance, nodesToElevationPath } from '../utils/routeGeometry';
import { useTheme } from '../theme';

const PADDING = 6;
const EMOJI_SIZE = 14;

interface Props {
  nodes: RouteNode[];
  width: number;
  height: number;
  riderDistanceM?: number;
  ghostDistanceM?: number;
  riderMarker?: MarkerSettings;
  ghostMarker?: MarkerSettings;
}

const DEFAULT_RIDER: MarkerSettings = { type: 'emoji', color: '#ffffff', emoji: '🔥' };
const DEFAULT_GHOST: MarkerSettings = { type: 'dot', color: '#888888', emoji: '👻' };

function ElevationMarker({
  x, height, marker, dashed,
}: {
  x: number;
  height: number;
  marker: MarkerSettings;
  dashed?: boolean;
}) {
  const color = marker.type === 'dot' ? marker.color : '#666';
  const topY = PADDING + (marker.type === 'emoji' ? EMOJI_SIZE / 2 : 0);

  return (
    <>
      <Line
        x1={x} y1={topY} x2={x} y2={height - PADDING}
        stroke={color}
        strokeWidth={marker.type === 'dot' ? (dashed ? 1.5 : 2) : 1}
        strokeDasharray={dashed ? '3,3' : undefined}
      />
      {marker.type === 'emoji' ? (
        <SvgText
          x={x}
          y={PADDING + EMOJI_SIZE / 2}
          fontSize={EMOJI_SIZE}
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {marker.emoji}
        </SvgText>
      ) : (
        <Circle cx={x} cy={PADDING} r={dashed ? 4 : 5} fill={color} />
      )}
    </>
  );
}

export function ElevationProfile({
  nodes, width, height,
  riderDistanceM, ghostDistanceM,
  riderMarker = DEFAULT_RIDER,
  ghostMarker = DEFAULT_GHOST,
}: Props) {
  const theme = useTheme();
  const path = useMemo(
    () => nodesToElevationPath(nodes, width, height, PADDING),
    [nodes, width, height],
  );

  const riderX = useMemo(
    () => riderDistanceM != null ? elevationXAtDistance(nodes, width, riderDistanceM, PADDING) : null,
    [nodes, width, riderDistanceM],
  );
  const ghostX = useMemo(
    () => ghostDistanceM != null ? elevationXAtDistance(nodes, width, ghostDistanceM, PADDING) : null,
    [nodes, width, ghostDistanceM],
  );

  if (!path) return null;

  return (
    <Svg width={width} height={height}>
      <Path d={path} fill={theme.surfaceAlt} stroke={theme.borderStrong} strokeWidth={1.5} />
      {ghostX != null && <ElevationMarker x={ghostX} height={height} marker={ghostMarker} dashed />}
      {riderX != null && <ElevationMarker x={riderX} height={height} marker={riderMarker} />}
    </Svg>
  );
}
