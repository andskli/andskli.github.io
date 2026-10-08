import { clone } from '../../learning/snapshots.ts';
import type { OdlFlow, OdlModel, OdlStep, Part } from './types.ts';
interface StepInput {
  id: string;
  title: string;
  description: string | ((after: OdlModel) => string);
  code: string;
  flows?: OdlFlow[] | ((after: OdlModel) => OdlFlow[]);
  update?: (state: OdlModel) => void;
  focus?: Part[];
}
export const flow = (
  from: Part,
  to: Part,
  kind: OdlFlow['kind'],
  label: string,
): OdlFlow => ({ from, to, kind, label });
/** Build steps by mutating a working model; published before/after snapshots are copies. */
export function createOdlBuilder(state: OdlModel) {
  const steps: OdlStep[] = [];
  function add({ id, title, description, code, flows = [], update, focus }: StepInput) {
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
