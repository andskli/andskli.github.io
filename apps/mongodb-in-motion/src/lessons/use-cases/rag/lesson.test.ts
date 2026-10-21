import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from './lesson.ts';
import {
  ask,
  augment,
  chunk,
  cosine,
  createInitialModel,
  embed,
  generate,
  store,
  vectorRank,
  vectorScore,
} from './operations.ts';
import type { EmbeddingMode, RagStep, RetrievalMode } from './types.ts';

const modes: RetrievalMode[] = ['vector', 'filtered', 'hybrid'];
const embeddings: EmbeddingMode[] = ['auto', 'byo'];
const byo = (retrieval: RetrievalMode = 'vector') =>
  build({ retrieval, embedding: 'byo' });
const step = (steps: RagStep[], id: string) => {
  const found = steps.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
};
const last = (steps: RagStep[]) => steps[steps.length - 1];
const retrieved = (mode: RetrievalMode) =>
  step(build({ retrieval: mode }).steps, 'augment-the-prompt').after.context;

test('every mode builds a lesson with stable unique steps and connected snapshots', () => {
  for (const embedding of embeddings)
    for (const mode of modes) {
      const { steps } = build({ retrieval: mode, embedding });
      assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, mode);
      for (const s of steps) {
        assert.ok(s.title && s.description && s.code, s.id);
        assert.ok(s.focus.length > 0, s.id);
      }
      for (let i = 1; i < steps.length; i++)
        assert.deepEqual(steps[i].before, steps[i - 1].after, steps[i].id);
    }
});

test('cosine scores are normalised the way Atlas reports them', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(vectorScore([1, 0], [-1, 0]), 0);
  assert.equal(vectorScore([1, 0], [0, 1]), 0.5);
});

test('ingestion chunks, embeds and stores text, metadata and vector together', () => {
  const { steps } = byo();
  const chunked = step(steps, 'split-into-chunks').after;
  assert.ok(chunked.pending.length > chunked.docs.length);
  assert.ok(chunked.pending.every((c) => c.embedding === undefined));
  const embedded = step(steps, 'embed-each-chunk').after;
  assert.equal(embedded.pending.length, 0);
  assert.ok(embedded.embedded.every((c) => c.embedding?.length === 4));
  const stored = step(steps, 'store-text-metadata-and-vector').after;
  assert.equal(stored.stored.length, chunked.pending.length);
  assert.ok(stored.stored.every((c) => c.text && c.product && c.embedding));
});

test('hybrid mode adds a full-text index alongside the vector index', () => {
  const types = (mode: RetrievalMode) =>
    step(build({ retrieval: mode }).steps, 'create-a-vector-index').after.indexes.map(
      (i) => i.type,
    );
  assert.deepEqual(types('vector'), ['vectorSearch']);
  assert.deepEqual(types('hybrid'), ['vectorSearch', 'search']);
});

test('searching before the question is embedded fails loudly', () => {
  const state = createInitialModel('vector', 'byo');
  chunk(state);
  embed(state);
  store(state);
  assert.throws(() => vectorRank(state, null));
  ask(state);
  assert.equal(vectorRank(state, null).length, state.stored.length);
  assert.throws(() => generate(state));
  assert.throws(() => augment(state));
});

test('semantic search ranks a web chunk first for a mobile question', () => {
  const hits = step(build().steps, 'semantic-search').after.hits;
  assert.equal(hits.length, 3);
  assert.equal(hits[0]._id, 'kb-205#1');
  for (let i = 1; i < hits.length; i++)
    assert.ok(hits[i - 1].vectorScore >= hits[i].vectorScore);
});

test('the vector-only explanation matches the computed ranking', () => {
  const s = step(build().steps, 'nearest-is-not-always-right');
  const state = s.after;
  for (const hit of vectorRank(state, null).slice(0, 5))
    assert.match(s.code, new RegExp(`${hit._id}.*${hit.vectorScore}`));
});

test('each mode retrieves different context and gives a different answer', () => {
  assert.ok(retrieved('vector').includes('kb-205#1'));
  assert.ok(!retrieved('vector').includes('tk-8812#1'));
  assert.ok(!retrieved('filtered').includes('kb-205#1'));
  assert.ok(!retrieved('filtered').includes('tk-8812#1'));
  assert.ok(retrieved('hybrid').includes('tk-8812#1'));
  const answers = modes.map(
    (mode) => last(build({ retrieval: mode }).steps).after.answer!.text,
  );
  assert.equal(new Set(answers).size, 3);
  assert.match(answers[2], /4\.2\.1/);
});

