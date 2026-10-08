import { useSyncExternalStore } from 'react';
import {
  featureIds,
  lessonIds,
  modelingIds,
  useCaseIds,
} from '../learning/lesson-registry.ts';
import type { Concern } from '../lessons/architecture/types.ts';
import type { ReferenceMode } from '../lessons/data-modeling/types.ts';
import type { FilterMode, FullDocumentMode } from '../lessons/features/types.ts';
import type { OdlLevel } from '../lessons/use-cases/types.ts';
import type { MainSection } from './sections.ts';

/** Option presets a deep link can pin. Only the active section's keys are read. */
export interface RouteOptions {
  level?: OdlLevel;
  fullDocument?: FullDocumentMode;
  filter?: FilterMode;
  concern?: Concern;
  mode?: ReferenceMode;
}
export interface Route {
  section: MainSection;
  lesson: string;
  step: string | null;
  options: RouteOptions;
}
const SECTIONS: MainSection[] = [
  'modeling',
  'standalone',
  'replica',
  'sharded',
  'features',
  'use-cases',
];
const LEVELS: OdlLevel[] = ['read-only', 'enriched', 'read-write'];
const FULL_DOCUMENT: FullDocumentMode[] = ['default', 'updateLookup'];
const FILTERS: FilterMode[] = ['none', 'inserts', 'open'];
const CONCERNS: Concern[] = ['local', 'majority'];
const MODES: ReferenceMode[] = ['application', 'lookup'];
/** Defaults are omitted from the hash so shareable links stay short. */
const DEFAULTS = {
  level: 'enriched',
  fullDocument: 'default',
  filter: 'none',
  concern: 'majority',
  mode: 'application',
} as const;

export function isSection(value: string): value is MainSection {
  return (SECTIONS as string[]).includes(value);
}
export function defaultLessonFor(section: MainSection): string {
  if (section === 'modeling') return 'documents';
  if (section === 'features') return 'changeStreams';
  if (section === 'use-cases') return 'odl';
  return lessonIds(section)[0];
}
export function isLessonValid(section: MainSection, lesson: string): boolean {
  if (section === 'modeling') return (modelingIds as string[]).includes(lesson);
  if (section === 'features') return (featureIds as string[]).includes(lesson);
  if (section === 'use-cases') return (useCaseIds as string[]).includes(lesson);
  return (lessonIds(section) as string[]).includes(lesson);
}
function parseOptions(section: MainSection, params: URLSearchParams): RouteOptions {
  const pick = <T extends string>(key: string, allowed: readonly T[]): T | undefined => {
    const value = params.get(key);
    return value && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : undefined;
  };
  const options: RouteOptions = {};
  if (section === 'use-cases') {
    const level = pick('level', LEVELS);
    if (level && level !== DEFAULTS.level) options.level = level;
  } else if (section === 'features') {
    const fullDocument = pick('fullDocument', FULL_DOCUMENT);
    if (fullDocument && fullDocument !== DEFAULTS.fullDocument)
      options.fullDocument = fullDocument;
    const filter = pick('filter', FILTERS);
    if (filter && filter !== DEFAULTS.filter) options.filter = filter;
  } else if (section === 'modeling') {
    const mode = pick('mode', MODES);
    if (mode && mode !== DEFAULTS.mode) options.mode = mode;
  } else {
    const concern = pick('concern', CONCERNS);
    if (concern && concern !== DEFAULTS.concern) options.concern = concern;
  }
  return options;
}
export function parseRoute(rawHash: string): Route {
  const hash = rawHash.replace(/^#/, '');
  const [rawPath = '', rawQuery = ''] = hash.split('?');
  const segments = rawPath.split('/').filter(Boolean);
  const section: MainSection =
    segments[0] && isSection(segments[0]) ? segments[0] : 'modeling';
  const requested = segments[1];
  const lesson =
    requested && isLessonValid(section, requested)
      ? requested
      : defaultLessonFor(section);
  const step = segments[2] ? decodeURIComponent(segments[2]) : null;
  return {
    section,
    lesson,
    step,
    options: parseOptions(section, new URLSearchParams(rawQuery)),
  };
}
export function formatRoute(route: Route): string {
  const segments = [route.section, route.lesson];
  if (route.step) segments.push(route.step);
  const params = new URLSearchParams();
  const { options } = route;
  if (route.section === 'use-cases') {
    if (options.level && options.level !== DEFAULTS.level)
      params.set('level', options.level);
  } else if (route.section === 'features') {
    if (options.fullDocument && options.fullDocument !== DEFAULTS.fullDocument)
      params.set('fullDocument', options.fullDocument);
    if (options.filter && options.filter !== DEFAULTS.filter)
      params.set('filter', options.filter);
  } else if (route.section === 'modeling') {
    if (options.mode && options.mode !== DEFAULTS.mode) params.set('mode', options.mode);
  } else if (options.concern && options.concern !== DEFAULTS.concern) {
    params.set('concern', options.concern);
  }
  const query = params.toString();
  return `#/${segments.join('/')}${query ? `?${query}` : ''}`;
}

const listeners = new Set<() => void>();
const readLocation = (): Route =>
  typeof window === 'undefined' ? parseRoute('') : parseRoute(window.location.hash);
let current = readLocation();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function emit() {
  for (const listener of listeners) listener();
}
export function getRoute(): Route {
  return current;
}
export function setRoute(next: Route, replace = false) {
  if (formatRoute(next) === formatRoute(current)) return;
  current = next;
  if (typeof window !== 'undefined') {
    const url = window.location.pathname + window.location.search + formatRoute(next);
    if (window.location.hash !== formatRoute(next)) {
      if (replace) window.history.replaceState(null, '', url);
      else window.history.pushState(null, '', url);
    }
  }
  emit();
}
/** Patch the current route, keeping unspecified fields. Defaults to replacing history. */
export function updateRoute(patch: Partial<Route>, replace = true) {
  const base = getRoute();
  setRoute(
    {
      section: patch.section ?? base.section,
      lesson: patch.lesson ?? base.lesson,
      step: patch.step !== undefined ? patch.step : base.step,
      options: patch.options ?? base.options,
    },
    replace,
  );
}
function syncFromLocation() {
  const next = readLocation();
  if (formatRoute(next) === formatRoute(current)) return;
  current = next;
  emit();
}
let initialized = false;
/** Subscribe to hash changes and normalize the initial URL so it is always shareable. */
export function initRoute() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('hashchange', syncFromLocation);
  window.addEventListener('popstate', syncFromLocation);
  if (!window.location.hash) {
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search + formatRoute(current),
    );
  }
}
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute, getRoute);
}
