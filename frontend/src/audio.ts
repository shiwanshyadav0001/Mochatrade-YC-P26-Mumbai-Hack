// Synthesized Web Audio Telemetry (zero asset dependencies)

let audioCtx: AudioContext | null = null
let isMuted = false

try {
  isMuted = localStorage.getItem('netra_sound_muted') === 'true'
} catch {
  // Ignore localStorage restrictions
}

function getAudioContext(): AudioContext | null {
  if (isMuted) return null
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (AudioCtx) {
      audioCtx = new AudioCtx()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

export const soundManager = {
  isMuted: () => isMuted,
  setMuted: (muted: boolean) => {
    isMuted = muted
    try {
      localStorage.setItem('netra_sound_muted', String(muted))
    } catch {
      // Ignore
    }
  },
  toggleMute: () => {
    soundManager.setMuted(!isMuted)
    return isMuted
  },
  playEventTick: () => {
    const ctx = getAudioContext()
    if (!ctx) return
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.04)
      gain.gain.setValueAtTime(0.015, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.04)
    } catch {
      // Ignore audio failure
    }
  },
  playThreatAlert: () => {
    const ctx = getAudioContext()
    if (!ctx) return
    try {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(320, now)
      osc.frequency.setValueAtTime(440, now + 0.08)
      gain.gain.setValueAtTime(0.04, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(now + 0.25)
    } catch {
      // Ignore
    }
  },
  playSuccess: () => {
    const ctx = getAudioContext()
    if (!ctx) return
    try {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, now) // D5
      osc.frequency.setValueAtTime(880, now + 0.06) // A5
      gain.gain.setValueAtTime(0.03, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(now + 0.2)
    } catch {
      // Ignore
    }
  },
}
