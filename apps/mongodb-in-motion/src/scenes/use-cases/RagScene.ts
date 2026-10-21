import * as THREE from 'three';
import type {
  Chunk,
  RagFlow,
  RagFlowKind,
  RagModel,
  RagPart,
  RagStep,
} from '../../lessons/use-cases/rag/types.ts';
import type { ClusterObjects } from '../cluster/objects.ts';
import { C } from '../cluster/palette.ts';
import { FlowScene, vec } from './FlowScene.ts';
import type { FlowFrame } from './FlowScene.ts';

export type RagFrame = FlowFrame<RagModel, RagPart, RagStep>;

const POS: Record<RagPart, THREE.Vector3> = {
  sources: vec(-16, 0, -5),
  chunker: vec(-8, 0, -5),
  embedder: vec(0, 0, -5),
  atlas: vec(8.5, 0, 0.5),
  app: vec(0, 0, 6),
  llm: vec(-9, 0, 6),
};
const NAMES: Record<RagPart, string> = {
  sources: 'Knowledge base',
  chunker: 'Chunker',
  embedder: 'Embedding model',
  atlas: 'MongoDB Atlas',
  app: 'Support assistant',
  llm: 'LLM',
};
/** Shares the legend colours: ingest green, embed purple, query blue, results orange. */
export const ragFlowColors: Record<RagFlowKind, number> = {
  ingest: 0x008d68,
  write: 0x008d68,
  embed: 0x9670c5,
  generate: 0x9670c5,
  query: 0x668bb7,
  retrieve: 0xdc8736,
};
const PRODUCT_COLOR: Record<Chunk['product'], number> = {
  mobile: C.green,
  web: 0x668bb7,
  account: 0xb3a58f,
};
const CHUNK_SLOTS = 7;
/** Embedding bars: one per teaching dimension. */
const DIMS = 4;

/**
 * Renders immutable frames from the use-case stage. Chunks appear on the chunker, pick
 * up vectors in the embedder and land as tiles in Atlas, where hits rise and filtered
 * chunks fade.
 */
export class RagScene extends FlowScene<RagModel, RagPart, RagFlowKind, RagStep> {
  pendingTiles: THREE.Mesh[] = [];
  storedTiles: { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial }[] = [];
  bars: THREE.Mesh[] = [];
  vectorIndex: THREE.Mesh | null = null;
  textIndex: THREE.Mesh | null = null;
  pages: THREE.Mesh[] = [];
  answerCard: THREE.Mesh | null = null;
  llmCore: THREE.Mesh | null = null;
  /** Voyage AI running inside Atlas, shown when an autoEmbed index exists. */
  voyage: THREE.Group | null = null;

  constructor(container: HTMLElement, select: (id: RagPart) => void) {
    super(container, select, {
      positions: POS,
      colors: ragFlowColors,
      ariaLabel:
        'Interactive 3D retrieval-augmented generation pipeline. Drag to orbit, scroll to zoom, or select a labeled part.',
      home: { target: vec(-1, 0, 1.5), wide: vec(4, 26, 33), narrow: vec(6, 30, 30) },
      fit: { wide: 41, narrow: 46 },
    });
    this.start();
  }

  protected build() {
    this.buildSources();
    this.buildChunker();
    this.buildEmbedder();
    this.buildAtlas();
    this.buildApp();
    this.buildLlm();
    const route = (
      from: RagPart,
      to: RagPart,
      kind: RagFlowKind,
      show: (m: RagModel) => boolean,
    ) => this.getRoute(from, to, kind, show);
    route('sources', 'chunker', 'ingest', (m) => m.layers.chunker);
    route('chunker', 'embedder', 'embed', (m) => m.layers.embedder);
    route('embedder', 'atlas', 'write', (m) => m.layers.atlas && m.embedding === 'byo');
    route('chunker', 'atlas', 'write', (m) => m.layers.atlas && m.embedding === 'auto');
    // With autoEmbed the app never calls a model, and the embedder is hidden.
    route('app', 'embedder', 'query', (m) => m.layers.app && m.layers.embedder);
    route('app', 'atlas', 'query', (m) => m.layers.app && m.hits.length > 0);
    route('app', 'llm', 'generate', (m) => m.layers.llm);
  }

