// audio.js
// Procedural Web Audio API sound synthesizer for Artemis Trajectory Lab.
// Generates high-tech UI feedback, rocket engine rumbles, and emergency sirens without audio files.

export class TelemetrySynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.muted = true; // Start muted to satisfy browser autoplay policies

    // Noise buffer for thruster rumble
    this.noiseBuffer = null;

    // Running sound node references
    this.rumbleSource = null;
    this.rumbleOsc = null;
    this.rumbleGain = null;

    this.blackoutGain = null;
    this.blackoutOsc1 = null;
    this.blackoutOsc2 = null;
  }

  // Safe initialization on first user gesture
  init() {
    if (this.ctx) return;
    
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Pre-generate 2 seconds of white noise buffer
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } catch (e) {
      console.warn("Web Audio API not supported or failed to initialize:", e);
    }
  }

  setMute(state) {
    this.muted = state;
    if (!this.ctx) this.init();
    if (this.masterGain && this.ctx) {
      // Resume context if suspended
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.setMute(!this.muted);
    return this.muted;
  }

  // UI Telemetry click: Short pitch-sweeping sine wave chime
  playClick(volume = 0.08) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(this.masterGain);

    const now = this.ctx.currentTime;
    
    // High-tech sweeping frequency (sine)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(2400, now + 0.04);

    // Fast envelope fade
    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Play a soft telemetry hum chime during step changes
  playDataStep() {
    this.playClick(0.03);
  }

  // Emergency Siren: Alternating dual-tone alarm when communications drop
  startBlackoutAlarm() {
    if (this.muted || !this.ctx || this.blackoutGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    this.blackoutGain = this.ctx.createGain();
    this.blackoutGain.gain.setValueAtTime(0, now);
    
    // Slow warning pulse
    this.blackoutGain.gain.linearRampToValueAtTime(0.06, now + 0.2);
    this.blackoutGain.connect(this.masterGain);

    // Detuned oscillators to create a glowing warning "beat"
    this.blackoutOsc1 = this.ctx.createOscillator();
    this.blackoutOsc1.type = 'sawtooth';
    this.blackoutOsc1.frequency.setValueAtTime(320, now);

    this.blackoutOsc2 = this.ctx.createOscillator();
    this.blackoutOsc2.type = 'triangle';
    this.blackoutOsc2.frequency.setValueAtTime(323, now); // slightly detuned

    // Add lowpass filter to make it sound like a tactical alarm under a panel
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, now);

    // Dynamic siren pitch modulation (LFO)
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 1.8; // 1.8Hz alarm frequency
    lfoGain.gain.value = 35; // sweep depth in Hz

    lfo.connect(lfoGain);
    lfoGain.connect(this.blackoutOsc1.frequency);
    lfoGain.connect(this.blackoutOsc2.frequency);

    this.blackoutOsc1.connect(filter);
    this.blackoutOsc2.connect(filter);
    filter.connect(this.blackoutGain);

    lfo.start(now);
    this.blackoutOsc1.start(now);
    this.blackoutOsc2.start(now);

    // Keep reference to stop later
    this.blackoutLfo = lfo;
  }

  stopBlackoutAlarm() {
    if (!this.blackoutGain) return;
    
    const now = this.ctx.currentTime;
    this.blackoutGain.gain.cancelScheduledValues(now);
    this.blackoutGain.gain.linearRampToValueAtTime(0, now + 0.15);

    setTimeout(() => {
      if (this.blackoutOsc1) {
        try {
          this.blackoutOsc1.stop();
          this.blackoutOsc2.stop();
          this.blackoutLfo.stop();
        } catch(e) {}
        this.blackoutOsc1 = null;
        this.blackoutOsc2 = null;
        this.blackoutLfo = null;
      }
      if (this.blackoutGain) {
        this.blackoutGain.disconnect();
        this.blackoutGain = null;
      }
    }, 200);
  }

  // Rocket Engine Combustion Rumble: Brownian lowpass-noise + Triangle LFO rumble
  startEngineRumble() {
    if (this.muted || !this.ctx || this.rumbleGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    
    // Gain Node with smooth fade-in
    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.setValueAtTime(0, now);
    this.rumbleGain.gain.linearRampToValueAtTime(0.35, now + 0.5); // Fades in smoothly
    this.rumbleGain.connect(this.masterGain);

    // 1. Noise channel (Combustion hiss & roar)
    this.rumbleSource = this.ctx.createBufferSource();
    this.rumbleSource.buffer = this.noiseBuffer;
    this.rumbleSource.loop = true;

    // Filter to keep only deep subsonic roar
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(75, now); // Super deep lowpass

    this.rumbleSource.connect(noiseFilter);
    noiseFilter.connect(this.rumbleGain);

    // 2. Sub-bass tone (Thruster hum)
    this.rumbleOsc = this.ctx.createOscillator();
    this.rumbleOsc.type = 'triangle';
    this.rumbleOsc.frequency.setValueAtTime(52, now); // 52Hz low G hum

    // LFO to create structural vibration/tremolo
    const rumbleLfo = this.ctx.createOscillator();
    const rumbleLfoGain = this.ctx.createGain();
    rumbleLfo.frequency.setValueAtTime(9.5, now); // 9.5Hz structural vibrations
    rumbleLfoGain.gain.setValueAtTime(0.12, now);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.22, now);

    rumbleLfo.connect(rumbleLfoGain);
    rumbleLfoGain.connect(oscGain.gain);

    const oscFilter = this.ctx.createBiquadFilter();
    oscFilter.type = 'lowpass';
    oscFilter.frequency.setValueAtTime(90, now);

    this.rumbleOsc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(this.rumbleGain);

    // Start nodes
    this.rumbleSource.start(now);
    this.rumbleOsc.start(now);
    rumbleLfo.start(now);

    // Retain LFO and gain nodes to terminate
    this.rumbleOscGain = oscGain;
    this.rumbleLfoNode = rumbleLfo;
  }

  stopEngineRumble() {
    if (!this.rumbleGain) return;

    const now = this.ctx.currentTime;
    this.rumbleGain.gain.cancelScheduledValues(now);
    this.rumbleGain.gain.linearRampToValueAtTime(0, now + 0.4); // Smooth deceleration fade

    setTimeout(() => {
      if (this.rumbleSource) {
        try {
          this.rumbleSource.stop();
          this.rumbleOsc.stop();
          this.rumbleLfoNode.stop();
        } catch(e) {}
        this.rumbleSource = null;
        this.rumbleOsc = null;
        this.rumbleLfoNode = null;
        this.rumbleOscGain = null;
      }
      if (this.rumbleGain) {
        this.rumbleGain.disconnect();
        this.rumbleGain = null;
      }
    }, 450);
  }
}
