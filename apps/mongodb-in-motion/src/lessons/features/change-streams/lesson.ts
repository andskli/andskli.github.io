import { createFeatureBuilder, flow } from '../builder.ts';
import { featureSources } from '../sources.ts';
import type {
  ChangeStreamModel,
  FeatureDefinition,
  FeatureFlow,
  FeatureLesson,
  Order,
  StreamOptions,
} from '../types.ts';
import {
  applyWrite,
  applyWrites,
  crashConsumer,
  createInitialModel,
  defaultOptions,
  openStream,
  pipelineText,
  processInbox,
  tokenFor,
  watchCall,
} from './operations.ts';

const metadata = {
  id: 'changeStreams',
  number: '01',
  name: 'Change streams',
  short: 'React to every write',
  heading: 'Every write becomes an event.',
  blurb:
    'Follow writes from the oplog to a consumer, then see what happens when that consumer falls behind.',
  collection: 'shop.orders',
  source: featureSources.changeStreams,
};

const order = (id: number, item: string, amount: number): Order => ({
  _id: id,
  item,
  amount,
  status: 'open',
});

/** Writes travel producer -> primary -> oplog; a delivered event continues to the consumer. */
function writeFlows(label: string, eventLabel: string) {
  return (after: ChangeStreamModel): FeatureFlow[] => [
    flow('producer', 'primary', 'write', label),
    flow('primary', 'oplog', 'oplog', `oplog #${after.headTs}`),
    ...(after.fresh.length ? [flow('oplog', 'consumer', 'event', eventLabel)] : []),
  ];
}

const delivered = (after: ChangeStreamModel) => after.fresh.length > 0;