  /** The source change reaches Atlas over the top of the ingest lane. */
  protected routeLift(from: RagPart, to: RagPart) {
    return (from === 'sources' && to === 'atlas') ||
      (from === 'atlas' && to === 'sources')
      ? 4.2
      : 0.55;
  }

  buildSources() {
    const part = this.makePart('sources', 1.6, 3.4);
    this.platform(part, 'sources', 5, 5, 'app');
    const g = part.body,
      o = part.objects;
    // A fanned stack of pages: four articles and one ticket.
    for (let i = 0; i < 5; i++) {
      const ticket = i === 4;
      const page = o.box(
        g,
        1.5,
        0.08,
        1.95,
        -0.55 + i * 0.28,
        0.7 + i * 0.3,
        0.2 - i * 0.12,
        ticket ? 0xfbeedd : 0xf8faf6,
        0.03,
      );
      page.rotation.y = -0.18 + i * 0.08;
      this.pages.push(page);
      for (let k = 0; k < 3; k++)
        o.box(
          page,
          1.0 - k * 0.2,
          0.02,
          0.12,
          -0.1,
          0.05,
          -0.55 + k * 0.38,
          ticket ? C.orange : 0x9fb3a5,
          0.01,
        );
    }
  }

  buildChunker() {
    const part = this.makePart('chunker', 1.9, 3.3);
    this.platform(part, 'chunker', 5.6, 3.8, 'config');
    this.island(part, 'chunker', 'CHUNKING', 'Passages + metadata', 3.8);
    const g = part.body,
      o = part.objects;
    o.box(g, 2.6, 0.9, 1.5, -0.6, 1.0, 0, 0xeef1ea, 0.12);
    // The blade.
    o.box(g, 0.08, 1.3, 1.7, 0.75, 1.2, 0, 0x8a9a92, 0.02);
    o.box(g, 0.2, 0.18, 1.8, 0.75, 1.92, 0, C.dark, 0.04);
    for (let i = 0; i < CHUNK_SLOTS; i++) {
      const tile = o.box(
        g,
        0.32,
        0.16,
        0.42,
        -1.65 + (i % 4) * 0.42,
        1.56 + Math.floor(i / 4) * 0.2,
        -0.3 + Math.floor(i / 4) * 0.5,
        0xf8faf6,
        0.03,
      );
      tile.visible = false;
      this.pendingTiles.push(tile);
    }
  }

