import { clone } from '../../learning/snapshots.ts';
import { initialModel } from './topology.ts';
import type { Flow, Model, NodeId, Step, Topology } from './types.ts';
interface StepInput {
  id: string;
  title: string;
  description: string;
  flows?: Flow[];
  update?: (state: Model) => void;
  focus?: NodeId[];
}
/** Build steps by mutating a working model; published before/after snapshots are copies. */
export function createArchitectureBuilder(topology: Topology) {
  const sharded = topology === 'sharded',
    replicated = topology !== 'standalone';
  const state = initialModel(topology),
    steps: Step[] = [];
  const entry: NodeId = sharded ? 'r1' : 'a1';
  const flow = (from: NodeId, to: NodeId, kind: Flow['kind'], label: string): Flow => ({
    from,
    to,
    kind,
    label,
  });
  function add({ id, title, description, flows = [], update, focus = [] }: StepInput) {
    // Capture both sides so seeking/rewinding never has to undo a previous operation.
    const before = clone(state);
    update?.(state);
    state.event = title;
    steps.push({
      id,
      title,
      description,
      before,
      after: clone(state),
      flows,
      // Most steps focus their route endpoints; local operations can supply focus explicitly.
      focus: focus.length
        ? focus
        : [...new Set(flows.flatMap((route) => [route.from, route.to]))],
    });
  }
  function reply(result: string) {
    // Convenience for reads served by a1. A failover lesson must specify its own
    // response flows, because the primary may have moved to another member.
    if (sharded)
      add({
        id: 'router-response',
        title: 'Back through the router',
        description:
          'The shard returns its result to the mongos that accepted the operation.',
        flows: [flow('a1', 'r1', 'response', result)],
      });
    add({
      id: 'application-response',
      title: 'The application gets its result',
      description: result,
      flows: [flow(entry, 'app', 'response', result)],
      update: (state) => {
        state.readResult = result;
      },
    });
  }
  return { state, steps, entry, sharded, replicated, flow, add, reply };
}
