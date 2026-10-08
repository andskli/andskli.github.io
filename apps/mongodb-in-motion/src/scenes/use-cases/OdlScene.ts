import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type {
  ConsumerId,
  OdlFlow,
  OdlModel,
  OdlStep,
  Part,
  SourceId,
} from '../../lessons/use-cases/types.ts';
import {
  LOAD_HIGH,
  LOAD_MID,
  loadLevel,
} from '../../lessons/use-cases/odl/operations.ts';
import { ClusterObjects } from '../cluster/objects.ts';
import { C } from '../cluster/palette.ts';
import { disposeObjectTree } from '../shared/resources.ts';

export interface OdlFrame {
  state: OdlModel;
  step: OdlStep | null;
  progress: number;
  playing: boolean;
  selected: Part | null;
  follow: boolean;
}

const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SOURCES: SourceId[] = ['crm', 'rdbms', 'api'];
const CONSUMERS: ConsumerId[] = ['app', 'analytics', 'ai'];
const POS: Record<Part, THREE.Vector3> = {
  crm: vec(-15, 0, -6.2),
  rdbms: vec(-15, 0, 0),
  api: vec(-15, 0, 6.2),
  cdc: vec(-7.5, 0, -3.1),
  batch: vec(-7.5, 0, 6.2),
  odl: vec(2, 0, 0),
  app: vec(13, 0, -6.2),
  analytics: vec(13, 0, 0),
  ai: vec(13, 0, 6.2),
};
const NAMES: Record<Part, string> = {
  crm: 'CRM',
  rdbms: 'Legacy RDBMS',
  api: 'Partner API',
  cdc: 'CDC pipeline',
  batch: 'Micro-batch job',
  odl: 'MongoDB ODL',
  app: 'Operational app',
  analytics: 'Analytics',
  ai: 'AI agent',
};
const flowColors: Record<OdlFlow['kind'], number> = {
  cdc: 0x008d68,
  batch: 0xdc8736,
  read: 0x668bb7,
  write: 0x9670c5,
  direct: 0xc77b6a,
};
const LOCKED = 0x9aa8a0;
const LOAD_GREEN = new THREE.Color(C.green),
  LOAD_AMBER = new THREE.Color(0xe8a65a),
  LOAD_RED = new THREE.Color(0xd9534f);
/** Green when protected, amber when busy, red when overloaded; blended between. */
function loadColor(load: number, out = new THREE.Color()) {
  if (load <= LOAD_MID) return out.copy(LOAD_GREEN);
  if (load <= LOAD_HIGH)
    return out
      .copy(LOAD_GREEN)
      .lerp(LOAD_AMBER, (load - LOAD_MID) / (LOAD_HIGH - LOAD_MID));
  return out.copy(LOAD_AMBER).lerp(LOAD_RED, Math.min(1, (load - LOAD_HIGH) / 35));
}
const CONSUMER_COLOR: Record<ConsumerId, number> = {
  app: C.green,
  analytics: C.orange,
  ai: C.purple,
};
const COLLECTIONS = ['crm_customers', 'rdbms_accounts', 'partner_shipments', 'customers'];

interface Route {
  curve: THREE.CatmullRomCurve3;
  mesh: THREE.Mesh;
  active: THREE.Mesh;
  show: (model: OdlModel) => boolean;
}
interface PartObject {
  group: THREE.Group;
  body: THREE.Group;
  ring: THREE.Mesh;
  label: HTMLElement;
  objects: ClusterObjects;
}

/**
 * Renders immutable frames from UseCasesView. Hubs, lanes and consumers appear as the
 * lesson introduces them; the lesson clock stays in React.
 */
