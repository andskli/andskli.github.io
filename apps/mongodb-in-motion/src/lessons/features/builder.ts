import { clone } from '../../learning/snapshots.ts';
import type { ChangeStreamModel, FeatureFlow, FeatureStep, Part } from './types.ts';
interface StepInput {
  id: string;
  title: string;
  description: string | ((after: ChangeStreamModel) => string);
  code: string;
  /** Resolved after `update`, so a flow can depend on whether an event was delivered. */
  flows?: FeatureFlow[] | ((after: ChangeStreamModel) => FeatureFlow[]);
  update?: (state: ChangeStreamModel) => void;
  focus?: Part[];
}
export const flow = (
  from: Part,
  to: Part,
  kind: FeatureFlow['kind'],
  label: string,
): FeatureFlow => ({ from, to, kind, label });
/** Build steps by mutating a working model; published before/after snapshots are copies. */
export function createFeatureBuilder(state: ChangeStreamModel) {
  const steps: FeatureStep[] = [];
  function add({ id, title, description, code, flows = [], update, focus }: StepInput) {
    state.fresh = [];
    const before = clone(state);
    update?.(state);
    state.event = title;
    const after = clone(state);
    const resolved = typeof flows === 'function' ? flows(after) : flows;
    steps.push({
      id,
      title,
      description: typeof description === 'function' ? description(after) : description,
      code,
      before,
      after,
      flows: resolved,
      focus: focus ?? [...new Set(resolved.flatMap((route) => [route.from, route.to]))],
    });
  }
  return { state, steps, add };
}
