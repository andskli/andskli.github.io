import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeatureStep, FilterMode, FullDocumentMode } from '../types.ts';
import { build } from './lesson.ts';
import {
  HISTORY_LOST,
  applyWrite,
  canResume,
  createInitialModel,
  defaultOptions,
  eventDocument,
  matchesFilter,
  openStream,
  tokenFor,
  watchCall,
} from './operations.ts';

const modes: { fullDocument: FullDocumentMode; filter: FilterMode }[] = [];
for (const fullDocument of ['default', 'updateLookup'] as const)
  for (const filter of ['none', 'inserts', 'open'] as const)
    modes.push({ fullDocument, filter });

const step = (steps: FeatureStep[], id: string) => {
  const found = steps.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
};

test('every option combination builds a lesson with stable, unique steps', () => {
  for (const options of modes) {
    const lesson = build(options);
    assert.equal(new Set(lesson.steps.map((s) => s.id)).size, lesson.steps.length);
    for (const s of lesson.steps) {
      assert.ok(s.title && s.description && s.code, s.id);
      assert.ok(s.focus.length > 0, s.id);
    }
  }
});

test('insert, update and delete events have the documented shapes', () => {
  const { steps } = build(defaultOptions);
  const insert = step(steps, 'an-insert-becomes-an-event').after.lastEvent!;
  assert.equal(insert.operationType, 'insert');
  assert.equal(insert.fullDocument?.item, 'Notebook');
  assert.equal(insert.documentKey._id, 3);
  const update = step(steps, 'an-update-reports-a-delta').after.lastEvent!;
  assert.deepEqual(update.updateDescription?.updatedFields, { amount: 24 });
  assert.equal(update.fullDocument, undefined);
  const remove = step(steps, 'a-delete-carries-only-a-key').after.lastEvent!;
  assert.equal(remove.operationType, 'delete');
  assert.deepEqual(remove.documentKey, { _id: 2 });
  assert.equal(remove.fullDocument, undefined);
  assert.equal(remove.updateDescription, undefined);
});

test('updateLookup adds the current document to update events only', () => {
  const { steps } = build({ fullDocument: 'updateLookup', filter: 'none' });
  const update = step(steps, 'an-update-reports-a-delta').after.lastEvent!;
  assert.equal(update.fullDocument?.amount, 24);
  assert.deepEqual(update.updateDescription?.updatedFields, { amount: 24 });
  assert.equal(
    step(steps, 'a-delete-carries-only-a-key').after.lastEvent!.fullDocument,
    undefined,
  );
});

test('updateLookup returns null when the document is gone by the time it is read', () => {
  const state = createInitialModel({ fullDocument: 'updateLookup', filter: 'none' });
  applyWrite(state, { op: 'update', id: 1, set: { amount: 1 } });
  applyWrite(state, { op: 'delete', id: 1 });
  openStream(state, 100);
  const update = state.inbox.find((e) => e.operationType === 'update')!;
  assert.equal(update.fullDocument, null);
  assert.deepEqual(update.updateDescription?.updatedFields, { amount: 1 });
});

test('a pipeline drops events on the server but the stream still advances', () => {
  const inserts = build({ fullDocument: 'default', filter: 'inserts' }).steps;
  assert.equal(step(inserts, 'an-insert-becomes-an-event').after.fresh.length, 1);
  for (const id of [
    'an-update-reports-a-delta',
    'a-delete-carries-only-a-key',
    'a-pipeline-filters-events',
  ]) {
    const after = step(inserts, id).after;
    assert.equal(after.fresh.length, 0, id);
    assert.equal(after.cursorTs, after.headTs, id);
  }
  assert.equal(step(inserts, 'a-pipeline-filters-events').after.inbox.length, 1);
});

test('a $match on fullDocument cannot match updates unless updateLookup is on', () => {
  const plain = build({ fullDocument: 'default', filter: 'open' }).steps;
  assert.equal(step(plain, 'an-update-reports-a-delta').after.fresh.length, 0);
  const lookup = build({ fullDocument: 'updateLookup', filter: 'open' }).steps;
  assert.equal(step(lookup, 'an-update-reports-a-delta').after.fresh.length, 1);
  // The order was closed by this update, so even with lookup it is filtered out.
  assert.equal(step(lookup, 'a-pipeline-filters-events').after.fresh.length, 0);
  assert.equal(step(lookup, 'a-delete-carries-only-a-key').after.fresh.length, 0);
});

test('the consumer persists its token only after processing', () => {
  const { steps } = build(defaultOptions);
  const before = step(steps, 'process-then-save-the-token').before;
  const after = step(steps, 'process-then-save-the-token').after;
  assert.equal(before.savedTs, null);
  assert.ok(before.inbox.length > 0);
  assert.equal(after.inbox.length, 0);
  assert.equal(after.savedTs, after.cursorTs);
  assert.equal(after.processedCount, before.inbox.length);
});

