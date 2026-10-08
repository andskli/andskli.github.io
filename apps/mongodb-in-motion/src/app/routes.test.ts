import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatRoute, parseRoute } from './routes.ts';

test('an empty or unknown hash falls back to the default lesson', () => {
  assert.deepEqual(parseRoute(''), {
    section: 'modeling',
    lesson: 'documents',
    step: null,
    options: {},
  });
  assert.equal(parseRoute('#/nonsense/odl').section, 'modeling');
  assert.equal(parseRoute('#/nonsense/odl').lesson, 'documents');
});

test('section-only links resolve to a valid default lesson', () => {
  assert.equal(parseRoute('#/use-cases').lesson, 'odl');
  assert.equal(parseRoute('#/features').lesson, 'changeStreams');
  assert.equal(parseRoute('#/replica').lesson, 'write');
  assert.equal(parseRoute('#/sharded').lesson, 'write');
});

test('a lesson that does not belong to the topology falls back', () => {
  // Scatter-gather is sharded-only; one server keeps its first valid lesson.
  assert.equal(parseRoute('#/standalone/scatter').lesson, 'write');
  assert.equal(parseRoute('#/sharded/scatter').lesson, 'scatter');
});

test('step ids and option presets are parsed from the link', () => {
  const route = parseRoute(
    '#/use-cases/odl/one-customer-document?level=read-only&bogus=1',
  );
  assert.equal(route.section, 'use-cases');
  assert.equal(route.lesson, 'odl');
  assert.equal(route.step, 'one-customer-document');
  assert.equal(route.options.level, 'read-only');
  assert.deepEqual(
    parseRoute('#/features/changeStreams?fullDocument=updateLookup&filter=inserts')
      .options,
    {
      fullDocument: 'updateLookup',
      filter: 'inserts',
    },
  );
  assert.deepEqual(parseRoute('#/replica/secondary?concern=local').options, {
    concern: 'local',
  });
  assert.deepEqual(parseRoute('#/modeling/references?mode=lookup').options, {
    mode: 'lookup',
  });
});

test('default option values are omitted and unknown values ignored', () => {
  assert.deepEqual(parseRoute('#/use-cases/odl?level=enriched').options, {});
  assert.deepEqual(parseRoute('#/features/changeStreams?fullDocument=wat').options, {});
  assert.equal(
    formatRoute({
      section: 'features',
      lesson: 'changeStreams',
      step: null,
      options: { fullDocument: 'default', filter: 'none' },
    }),
    '#/features/changeStreams',
  );
});

test('formatRoute round-trips a fully specified link', () => {
  const hash = '#/use-cases/odl/one-customer-document?level=read-only';
  assert.equal(formatRoute(parseRoute(hash)), hash);
  const featureHash =
    '#/features/changeStreams/the-consumer-crashes?fullDocument=updateLookup';
  assert.equal(formatRoute(parseRoute(featureHash)), featureHash);
});
