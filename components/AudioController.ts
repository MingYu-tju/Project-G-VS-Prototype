
import { 
    DASH_SFX_BASE64, 
    SHOOT_SFX_BASE64,
    SWITCH_SFX_BASE64,
    STEP_SFX_BASE64,
    HIT_SFX_BASE64,
    DROP_SFX_BASE64,
    FOOT_SFX_BASE64
} from '../assets';

let globalAudioCtx: AudioContext | null = null;
let boostAudioBuffer: AudioBuffer | null = null;
let shootAudioBuffer: AudioBuffer | null = null;
let switchAudioBuffer: AudioBuffer | null = null;
let stepAudioBuffer: AudioBuffer | null = null;
let hitAudioBuffer: AudioBuffer | null = null;
let dropAudioBuffer: AudioBuffer | null = null;
let footAudioBuffer: AudioBuffer | null = null;
let areSoundsLoading = false;

const getAudioContext = () => {
    if (!globalAudioCtx) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            globalAudioCtx = new AudioContext();
        }
    }
    return globalAudioCtx;
};

const loadSoundAsset = async (ctx: AudioContext, base64: string): Promise<AudioBuffer | null> => {
    if (!base64 || base64.length < 50) return null;
    try {
        const response = await fetch(base64);
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength === 0) return null;
        return await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
        return null;
    }
};

const generateProceduralDash = (ctx: AudioContext): AudioBuffer => {
    const duration = 0.6;
    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        const noise = Math.random() * 2 - 1;
        const t = i / frameCount;
        let envelope = 0;
        if (t < 0.1) envelope = t / 0.1;
        else envelope = 1 - ((t - 0.1) / 0.9);
        envelope = Math.pow(envelope, 2);
        data[i] = noise * envelope * 0.5;
    }
    return buffer;
};

const generateProceduralShoot = (ctx: AudioContext): AudioBuffer => {
    const duration = 0.3;
    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const progress = i / frameCount;
        const frequency = 1200 - (1000 * Math.pow(progress, 0.5));
        const val = Math.sign(Math.sin(2 * Math.PI * frequency * t));
        const envelope = 1 - progress;
        data[i] = val * envelope * 0.3;
    }
    return buffer;
};

export const resumeAudioContext = async () => {
    const ctx = getAudioContext();
    if (ctx) {
        try {
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
            if (!areSoundsLoading) loadAllSounds();
        } catch (e) {
            console.error("Failed to resume audio context:", e);
        }
    }
};

export const loadAllSounds = async () => {
    if (areSoundsLoading) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    areSoundsLoading = true;
    try {
        if (!boostAudioBuffer) {
            boostAudioBuffer = await loadSoundAsset(ctx, DASH_SFX_BASE64);
            if (!boostAudioBuffer) boostAudioBuffer = generateProceduralDash(ctx);
        }
        if (!shootAudioBuffer) {
            shootAudioBuffer = await loadSoundAsset(ctx, SHOOT_SFX_BASE64);
            if (!shootAudioBuffer) shootAudioBuffer = generateProceduralShoot(ctx);
        }
        if (!switchAudioBuffer) switchAudioBuffer = await loadSoundAsset(ctx, SWITCH_SFX_BASE64);
        if (!stepAudioBuffer) stepAudioBuffer = await loadSoundAsset(ctx, STEP_SFX_BASE64);
        if (!hitAudioBuffer) hitAudioBuffer = await loadSoundAsset(ctx, HIT_SFX_BASE64);
        if (!dropAudioBuffer) dropAudioBuffer = await loadSoundAsset(ctx, DROP_SFX_BASE64);
        if (!footAudioBuffer) footAudioBuffer = await loadSoundAsset(ctx, FOOT_SFX_BASE64);
    } catch (e) {
        console.warn("Error loading audio assets:", e);
    } finally {
        areSoundsLoading = false;
    }
};

const playSoundBuffer = (buffer: AudioBuffer | null, volume: number = 1.0, pitchVar: number = 0.0) => {
    const ctx = getAudioContext();
    if (!ctx || !buffer) return;
    if (ctx.state === 'suspended') ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    if (pitchVar > 0) {
        source.playbackRate.value = 1.0 + (Math.random() - 0.5) * pitchVar;
    }
    source.start(0);
};

export const playBeamRifleSynth = (ctx: AudioContext, volume: number = 0.1) => {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
};

// UPDATED: Functions now accept an optional volume override
export const playShootSound = (volume: number = 0.4) => {
    if (shootAudioBuffer) {
        playSoundBuffer(shootAudioBuffer, volume, 0.2);
    } else {
        const ctx = getAudioContext();
        if(ctx) playBeamRifleSynth(ctx, volume * 0.25);
    }
};

export const playBoostSound = (volume: number = 0.6) => playSoundBuffer(boostAudioBuffer, volume);
export const playSwitchSound = (volume: number = 0.6) => playSoundBuffer(switchAudioBuffer, volume, 0.1);
export const playStepSound = (volume: number = 0.8) => playSoundBuffer(stepAudioBuffer, volume, 0.1);
export const playDropSound = (volume: number = 0.8) => playSoundBuffer(dropAudioBuffer, volume, 0.2);
export const playFootSound = (volume: number = 0.55) => playSoundBuffer(footAudioBuffer, volume, 0.15);

// playHitSound takes distance as primary argument to auto-calc volume
export const playHitSound = (distance: number) => {
    const maxDist = 100;
    const vol = Math.max(0.05, 1 - (distance / maxDist));
    playSoundBuffer(hitAudioBuffer, vol * 0.4, 0.2);
};
