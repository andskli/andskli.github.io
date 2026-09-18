import { ExternalLink, X } from 'lucide-react';
import { sourceLinks } from '../lessons/architecture/sources.ts';
import { modelingSources } from '../lessons/data-modeling/sources.ts';
export default function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={() => onClose()}>
      <section
        className="about-modal"
        role="dialog"
        aria-modal="true"
        aria-label="About MongoDB in Motion"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          onClick={() => onClose()}
          aria-label="Close about dialog"
        >
          <X size={20} />
        </button>
        <span className="eyebrow">HOW TO READ THIS WORLD</span>
        <h2>
          Real concepts.
          <br />
          An explorable model.
        </h2>
        <p>
          MongoDB in Motion is an independent educational guide. It runs a deterministic
          simulation in your browser, with 3D views of documents, collections, processes,
          replica sets, and network routes.
        </p>
        <div className="boundary-grid">
          <div>
            <h3>What is represented</h3>
            <p>
              Document structure, polymorphism, embedding, manual references, access
              patterns, compound and multikey indexes, routing, document placement, oplog
              replication, majority acknowledgements, elections, read visibility, split
              aggregation, and range ownership.
            </p>
          </div>
          <div>
            <h3>What is simplified</h3>
            <p>
              Network and election timing, storage internals, driver retries, and
              migration concurrency. It does not execute MongoDB binaries, arbitrary
              queries, or a complete distributed protocol.
            </p>
          </div>
        </div>
        <p className="small-note">
          This model uses three voting, data-bearing members per replica set, primary
          reads unless specified, and dedicated config servers. Majority reads are not
          guaranteed to return the latest data. Moving markers represent logical
          operations, not a measured byte count.
        </p>
        <div className="source-links">
          {[...Object.entries(sourceLinks), ...Object.entries(modelingSources)].map(
            ([name, url]) => (
              <a href={url} key={name} target="_blank" rel="noreferrer">
                {name === 'concern'
                  ? 'Read concern'
                  : name === 'config'
                    ? 'Config servers'
                    : name === 'aggregate'
                      ? 'Aggregation'
                      : name[0].toUpperCase() + name.slice(1)}
                <ExternalLink size={13} />
              </a>
            ),
          )}
        </div>
        <footer>
          Inspired by{' '}
          <a href="https://poltora.dev/redis" target="_blank" rel="noreferrer">
            Redis City by poltora.dev
          </a>
          . MongoDB and its marks belong to MongoDB, Inc.
        </footer>
      </section>
    </div>
  );
}
