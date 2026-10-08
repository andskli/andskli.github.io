import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OdlLevel, OdlStep } from '../types.ts';
import { build } from './lesson.ts';
import {
  connectCdc,
  createInitialModel,
  customerDocument,
  enrich,
  enableWrites,
  landChanges,
  loadLevel,
  runMicroBatch,
  unify,
  unlock,
  writePreference,
} from './operations.ts';

const levels: OdlLevel[] = ['read-only', 'enriched', 'read-write'];
const step = (steps: OdlStep[], id: string) => {
  const found = steps.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
};

test('every level builds a lesson with stable unique steps and connected snapshots', () => {
  for (const level of levels) {
    const { steps } = build(level);
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, level);
    for (const s of steps) {
      assert.ok(s.title && s.description && s.code, s.id);
      assert.ok(s.focus.length > 0, s.id);
    }
    for (let i = 1; i < steps.length; i++)
      assert.deepEqual(steps[i].before, steps[i - 1].after, steps[i].id);
  }
});

test('point-to-point is a full mesh of sources and consumers before any ODL exists', () => {
  const { steps } = build();
  const mesh = step(steps, 'point-to-point-does-not-scale');
  assert.equal(mesh.flows.length, 9);
  assert.ok(mesh.flows.every((f) => f.kind === 'direct'));
  assert.equal(mesh.after.integrations, 9);
  assert.deepEqual(mesh.after.layers, { cdc: false, batch: false, odl: false });
  assert.deepEqual(
    mesh.after.sources.map((s) => s.load),
    [40, 85, 45],
  );
});

test('CDC captures the CRM and database changes; the API waits for its poll', () => {
  const { steps } = build();
  const cdc = step(steps, 'cdc-captures-changes').after;
  assert.deepEqual(
    cdc.cdc.map((c) => c.source),
    ['crm', 'rdbms'],
  );
  assert.equal(cdc.batch.length, 0);
  assert.equal(cdc.batchRuns, 0);
  assert.equal(cdc.sources[2].captured, 0);
  assert.equal(cdc.layers.batch, false);
  const batch = step(steps, 'micro-batch-polls-the-api').after;
  assert.deepEqual(
    batch.batch.map((c) => c.source),
    ['api'],
  );
  assert.equal(batch.batchRuns, 1);
  assert.equal(batch.lastChange?.format, 'XML');
  assert.equal(batch.sources[2].latency, 'up to 5 min');
  assert.equal(batch.sources[0].latency, 'seconds');
});

test('changes keep their native format until they land as documents', () => {
  const { steps } = build();
  const formats = [
    step(steps, 'cdc-captures-changes').after.lastChange!.format,
    step(steps, 'micro-batch-polls-the-api').after.lastChange!.format,
  ];
  assert.deepEqual(formats, ['Change record', 'XML']);
  const landed = step(steps, 'changes-land-in-the-odl').after;
  assert.equal(landed.cdc.length + landed.batch.length, 0);
  assert.deepEqual(landed.collections, {
    crm_customers: 1,
    rdbms_accounts: 1,
    partner_shipments: 1,
  });
  assert.equal(landed.customer, null);
  assert.equal(landed.integrations, 6);
});

test('merging builds one customer from all three sources', () => {
  const merged = step(build().steps, 'one-customer-document').after;
  assert.deepEqual(customerDocument(merged.customer!), {
    _id: 1001,
    name: 'Ada Lindqvist',
    email: 'ada@example.com',
    segment: 'Gold',
    plan: 'Premium',
    balance: 1240.5,
    shipment: { status: 'In transit', eta: '2026-10-12' },
  });
  assert.equal(merged.collections.customers, 1);
});

