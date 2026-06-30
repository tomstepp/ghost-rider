#!/usr/bin/env node
// Generates assets/beep-low.wav and assets/beep-high.wav
const fs = require('fs');
const path = require('path');

function generateBeep(filename, frequency, durationMs = 130, amplitude = 22000) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const buf = Buffer.alloc(44 + numSamples * 2);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + numSamples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    // Short attack (first 5ms), then linear fade-out
    const attackSamples = Math.floor(sampleRate * 0.005);
    const attack = i < attackSamples ? i / attackSamples : 1;
    const decay = 1 - i / numSamples;
    const sample = Math.round(amplitude * attack * decay * Math.sin(2 * Math.PI * frequency * i / sampleRate));
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), 44 + i * 2);
  }

  fs.writeFileSync(filename, buf);
  console.log(`wrote ${path.basename(filename)} (${frequency} Hz, ${durationMs}ms)`);
}

const assetsDir = path.join(__dirname, '..', 'assets');
generateBeep(path.join(assetsDir, 'beep-low.wav'),  660, 120);
generateBeep(path.join(assetsDir, 'beep-high.wav'), 1320, 200);