export class OdlScene {
  renderer: THREE.WebGLRenderer;
  labels = new CSS2DRenderer();
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  container: HTMLElement;
  world = new THREE.Group();
  network = new THREE.Group();
  particles = new THREE.Group();
  parts = new Map<Part, PartObject>();
  routes = new Map<string, Route>();
  packets: THREE.Mesh[] = [];
  packetGeometry = new THREE.SphereGeometry(0.115, 12, 8);
  bars = new Map<SourceId, THREE.Mesh>();
  /** Per source: a tinted base pad, and the colour it is easing toward. */
  pads = new Map<
    SourceId,
    { material: THREE.MeshStandardMaterial; target: THREE.Color; load: number }
  >();
  consumerAccents = new Map<ConsumerId, THREE.MeshStandardMaterial>();
  cdcTiles: THREE.Mesh[] = [];
  batchTiles: THREE.Mesh[] = [];
  odlTiles: THREE.Mesh[] = [];
  frame: OdlFrame | null = null;
  lastState: OdlModel | null = null;
  lastSelected: Part | null = null;
  lastStep: OdlStep | null = null;
  floor: THREE.Mesh;
  ray = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  pointerDown = { x: 0, y: 0 };
  selection: (id: Part) => void;
  animationTarget: THREE.Vector3 | null = null;
  targetZoom = 1;
  lastTime = 0;
  raf = 0;
  disposed = false;
  resizeObserver: ResizeObserver;
  /** Pixels at the right edge covered by a side panel; the scene recenters in the rest. */
  inset = 0;
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(container: HTMLElement, select: (id: Part) => void) {
    this.container = container;
    this.selection = select;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.domElement.className = 'world-canvas';
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D operational data layer. Drag to orbit, scroll to zoom, or select a labeled part.',
    );
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    container.append(this.renderer.domElement);
    this.labels.domElement.className = 'world-labels';
    container.append(this.labels.domElement);
    this.scene.background = new THREE.Color(C.floor);
    this.scene.fog = new THREE.Fog(C.floor, 90, 190);
    this.camera = new THREE.OrthographicCamera(-20, 20, 16, -16, 0.1, 220);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 3.5;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.addEventListener('start', () => {
      this.animationTarget = null;
      this.targetZoom = this.camera.zoom;
    });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa1b8a4, 2.6));
    const sun = new THREE.DirectionalLight(0xfffaf0, 4);
    sun.position.set(-12, 28, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -34,
      right: 34,
      top: 30,
      bottom: -30,
      near: 1,
      far: 90,
    });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc8e9f3, 1.4);
    fill.position.set(18, 10, -20);
    this.scene.add(fill);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ color: C.floor, roughness: 1 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.25;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    const grid = new THREE.GridHelper(140, 116, 0xc7d3c7, 0xd1dcd0);
    grid.position.y = -0.24;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.48;
    this.scene.add(grid);
    this.scene.add(this.world, this.network, this.particles);
    for (let i = 0; i < 16; i++) {
      const p = new THREE.Mesh(
        this.packetGeometry,
        new THREE.MeshStandardMaterial({
          color: C.green,
          emissive: C.green,
          emissiveIntensity: 0.4,
          roughness: 0.3,
        }),
      );
      p.visible = false;
      this.particles.add(p);
      this.packets.push(p);
    }
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.build();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.home();
    this.animate(0);
  }
  contextLost = (e: Event) => {
    e.preventDefault();
    this.container.dispatchEvent(
      new CustomEvent('scene-error', {
        detail: 'Graphics paused. Reload the page to restore the 3D view.',
      }),
    );
  };

  /** Each part owns a group at the origin; its contents are placed at absolute coordinates. */
  makePart(id: Part, ringRadius: number, labelY: number) {
    const group = new THREE.Group();
    group.userData.partId = id;
    this.world.add(group);
    const objects = new ClusterObjects(
      group,
      new Map(),
      () => {},
      () => {},
    );
    const body = new THREE.Group();
    body.position.copy(POS[id]);
    group.add(body);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, 0.045, 8, 60),
      new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.56;
    body.add(ring);
    const { div } = objects.label(body, '', 'process-label', vec(0, labelY, 0));
    div.dataset.node = id;
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selection(id);
    });
    const part = { group, body, ring, label: div, objects };
    this.parts.set(id, part);
    return part;
  }
  platform(
    part: PartObject,
    id: Part,
    w: number,
    d: number,
    kind: 'app' | 'shard' | 'config',
  ) {
    part.objects.platform('', '', POS[id].x, POS[id].z, w, d, kind);
  }
  island(part: PartObject, id: Part, name: string, subtitle: string, depth: number) {
    const { div } = part.objects.label(
      part.group,
      `<strong>${name}</strong><span>${subtitle}</span>`,
      'island-label',
      vec(POS[id].x, 0.45, POS[id].z + depth / 2 + 0.45),
    );
    div.dataset.group = 'config';
  }

  build() {
    this.buildSources();
    this.buildLanes();
    this.buildOdl();
    this.buildConsumers();
    const route = (from: Part, to: Part, kind: OdlFlow['kind'], show: Route['show']) =>
      this.getRoute(from, to, kind, show);
    route('crm', 'cdc', 'cdc', (m) => m.layers.cdc);
    route('rdbms', 'cdc', 'cdc', (m) => m.layers.cdc);
    route('api', 'batch', 'batch', (m) => m.layers.batch);
    route('cdc', 'odl', 'cdc', (m) => m.layers.cdc);
    route('batch', 'odl', 'batch', (m) => m.layers.batch);
    for (const id of CONSUMERS)
      route('odl', id, 'read', (m) => m.consumers.find((c) => c.id === id)!.unlocked);
  }

  buildSources() {
    // CRM: a SaaS cloud.
    {
      const part = this.makePart('crm', 1.6, 3.2);
      this.platform(part, 'crm', 5, 5, 'app');
      const o = part.objects,
        g = part.body;
      const cloud = o.mat(0xe8f1fb, 0.5);
      for (const [x, y, z, r] of [
        [-0.6, 1.5, 0, 0.62],
        [0.15, 1.85, 0.1, 0.78],
        [0.85, 1.5, -0.05, 0.58],
        [0.15, 1.45, 0.45, 0.6],
      ] as const) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), cloud);
        s.position.set(x, y, z);
        s.castShadow = true;
        g.add(s);
      }
      o.box(g, 2.2, 0.16, 1.5, 0, 0.62, 0, 0xc9d9ea, 0.07);
      o.box(g, 1.3, 0.12, 0.3, 0, 0.78, 0.9, 0x668bb7, 0.04);
    }
    // Legacy RDBMS: stacked database discs.
    {
      const part = this.makePart('rdbms', 1.6, 3.5);
      this.platform(part, 'rdbms', 5, 5, 'app');
      const g = part.body,
        o = part.objects;
      for (let i = 0; i < 3; i++) {
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(1.05, 1.05, 0.62, 36),
          o.mat(0xf0e6d8, 0.6),
        );
        disc.position.y = 0.95 + i * 0.7;
        disc.castShadow = true;
        g.add(disc);
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(1.07, 1.07, 0.1, 36),
          o.mat(0xc9703a, 0.5),
        );
        band.position.y = 1.13 + i * 0.7;
        g.add(band);
      }
    }
    // Partner API: a gateway with plugs.
    {
      const part = this.makePart('api', 1.6, 3.2);
      this.platform(part, 'api', 5, 5, 'app');
      const g = part.body,
        o = part.objects;
      o.box(g, 2.3, 1.7, 1.3, 0, 1.5, 0, 0xece8f4, 0.14);
      o.box(g, 2.4, 0.2, 1.4, 0, 2.42, 0, 0x8a77b4, 0.06);
      o.box(g, 1.7, 0.12, 0.04, 0, 1.8, 0.67, 0x5d4d82, 0.02);
      o.box(g, 1.1, 0.12, 0.04, -0.3, 1.5, 0.67, 0x8a77b4, 0.02);
      o.box(g, 1.4, 0.12, 0.04, -0.15, 1.2, 0.67, 0x8a77b4, 0.02);
      for (const x of [-0.5, 0.5]) {
        const plug = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 0.5, 14),
          o.mat(0x5d4d82),
        );
        plug.rotation.z = Math.PI / 2;
        plug.position.set(1.4, 1.2 + x * 0.5, 0);
        g.add(plug);
      }
    }
    // Load meters: how much of each system's capacity downstream readers consume.
    for (const id of SOURCES) {
      const part = this.parts.get(id)!;
      const o = part.objects;
      o.box(part.body, 0.3, 2.6, 0.3, -2.0, 1.55, 1.6, 0xdde5dc, 0.06);
      const geometry = new THREE.BoxGeometry(0.2, 1, 0.2);
      geometry.translate(0, 0.5, 0);
      const fill = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: C.green, roughness: 0.5 }),
      );
      fill.position.set(-2.0, 0.3, 1.6);
      part.body.add(fill);
      this.bars.set(id, fill);
      // A tinted pad under the system shows how hard it is being hit.
      const material = new THREE.MeshStandardMaterial({
        color: C.green,
        emissive: C.green,
        emissiveIntensity: 0.2,
        roughness: 0.55,
        transparent: true,
        opacity: 0.8,
      });
      const pad = o.box(part.body, 4.5, 0.07, 4.5, 0, 0.5, 0, material, 0.12);
      pad.castShadow = false;
      this.pads.set(id, { material, target: new THREE.Color(C.green), load: 0 });
    }
  }

  buildLanes() {
    // CDC: a pipe carrying change records.
    {
      const part = this.makePart('cdc', 1.9, 3.3);
      this.platform(part, 'cdc', 5.6, 3.8, 'config');
      this.island(part, 'cdc', 'CDC PIPELINE', 'Log-based · Kafka', 3.8);
      const g = part.body,
        o = part.objects;
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 4.2, 24),
        o.mat(0xe6e0f1, 0.5),
      );
      pipe.rotation.z = Math.PI / 2;
      pipe.position.y = 1.0;
      pipe.castShadow = true;
      g.add(pipe);
      for (const x of [-1.5, -0.5, 0.5, 1.5]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.52, 0.07, 8, 28),
          o.mat(C.purple, 0.5),
        );
        ring.rotation.y = Math.PI / 2;
        ring.position.set(x, 1.0, 0);
        g.add(ring);
      }
      for (let i = 0; i < 2; i++) {
        const tile = o.box(g, 0.7, 0.3, 0.7, -0.7 + i * 1.4, 1.75, 0, C.green, 0.05);
        tile.visible = false;
        this.cdcTiles.push(tile);
      }
    }
    // Micro-batch: a scheduled job with a clock.
    {
      const part = this.makePart('batch', 1.9, 3.3);
      this.platform(part, 'batch', 5.6, 3.8, 'config');
      this.island(part, 'batch', 'MICRO-BATCH', 'Scheduled poll', 3.8);
      const g = part.body,
        o = part.objects;
      o.box(g, 2.6, 1.3, 1.5, -0.4, 1.2, 0, 0xf3e8d7, 0.12);
      o.box(g, 2.7, 0.16, 1.6, -0.4, 1.9, 0, C.orange, 0.05);
      const face = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.12, 32),
        o.mat(0xfffaf0, 0.4),
      );
      face.rotation.x = Math.PI / 2;
      face.position.set(1.6, 1.55, 0);
      g.add(face);
      o.box(g, 0.06, 0.4, 0.05, 1.6, 1.7, 0.08, C.dark, 0.01);
      o.box(g, 0.3, 0.06, 0.05, 1.72, 1.55, 0.08, C.dark, 0.01);
      const tile = o.box(g, 0.7, 0.3, 0.7, -0.4, 2.15, 0, C.orange, 0.05);
      tile.visible = false;
      this.batchTiles.push(tile);
    }
  }

  buildOdl() {
    const part = this.makePart('odl', 2.6, 4.4);
    this.platform(part, 'odl', 9, 12.4, 'shard');
    this.island(part, 'odl', 'OPERATIONAL DATA LAYER', 'MongoDB Atlas', 12.4);
    const g = part.body,
      o = part.objects;
    const accent = o.mat(C.green);
    for (const z of [-3.5, 0, 3.5]) {
      o.box(g, 1.9, 0.16, 1.85, 0, 0.56, z, 0xe0e8dd, 0.1);
      o.box(g, 1.35, 2.15, 1.16, 0, 1.74, z, 0xeef3e9, 0.13);
      o.box(g, 1.43, 0.2, 1.24, 0, 2.8, z, accent, 0.06);
      o.box(g, 0.97, 1.47, 0.035, 0, 1.68, z + 0.591, C.dark, 0.015);
      for (let k = 0; k < 4; k++) {
        o.box(g, 0.76, 0.17, 0.045, -0.025, 2.2 - k * 0.32, z + 0.625, 0x34594d, 0.015);
        o.box(g, 0.055, 0.055, 0.025, 0.285, 2.2 - k * 0.32, z + 0.66, 0x9df0b8, 0.01);
      }
    }
    // Collections: three raw trays and the unified one.
    COLLECTIONS.forEach((name, i) => {
      const unified = name === 'customers';
      const tile = o.box(
        g,
        unified ? 1.9 : 1.3,
        unified ? 0.22 : 0.16,
        1.0,
        2.8 + (unified ? 0 : 0),
        0.7 + (unified ? 0 : 0),
        -3.3 + i * 2.2,
        unified ? C.green : [0x668bb7, 0xc9703a, 0x8a77b4][i],
        0.05,
      );
      tile.visible = false;
      this.odlTiles.push(tile);
    });
  }

  buildConsumers() {
    const laptop = (
      g: THREE.Group,
      o: ClusterObjects,
      accent: THREE.MeshStandardMaterial,
    ) => {
      o.box(g, 2.6, 0.15, 1.55, 0, 0.63, 0.2, 0x597d6c, 0.07);
      o.box(g, 2.45, 1.6, 0.15, 0, 1.51, -0.32, o.mat(C.dark), 0.07);
      o.box(g, 2.12, 1.24, 0.025, 0, 1.54, -0.23, accent, 0.025);
      for (let k = 0; k < 6; k++)
        o.box(g, 0.23, 0.025, 0.4, -0.87 + k * 0.35, 0.73, 0.45, 0xb5c7b6, 0.025);
    };
    for (const id of CONSUMERS) {
      const part = this.makePart(id, 1.6, 3.2);
      this.platform(part, id, 5, 5, 'app');
      const accent = part.objects.mat(CONSUMER_COLOR[id]);
      this.consumerAccents.set(id, accent);
      const g = part.body,
        o = part.objects;
      if (id === 'app') laptop(g, o, accent);
      if (id === 'analytics') {
        o.box(g, 2.6, 0.15, 1.5, 0, 0.63, 0, 0x597d6c, 0.07);
        [0.8, 1.4, 1.1, 1.9].forEach((h, k) =>
          o.box(g, 0.42, h, 0.5, -0.95 + k * 0.63, 0.7 + h / 2, 0, accent, 0.05),
        );
      }
      if (id === 'ai') {
        o.box(g, 1.2, 0.5, 1.2, 0, 0.85, 0, 0x597d6c, 0.08);
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), accent);
        core.position.y = 2.0;
        core.castShadow = true;
        g.add(core);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 8, 40), accent);
        halo.position.y = 2.0;
        halo.rotation.x = Math.PI / 2.4;
        g.add(halo);
      }
    }
  }

  /** `direct` routes fan out from sources to consumers; give each a distinct arc. */
  getRoute(from: Part, to: Part, kind: OdlFlow['kind'], show?: Route['show']) {
    const key = from + '-' + to,
      reverseKey = to + '-' + from;
    if (this.routes.has(key)) return { route: this.routes.get(key)!, reverse: false };
    if (this.routes.has(reverseKey))
      return { route: this.routes.get(reverseKey)!, reverse: true };
    const start = POS[from].clone(),
      end = POS[to].clone();
    start.y = end.y = 1.0;
    const mid = start.clone().lerp(end, 0.5);
    const lift =
      kind === 'direct'
        ? 1.6 +
          SOURCES.indexOf(from as SourceId) * 0.9 +
          CONSUMERS.indexOf(to as ConsumerId) * 0.35
        : 0.55;
    mid.y += lift;
    const curve = new THREE.CatmullRomCurve3(
      [start, mid, end],
      false,
      'centripetal',
      0.35,
    );
    const base = !!show;
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 50, 0.068, 7, false),
      new THREE.MeshStandardMaterial({
        color: C.wire,
        roughness: 0.65,
        transparent: true,
        opacity: base ? 0.9 : 0.35,
      }),
    );
    mesh.castShadow = true;
    this.network.add(mesh);
    const active = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 50, 0.093, 7, false),
      new THREE.MeshStandardMaterial({
        color: flowColors[kind],
        emissive: flowColors[kind],
        emissiveIntensity: 0.15,
        roughness: 0.4,
        transparent: true,
        opacity: 0.9,
      }),
    );
    active.visible = false;
    this.network.add(active);
    const route: Route = { curve, mesh, active, show: show ?? (() => false) };
    this.routes.set(key, route);
    return { route, reverse: false };
  }

  update(frame: OdlFrame) {
    this.frame = frame;
    if (frame.step !== this.lastStep) {
      if (frame.follow && frame.step?.focus.length) {
        const center = new THREE.Vector3();
        frame.step.focus.forEach((id) => center.add(POS[id]));
        center.divideScalar(frame.step.focus.length);
        this.animationTarget = center;
        this.targetZoom = this.container.clientWidth < 650 ? 2 : 1.3;
      }
      this.lastStep = frame.step;
    }
    // Snapshot identity is the invalidation signal; published models are never mutated.
    if (frame.state !== this.lastState || frame.selected !== this.lastSelected) {
      this.applyState();
      this.lastState = frame.state;
      this.lastSelected = frame.selected;
    }
  }

  isVisible(id: Part, state: OdlModel) {
    if (id === 'cdc') return state.layers.cdc;
    if (id === 'batch') return state.layers.batch;
    if (id === 'odl') return state.layers.odl;
    return true;
  }

  applyState() {
    if (!this.frame) return;
    const { state, selected } = this.frame;
    for (const [id, part] of this.parts) part.group.visible = this.isVisible(id, state);
    // Source load meters.
    for (const source of state.sources) {
      const bar = this.bars.get(source.id)!;
      bar.scale.y = Math.max(0.05, (source.load / 100) * 2.3);
      const pad = this.pads.get(source.id)!;
      pad.load = source.load;
      loadColor(source.load, pad.target);
      (bar.material as THREE.MeshStandardMaterial).color.copy(pad.target);
    }
    // Lanes and collections.
    this.cdcTiles.forEach((tile, i) => (tile.visible = i < state.cdc.length));
    this.batchTiles.forEach((tile, i) => (tile.visible = i < state.batch.length));
    COLLECTIONS.forEach(
      (name, i) => (this.odlTiles[i].visible = !!state.collections[name]),
    );
    // Consumers: grey while they still query the sources directly.
    for (const consumer of state.consumers)
      this.consumerAccents
        .get(consumer.id)!
        .color.setHex(consumer.unlocked ? CONSUMER_COLOR[consumer.id] : LOCKED);
    // Labels.
    const roles: Record<Part, string> = {
      // Sources and consumers stack in columns, so they keep to two label lines.
      crm: '',
      rdbms: '',
      api: '',
      cdc: 'Log-based',
      batch: 'Every ' + state.batchInterval,
      odl:
        state.level === 'read-write'
          ? 'Read-write'
          : state.level === 'enriched'
            ? 'Enriched'
            : 'Read-only',
      app: '',
      analytics: '',
      ai: '',
    };
    const loadClasses: Partial<Record<Part, string>> = {};
    const notes: Record<Part, string> = {
      crm: '',
      rdbms: '',
      api: '',
      cdc: state.cdc.length ? `${state.cdc.length} in flight` : 'idle',
      batch: state.batchRuns ? `${state.batchRuns} poll` : 'waiting',
      odl: `${Object.keys(state.collections).length} collections`,
      app: '',
      analytics: '',
      ai: '',
    };
    for (const source of state.sources) {
      notes[source.id] = `load ${source.load}% · ${source.latency}`;
      loadClasses[source.id] = 'load-' + loadLevel(source.load);
    }
    for (const consumer of state.consumers) {
      roles[consumer.id] = consumer.unlocked
        ? 'ODL · 1 query'
        : `Direct · ${state.sources.length} queries`;
    }
    for (const [id, part] of this.parts) {
      part.label.classList.toggle('is-selected', selected === id);
      part.label.innerHTML = `<button type="button" aria-label="Inspect ${NAMES[id]}"><span class="node-name"></span><span class="node-role ${id === 'odl' ? 'primary' : ''}"><i></i><u></u></span><em class="label-value"></em></button>`;
      part.label.querySelector('.node-name')!.textContent = NAMES[id];
      part.label.querySelector('u')!.textContent = roles[id];
      const note = part.label.querySelector('.label-value')!;
      note.textContent = notes[id];
      if (loadClasses[id]) note.classList.add(loadClasses[id]!);
      if (!notes[id]) note.remove();
      if (!roles[id]) part.label.querySelector('.node-role')!.remove();
    }
  }

  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const inset = w > 900 ? this.inset : 0;
    // Fit the scene to the uncovered width, then shift it left within the full canvas.
    const height = Math.max(22, (w < 650 ? 46 : 41) / ((w - inset) / h));
    const aspect = w / h;
    this.camera.left = (-height * aspect) / 2;
    this.camera.right = (height * aspect) / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    // A positive y offset moves the scene up, clear of the playback and code panels.
    this.camera.setViewOffset(w, h, inset / 2, w > 800 ? h * 0.095 : h * 0.07, w, h);
    this.camera.updateProjectionMatrix();
  }
  setInset(px: number) {
    if (px === this.inset) return;
    this.inset = px;
    this.resize();
  }
  home() {
    this.animationTarget = vec(-0.5, 0, 1);
    this.targetZoom = 1;
    this.controls.target.copy(this.animationTarget);
    this.camera.position.copy(
      this.animationTarget
        .clone()
        .add(this.container.clientWidth < 650 ? vec(6, 30, 30) : vec(4, 26, 33)),
    );
    this.camera.zoom = 1;
    this.resize();
  }
  focus(id: Part) {
    this.animationTarget = POS[id].clone();
    this.targetZoom = 1.5;
  }
  zoomBy(factor: number) {
    this.targetZoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 0.5, 3.5);
    this.animationTarget = this.controls.target.clone();
  }
  onPointerDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY };
  };
  onPointerUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y) > 6)
      return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
    for (const hit of this.ray.intersectObjects(this.world.children, true)) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData.partId) {
          // Raycasting ignores `visible`, so skip parts that have not appeared yet.
          if (!obj.visible) break;
          this.selection(obj.userData.partId);
          return;
        }
        obj = obj.parent;
      }
    }
  };
  animate = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const alpha = this.reduced ? 1 : 1 - Math.exp(-5 * dt);
    if (this.animationTarget) {
      const diff = this.animationTarget
        .clone()
        .sub(this.controls.target)
        .multiplyScalar(alpha);
      this.controls.target.add(diff);
      this.camera.position.add(diff);
      this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, this.targetZoom, alpha);
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
    // Ease each source's tint toward its current load; pulse the ones that are overloaded.
    const ease = this.reduced ? 1 : 1 - Math.exp(-4 * dt);
    this.pads.forEach((pad) => {
      pad.material.color.lerp(pad.target, ease);
      pad.material.emissive.copy(pad.material.color);
      pad.material.emissiveIntensity =
        pad.load > LOAD_HIGH && !this.reduced
          ? 0.35 + 0.3 * Math.sin(now / 280)
          : pad.load > LOAD_MID
            ? 0.3
            : 0.15;
    });
    this.routes.forEach((r) => {
      r.active.visible = false;
      r.mesh.visible = false;
    });
    this.packets.forEach((p) => (p.visible = false));
    if (this.frame) {
      const { step, progress, selected, state } = this.frame;
      this.routes.forEach((r) => (r.mesh.visible = r.show(state)));
      const focus = step?.focus ?? [];
      this.parts.forEach((part, id) => {
        const mat = part.ring.material as THREE.MeshBasicMaterial;
        mat.opacity = focus.includes(id) || selected === id ? 0.8 : 0;
      });
      const flows = step?.flows ?? [];
      // A full mesh would run out of markers; give each flow one when there are many.
      const trails = flows.length > 5 ? 1 : 3;
      let count = 0;
      for (const flow of flows) {
        const { route, reverse } = this.getRoute(flow.from, flow.to, flow.kind);
        route.mesh.visible = true;
        route.active.visible = true;
        const mat = route.active.material as THREE.MeshStandardMaterial;
        // Direct queries are coloured by the load on the system they hit.
        const tint =
          flow.kind === 'direct' && this.pads.has(flow.from as SourceId)
            ? this.pads.get(flow.from as SourceId)!.target.getHex()
            : flowColors[flow.kind];
        mat.color.setHex(tint);
        mat.emissive.setHex(tint);
        for (let trail = 0; trail < trails && count < this.packets.length; trail++) {
          // Match SNAPSHOT_CHANGE_PROGRESS: the leading marker arrives at 0.76.
          const p = progress / 0.76 - trail * 0.065;
          if (p < 0 || p > 1) continue;
          const packet = this.packets[count++];
          packet.visible = !this.reduced;
          packet.position.copy(route.curve.getPoint(reverse ? 1 - p : p));
          packet.position.y += 0.075;
          packet.scale.setScalar(trail ? 1 - trail * 0.22 : 1.15);
          const pm = packet.material as THREE.MeshStandardMaterial;
          pm.color.setHex(tint);
          pm.emissive.setHex(tint);
        }
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    disposeObjectTree(this.world);
    disposeObjectTree(this.network);
    this.packets.forEach((p) => (p.material as THREE.Material).dispose());
    this.packetGeometry.dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
