import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Theme, useTheme } from '../theme';

// Max physical gap (meters) that maps to full bar separation
const MAX_GAP_M = 500;

interface Props {
  userDistance: number;
  ghostDistance: number | null;
  totalDistance: number | null;
}

export function ElasticBand({ userDistance, ghostDistance, totalDistance }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const total = totalDistance ?? 10000;

  // User position as 0–1 along the bar (bottom = 0, top = 1)
  const userRatio = Math.min(userDistance / total, 1);

  // Ghost position
  const ghostRatio =
    ghostDistance !== null ? Math.min(ghostDistance / total, 1) : null;

  return (
    <View style={styles.track}>
      {/* Ghost indicator (hollow ring) */}
      {ghostRatio !== null && (
        <View
          style={[
            styles.ghostDot,
            { bottom: `${ghostRatio * 100}%` as unknown as number },
          ]}
        />
      )}
      {/* User indicator (solid dot) */}
      <View
        style={[
          styles.userDot,
          { bottom: `${userRatio * 100}%` as unknown as number },
        ]}
      />
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  track: {
    position: 'absolute',
    right: 12,
    top: 60,
    bottom: 60,
    width: 4,
    backgroundColor: t.border,
    borderRadius: 2,
  },
  userDot: {
    position: 'absolute',
    right: -7,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.text,
  },
  ghostDot: {
    position: 'absolute',
    right: -7,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: t.text,
    backgroundColor: 'transparent',
  },
});
