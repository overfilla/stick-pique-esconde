// Procedural Web Audio Synthesizer for Stick Pique-Esconde 3D
class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  tone(freq, type = 'sine', duration = 0.15, vol = 0.15, slideFreq = null) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideFreq), now + duration);
    }

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  playCountdownTick(isFinal = false) {
    if (isFinal) {
      this.tone(880, 'triangle', 0.35, 0.22, 1174);
    } else {
      this.tone(440, 'sine', 0.12, 0.14);
    }
  }

  playWallHug() {
    this.tone(240, 'triangle', 0.09, 0.08, 180);
  }

  playSkillActivate(skillType = 'acrobat') {
    if (skillType === 'dragon_flag') {
      this.tone(320, 'sine', 0.25, 0.18, 640);
    } else if (skillType === 'flat_paint') {
      this.tone(520, 'triangle', 0.2, 0.15, 260);
    } else if (skillType === 'corridor_split') {
      this.tone(380, 'sine', 0.28, 0.18, 760);
    } else if (skillType === 'distract_snap') {
      this.tone(1100, 'square', 0.08, 0.16, 420);
    } else if (skillType === 'flashlight_360') {
      this.tone(600, 'sawtooth', 0.3, 0.15, 920);
    } else if (skillType === 'look_up') {
      this.tone(400, 'triangle', 0.22, 0.15, 700);
    } else if (skillType === 'heartbeat_radar') {
      this.tone(120, 'sine', 0.35, 0.25, 75);
      setTimeout(() => this.tone(110, 'sine', 0.35, 0.22, 65), 220);
    } else if (skillType === 'lunge_dash') {
      this.tone(280, 'sawtooth', 0.18, 0.18, 120);
    } else if (skillType === 'short_circuit') {
      this.tone(740, 'sawtooth', 0.14, 0.22, 160);
      setTimeout(() => this.tone(520, 'square', 0.18, 0.22, 95), 110);
      setTimeout(() => this.tone(880, 'sawtooth', 0.24, 0.2, 110), 230);
    }
  }

  playTremorPulse() {
    this.tone(95, 'sawtooth', 0.12, 0.1, 70);
  }

  playCapture() {
    this.tone(300, 'sawtooth', 0.18, 0.22, 130);
    setTimeout(() => this.tone(180, 'square', 0.28, 0.2, 90), 120);
  }

  playSalvaTodos() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      setTimeout(() => this.tone(n, 'triangle', 0.26, 0.22), idx * 90);
    });
  }

  playSingleSave() {
    this.tone(587.33, 'triangle', 0.16, 0.18);
    setTimeout(() => this.tone(880, 'triangle', 0.25, 0.2), 110);
  }

  playMatchEnd(victory = true) {
    if (victory) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        setTimeout(() => this.tone(f, 'triangle', 0.32, 0.2), i * 120);
      });
    } else {
      [392, 349.23, 311.13, 261.63].forEach((f, i) => {
        setTimeout(() => this.tone(f, 'sawtooth', 0.32, 0.18), i * 140);
      });
    }
  }
}

window.soundFX = new SoundFX();

