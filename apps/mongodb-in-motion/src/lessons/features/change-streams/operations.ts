import { clone } from '../../../learning/snapshots.ts';
import type {
  ChangeEvent,
  ChangeStreamModel,
  FilterMode,
  OplogEntry,
  Order,
  OrderChanges,
  StreamOptions,
} from '../types.ts';
/** A small capped oplog makes "the window rolled over" visible in a few writes. */
export const OPLOG_CAPACITY = 7;
export const HISTORY_LOST = 'ChangeStreamHistoryLost (code 286)';
export const defaultOptions: StreamOptions = { fullDocument: 'default', filter: 'none' };

/** Opaque, fixed-width stand-in for a real resume token. */
export function tokenFor(ts: number) {
  return '8265F0A1' + ts.toString(16).toUpperCase().padStart(4, '0') + '2B02';
}

export type Write =
  | { op: 'insert'; order: Order }
  | { op: 'update'; id: number; set: OrderChanges }
  | { op: 'delete'; id: number };

export function createInitialModel(options: StreamOptions): ChangeStreamModel {
  const desk: Order = { _id: 1, item: 'Desk plant', amount: 35, status: 'open' };
  const lamp: Order = { _id: 2, item: 'Lamp', amount: 60, status: 'closed' };
  return {
    options: clone(options),
    orders: [desk, lamp],
    oplog: [
      { ts: 98, op: 'insert', id: 1, doc: clone(desk) },
      { ts: 99, op: 'insert', id: 2, doc: { ...lamp, status: 'open' } },
      { ts: 100, op: 'update', id: 2, set: { status: 'closed' } },
    ],
    oplogCapacity: OPLOG_CAPACITY,
    headTs: 100,
    streamOpen: false,
    cursorTs: null,
    consumer: 'healthy',
    inbox: [],
    processedCount: 0,
    savedTs: null,
    lastEvent: null,
    fresh: [],
    error: null,
    missed: 0,
    event: 'Ready',
  };
}

export function matchesFilter(event: ChangeEvent, filter: FilterMode) {
  if (filter === 'none') return true;
  if (filter === 'inserts') return event.operationType === 'insert';
  // An event without a fullDocument has no fullDocument.status, so it cannot match.
  return event.fullDocument?.status === 'open';
}

export function pipelineText(filter: FilterMode) {
  if (filter === 'inserts') return '[ { $match: { operationType: "insert" } } ]';
  if (filter === 'open') return '[ { $match: { "fullDocument.status": "open" } } ]';
  return '[]';
}

/** The mongosh call for the stream's options, optionally resuming from a token. */
export function watchCall(options: StreamOptions, resumeAfter?: number) {
  const settings = [
    ...(options.fullDocument === 'updateLookup' ? ['fullDocument: "updateLookup"'] : []),
    ...(resumeAfter === undefined
      ? []
      : [`resumeAfter: { _data: "${tokenFor(resumeAfter)}" }`]),
  ];
  const args = [
    pipelineText(options.filter),
    ...(settings.length ? [`{ ${settings.join(', ')} }`] : []),
  ];
  return `db.orders.watch(${args.join(', ')})`;
}

/** Build the event this oplog entry produces, using the collection as it is now. */
export function eventFor(state: ChangeStreamModel, entry: OplogEntry): ChangeEvent {
  const event: ChangeEvent = {
    ts: entry.ts,
    token: tokenFor(entry.ts),
    operationType: entry.op,
    ns: 'shop.orders',
    documentKey: { _id: entry.id },
  };
  if (entry.op === 'insert') event.fullDocument = clone(entry.doc!);
  if (entry.op === 'update') {
    event.updateDescription = { updatedFields: clone(entry.set!), removedFields: [] };
    // updateLookup reads the document when the event is processed, not when it was written.
    if (state.options.fullDocument === 'updateLookup')
      event.fullDocument = clone(state.orders.find((o) => o._id === entry.id) ?? null);
  }
  return event;
}

/** Render an event in the order the server emits its fields. */
export function eventDocument(event: ChangeEvent) {
  return {
    _id: { _data: event.token },
    operationType: event.operationType,
    clusterTime: { $timestamp: { t: 1760000000, i: event.ts } },
    ...(event.fullDocument !== undefined ? { fullDocument: event.fullDocument } : {}),
    ns: { db: 'shop', coll: 'orders' },
    documentKey: event.documentKey,
    ...(event.updateDescription ? { updateDescription: event.updateDescription } : {}),
  };
}

function scan(state: ChangeStreamModel, entry: OplogEntry) {
  state.cursorTs = entry.ts;
  const event = eventFor(state, entry);
  if (!matchesFilter(event, state.options.filter)) return null;
  if (state.consumer !== 'offline') state.inbox.push(event);
  state.lastEvent = event;
  state.fresh.push(entry.ts);
  return event;
}

/** Commit a write on the primary; an open stream scans the new oplog entry. */
export function applyWrite(state: ChangeStreamModel, write: Write) {
  const ts = ++state.headTs;
  let entry: OplogEntry;
  if (write.op === 'insert') {
    state.orders.push(clone(write.order));
    entry = { ts, op: 'insert', id: write.order._id, doc: clone(write.order) };
  } else if (write.op === 'update') {
    Object.assign(
      state.orders.find((o) => o._id === write.id)!,
      write.set,
    );
    entry = { ts, op: 'update', id: write.id, set: clone(write.set) };
  } else {
    state.orders = state.orders.filter((o) => o._id !== write.id);
    entry = { ts, op: 'delete', id: write.id };
  }
  state.oplog.push(entry);
  // The oplog is a capped collection: the oldest entries are overwritten.
  while (state.oplog.length > state.oplogCapacity) state.oplog.shift();
  return state.streamOpen ? scan(state, entry) : null;
}

/** A burst of writes applied in order. */
export const applyWrites = (state: ChangeStreamModel, writes: Write[]) =>
  writes.map((write) => applyWrite(state, write));

export function canResume(state: ChangeStreamModel, afterTs: number) {
  return state.oplog.length > 0 && afterTs >= state.oplog[0].ts;
}

/**
 * Open a stream at "now", or resume after a saved position. Resuming replays the
 * retained oplog entries after the token; if the token has been overwritten it fails.
 */
export function openStream(state: ChangeStreamModel, resumeAfter?: number) {
  state.error = null;
  if (resumeAfter === undefined) {
    state.streamOpen = true;
    state.cursorTs = state.headTs;
    return true;
  }
  if (!canResume(state, resumeAfter)) {
    state.streamOpen = false;
    state.error = HISTORY_LOST;
    state.missed = state.headTs - resumeAfter;
    return false;
  }
  state.streamOpen = true;
  for (const entry of state.oplog) if (entry.ts > resumeAfter) scan(state, entry);
  state.cursorTs = state.headTs;
  return true;
}

/** The consumer finishes its queue, then persists the stream's position. */
export function processInbox(state: ChangeStreamModel) {
  state.processedCount += state.inbox.length;
  state.inbox = [];
  state.savedTs = state.cursorTs;
}

/** A crash loses unprocessed events from memory but not the persisted token. */
export function crashConsumer(state: ChangeStreamModel) {
  state.consumer = 'offline';
  state.streamOpen = false;
  state.inbox = [];
}
