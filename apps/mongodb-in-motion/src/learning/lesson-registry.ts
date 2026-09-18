import { lesson as aggregate } from '../lessons/architecture/aggregation/lesson.ts';
import { lesson as config } from '../lessons/architecture/config-servers/lesson.ts';
import { lesson as fail } from '../lessons/architecture/elections/lesson.ts';
import { lesson as migrate } from '../lessons/architecture/range-migration/lesson.ts';
import { lesson as write } from '../lessons/architecture/replication/lesson.ts';
import { lesson as scatter } from '../lessons/architecture/scatter-gather/lesson.ts';
import { lesson as secondary } from '../lessons/architecture/secondary-reads/lesson.ts';
import { lesson as target } from '../lessons/architecture/targeted-reads/lesson.ts';
import type { Concern, LessonId, Topology } from '../lessons/architecture/types.ts';
import { lesson as access } from '../lessons/data-modeling/access-patterns/lesson.ts';
import { lesson as documents } from '../lessons/data-modeling/documents/lesson.ts';
import { lesson as embedding } from '../lessons/data-modeling/embedding/lesson.ts';
import { lesson as indexes } from '../lessons/data-modeling/indexes/lesson.ts';
import { lesson as polymorphism } from '../lessons/data-modeling/polymorphism/lesson.ts';
import { lesson as references } from '../lessons/data-modeling/references/lesson.ts';
import type { ModelingId, ReferenceMode } from '../lessons/data-modeling/types.ts';
/** Registration order is navigation order. Metadata belongs to each lesson. */
export const architectureLessons = {
  write,
  target,
  scatter,
  fail,
  secondary,
  aggregate,
  config,
  migrate,
};
export const modelingLessons = {
  documents,
  polymorphism,
  embedding,
  references,
  access,
  indexes,
};
export const modelingIds = Object.keys(modelingLessons) as ModelingId[];
export function lessonIds(topology: Topology): LessonId[] {
  return (Object.keys(architectureLessons) as LessonId[]).filter((id) =>
    architectureLessons[id].topologies.includes(topology),
  );
}
export function buildLesson(
  id: LessonId,
  topology: Topology,
  concern: Concern = 'majority',
) {
  return architectureLessons[id].build(topology, concern);
}
export function buildModelingLesson(id: ModelingId, mode: ReferenceMode = 'application') {
  return modelingLessons[id].build(mode);
}