test('the ODL level decides what the layer can do', () => {
  const only = build('read-only').steps;
  const enriched = build('enriched').steps;
  const rw = build('read-write').steps;
  const last = (steps: OdlStep[]) => steps[steps.length - 1].after;
  assert.equal(last(only).enriched, false);
  assert.equal(last(only).acceptsWrites, false);
  assert.equal(last(only).customer?.region, undefined);
  assert.equal(last(enriched).enriched, true);
  assert.equal(last(enriched).customer?.region, 'Nordics');
  assert.deepEqual(Object.keys(last(enriched).customer!.sources!), [
    'crm',
    'rdbms',
    'api',
  ]);
  assert.equal(last(enriched).acceptsWrites, false);
  assert.equal(last(rw).acceptsWrites, true);
  assert.deepEqual(last(rw).customer?.preferences, { marketingOptIn: false });
  assert.equal(last(only).customer?.preferences, undefined);
  // Only the read-write level draws a write path from the app.
  assert.ok(step(rw, 'unlock-customer-360').flows.some((f) => f.kind === 'write'));
  assert.ok(!step(enriched, 'unlock-customer-360').flows.some((f) => f.kind === 'write'));
});

test('consumers unlock one at a time and each unlock lowers legacy load', () => {
  for (const level of levels) {
    const { steps } = build(level);
    const app = step(steps, 'unlock-customer-360');
    const analytics = step(steps, 'unlock-real-time-analytics');
    const ai = step(steps, 'unlock-ai-agents');
    const unlocked = (s: OdlStep) =>
      s.after.consumers.filter((c) => c.unlocked).map((c) => c.id);
    assert.deepEqual(unlocked(app), ['app']);
    assert.deepEqual(unlocked(analytics), ['app', 'analytics']);
    assert.deepEqual(unlocked(ai), ['app', 'analytics', 'ai']);
    for (const [before, after] of [
      [app.before, app.after],
      [analytics.before, analytics.after],
      [ai.before, ai.after],
    ])
      assert.ok(
        after.sources.reduce((t, s) => t + s.load, 0) <
          before.sources.reduce((t, s) => t + s.load, 0),
        level,
      );
  }
  const end = step(build().steps, 'the-hub-replaces-the-mesh').after;
  assert.deepEqual(
    end.sources.map((s) => s.load),
    [3, 3, 4],
  );
  assert.equal(end.integrations, 6);
  assert.equal(end.value.length, 4);
});

test('the AI agent only gets an embedding once it is unlocked', () => {
  const { steps } = build();
  assert.equal(
    step(steps, 'unlock-real-time-analytics').after.customer?.embedding,
    undefined,
  );
  assert.ok(step(steps, 'unlock-ai-agents').after.customer?.embedding?.length);
});

test('operations refuse to skip the pipeline', () => {
  const state = createInitialModel();
  assert.throws(() => unlock(state, 'app', 'x'), /no unified customer/);
  assert.throws(() => enrich(state), /Unify/);
  connectCdc(state);
  runMicroBatch(state);
  landChanges(state);
  unify(state);
  assert.throws(() => writePreference(state), /read-only/);
  enableWrites(state);
  writePreference(state);
  assert.deepEqual(state.customer?.preferences, { marketingOptIn: false });
});

test('rewinding is safe: published snapshots are independent', () => {
  const { steps } = build();
  steps[2].after.sources[0].load = 999;
  steps[2].after.collections.hacked = 1;
  assert.notEqual(steps[3].before.sources[0].load, 999);
  assert.equal(steps[3].before.collections.hacked, undefined);
  assert.notEqual(steps[2].before, steps[2].after);
});

test('load colours show the systems of record going from overloaded to protected', () => {
  assert.deepEqual([0, 20, 21, 50, 51, 100].map(loadLevel), [
    'low',
    'low',
    'mid',
    'mid',
    'high',
    'high',
  ]);
  const levels = (s: OdlStep) => s.after.sources.map((source) => loadLevel(source.load));
  for (const level of levels_()) {
    const { steps } = build(level);
    // Before the layer: the database that serves reporting is overloaded, the others busy.
    assert.deepEqual(levels(step(steps, 'point-to-point-does-not-scale')), [
      'mid',
      'high',
      'mid',
    ]);
    // The database stays red until its heavy reporting queries move, then turns green.
    assert.equal(levels(step(steps, 'unlock-customer-360'))[1], 'high');
    assert.deepEqual(levels(step(steps, 'unlock-real-time-analytics')), [
      'low',
      'low',
      'mid',
    ]);
    assert.deepEqual(levels(step(steps, 'unlock-ai-agents')), ['low', 'low', 'low']);
  }
});
function levels_() {
  return ['read-only', 'enriched', 'read-write'] as const;
}