  buildEmbedder() {
    const part = this.makePart('embedder', 1.9, 3.6);
    this.platform(part, 'embedder', 5.6, 3.8, 'config');
    this.island(part, 'embedder', 'EMBEDDINGS', 'Text in, vector out', 3.8);
    const g = part.body,
      o = part.objects;
    o.box(g, 1.3, 0.45, 1.3, -1.0, 0.82, 0, 0x597d6c, 0.08);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), o.mat(C.purple));
    core.position.set(-1.0, 1.7, 0);
    core.castShadow = true;
    g.add(core);
    // The vector the model last produced, one bar per dimension.
    for (let i = 0; i < DIMS; i++) {
      const geometry = new THREE.BoxGeometry(0.26, 1, 0.26);
      geometry.translate(0, 0.5, 0);
      const bar = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: C.purple, roughness: 0.5 }),
      );
      bar.position.set(0.55 + i * 0.42, 0.6, 0);
      bar.scale.y = 0.05;
      bar.castShadow = true;
      g.add(bar);
      this.bars.push(bar);
    }
  }

  buildAtlas() {
    const part = this.makePart('atlas', 2.6, 4.6);
    this.platform(part, 'atlas', 8.4, 11.6, 'shard');
    this.island(part, 'atlas', 'KNOWLEDGE.CHUNKS', 'MongoDB Atlas · Vector Search', 11.6);
    const g = part.body,
      o = part.objects;
    const accent = o.mat(C.green);
    for (const z of [-3.4, 0, 3.4]) {
      o.box(g, 1.9, 0.16, 1.85, -2.1, 0.56, z, 0xe0e8dd, 0.1);
      o.box(g, 1.35, 2.15, 1.16, -2.1, 1.74, z, 0xeef3e9, 0.13);
      o.box(g, 1.43, 0.2, 1.24, -2.1, 2.8, z, accent, 0.06);
      o.box(g, 0.97, 1.47, 0.035, -2.1, 1.68, z + 0.591, C.dark, 0.015);
      for (let k = 0; k < 4; k++) {
        o.box(g, 0.76, 0.17, 0.045, -2.125, 2.2 - k * 0.32, z + 0.625, 0x34594d, 0.015);
        o.box(g, 0.055, 0.055, 0.025, -1.815, 2.2 - k * 0.32, z + 0.66, 0x9df0b8, 0.01);
      }
    }
    // Index plinths under the chunk tiles: vector first, full-text beside it.
    // Managed Voyage AI model: a purple core on its own pad inside the platform.
    this.voyage = new THREE.Group();
    this.voyage.position.set(1.6, 0, 4.75);
    o.box(this.voyage, 2.3, 0.3, 0.9, 0, 0.7, 0, 0x597d6c, 0.06);
    const voyageCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      o.mat(C.purple),
    );
    voyageCore.position.y = 1.3;
    voyageCore.castShadow = true;
    this.voyage.add(voyageCore);
    this.voyage.visible = false;
    g.add(this.voyage);
    const { div } = o.label(
      this.voyage,
      '<strong>VOYAGE AI</strong><span>managed in Atlas</span>',
      'island-label',
      vec(0, 2.0, 0),
    );
    div.dataset.group = 'config';
    this.vectorIndex = o.box(g, 2.9, 0.14, 7.6, 1.6, 0.58, 0, C.purple, 0.06);
    this.vectorIndex.visible = false;
    this.textIndex = o.box(g, 0.32, 0.3, 7.6, 3.3, 0.66, 0, C.orange, 0.06);
    this.textIndex.visible = false;
    for (let i = 0; i < CHUNK_SLOTS; i++) {
      const material = new THREE.MeshStandardMaterial({
        color: C.green,
        roughness: 0.45,
        transparent: true,
        opacity: 1,
        emissive: C.green,
        emissiveIntensity: 0,
      });
      const mesh = this.tile(o, g, material, 1.6, -3.3 + i * 1.1);
      mesh.visible = false;
      this.storedTiles.push({ mesh, material });
    }
  }
  tile(
    o: ClusterObjects,
    g: THREE.Group,
    material: THREE.MeshStandardMaterial,
    x: number,
    z: number,
  ) {
    return o.box(g, 2.3, 0.22, 0.8, x, 0.78, z, material, 0.05);
  }

  buildApp() {
    const part = this.makePart('app', 1.6, 3.2);
    this.platform(part, 'app', 5, 5, 'app');
    const g = part.body,
      o = part.objects;
    o.box(g, 2.6, 0.15, 1.55, 0, 0.63, 0.2, 0x597d6c, 0.07);
    o.box(g, 2.45, 1.6, 0.15, 0, 1.51, -0.32, o.mat(C.dark), 0.07);
    o.box(g, 2.12, 1.24, 0.025, 0, 1.54, -0.23, 0xf2f6ef, 0.025);
    // A chat: the question bubble, and an answer bubble once there is one.
    o.box(g, 1.1, 0.22, 0.03, 0.35, 1.9, -0.2, 0x668bb7, 0.04);
    this.answerCard = o.box(g, 1.4, 0.42, 0.03, -0.2, 1.4, -0.2, C.green, 0.04);
    this.answerCard.visible = false;
    for (let k = 0; k < 6; k++)
      o.box(g, 0.23, 0.025, 0.4, -0.87 + k * 0.35, 0.73, 0.45, 0xb5c7b6, 0.025);
  }

  buildLlm() {
    const part = this.makePart('llm', 1.8, 3.4);
    this.platform(part, 'llm', 5, 5, 'app');
    const g = part.body,
      o = part.objects;
    o.box(g, 1.2, 0.5, 1.2, 0, 0.85, 0, 0x597d6c, 0.08);
    const material = o.mat(C.purple);
    this.llmCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), material);
    this.llmCore.position.y = 2.0;
    this.llmCore.castShadow = true;
    g.add(this.llmCore);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 8, 40), material);
    halo.position.y = 2.0;
    halo.rotation.x = Math.PI / 2.4;
    g.add(halo);
  }

  isVisible(id: RagPart, state: RagModel) {
    return id === 'sources' ? true : state.layers[id];
  }

  protected tick(dt: number) {
    if (this.llmCore && !this.reduced) this.llmCore.rotation.y += dt * 0.6;
  }

  protected applyState() {
    if (!this.frame) return;
    const { state } = this.frame;
    for (const [id, part] of this.parts) part.group.visible = this.isVisible(id, state);
    this.pendingTiles.forEach((tile, i) => (tile.visible = i < state.pending.length));
    // The embedder shows the question's vector once asked, else the last chunk embedded.
    const shown =
      state.queryVector ??
      state.embedded[0]?.embedding ??
      state.stored.find((c) => state.refreshed.includes(c._id))?.embedding ??
      null;
    this.bars.forEach((bar, i) => (bar.scale.y = shown ? 0.1 + shown[i] * 2.2 : 0.05));
    const hits = new Set(state.hits.map((hit) => hit._id));
    this.storedTiles.forEach(({ mesh, material }, i) => {
      const chunk = state.stored[i];
      mesh.visible = !!chunk;
      if (!chunk) return;
      const hit = hits.has(chunk._id);
      const excluded = !!state.filter && chunk.product !== state.filter.product;
      material.color.setHex(PRODUCT_COLOR[chunk.product]);
      material.emissive.setHex(hit ? C.orange : PRODUCT_COLOR[chunk.product]);
      material.emissiveIntensity = hit ? 0.55 : 0;
      material.opacity = excluded ? 0.25 : 1;
      mesh.position.y = 0.78 + (hit ? 0.45 : 0);
    });
    this.voyage!.visible = state.embedding === 'auto' && state.indexes.length > 0;
    this.vectorIndex!.visible = state.indexes.some((i) => i.type === 'vectorSearch');
    this.textIndex!.visible = state.indexes.some((i) => i.type === 'search');
    this.answerCard!.visible = !!state.answer;
    const doc = state.docs.find((d) => d.id === 'kb-101');
    (this.pages[0].material as THREE.MeshStandardMaterial).color.setHex(
      doc && doc.version > 1 ? 0xdff3e6 : 0xf8faf6,
    );

    const roles: Record<RagPart, string> = {
      sources: `${state.docs.length} documents`,
      chunker: 'Split + metadata',
      embedder: 'One model, both sides',
      atlas: state.indexes.length
        ? (state.embedding === 'auto' ? 'autoEmbed' : 'vectorSearch') +
          (state.indexes.some((i) => i.type === 'search') ? ' + search' : '')
        : 'knowledge.chunks',
      app:
        state.mode === 'vector'
          ? 'Semantic'
          : state.mode === 'filtered'
            ? 'Filtered'
            : 'Hybrid',
      llm: 'Grounded',
    };
    const notes: Record<RagPart, string> = {
      sources: state.refreshed.length ? 'kb-101 revised' : '',
      chunker: state.pending.length ? `${state.pending.length} chunks` : 'idle',
      embedder: state.queryVector
        ? 'question vector'
        : state.embedded.length
          ? `${state.embedded.length} vectors`
          : 'idle',
      atlas: `${state.stored.length} chunks${state.hits.length ? ` · ${state.hits.length} hits` : ''}`,
      app: state.answer
        ? `${state.answer.citations.length} citations`
        : state.hits.length
          ? `top ${state.hits.length} retrieved`
          : state.question
            ? 'question asked'
            : '',
      llm: state.answer
        ? 'answered'
        : state.context.length
          ? `${state.context.length} passages`
          : '',
    };
    for (const id of this.parts.keys())
      this.setLabel(id, NAMES[id], roles[id], notes[id], { primary: id === 'atlas' });
  }
}

export type { RagFlow };
