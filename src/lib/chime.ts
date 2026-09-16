let sharedAudioCtx: AudioContext | null = null;
let chimeUnlockInstalled = false;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
  return sharedAudioCtx;
}

// Browsers block audio until the user interacts with the page at least once.
// Call this once on mount to "unlock" audio playback for later chime calls.
export function installChimeUnlock() {
  if (chimeUnlockInstalled || typeof window === "undefined") return;
  chimeUnlockInstalled = true;
  const unlock = () => {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  ["pointerdown", "touchstart", "keydown", "click"].forEach((evt) =>
    window.addEventListener(evt, unlock, { once: false, passive: true }),
  );
}

export function playChime() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    playTone(880, 0, 0.18);
    playTone(1320, 0.18, 0.22);
  } catch (e) {
    console.warn("Ping sound failed:", e);
  }
}
