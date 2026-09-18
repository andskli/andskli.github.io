import assert from 'node:assert/strict';
import { test } from 'node:test';
import { architectureLessons, modelingLessons } from './lesson-registry.ts';

test('registered lessons have unique stable steps and every shortcut resolves for every option', () => {
  for (const [id, definition] of Object.entries(architectureLessons)) {
    assert.equal(definition.id, id);
    for (const topology of definition.topologies)
      for (const concern of ['local', 'majority'] as const) {
        const lesson = definition.build(topology, concern);
        assert.ok(lesson.steps.length > 0);
        assert.equal(
          new Set(lesson.steps.map((step) => step.id)).size,
          lesson.steps.length,
          id,
        );
        assert.ok(lesson.steps.every((step) => step.id.length > 0));
      }
  }
  for (const [id, definition] of Object.entries(modelingLessons)) {
    assert.equal(definition.id, id);
    for (const mode of ['application', 'lookup'] as const) {
      const lesson = definition.build(mode);
      const stepIds = new Set(lesson.steps.map((step) => step.id));
      assert.ok(lesson.steps.length > 0);
      assert.equal(stepIds.size, lesson.steps.length, id);
      for (const shortcut of definition.shortcuts ?? [])
        assert.ok(stepIds.has(shortcut.stepId), `${id}: ${shortcut.stepId}`);
      assert.ok(lesson.presentation.worldWidth > 0);
      assert.ok(lesson.presentation.minHeight > 0);
    }
  }
});

test('lesson annotations describe current simulated state instead of hardcoded renderer labels', () => {
  const definition = architectureLessons.secondary;
  const state = definition.build('replica').steps[0].before;
  assert.equal(definition.annotations!(state).a2, 'local v2 · committed v1');
  state.members.a2.applied = 3;
  state.members.a2.committed = 2;
  assert.equal(definition.annotations!(state).a2, 'local v3 · committed v2');
  const config = architectureLessons.config;
  const metadata = config.build('sharded').steps[0].before;
  assert.equal(config.annotations!(metadata).r1, 'cache empty');
});
