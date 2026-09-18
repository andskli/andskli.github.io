import { BookOpen, ExternalLink, Focus, GitBranch, Server, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { sourceLinks } from '../../lessons/architecture/sources.ts';
import { nodeSet, nodeTitle } from '../../lessons/architecture/topology.ts';
import type { Model, NodeId } from '../../lessons/architecture/types.ts';
const componentDescriptions: Record<
  string,
  { title: string; body: string; points: string[]; source: string }
> = {
  app: {
    title: 'Where a request begins',
    body: 'Your application uses a MongoDB driver to discover topology, select servers, and send operations.',
    points: [
      'Connects to mongos in a sharded deployment',
      'Connects directly to a standalone or replica set',
      'Driver behavior includes pooling, discovery, and eligible retries',
    ],
    source: sourceLinks.sharding,
  },
  r: {
    title: 'A router, not a data store',
    body: 'mongos uses cached cluster metadata to send an operation to the right shard or shards, then returns the results.',
    points: [
      'No persistent user-document storage',
      'Chooses replica-set members using read preference',
      'Multiple routers can serve the same cluster',
    ],
    source: sourceLinks.sharding,
  },
  a: {
    title: 'A member of the data replica set',
    body: 'Each mongod stores a copy of this replica set’s dataset. The primary accepts writes; secondaries replicate its oplog.',
    points: [
      'Replication makes copies; sharding makes partitions',
      'Each replica set elects its own primary',
      'Secondary reads depend on read preference and concern',
    ],
    source: sourceLinks.replication,
  },
  c: {
    title: 'The map of the cluster',
    body: 'These dedicated config servers form their own replica set. They store shard keys, range ownership, shard membership, and cluster settings.',
    points: [
      'Metadata reads and writes use majority guarantees',
      'mongos caches and refreshes routing metadata',
      'The balancer coordinator runs on the config primary',
    ],
    source: sourceLinks.config,
  },
};
export function Inspector({
  id,
  model,
  onClose,
  onFocus,
}: {
  id: NodeId;
  model: Model;
  onClose: () => void;
  onFocus: () => void;
}) {
  const [tab, setTab] = useState<'about' | 'data'>('about');
  useEffect(() => setTab('about'), [id]);
  const kind = id === 'app' ? 'app' : id[0] === 'r' ? 'r' : id[0] === 'c' ? 'c' : 'a';
  const info = componentDescriptions[kind],
    member = model.members[id],
    isConfig = kind === 'c';
  return (
    <aside className="inspector" aria-label={`Details for ${nodeTitle(id)}`}>
      <div className="inspector-top">
        <span className="eyebrow">COMPONENT INSPECTOR</span>
        <button className="icon-button" aria-label="Close inspector" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="inspector-heading">
        <div className={'component-icon ' + (isConfig ? 'purple' : '')}>
          <Server size={24} />
        </div>
        <div>
          <h2>{nodeTitle(id)}</h2>
          <p>
            {id === 'app'
              ? 'Client application'
              : kind === 'r'
                ? 'Routing process'
                : `${nodeSet(id)} · ${member?.alive ? member.role : 'Offline'}`}
          </p>
        </div>
      </div>
      <div className="inspector-tabs">
        <button
          className={tab === 'about' ? 'active' : ''}
          onClick={() => setTab('about')}
        >
          Overview
        </button>
        {member && (
          <button
            className={tab === 'data' ? 'active' : ''}
            onClick={() => setTab('data')}
          >
            {isConfig ? 'Metadata' : 'Documents'}
          </button>
        )}
      </div>
      {tab === 'about' ? (
        <div className="inspector-body">
          <h3>{info.title}</h3>
          <p>{info.body}</p>
          <ul>
            {info.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {member && !isConfig && (
            <div className="version-grid">
              <div>
                <span>Applied</span>
                <strong>v{member.applied}</strong>
              </div>
              <div>
                <span>Durable</span>
                <strong>v{member.durable}</strong>
              </div>
              <div>
                <span>Committed</span>
                <strong>v{member.committed}</strong>
              </div>
            </div>
          )}
          {kind === 'r' && (
            <div className="inspector-fact">
              <span>Routing cache</span>
              <strong>
                {model.cacheVersion ? `Version ${model.cacheVersion}` : 'Empty'}
              </strong>
            </div>
          )}
          {isConfig && (
            <div className="inspector-fact">
              <span>Metadata version</span>
              <strong>v{model.metadataVersion}</strong>
            </div>
          )}
        </div>
      ) : (
        <div className="inspector-body data-view">
          {isConfig ? (
            <>
              <h3>Routing catalog</h3>
              <p className="data-caption">shop.orders · shard key: tenantId</p>
              <table>
                <thead>
                  <tr>
                    <th>Range</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {model.rangeOwner === 'B' ? (
                    <>
                      <tr>
                        <td>[0, 500)</td>
                        <td>Shard B</td>
                      </tr>
                      <tr>
                        <td>Other values &lt; 1000</td>
                        <td>Shard A</td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td>tenantId &lt; 1000</td>
                      <td>Shard A</td>
                    </tr>
                  )}
                  <tr>
                    <td>tenantId ≥ 1000</td>
                    <td>Shard B</td>
                  </tr>
                </tbody>
              </table>
              <div className="metadata-note">
                <GitBranch size={15} />{' '}
                {member.role === 'Primary'
                  ? 'Balancer coordinator on this member'
                  : 'Metadata replicated from the primary'}
              </div>
            </>
          ) : (
            <>
              <h3>Locally applied documents</h3>
              <p className="data-caption">shop.orders · {member.docs.length} documents</p>
              <div className="doc-list">
                {member.docs.map((d) => (
                  <div className="doc-item" key={d._id}>
                    <div>
                      <code>tenantId: {d.tenantId}</code>
                      <span
                        className={d.status === 'open' ? 'status-open' : 'status-closed'}
                      >
                        {d.status}
                      </span>
                    </div>
                    <strong>{d.item}</strong>
                    <span>amount: {d.amount}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <div className="inspector-bottom">
        <button className="button quiet" onClick={onFocus}>
          <Focus size={15} /> Focus in 3D
        </button>
        <a
          href={info.source}
          target="_blank"
          rel="noreferrer"
          aria-label="Read component documentation"
        >
          <BookOpen size={16} />
          <ExternalLink size={12} />
        </a>
      </div>
    </aside>
  );
}
