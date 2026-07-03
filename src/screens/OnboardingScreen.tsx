import React, { useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RouteNode } from '../types';
import { RouteShape } from '../components/RouteShape';
import { Theme, useTheme } from '../theme';

interface Props {
  onDone: () => void;
}

// A small hand-drawn one-way route used to preview the app's real route visual
// with start/finish markers. Values are relative — RouteShape normalizes them
// to fit. distance_from_start only needs to increase monotonically.
const SAMPLE_ROUTE: RouteNode[] = [
  [-2.4, -1.4], [-1.6, -1.6], [-0.9, -1.2], [-0.5, -0.4], [-0.6, 0.4],
  [-1.1, 1.0], [-0.6, 1.6], [0.3, 1.8], [1.1, 1.5], [1.6, 0.8],
  [1.6, -0.1], [2.0, -0.9], [2.5, -1.4],
].map(([lon, lat], i) => ({
  latitude: lat,
  longitude: lon,
  altitude: 0,
  timestamp: i * 20000,
  distance_from_start: i * 130,
}));

interface Step {
  emoji: string;
  title: string;
  body: string;
  options?: { label: string; text: string }[];
  routePreview?: boolean;
  colorStrip?: boolean;
}

const STEPS: Step[] = [
  {
    emoji: '👻',
    title: 'Race your past self.',
    body: 'GhostRider is a heads-up display for your bike. Record a ride, then race the ghost of it — glance, don\'t stare.',
  },
  {
    emoji: '🚴',
    title: 'Get a ghost — two ways.',
    body: 'Every saved ride becomes a ghost you can race.',
    routePreview: true,
    options: [
      { label: 'RECORD', text: 'Tap START RIDE, ride your route, then save it as a ghost.' },
      { label: 'IMPORT', text: 'Or import a GPX from Strava, Garmin, or Komoot and race it right away.' },
    ],
  },
  {
    emoji: '⏱',
    title: 'Race it.',
    body: 'Pick a ghost and go. Your time delta updates live — and the whole screen shifts color so you know at a glance.',
    colorStrip: true,
  },
  {
    emoji: '🔊',
    title: 'Eyes on the road.',
    body: 'GhostRider talks to you: spoken split updates, a chime when you pull ahead or slip behind, and an alert if GPS drops. Huge numbers, bold colors — no need to stare.',
  },
  {
    emoji: '✨',
    title: 'Make it yours.',
    body: 'Choose your units and rider/ghost markers in Settings. Every ride is saved to your history, and you can share a route card with friends.',
  },
];

function ColorStrip() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.colorStrip}>
      <View style={[styles.hudCard, { backgroundColor: theme.aheadBg }]}>
        <Text style={styles.hudDelta}>-4.2s</Text>
        <Text style={styles.hudLabel}>AHEAD</Text>
      </View>
      <View style={[styles.hudCard, styles.hudEven, { backgroundColor: theme.evenBg }]}>
        <Text style={styles.hudDelta}>0.0s</Text>
        <Text style={styles.hudLabel}>EVEN</Text>
      </View>
      <View style={[styles.hudCard, { backgroundColor: theme.behindBg }]}>
        <Text style={styles.hudDelta}>+2.1s</Text>
        <Text style={styles.hudLabel}>BEHIND</Text>
      </View>
    </View>
  );
}

function StepContent({ step, previewWidth }: { step: Step; previewWidth: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.content}>
      <Text style={styles.emoji}>{step.emoji}</Text>
      <Text style={styles.title}>{step.title}</Text>
      <Text style={styles.body}>{step.body}</Text>

      {step.routePreview && (
        <View style={styles.routePreview}>
          <RouteShape
            nodes={SAMPLE_ROUTE}
            width={previewWidth}
            height={120}
            strokeColor={theme.routeStroke}
            padding={12}
            showEndpoints
          />
        </View>
      )}

      {step.options && (
        <View style={styles.optionList}>
          {step.options.map((o) => (
            <View key={o.label} style={styles.optionRow}>
              <View style={styles.optionBadge}>
                <Text style={styles.optionBadgeText}>{o.label}</Text>
              </View>
              <Text style={styles.optionText}>{o.text}</Text>
            </View>
          ))}
        </View>
      )}

      {step.colorStrip && <ColorStrip />}
    </View>
  );
}

export function OnboardingScreen({ onDone }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [step, setStep] = useState(0);
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const isLast = step === STEPS.length - 1;
  // Page width minus the per-slide horizontal padding (32 each side).
  const previewWidth = width - 64;

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(next, STEPS.length - 1));
    setStep(clamped);
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    if (page !== step) setStep(page);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {step > 0 ? (
          <TouchableOpacity style={styles.headerButton} onPress={() => goTo(step - 1)}>
            <Text style={styles.headerButtonText}>‹ Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
        <TouchableOpacity style={styles.headerButton} onPress={onDone}>
          <Text style={styles.headerButtonText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        style={styles.pager}
      >
        {STEPS.map((s, i) => (
          <View key={i} style={[styles.page, { width }]}>
            <StepContent step={s} previewWidth={previewWidth} />
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => (isLast ? onDone() : goTo(step + 1))}
        >
          <Text style={styles.buttonText}>{isLast ? "LET'S RIDE" : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
    paddingTop: 64,
    paddingBottom: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    height: 32,
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
    color: t.textFaint,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emoji: {
    fontSize: 72,
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: t.text,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 20,
    // Full-width box so letterSpacing can't push the last word past the
    // shrink-wrapped text bounds and clip it (iOS letterSpacing measuring bug).
    alignSelf: 'stretch',
  },
  body: {
    fontSize: 16,
    color: t.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  routePreview: {
    marginTop: 28,
    alignItems: 'center',
  },
  optionList: {
    marginTop: 28,
    gap: 16,
    alignSelf: 'stretch',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  optionBadge: {
    borderWidth: 1,
    borderColor: t.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 72,
    alignItems: 'center',
  },
  optionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: t.textMuted,
    letterSpacing: 1.5,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: t.textSecondary,
    lineHeight: 20,
  },
  colorStrip: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 36,
    alignSelf: 'stretch',
  },
  hudCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  hudEven: {
    borderWidth: 1,
    borderColor: t.border,
  },
  hudDelta: {
    fontSize: 26,
    fontWeight: '900',
    color: t.text,
  },
  hudLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: t.textMuted,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  footer: {
    gap: 24,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.borderStrong,
  },
  dotActive: {
    backgroundColor: t.text,
    width: 20,
  },
  button: {
    backgroundColor: t.accent,
    borderRadius: 14,
    paddingVertical: 18,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '900',
    color: t.accentText,
    letterSpacing: 2,
  },
});
