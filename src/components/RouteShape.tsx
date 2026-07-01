import React, { useMemo } from 'react';
import Svg, { Circle, Polyline, Text as SvgText } from 'react-native-svg';
import { RouteNode } from '../types';
import { MarkerSettings } from '../screens/SettingsScreen';
import { nodesToSvgPoints, sampleNodes, svgPointAtDistance, svgPointsToPolylineStr } from '../utils/routeGeometry';

interface Props {
  nodes: RouteNode[];
  width: number;
  height: number;
  riderDistanceM?: number;
  ghostDistanceM?: number;
  riderMarker?: MarkerSettings;
  ghostMarker?: MarkerSettings;
  strokeColor?: string;
  padding?: number;
  /** Draw START/FINISH markers at the route ends (matches the map view). */
  showEndpoints?: boolean;
}

const DEFAULT_RIDER: MarkerSettings = { type: 'emoji', color: '#ffffff', emoji: '🔥' };
const DEFAULT_GHOST: MarkerSettings = { type: 'emoji', color: '#888888', emoji: '👻' };

function SvgEndpoint({ pt, color, glyph }: { pt: { x: number; y: number }; color: string; glyph: string }) {
  return (
    <>
      <Circle cx={pt.x} cy={pt.y} r={11} fill="rgba(0,0,0,0.8)" stroke={color} strokeWidth={1.5} />
      <SvgText x={pt.x} y={pt.y} fontSize={12} fill={color} textAnchor="middle" alignmentBaseline="middle">
        {glyph}
      </SvgText>
    </>
  );
}

function Marker({ pt, config, size }: { pt: { x: number; y: number }; config: MarkerSettings; size: number }) {
  if (config.type === 'emoji') {
    return (
      <SvgText
        x={pt.x}
        y={pt.y}
        fontSize={size}
        textAnchor="middle"
        alignmentBaseline="middle"
      >
        {config.emoji}
      </SvgText>
    );
  }
  return <Circle cx={pt.x} cy={pt.y} r={size / 2} fill={config.color} />;
}

export function RouteShape({
  nodes,
  width,
  height,
  riderDistanceM,
  ghostDistanceM,
  riderMarker = DEFAULT_RIDER,
  ghostMarker = DEFAULT_GHOST,
  strokeColor = '#444',
  padding = 8,
  showEndpoints = false,
}: Props) {
  const sampled = useMemo(() => sampleNodes(nodes, 200), [nodes]);
  const svgPoints = useMemo(
    () => nodesToSvgPoints(sampled, width, height, padding),
    [sampled, width, height, padding],
  );
  const polylineStr = useMemo(() => svgPointsToPolylineStr(svgPoints), [svgPoints]);

  const riderPt = useMemo(
    () => riderDistanceM != null ? svgPointAtDistance(svgPoints, sampled, riderDistanceM) : null,
    [svgPoints, sampled, riderDistanceM],
  );
  const ghostPt = useMemo(
    () => ghostDistanceM != null ? svgPointAtDistance(svgPoints, sampled, ghostDistanceM) : null,
    [svgPoints, sampled, ghostDistanceM],
  );

  if (!polylineStr) return null;

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={polylineStr}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showEndpoints && svgPoints.length > 1 && (
        <>
          <SvgEndpoint pt={svgPoints[0]} color="#4caf50" glyph="▶" />
          <SvgEndpoint pt={svgPoints[svgPoints.length - 1]} color="#f44336" glyph="🏁" />
        </>
      )}
      {ghostPt && <Marker pt={ghostPt} config={ghostMarker} size={16} />}
      {riderPt && <Marker pt={riderPt} config={riderMarker} size={14} />}
    </Svg>
  );
}
