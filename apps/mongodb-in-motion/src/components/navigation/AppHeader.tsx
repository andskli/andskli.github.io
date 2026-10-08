import {
  Box,
  Boxes,
  Braces,
  Info,
  Layers,
  Network,
  Radio,
  Sparkles,
  Workflow,
} from 'lucide-react';
import type { MainSection } from '../../app/sections.ts';
import { topologyNames } from '../../app/sections.ts';
interface Props {
  section: MainSection;
  /** Whether the section's inspector panel (components, documents or events) is open. */
  panelOpen: boolean;
  onHome: () => void;
  onSection: (section: MainSection) => void;
  onInspect: () => void;
  onAbout: () => void;
}
const tabs: { id: MainSection; label: string; short: string; Icon: typeof Box }[] = [
  { id: 'modeling', label: 'Data modeling', short: 'Modeling', Icon: Braces },
  { id: 'standalone', label: topologyNames.standalone, short: 'One server', Icon: Box },
  { id: 'replica', label: topologyNames.replica, short: 'Replica', Icon: Layers },
  { id: 'sharded', label: topologyNames.sharded, short: 'Sharded', Icon: Network },
  { id: 'features', label: 'Features', short: 'Features', Icon: Radio },
  { id: 'use-cases', label: 'Use cases', short: 'Use cases', Icon: Workflow },
];
const inspectLabels: Record<
  'modeling' | 'features' | 'use-cases' | 'architecture',
  string
> = {
  modeling: 'Documents',
  features: 'Event',
  'use-cases': 'Value',
  architecture: 'Components',
};
export default function AppHeader({
  section,
  panelOpen,
  onHome,
  onSection,
  onInspect,
  onAbout,
}: Props) {
  const inspectKind =
    section === 'modeling' || section === 'features' || section === 'use-cases'
      ? section
      : 'architecture';
  const InspectIcon = {
    architecture: Boxes,
    features: Radio,
    'use-cases': Sparkles,
    modeling: Braces,
  }[inspectKind];
  return (
    <header className="app-header">
      <a
        className="brand"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onHome();
        }}
        aria-label="MongoDB in Motion home"
      >
        <span className="brand-mark">
          <i />
          <i />
          <i />
        </span>
        <span>
          MongoDB<span className="brand-light"> in Motion</span>
          <small>AN INTERACTIVE FIELD GUIDE</small>
        </span>
      </a>
      <nav className="topology-switch main-navigation" aria-label="Main navigation">
        {tabs.map(({ id, label, short, Icon }) => {
          const active = id === section;
          return (
            <button
              key={id}
              aria-pressed={active}
              className={active ? 'active' : ''}
              onClick={() => {
                if (!active) onSection(id);
              }}
            >
              <Icon size={15} />
              <span className="tab-full">{label}</span>
              <span className="tab-short">{short}</span>
            </button>
          );
        })}
      </nav>
      <div className="header-actions">
        <button
          aria-label={inspectLabels[inspectKind]}
          className={'button quiet components-button ' + (panelOpen ? 'pressed' : '')}
          onClick={onInspect}
        >
          <InspectIcon size={16} />
          <span>{inspectLabels[inspectKind]}</span>
        </button>
        <button
          className="icon-button about-button"
          aria-label="About this model and sources"
          onClick={onAbout}
        >
          <Info size={19} />
        </button>
      </div>
    </header>
  );
}
