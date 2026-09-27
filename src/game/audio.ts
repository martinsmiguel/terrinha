/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sound synthesizer using the Web Audio API.
 * Synthesizes authentic RTS sound effects natively without requiring external audio assets.
 */
class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterVolume: number = 0.65;
  private lastBarkTime: number = 0;
  private lastBarkVariation: number = -1;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  /**
   * Sound effect when a new building construction is started.
   * Simulates wooden carpentry hammer impacts and structural foundation placement.
   */
  public playBuildingConstructStartedSound(buildingType: 'house' | 'barracks' | 'town_center' | string = 'house') {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.masterVolume, now);
    masterGain.connect(ctx.destination);

    // 1. Heavy Stone / Ground Foundation Placement Thud
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(140, now);
    subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.35);

    subGain.gain.setValueAtTime(0.7, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    subOsc.connect(subGain);
    subGain.connect(masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.4);

    // 2. Hammer Strikes against Wood / Timber Nails (3 sequential strikes: tap... tap-TAP!)
    const strikeDelays = [0.03, 0.16, 0.28];
    const strikePitches = [
      buildingType === 'barracks' ? 520 : 640,
      buildingType === 'barracks' ? 580 : 700,
      buildingType === 'barracks' ? 660 : 780,
    ];

    strikeDelays.forEach((delay, idx) => {
      const strikeTime = now + delay;
      const pitch = strikePitches[idx];

      // Metallic / Hard wood ping
      const strikeOsc = ctx.createOscillator();
      const strikeGain = ctx.createGain();
      strikeOsc.type = 'sine';
      strikeOsc.frequency.setValueAtTime(pitch, strikeTime);
      strikeOsc.frequency.exponentialRampToValueAtTime(pitch * 0.4, strikeTime + 0.08);

      strikeGain.gain.setValueAtTime(0.5, strikeTime);
      strikeGain.gain.exponentialRampToValueAtTime(0.001, strikeTime + 0.085);

      strikeOsc.connect(strikeGain);
      strikeGain.connect(masterGain);
      strikeOsc.start(strikeTime);
      strikeOsc.stop(strikeTime + 0.09);

      // Noise burst for the wooden hammer hit texture
      const bufferSize = ctx.sampleRate * 0.04;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(pitch * 1.5, strikeTime);
      noiseFilter.Q.setValueAtTime(3.0, strikeTime);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, strikeTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, strikeTime + 0.04);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);
      noise.start(strikeTime);
      noise.stop(strikeTime + 0.045);
    });

    // 3. Cheerful Renaissance/Colonial Construction Chord (Harp/Lute strum)
    const chordNotes = buildingType === 'barracks' ? [220, 277.18, 329.63] : [261.63, 329.63, 392.0]; // A major or C major
    chordNotes.forEach((freq, idx) => {
      const strumTime = now + 0.32 + idx * 0.035;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, strumTime);

      gain.gain.setValueAtTime(0.22, strumTime);
      gain.gain.exponentialRampToValueAtTime(0.001, strumTime + 0.4);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(strumTime);
      osc.stop(strumTime + 0.42);
    });
  }

  /**
   * Sound effect when a unit finishes training.
   * Plays a triumphant military trumpet / fanfare for soldiers, or a warm rustic village horn for villagers.
   */
  public playUnitTrainedSound(unitType: 'villager' | 'soldier' | string = 'villager') {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.masterVolume * 0.9, now);
    masterGain.connect(ctx.destination);

    if (unitType === 'soldier') {
      // MILITARY TRUMPET FANFARE (Notes: G3 -> C4 -> E4 -> G4 triumph)
      const notes = [
        { freq: 196.0, start: 0.0, dur: 0.12 },   // G3
        { freq: 261.63, start: 0.12, dur: 0.12 }, // C4
        { freq: 329.63, start: 0.24, dur: 0.14 }, // E4
        { freq: 392.0, start: 0.38, dur: 0.45 },  // G4 held with vibrato
      ];

      notes.forEach((note) => {
        const noteStart = now + note.start;
        const noteEnd = noteStart + note.dur;

        // Brass fundamental + harmonic overtone
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const noteGain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'triangle';

        osc1.frequency.setValueAtTime(note.freq, noteStart);
        osc2.frequency.setValueAtTime(note.freq * 2, noteStart);

        // Lowpass filter for warm brass timbre (Age of Empires style bugle)
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, noteStart);
        filter.frequency.exponentialRampToValueAtTime(850, noteEnd);

        // Amplitude envelope (brass attack & decay)
        noteGain.gain.setValueAtTime(0.001, noteStart);
        noteGain.gain.linearRampToValueAtTime(0.35, noteStart + 0.025);
        noteGain.gain.exponentialRampToValueAtTime(0.001, noteEnd);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(noteGain);
        noteGain.connect(masterGain);

        osc1.start(noteStart);
        osc2.start(noteStart);
        osc1.stop(noteEnd + 0.02);
        osc2.stop(noteEnd + 0.02);
      });

      // Snare drum roll accompaniment
      const drumTimes = [0.0, 0.08, 0.16, 0.24, 0.38];
      drumTimes.forEach((dTime, idx) => {
        const t = now + dTime;
        const drumOsc = ctx.createOscillator();
        const drumGain = ctx.createGain();
        drumOsc.type = 'triangle';
        drumOsc.frequency.setValueAtTime(idx === 4 ? 90 : 120, t);
        drumOsc.frequency.exponentialRampToValueAtTime(40, t + 0.08);

        drumGain.gain.setValueAtTime(idx === 4 ? 0.4 : 0.2, t);
        drumGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

        drumOsc.connect(drumGain);
        drumGain.connect(masterGain);
        drumOsc.start(t);
        drumOsc.stop(t + 0.1);
      });
    } else {
      // VILLAGER SPAWN SOUND: Warm Rustic Horn & Cheerful Town Bell (Chime)
      // Notes: C5 -> E5 -> G5 bell arpeggio
      const bellNotes = [
        { freq: 523.25, start: 0.0, dur: 0.35 },  // C5
        { freq: 659.25, start: 0.1, dur: 0.45 },  // E5
        { freq: 783.99, start: 0.22, dur: 0.65 }, // G5
      ];

      bellNotes.forEach((bell) => {
        const bStart = now + bell.start;
        const bEnd = bStart + bell.dur;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(bell.freq, bStart);

        // Bell overtone
        const overtone = ctx.createOscillator();
        const overtoneGain = ctx.createGain();
        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(bell.freq * 2.76, bStart);

        gain.gain.setValueAtTime(0.3, bStart);
        gain.gain.exponentialRampToValueAtTime(0.001, bEnd);

        overtoneGain.gain.setValueAtTime(0.12, bStart);
        overtoneGain.gain.exponentialRampToValueAtTime(0.001, bStart + bell.dur * 0.5);

        osc.connect(gain);
        overtone.connect(overtoneGain);
        gain.connect(masterGain);
        overtoneGain.connect(masterGain);

        osc.start(bStart);
        overtone.start(bStart);
        osc.stop(bEnd + 0.05);
        overtone.stop(bEnd + 0.05);
      });
    }
  }

  /**
   * Sound effect on UI button / order clicks.
   */
  public playClickSound() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Sound effect when a unit attacks / damage is dealt.
   */
  public playCombatHitSound(isMusket: boolean = false) {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.masterVolume * 0.45, now);
    masterGain.connect(ctx.destination);

    if (isMusket) {
      // Gunpowder musket bang + whiz
      const bufferSize = ctx.sampleRate * 0.08;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + 0.08);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.6, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(masterGain);
      noise.start(now);
      noise.stop(now + 0.09);
    } else {
      // Melee blade / club impact
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.07);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  }

  /**
   * Sound effect when a unit or group of units is selected (RTS unit response barks / acknowledgements).
   * Generates randomized, expressive vocal/instrumental acknowledgements tailored for soldiers, villagers, or squads.
   */
  public playUnitResponseSound(unitType: 'villager' | 'soldier' | 'group' | string = 'soldier', count: number = 1) {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Debounce to prevent audio stacking if clicking rapidly
    if (now - this.lastBarkTime < 0.12) return;
    this.lastBarkTime = now;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.masterVolume * 0.7, now);
    masterGain.connect(ctx.destination);

    const isGroup = unitType === 'group' || count > 1;

    // Pick random variation ensuring no immediate repetition
    let variation = Math.floor(Math.random() * (isGroup ? 3 : 4));
    if (variation === this.lastBarkVariation) {
      variation = (variation + 1) % (isGroup ? 3 : 4);
    }
    this.lastBarkVariation = variation;

    if (isGroup) {
      // SQUAD / GROUP SELECTION BARKS (Martial unison callouts, brass chords & drum rallies)
      if (variation === 0) {
        // "Squad Ready!": Clarion fifth chord with a crisp martial cadence
        const chord = [261.63, 392.0, 523.25]; // C4, G4, C5
        chord.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + i * 0.02);

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1800, now);
          filter.frequency.exponentialRampToValueAtTime(700, now + 0.22);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.25 / chord.length, now + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.26);
        });

        // Marching footstep / drum tap
        const drumOsc = ctx.createOscillator();
        const drumGain = ctx.createGain();
        drumOsc.type = 'triangle';
        drumOsc.frequency.setValueAtTime(110, now);
        drumOsc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
        drumGain.gain.setValueAtTime(0.35, now);
        drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        drumOsc.connect(drumGain);
        drumGain.connect(masterGain);
        drumOsc.start(now);
        drumOsc.stop(now + 0.14);
      } else if (variation === 1) {
        // "Platoon At Attention!": Quick double brass burst (E4 -> A4) with snare tap
        const notes = [
          { f: 329.63, t: 0.0, d: 0.07 },
          { f: 440.0, t: 0.08, d: 0.18 },
        ];
        notes.forEach(({ f, t, d }) => {
          const start = now + t;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, start);

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(2200, start);
          filter.frequency.exponentialRampToValueAtTime(800, start + d);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + d);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);
          osc.start(start);
          osc.stop(start + d + 0.01);
        });

        // Snare tap
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(2400, now + 0.08);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.25, now + 0.08);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noise.start(now + 0.08);
        noise.stop(now + 0.14);
      } else {
        // "Company Formed!": Resonant chorus horn fan (G3 -> D4 -> G4)
        const notes = [
          { f: 196.0, t: 0.0, d: 0.08 },
          { f: 293.66, t: 0.07, d: 0.08 },
          { f: 392.0, t: 0.14, d: 0.22 },
        ];
        notes.forEach(({ f, t, d }) => {
          const start = now + t;
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'triangle';
          osc2.type = 'sawtooth';
          osc1.frequency.setValueAtTime(f, start);
          osc2.frequency.setValueAtTime(f * 1.006, start); // subtle detune for squad chorus

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + d);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(masterGain);
          osc1.start(start);
          osc2.start(start);
          osc1.stop(start + d + 0.01);
          osc2.stop(start + d + 0.01);
        });
      }
    } else if (unitType === 'soldier') {
      // SOLDIER BARKS (Assertive, disciplined, martial response tones)
      if (variation === 0) {
        // "Yes Sir / Ready!" (Crisp ascending dual-tone brass bark: G4 -> C5)
        const notes = [
          { f: 392.0, t: 0.0, d: 0.07 },
          { f: 523.25, t: 0.07, d: 0.14 },
        ];
        notes.forEach(({ f, t, d }) => {
          const start = now + t;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, start);

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(2000, start);
          filter.frequency.exponentialRampToValueAtTime(750, start + d);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.28, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + d);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);
          osc.start(start);
          osc.stop(start + d + 0.01);
        });
      } else if (variation === 1) {
        // "En Garde!" (Sharp, snappy staccato bugle chirp: E5 -> D5 -> E5)
        const notes = [
          { f: 659.25, t: 0.0, d: 0.05 },
          { f: 587.33, t: 0.05, d: 0.05 },
          { f: 659.25, t: 0.1, d: 0.12 },
        ];
        notes.forEach(({ f, t, d }) => {
          const start = now + t;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, start);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.3, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.001, start + d);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(start);
          osc.stop(start + d + 0.01);
        });

        // Musket metal click
        const clickOsc = ctx.createOscillator();
        const clickGain = ctx.createGain();
        clickOsc.type = 'sine';
        clickOsc.frequency.setValueAtTime(1400, now + 0.02);
        clickOsc.frequency.exponentialRampToValueAtTime(400, now + 0.06);
        clickGain.gain.setValueAtTime(0.18, now + 0.02);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
        clickOsc.connect(clickGain);
        clickGain.connect(masterGain);
        clickOsc.start(now + 0.02);
        clickOsc.stop(now + 0.07);
      } else if (variation === 2) {
        // "Standing by!" (Assertive military horn inflection: A4 with positive upward lilt)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.16); // A4 -> C#5

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, now);
        filter.frequency.exponentialRampToValueAtTime(900, now + 0.16);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.19);
      } else {
        // "Orders, Captain!" (Two-step prompt cadence: F#4 -> B4)
        const notes = [
          { f: 369.99, t: 0.0, d: 0.06 },
          { f: 493.88, t: 0.06, d: 0.15 },
        ];
        notes.forEach(({ f, t, d }) => {
          const start = now + t;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, start);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.26, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + d);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(start);
          osc.stop(start + d + 0.01);
        });
      }
    } else {
      // VILLAGER BARKS (Friendly, rustic, cheerful wood/village acknowledgements)
      if (variation === 0) {
        // "Sim? / Yes?" (Warm vocalized upward humming lilt: G4 -> C5)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(392, now);
        osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.14);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.17);
      } else if (variation === 1) {
        // "Às ordens! / Right away!" (Bright melodic double-chirp with wooden tool clink: C5 -> E5 -> G5)
        const notes = [
          { f: 523.25, t: 0.0, d: 0.06 },
          { f: 659.25, t: 0.06, d: 0.06 },
          { f: 783.99, t: 0.12, d: 0.14 },
        ];
        notes.forEach(({ f, t, d }) => {
          const start = now + t;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, start);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.22, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + d);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(start);
          osc.stop(start + d + 0.01);
        });

        // Light wooden knock
        const woodOsc = ctx.createOscillator();
        const woodGain = ctx.createGain();
        woodOsc.type = 'triangle';
        woodOsc.frequency.setValueAtTime(320, now + 0.05);
        woodOsc.frequency.exponentialRampToValueAtTime(90, now + 0.09);
        woodGain.gain.setValueAtTime(0.2, now + 0.05);
        woodGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
        woodOsc.connect(woodGain);
        woodGain.connect(masterGain);
        woodOsc.start(now + 0.05);
        woodOsc.stop(now + 0.1);
      } else if (variation === 2) {
        // "Pronto para o trabalho! / Ready to work!" (Gentle rustic flute rise: D5 -> F#5)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(739.99, now + 0.15);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.22, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.18);
      } else {
        // "O que manda? / What needs doing?" (Cheerful village whistle: A4 -> C#5 -> B4)
        const notes = [
          { f: 440.0, t: 0.0, d: 0.06 },
          { f: 554.37, t: 0.06, d: 0.08 },
          { f: 493.88, t: 0.14, d: 0.13 },
        ];
        notes.forEach(({ f, t, d }) => {
          const start = now + t;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, start);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.22, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + d);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(start);
          osc.stop(start + d + 0.01);
        });
      }
    }
  }

  /**
   * Sound effect when villagers are actively hammering and constructing a building.
   * Plays a crisp wooden carpenter tap with randomized subtle pitch for realistic texture.
   */
  public playHammerSound() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.masterVolume * 0.4, now);
    masterGain.connect(ctx.destination);

    // Random pitch variance around 680Hz
    const pitch = 620 + Math.random() * 140;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.35, now + 0.06);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  /**
   * Triumphant sound effect when a building reaches 100% construction completion.
   * Plays a rich colonial brass chord, fanfare and bell flourish.
   */
  public playBuildingCompletedSound(buildingType: string = 'house') {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.masterVolume * 0.85, now);
    masterGain.connect(ctx.destination);

    // 1. Triumphant rising arpeggio chord (D4 -> F#4 -> A4 -> D5)
    const chord = [293.66, 369.99, 440.0, 587.33];
    chord.forEach((freq, idx) => {
      const start = now + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.28, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.65);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.7);
    });

    // 2. High church / village bell shimmer
    const bellOsc = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bellOsc.type = 'sine';
    bellOsc.frequency.setValueAtTime(1174.66, now + 0.28); // D6
    bellGain.gain.setValueAtTime(0.25, now + 0.28);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

    bellOsc.connect(bellGain);
    bellGain.connect(masterGain);
    bellOsc.start(now + 0.28);
    bellOsc.stop(now + 1.15);
  }
}

export const soundManager = new SoundManager();
