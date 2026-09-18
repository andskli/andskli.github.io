/** Playback is independent of MongoDB state and Three.js. */
export interface PlaybackState {
  /** -1 is the introduction, before any step has started. */
  index: number;
  /** Fraction of the current step, from 0 (before) to 1 (finished). */
  progress: number;
  playing: boolean;
  speed: number;
}
export const initialPlayback = (): PlaybackState => ({
  index: -1,
  progress: 0,
  playing: false,
  speed: 1,
});
export type PlaybackAction =
  | { type: 'reset' }
  | { type: 'seek'; index: number; stepCount: number }
  | { type: 'toggle'; stepCount: number }
  | { type: 'speed'; speed: number }
  | { type: 'tick'; elapsedMs: number; durationMs: number; stepCount: number };
export function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction,
): PlaybackState {
  switch (action.type) {
    case 'reset':
      return { ...initialPlayback(), speed: state.speed };
    case 'speed':
      return { ...state, speed: action.speed };
    case 'seek': {
      // Timeline clicks and keyboard shortcuts land on a step's completed snapshot.
      // Playing from there advances to the next step; seeking -1 returns to the intro.
      const index = Math.max(-1, Math.min(action.index, action.stepCount - 1));
      return { ...state, index, progress: index < 0 ? 0 : 1, playing: false };
    }
    case 'toggle': {
      if (!action.stepCount) return state;
      if (state.playing) return { ...state, playing: false };
      const complete = state.index === action.stepCount - 1 && state.progress >= 1;
      if (state.index < 0 || complete)
        return { ...state, index: 0, progress: 0, playing: true };
      if (state.progress >= 1)
        return { ...state, index: state.index + 1, progress: 0, playing: true };
      return { ...state, playing: true };
    }
    case 'tick': {
      if (!state.playing || state.index < 0) return state;
      // Cap elapsed time so returning to a backgrounded tab does not skip a lesson.
      const progress = Math.min(
        1,
        state.progress +
          (Math.min(action.elapsedMs, 150) * state.speed) / action.durationMs,
      );
      if (progress < 1) return { ...state, progress };
      if (state.index >= action.stepCount - 1)
        return { ...state, progress: 1, playing: false };
      return { ...state, index: state.index + 1, progress: 0 };
    }
  }
}
/**
 * Switch inspectors to the after snapshot when the visual operation arrives.
 * The remaining time lets readers see the result before the next step starts.
 * Keep the renderers' 0.76 arrival/interpolation thresholds in sync with this value.
 */
export const SNAPSHOT_CHANGE_PROGRESS = 0.76;
export function stepIndex(steps: readonly { id: string }[], id: string): number {
  const index = steps.findIndex((step) => step.id === id);
  if (index < 0) throw new Error(`Unknown lesson step: ${id}`);
  return index;
}
