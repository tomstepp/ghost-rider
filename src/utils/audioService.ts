import { setAudioModeAsync, createAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';

const aheadPlayer = createAudioPlayer(require('../../assets/chime-ahead.wav'));
const behindPlayer = createAudioPlayer(require('../../assets/chime-behind.wav'));
const neckPlayer = createAudioPlayer(require('../../assets/chime-neck.wav'));

// Countdown beep: create a fresh player per tick so a finished player never blocks replay.
// Keep the reference alive at module scope so the GO beep survives the immediate screen unmount.
let activeCountdownPlayer: ReturnType<typeof createAudioPlayer> | null = null;

export async function initAudio(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'mixWithOthers',
  });
}

export function announceTimeDelta(timeDeltaMs: number): void {
  const seconds = Math.abs(timeDeltaMs / 1000).toFixed(1);
  const phrase =
    timeDeltaMs < 0
      ? `${seconds} seconds ahead`
      : `${seconds} seconds behind`;
  Speech.speak(phrase, { rate: 1.1 });
}

export function announceGpsLost(): void {
  Speech.speak('GPS signal lost', { rate: 1.1 });
}

export function playChimeAhead(): void {
  aheadPlayer.seekTo(0);
  aheadPlayer.play();
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function playChimeBehind(): void {
  behindPlayer.seekTo(0);
  behindPlayer.play();
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function playChimeNeck(): void {
  neckPlayer.seekTo(0);
  neckPlayer.play();
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function announceCountdown(count: number): void {
  activeCountdownPlayer?.remove();
  if (count > 0) {
    activeCountdownPlayer = createAudioPlayer(require('../../assets/beep-low.wav'));
    activeCountdownPlayer.play();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } else if (count === 0) {
    activeCountdownPlayer = createAudioPlayer(require('../../assets/beep-high.wav'));
    activeCountdownPlayer.play();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}