test('a slow consumer queues events while its saved token stays put', () => {
  for (const options of modes) {
    const { steps } = build(options);
    const saved = step(steps, 'process-then-save-the-token').after.savedTs;
    const behind = step(steps, 'the-consumer-falls-behind').after;
    assert.equal(behind.inbox.length, 3, JSON.stringify(options));
    assert.equal(behind.savedTs, saved);
    assert.equal(behind.consumer, 'slow');
    assert.ok(behind.headTs > behind.savedTs!);
  }
});

test('a crash loses queued events but resuming replays them in oplog order', () => {
  const { steps } = build(defaultOptions);
  const crash = step(steps, 'the-consumer-crashes').after;
  assert.equal(crash.inbox.length, 0);
  assert.equal(crash.streamOpen, false);
  assert.equal(crash.savedTs, step(steps, 'the-consumer-falls-behind').after.savedTs);
  const resumed = step(steps, 'resume-after-the-saved-token').after;
  assert.equal(resumed.error, null);
  assert.deepEqual(
    resumed.inbox.map((e) => e.ts),
    [105, 106, 107, 108, 109],
  );
  const caughtUp = step(steps, 'the-consumer-catches-up').after;
  assert.equal(caughtUp.savedTs, caughtUp.headTs);
  assert.equal(caughtUp.inbox.length, 0);
});

test('resuming works for every pipeline because the token covers filtered entries', () => {
  for (const options of modes) {
    const { steps } = build(options);
    assert.equal(step(steps, 'resume-after-the-saved-token').after.error, null);
    assert.equal(step(steps, 'resume-after-the-saved-token').after.streamOpen, true);
  }
});

test('an outage longer than the oplog window loses the resume point', () => {
  for (const options of modes) {
    const { steps } = build(options);
    const outage = step(steps, 'an-outage-outlasts-the-oplog').after;
    assert.equal(outage.oplog.length, outage.oplogCapacity);
    assert.ok(outage.savedTs! < outage.oplog[0].ts);
    const lost = step(steps, 'history-is-lost').after;
    assert.equal(lost.error, HISTORY_LOST);
    assert.equal(lost.streamOpen, false);
    assert.equal(lost.missed, 8);
    assert.equal(lost.inbox.length, 0);
    const fresh = step(steps, 'start-fresh-and-resync').after;
    assert.equal(fresh.error, null);
    assert.equal(fresh.streamOpen, true);
    assert.equal(fresh.missed, 0);
    assert.equal(fresh.savedTs, fresh.headTs);
  }
});

test('the oplog is capped and a token must still be inside the window', () => {
  const state = createInitialModel(defaultOptions);
  assert.equal(canResume(state, 100), true);
  assert.equal(canResume(state, 97), false);
  for (let i = 0; i < 10; i++) applyWrite(state, { op: 'delete', id: 1000 + i });
  assert.equal(state.oplog.length, state.oplogCapacity);
  assert.equal(state.oplog[0].ts, state.headTs - state.oplogCapacity + 1);
  assert.equal(canResume(state, state.oplog[0].ts), true);
  assert.equal(canResume(state, state.oplog[0].ts - 1), false);
});

test('events render in server field order and tokens are unique per position', () => {
  const state = createInitialModel(defaultOptions);
  openStream(state);
  applyWrite(state, {
    op: 'insert',
    order: { _id: 9, item: 'Cup', amount: 5, status: 'open' },
  });
  const document = eventDocument(state.inbox[0]);
  assert.deepEqual(Object.keys(document), [
    '_id',
    'operationType',
    'clusterTime',
    'fullDocument',
    'ns',
    'documentKey',
  ]);
  assert.equal(document._id._data, tokenFor(101));
  assert.notEqual(tokenFor(101), tokenFor(102));
  assert.equal(matchesFilter(state.inbox[0], 'open'), true);
  assert.equal(
    watchCall({ fullDocument: 'updateLookup', filter: 'inserts' }, 104),
    `db.orders.watch([ { $match: { operationType: "insert" } } ], { fullDocument: "updateLookup", resumeAfter: { _data: "${tokenFor(104)}" } })`,
  );
});

test('rewinding is safe: snapshots are independent and consecutive steps connect', () => {
  const { steps } = build({ fullDocument: 'updateLookup', filter: 'open' });
  const strip = (model: FeatureStep['before']) => ({ ...model, fresh: [] });
  for (let i = 1; i < steps.length; i++)
    assert.deepEqual(strip(steps[i].before), strip(steps[i - 1].after), steps[i].id);
  const first = steps[1];
  first.after.orders.push({ _id: 99, item: 'x', amount: 0, status: 'open' });
  first.after.oplog.length = 0;
  assert.equal(steps[2].before.oplog.length > 0, true);
  assert.equal(
    steps[2].before.orders.some((o) => o._id === 99),
    false,
  );
  assert.notEqual(steps[1].before, steps[1].after);
});