test('the pre-filter keeps every hit on the user’s product', () => {
  for (const mode of ['filtered', 'hybrid'] as const) {
    const state = step(build({ retrieval: mode }).steps, 'augment-the-prompt').after;
    assert.deepEqual(state.filter, { product: 'mobile' });
    for (const id of state.context)
      assert.equal(state.stored.find((c) => c._id === id)!.product, 'mobile');
  }
});

test('hybrid hits carry their text rank and fused score', () => {
  const hits = step(build({ retrieval: 'hybrid' }).steps, 'fuse-with-full-text').after
    .hits;
  assert.equal(hits.find((h) => h._id === 'tk-8812#1')!.textRank, 1);
  for (let i = 1; i < hits.length; i++)
    assert.ok(hits[i - 1].fusedScore! >= hits[i].fusedScore!);
});

test('citations are always drawn from the retrieved context', () => {
  for (const mode of modes) {
    const state = step(build({ retrieval: mode }).steps, 'a-grounded-answer').after;
    assert.ok(state.answer!.citations.length > 0, mode);
    for (const id of state.answer!.citations) assert.ok(state.context.includes(id), id);
  }
});

test('a change stream re-embeds only the edited chunk', () => {
  const { steps } = byo();
  const s = step(steps, 'keep-vectors-fresh');
  const changed = s.after.stored.filter(
    (c, i) => JSON.stringify(c) !== JSON.stringify(s.before.stored[i]),
  );
  assert.deepEqual(
    changed.map((c) => c._id),
    ['kb-101#1'],
  );
  assert.notDeepEqual(changed[0].embedding, s.before.stored[0].embedding);
  assert.equal(s.after.docs.find((d) => d.id === 'kb-101')!.version, 2);
  assert.deepEqual(s.after.refreshed, ['kb-101#1']);
});

test('automated embedding keeps vectors out of the app and out of the document', () => {
  const { steps } = build({ embedding: 'auto' });
  assert.ok(
    steps.every((s) =>
      s.flows.every((f) => f.from !== 'embedder' && f.to !== 'embedder'),
    ),
  );
  assert.ok(
    !steps.some((s) => s.id === 'embed-each-chunk' || s.id === 'embed-the-question'),
  );
  const stored = step(steps, 'store-text-metadata-and-vector').after;
  assert.ok(stored.stored.every((c) => c.embedding === undefined));
  assert.deepEqual(stored.managed, {});
  const indexed = step(steps, 'create-a-vector-index').after;
  assert.equal(Object.keys(indexed.managed).length, indexed.stored.length);
  assert.match(step(steps, 'create-a-vector-index').code, /autoEmbed/);
  const asked = step(steps, 'ask-in-plain-text').after;
  assert.equal(asked.queryVector, null);
  assert.ok(asked.question);
  assert.match(step(steps, 'semantic-search').code, /query: question/);
});

test('bring-your-own stores the vector in the same document', () => {
  const stored = step(byo().steps, 'store-text-metadata-and-vector').after;
  assert.ok(stored.stored.every((c) => c.embedding?.length === 4));
  assert.match(step(byo().steps, 'one-document-no-pipeline').code, /embedding: \[/);
});

test('both embedding modes rank and answer identically', () => {
  for (const mode of modes) {
    const [a, b] = embeddings.map(
      (embedding) => last(build({ retrieval: mode, embedding }).steps).after,
    );
    assert.deepEqual(a.hits, b.hits, mode);
    assert.deepEqual(a.answer, b.answer, mode);
  }
});

test('an edit is re-embedded by Atlas with no app-side vector', () => {
  const s = step(build({ embedding: 'auto' }).steps, 'keep-vectors-fresh');
  const edited = s.after.stored.find((c) => c._id === 'kb-101#1')!;
  assert.equal(edited.embedding, undefined);
  assert.notDeepEqual(s.after.managed['kb-101#1'], s.before.managed['kb-101#1']);
  assert.deepEqual(
    s.flows.map((f) => f.to),
    ['atlas'],
  );
});
