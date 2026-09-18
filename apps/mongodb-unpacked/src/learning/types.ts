/** Shared playback contract. Domain state stays in the individual learning models. */
export interface LessonStep<State> {
  id: string;
  title: string;
  description: string;
  before: State;
  after: State;
}
export interface StepShortcut {
  label: string;
  stepId: string;
}
export type LessonIcon =
  | 'write'
  | 'search'
  | 'network'
  | 'shield'
  | 'layers'
  | 'boxes'
  | 'settings'
  | 'branch'
  | 'document'
  | 'shapes'
  | 'embed'
  | 'reference'
  | 'pointer'
  | 'index';
