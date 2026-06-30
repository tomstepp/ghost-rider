import React, { useRef, useState } from 'react';
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

interface Props {
  onDone: () => void;
}

// HUD background tints, kept in sync with RaceHUDScreen so the color strip in
// the intro matches the live screen exactly.
const AHEAD_COLOR = '#032b13';
const BEHIND_COLOR = '#360808';
const EVEN_COLOR = '#000000';

// A small hand-drawn loop used to preview the app's real route visual. Values
// are relative — RouteShape normalizes them to fit. distance_from_start only
// needs to increase monotonically for the markers to place correctly.
const SAMPLE_ROUTE: RouteNode[] = [
  [-2.0, -1.0], [-1.0, -1.6], [0.2, -1.7], [1.3, -1.3], [2.0, -0.4],
  [2.2, 0.7], [1.8, 1.7], [0.9, 2.3], [-0.3, 2.4], [-1.4, 2.0],
  [-2.1, 1.1], [-2.3, 0.0], [-2.0, -1.0],
].map(([lon, lat], i) => ({
  latitude: lat,
  longitude: lon,
  altitude: 0,
  timestamp: i * 20000,
  distance_from_start: i * 130,
}));
const SAMPLE_TOTAL = SAMPLE_ROUTE[SAMPLE_ROUTE.length - 1].distance_from_start;

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
  return (
    <View style={styles.colorStrip}>
      <View style={[styles.hudCard, { backgroundColor: AHEAD_COLOR }]}>
        <Text style={styles.hudDelta}>-4.2s</Text>
        <Text style={styles.hudLabel}>AHEAD</Text>
      </View>
      <View style={[styles.hudCard, styles.hudEven, { backgroundColor: EVEN_COLOR }]}>
        <Text style={styles.hudDelta}>0.0s</Text>
        <Text style={styles.hudLabel}>EVEN</Text>
      </View>
      <View style={[styles.hudCard, { backgroundColor: BEHIND_COLOR }]}>
        <Text style={styles.hudDelta}>+2.1s</Text>
        <Text style={styles.hudLabel}>BEHIND</Text>
      </View>
    </View>
  );
}

function StepContent({ step, previewWidth }: { step: Step; previewWidth: number }) {
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
            riderDistanceM={SAMPLE_TOTAL * 0.62}
            ghostDistanceM={SAMPLE_TOTAL * 0.46}
            strokeColor="#333"
            padding={12}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    color: '#444',
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
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 20,
    // Full-width box so letterSpacing can't push the last word past the
    // shrink-wrapped text bounds and clip it (iOS letterSpacing measuring bug).
    alignSelf: 'stretch',
  },
  body: {
    fontSize: 16,
    color: '#666',
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
    borderColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 72,
    alignItems: 'center',
  },
  optionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#888',
    letterSpacing: 1.5,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: '#aaa',
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
    borderColor: '#222',
  },
  hudDelta: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
  },
  hudLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#888',
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
    backgroundColor: '#333',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 20,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 18,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 2,
  },
});
