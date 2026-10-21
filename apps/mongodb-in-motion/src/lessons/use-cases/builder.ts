import { clone } from '../../learning/snapshots.ts';
import type { OdlFlow, OdlModel, Part, UseCaseFlow, UseCaseStep } from './types.ts';
interface StepInput<State, P extends string, F extends UseCaseFlow<P>> {
  id: string;
  title: string;
  description: string | ((after: State) => string);
  code: string;
  flows?: F[] | ((after: State) => F[]);
  update?: (state: State) => void;
  focus?: P[];
}
export const flow = (
  from: Part,
  to: Part,
  kind: OdlFlow['kind'],
  label: string,
): OdlFlow => ({ from, to, kind, label });
/**
 * Build steps by mutating a working model; published before/after snapshots are copies.
 * Shared by every use case: the model only needs an `event` to name the latest step.
 */
export function createStepBuilder<
  State extends { event: string },
  P extends string,
  F extends UseCaseFlow<P>,
>(state: State) {
  const steps: UseCaseStep<State, P, F>[] = [];
  function add({
    id,
    title,
    description,
    code,
    flows = [],
    update,
    focus,
  }: StepInput<State, P, F>) {
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
export const createOdlBuilder = (state: OdlModel) =>
  createStepBuilder<OdlModel, Part, OdlFlow>(state);
