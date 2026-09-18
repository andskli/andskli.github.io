import { ArrowRight, ChevronRight, GitBranch } from 'lucide-react';
import type { LessonIcon } from '../../learning/types.ts';
import { lessonIcons } from '../icons.ts';
export interface NavigationLesson {
  id: string;
  name: string;
  short: string;
  number: string;
  icon: LessonIcon;
}
interface Props {
  lessons: NavigationLesson[];
  active: string;
  title: string;
  modeling: boolean;
  onSelect: (id: string) => void;
  onAbout: () => void;
}
export function LessonSidebar({
  lessons,
  active,
  title,
  modeling,
  onSelect,
  onAbout,
}: Props) {
  return (
    <aside className="lesson-sidebar">
      <div className="sidebar-top">
        <span className="eyebrow">EXPLORE THE SYSTEM</span>
        <span className="lesson-count">{lessons.length} lessons</span>
      </div>
      <nav className="lesson-list" aria-label="Guided lessons">
        <section className="lesson-section">
          <h2 className="lesson-section-title">
            <span>{title}</span>
          </h2>
          {lessons.map((lesson) => {
            const Icon = lessonIcons[lesson.icon];
            return (
              <button
                key={lesson.id}
                className={
                  'lesson-link ' +
                  (modeling ? 'modeling-link ' : '') +
                  (lesson.id === active ? 'active' : '')
                }
                aria-current={lesson.id === active ? 'step' : undefined}
                onClick={() => onSelect(lesson.id)}
              >
                <span className="lesson-icon">
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{lesson.name}</strong>
                  <small>{lesson.short}</small>
                </span>
                {lesson.id === active ? (
                  <ChevronRight size={15} />
                ) : (
                  <span className="lesson-number">{lesson.number}</span>
                )}
              </button>
            );
          })}
        </section>
      </nav>
      <div className="sidebar-note">
        <span className="small-leaf">
          <GitBranch size={16} />
        </span>
        <h3>Small model. Real ideas.</h3>
        <p>
          Start with document shapes, then explore the processes that store and serve
          them.
        </p>
        <button onClick={onAbout}>
          Model boundaries <ArrowRight size={13} />
        </button>
      </div>
      <div className="sidebar-footer">
        <span className="live-dot" /> Runs entirely in your browser
      </div>
    </aside>
  );
}
export function MobileLessonPicker({
  lessons,
  active,
  onSelect,
}: Pick<Props, 'lessons' | 'active' | 'onSelect'>) {
  return (
    <div className="mobile-lesson">
      <label htmlFor="lesson-picker">Lesson</label>
      <select
        id="lesson-picker"
        value={active}
        onChange={(e) => onSelect(e.target.value)}
      >
        {lessons.map((lesson) => (
          <option key={lesson.id} value={lesson.id}>
            {lesson.name}
          </option>
        ))}
      </select>
    </div>
  );
}
