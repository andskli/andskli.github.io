import { useCallback, useEffect, useReducer } from 'react';
import { initialPlayback, playbackReducer, stepIndex } from './playback.ts';
interface Options {
  steps: readonly { id: string }[];
  durationMs: number;
  /** Change this to restart a lesson without remounting its React view. */
  lessonKey?: string;
  /** Pause the clock without clearing the intent to play, e.g. while a modal is open. */
  suspended?: boolean;
}
export function usePlayback({
  steps,
  durationMs,
  lessonKey,
  suspended = false,
}: Options) {
  const [state, dispatch] = useReducer(playbackReducer, undefined, initialPlayback);
  const count = steps.length;
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  useEffect(reset, [lessonKey, reset]);
  useEffect(() => {
    if (!state.playing || suspended) return;
    // The interval requests updates; measured elapsed time drives playback.
    // Three.js has its own animation loop so camera controls also work while paused.
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'tick', elapsedMs: now - previous, durationMs, stepCount: count });
      previous = now;
    }, 33);
    return () => window.clearInterval(timer);
  }, [state.playing, state.index, state.speed, suspended, durationMs, count]);
  const seek = useCallback(
    (index: number) => dispatch({ type: 'seek', index, stepCount: count }),
    [count],
  );
  return {
    ...state,
    complete: state.index === count - 1 && state.progress >= 1,
    reset,
    play: () => dispatch({ type: 'toggle', stepCount: count }),
    seek,
    seekStep: (id: string) => seek(stepIndex(steps, id)),
    setSpeed: (speed: number) => dispatch({ type: 'speed', speed }),
  };
}
export type Playback = ReturnType<typeof usePlayback>;