export function build(options: StreamOptions = defaultOptions): FeatureLesson {
  const { steps, add, state } = createFeatureBuilder(createInitialModel(options));
  const lookup = options.fullDocument === 'updateLookup';
  const open = (savedTs?: number) => watchCall(options, savedTs);

  add({
    id: 'open-a-stream',
    title: 'The consumer opens a stream',
    description:
      'watch() sends an aggregation whose first stage is $changeStream. The cursor starts at the current end of the oplog, so it reports only changes made from now on.',
    code: `const stream = ${open()}\nstream.next()`,
    update: (s) => {
      openStream(s);
    },
    flows: [flow('consumer', 'oplog', 'watch', 'watch()')],
  });

  add({
    id: 'an-insert-becomes-an-event',
    title: 'An insert becomes an event',
    description: (after) =>
      delivered(after)
        ? 'The primary commits the insert and records it in the oplog. The stream reads the new entry and emits a change event. For an insert, fullDocument holds the whole new document.'
        : 'The pipeline dropped this event before it left the server.',
    code: `db.orders.insertOne(\n  { _id: 3, item: "Notebook", amount: 18, status: "open" }\n)`,
    update: (s) => {
      applyWrite(s, { op: 'insert', order: order(3, 'Notebook', 18) });
    },
    flows: writeFlows('insertOne', 'insert event'),
  });

  add({
    id: 'an-update-reports-a-delta',
    title: lookup ? 'An update adds the current document' : 'An update reports a delta',
    description: (after) => {
      const what = lookup
        ? 'The stream was opened with fullDocument: "updateLookup", so the event carries updateDescription and the document as it is now. The lookup happens when the event is read, not when the write committed.'
        : 'An update event reports only what changed in updateDescription.updatedFields. There is no fullDocument unless you ask for one with updateLookup, or pre/post-images.';
      return delivered(after)
        ? what
        : 'The pipeline does not match this event, so it is dropped on the server. ' +
            (options.filter === 'open' && !lookup
              ? 'Update events carry no fullDocument, so a $match on fullDocument.status cannot match them.'
              : '');
    },
    code: `db.orders.updateOne(\n  { _id: 3 },\n  { $set: { amount: 24 } }\n)`,
    update: (s) => {
      applyWrite(s, { op: 'update', id: 3, set: { amount: 24 } });
    },
    flows: writeFlows('updateOne', 'update event'),
  });

  add({
    id: 'a-delete-carries-only-a-key',
    title: 'A delete carries only a key',
    description: (after) =>
      delivered(after)
        ? 'The document is gone, so the event has only documentKey. To see the deleted document, enable changeStreamPreAndPostImages on the collection and request fullDocumentBeforeChange.'
        : 'The delete is in the oplog, but the pipeline drops it. A delete event has only documentKey, so it matches no condition on fullDocument.',
    code: `db.orders.deleteOne({ _id: 2 })`,
    update: (s) => {
      applyWrite(s, { op: 'delete', id: 2 });
    },
    flows: writeFlows('deleteOne', 'delete event'),
  });

  add({
    id: 'a-pipeline-filters-events',
    title: 'A pipeline filters events',
    description: (after) =>
      options.filter === 'none'
        ? 'This stream has no pipeline, so every change is delivered. Choose a pipeline below to see events dropped on the server before they reach the consumer.'
        : delivered(after)
          ? `The pipeline ${pipelineText(options.filter)} passes this event.`
          : 'This order is now closed. The pipeline drops the event on the server; the oplog entry still exists, and the stream still advances past it.',
    code: `db.orders.updateOne(\n  { _id: 1 },\n  { $set: { status: "closed" } }\n)\n// stream pipeline: ${pipelineText(options.filter)}`,
    update: (s) => {
      applyWrite(s, { op: 'update', id: 1, set: { status: 'closed' } });
    },
    flows: writeFlows('updateOne', 'update event'),
  });

  add({
    id: 'process-then-save-the-token',
    title: 'Process, then save the token',
    description: (after) =>
      `The consumer handles each queued event, then persists a resume token (position #${after.savedTs}). Save it after the work: a crash in between replays the event, so delivery is at-least-once and handlers should be idempotent.`,
    code: `// after the handler succeeds\ndb.streamState.updateOne(\n  { _id: "orders" },\n  { $set: { token: { _data: "${tokenFor(state.cursorTs ?? 0)}" } } },\n  { upsert: true }\n)`,
    update: (s) => {
      processInbox(s);
    },
    focus: ['consumer'],
  });

  add({
    id: 'the-consumer-falls-behind',
    title: 'The consumer falls behind',
    description: (after) =>
      `Writes arrive faster than the consumer works: ${after.inbox.length} events are queued, but the saved token has not moved. The server keeps no queue for this consumer. The cursor is only a position in the oplog, so the real limit is how long the oplog keeps that position.`,
    code: `db.orders.insertMany([\n  { _id: 5, item: "Mug", amount: 9, status: "open" },\n  { _id: 6, item: "Pen", amount: 3, status: "open" },\n  { _id: 7, item: "Tape", amount: 4, status: "open" }\n])`,
    update: (s) => {
      s.consumer = 'slow';
      applyWrites(s, [
        { op: 'insert', order: order(5, 'Mug', 9) },
        { op: 'insert', order: order(6, 'Pen', 3) },
        { op: 'insert', order: order(7, 'Tape', 4) },
      ]);
    },
    flows: writeFlows('insertMany', 'insert events'),
  });

  add({
    id: 'the-consumer-crashes',
    title: 'The consumer crashes',
    description: (after) =>
      `The process dies and its queued events vanish from memory. They were never processed, so the saved token still points before them. Writes continue into the oplog (now up to #${after.headTs}) with no cursor open.`,
    code: `// consumer process exits; the saved token is unchanged\ndb.orders.updateOne({ _id: 3 }, { $set: { amount: 30 } })\ndb.orders.insertOne({ _id: 8, item: "Stapler", amount: 12, status: "open" })`,
    update: (s) => {
      crashConsumer(s);
      applyWrites(s, [
        { op: 'update', id: 3, set: { amount: 30 } },
        { op: 'insert', order: order(8, 'Stapler', 12) },
      ]);
    },
    flows: [
      flow('producer', 'primary', 'write', 'writes continue'),
      flow('primary', 'oplog', 'oplog', 'oplog entries'),
    ],
  });

  add({
    id: 'resume-after-the-saved-token',
    title: 'Resume after the saved token',
    description: (after) =>
      `The restarted consumer passes resumeAfter. The oplog still holds that position, so the server replays every later entry in order: ${after.inbox.length} events reach the consumer, including the ones lost in the crash. Use startAfter to continue past an invalidate event.`,
    code: `const stream = ${open(state.savedTs ?? undefined)}`,
    update: (s) => {
      s.consumer = 'healthy';
      openStream(s, s.savedTs ?? undefined);
    },
    flows: [
      flow('consumer', 'oplog', 'watch', 'resumeAfter'),
      flow('oplog', 'consumer', 'event', 'replay'),
    ],
  });

  add({
    id: 'the-consumer-catches-up',
    title: 'The consumer catches up',
    description: (after) =>
      `It processes the replayed events and saves a new token at #${after.savedTs}. Nothing was skipped; some events were seen twice, which is why idempotent handlers matter.`,
    code: `// after the handlers succeed\ndb.streamState.updateOne(\n  { _id: "orders" },\n  { $set: { token: { _data: "${tokenFor(state.cursorTs ?? 0)}" } } }\n)`,
    update: (s) => {
      processInbox(s);
    },
    focus: ['consumer'],
  });

  add({
    id: 'an-outage-outlasts-the-oplog',
    title: 'An outage outlasts the oplog',
    description: (after) =>
      `This time the consumer is down while eight more writes arrive. The oplog is capped at ${after.oplogCapacity} entries here, so each new write overwrites the oldest, including the position the saved token points to.`,
    code: `// consumer is down for maintenance\nfor (let i = 10; i <= 17; i++)\n  db.orders.insertOne({ _id: i, item: "Item " + i, amount: i, status: "open" })`,
    update: (s) => {
      crashConsumer(s);
      applyWrites(
        s,
        Array.from({ length: 8 }, (_, i) => ({
          op: 'insert' as const,
          order: order(10 + i, `Item ${10 + i}`, 10 + i),
        })),
      );
    },
    flows: [
      flow('producer', 'primary', 'write', '8 inserts'),
      flow('primary', 'oplog', 'oplog', 'oplog overwrites'),
    ],
  });

  add({
    id: 'history-is-lost',
    title: 'The server cannot resume',
    description: (after) =>
      `The token's position is no longer in the oplog. Instead of silently skipping changes, the server fails with ChangeStreamHistoryLost. ${after.missed} changes cannot be replayed. Prevent it: size the oplog (or set a minimum retention) for your longest outage, and alert on consumer lag.`,
    code: `${open(state.savedTs ?? undefined)}\n// MongoServerError: ChangeStreamHistoryLost (code 286)\n// Resume of change stream was not possible, as the resume point may no longer be in the oplog.`,
    update: (s) => {
      s.consumer = 'healthy';
      openStream(s, s.savedTs ?? undefined);
    },
    flows: [flow('consumer', 'oplog', 'watch', 'resumeAfter')],
    focus: ['consumer', 'oplog'],
  });

  add({
    id: 'start-fresh-and-resync',
    title: 'Start fresh and resync',
    description:
      'The consumer opens a new stream at the current position, then re-reads the collection to rebuild what it missed. Opening the stream first means writes made during the read are not lost; the replay of those may duplicate some rows, which idempotent handlers absorb.',
    code: `// 1. open a new stream first\nconst stream = ${open()}\n// 2. then rebuild downstream state from the collection\ndb.orders.find()`,
    update: (s) => {
      openStream(s);
      s.savedTs = s.cursorTs;
      s.missed = 0;
    },
    flows: [flow('consumer', 'oplog', 'watch', 'watch()')],
  });

  return {
    ...metadata,
    steps,
    takeaway:
      'A change stream is a cursor over the oplog. Events arrive in order and each carries a resume token. The oplog is finite, so save the token after processing, expect each event at least once, and keep the oplog window longer than your longest consumer outage.',
  };
}

export const lesson: FeatureDefinition = {
  ...metadata,
  icon: 'stream',
  streamOptions: true,
  build,
};
