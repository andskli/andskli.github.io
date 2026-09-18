import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialPlayback, playbackReducer, stepIndex } from './playback.ts';

test('pause/resume keeps progress, completion stops, and replay begins at the first step', () => {
  let state = playbackReducer(initialPlayback(), { type: 'toggle', stepCount: 2 });
  state = playbackReducer(state, {
    type: 'tick',
    elapsedMs: 50,
    durationMs: 100,
    stepCount: 2,
  });
  assert.equal(state.progress, 0.5);
  state = playbackReducer(state, { type: 'toggle', stepCount: 2 });
  assert.equal(state.playing, false);
  assert.deepEqual(
    playbackReducer(state, {
      type: 'tick',
      elapsedMs: 100,
      durationMs: 100,
      stepCount: 2,
    }),
    state,
  );
  state = playbackReducer(state, { type: 'toggle', stepCount: 2 });
  state = playbackReducer(state, {
    type: 'tick',
    elapsedMs: 50,
    durationMs: 100,
    stepCount: 2,
  });
  assert.equal(state.index, 1);
  assert.equal(state.progress, 0);
  state = playbackReducer(state, {
    type: 'tick',
    elapsedMs: 100,
    durationMs: 100,
    stepCount: 2,
  });
  assert.equal(state.progress, 1);
  assert.equal(state.playing, false);
  state = playbackReducer(state, { type: 'toggle', stepCount: 2 });
  assert.equal(state.index, 0);
  assert.equal(state.progress, 0);
  assert.equal(state.playing, true);
});

test('seeking pauses on an end snapshot and reset preserves speed without skipping after tab suspension', () => {
  let state = playbackReducer(initialPlayback(), { type: 'speed', speed: 2 });
  state = playbackReducer(state, { type: 'seek', index: 2, stepCount: 4 });
  assert.equal(state.progress, 1);
  assert.equal(state.playing, false);
  state = playbackReducer(state, { type: 'toggle', stepCount: 4 });
  assert.equal(state.index, 3);
  state = playbackReducer(state, { type: 'reset' });
  assert.equal(state.index, -1);
  assert.equal(state.speed, 2);
  state = playbackReducer(state, { type: 'toggle', stepCount: 4 });
  state = playbackReducer(state, {
    type: 'tick',
    elapsedMs: 60_000,
    durationMs: 1000,
    stepCount: 4,
  });
  assert.equal(state.index, 0);
  assert.equal(state.progress, 0.3);
});

test('named shortcuts survive reordering and reject missing destinations', () => {
  const steps = [{ id: 'scan' }, { id: 'indexed-read' }];
  assert.equal(stepIndex(steps, 'indexed-read'), 1);
  assert.equal(stepIndex([...steps].reverse(), 'indexed-read'), 0);
  assert.throws(() => stepIndex(steps, 'missing'), /Unknown lesson step/);
});
