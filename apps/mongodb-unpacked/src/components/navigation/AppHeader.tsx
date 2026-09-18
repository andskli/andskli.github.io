import { Box, Boxes, Braces, Info, Layers, Network } from 'lucide-react';
import { topologyNames } from '../../app/sections.ts';
import type { Topology } from '../../lessons/architecture/types.ts';
interface Props {
  modeling: boolean;
  topology: Topology;
  componentsOpen: boolean;
  onHome: () => void;
  onModeling: () => void;
  onTopology: (topology: Topology) => void;
  onInspect: () => void;
  onAbout: () => void;
}
export default function AppHeader({
  modeling,
  topology,
  componentsOpen,
  onHome,
  onModeling,
  onTopology,
  onInspect,
  onAbout,
}: Props) {
  return (
    <header className="app-header">
      <a
        className="brand"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onHome();
        }}
        aria-label="MongoDB Unpacked home"
      >
        <span className="brand-mark">
          <i />
          <i />
          <i />
        </span>
        <span>
          MongoDB<span className="brand-light"> Unpacked</span>
          <small>AN INTERACTIVE FIELD GUIDE</small>
        </span>
      </a>
      <nav className="topology-switch main-navigation" aria-label="Main navigation">
        <button
          aria-pressed={modeling}
          className={modeling ? 'active' : ''}
          onClick={() => {
            if (!modeling) onModeling();
          }}
        >
          <Braces size={15} />
          <span>Data modeling</span>
        </button>
        {(['standalone', 'replica', 'sharded'] as Topology[]).map((value) => {
          const active = !modeling && value === topology,
            Icon = value === 'standalone' ? Box : value === 'replica' ? Layers : Network;
          return (
            <button
              key={value}
              aria-pressed={active}
              className={active ? 'active' : ''}
              onClick={() => {
                if (!active) onTopology(value);
              }}
            >
              <Icon size={15} />
              <span>{topologyNames[value]}</span>
            </button>
          );
        })}
      </nav>
      <div className="header-actions">
        <button
          aria-label={modeling ? 'Documents' : 'Components'}
          className={
            'button quiet components-button ' + (componentsOpen ? 'pressed' : '')
          }
          onClick={onInspect}
        >
          {modeling ? <Braces size={16} /> : <Boxes size={16} />}
          <span>{modeling ? 'Documents' : 'Components'}</span>
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
