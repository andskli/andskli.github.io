import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type {
  ChangeStreamModel,
  FeatureFlow,
  FeatureStep,
  OperationType,
  Part,
} from '../../lessons/features/types.ts';
import { ClusterObjects } from '../cluster/objects.ts';
import { C } from '../cluster/palette.ts';
import { disposeObjectTree } from '../shared/resources.ts';

export interface FeatureFrame {
  state: ChangeStreamModel;
  step: FeatureStep | null;
  progress: number;
  playing: boolean;
  selected: Part | null;
  follow: boolean;
}

const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SLOTS = 7;
const slotX = (i: number) => -2.2 + i * 1.4;
const partX: Record<Part, number> = {
  producer: -11.5,
  primary: -5.8,
  oplog: 2,
  consumer: 11.8,
};
const flowColors: Record<FeatureFlow['kind'], number> = {
  write: 0x008d68,
  oplog: 0x9670c5,
  event: 0xdc8736,
  watch: 0x668bb7,
};
const opColors: Record<OperationType, number> = {
  insert: 0x5fbf8e,
  update: 0xe8a65a,
  delete: 0xd9806a,
};
const partNames: Record<Part, string> = {
  producer: 'Application',
  primary: 'mongod',
  oplog: 'Oplog',
  consumer: 'Consumer',
};

interface PartObject {
  group: THREE.Group;
  ring: THREE.Mesh;
  label?: HTMLElement;
}
interface Route {
  curve: THREE.CatmullRomCurve3;
  mesh: THREE.Mesh;
  active: THREE.Mesh;
  base: boolean;
}
interface Slot {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  label: HTMLElement;
}

/**
 * Renders immutable frames from FeaturesView. The lesson clock lives in React; this
 * class only draws the oplog rail, markers, packets and DOM labels for the frame.
 */
export class ChangeStreamScene {
  renderer: THREE.WebGLRenderer;
  labels = new CSS2DRenderer();
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  container: HTMLElement;
  world = new THREE.Group();
  network = new THREE.Group();
  particles = new THREE.Group();
  objects: ClusterObjects;
  parts = new Map<Part, PartObject>();
  routes = new Map<string, Route>();
  slots: Slot[] = [];
  packets: THREE.Mesh[] = [];
  packetGeometry = new THREE.SphereGeometry(0.115, 12, 8);
  cursor!: { group: THREE.Group; label: HTMLElement };
  token!: { group: THREE.Group; flag: THREE.MeshStandardMaterial; label: HTMLElement };
  cursorTarget = slotX(0);
  tokenTarget = slotX(0);
  inboxTiles: THREE.Mesh[] = [];
  tokenChip!: THREE.Mesh;
  oplogMeta!: HTMLElement;
  frame: FeatureFrame | null = null;
  lastState: ChangeStreamModel | null = null;
  lastSelected: Part | null = null;
  lastStep: FeatureStep | null = null;
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
    this.objects = new ClusterObjects(
      this.world,
      new Map(),
      () => {},
      () => {},
    );
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
      'Interactive 3D change stream. Drag to orbit, scroll to zoom, or select a labeled part.',
    );
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    container.append(this.renderer.domElement);
    this.labels.domElement.className = 'world-labels';
    container.append(this.labels.domElement);
    this.scene.background = new THREE.Color(C.floor);
    this.scene.fog = new THREE.Fog(C.floor, 75, 160);
    this.camera = new THREE.OrthographicCamera(-20, 20, 16, -16, 0.1, 200);
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
      left: -32,
      right: 32,
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
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: C.floor, roughness: 1 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.25;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    const grid = new THREE.GridHelper(120, 100, 0xc7d3c7, 0xd1dcd0);
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

  build() {
    const o = this.objects;
    o.platform('', '', partX.producer, 0, 4.3, 4.3, 'app');
    o.platform('PRIMARY', 'mongod · rs-a', partX.primary, 0, 4.5, 4.5, 'shard');
    o.platform('OPLOG', 'Capped · oldest → newest', partX.oplog, 0, 10.6, 4.4, 'config');
    o.platform('', '', partX.consumer, 0, 5.4, 4.8, 'app');
    this.addApp('producer', vec(partX.producer, 0, 0), false);
    this.addServer('primary', vec(partX.primary, 0, 0));
    this.addApp('consumer', vec(partX.consumer, 0, 0), true);
    this.buildOplog();
    this.buildMarkers();
    // Always-visible wiring: write path and the consumer's connection.
    this.getRoute('producer', 'primary', 'write', true);
    this.getRoute('primary', 'oplog', 'oplog', true);
    this.getRoute('oplog', 'consumer', 'event', true);
  }

  /** Part -> world point; the oplog has separate left (write) and right (read) ends. */
  anchor(part: Part, other: Part) {
    if (part !== 'oplog') return vec(partX[part], 0.68, 0);
    return vec(other === 'consumer' ? slotX(SLOTS - 1) + 1.4 : slotX(0) - 1.4, 0.9, 0);
  }
  getRoute(from: Part, to: Part, kind: FeatureFlow['kind'], base = false) {
    const key = from + '-' + to,
      reverseKey = to + '-' + from;
    if (this.routes.has(key)) return { route: this.routes.get(key)!, reverse: false };
    if (this.routes.has(reverseKey))
      return { route: this.routes.get(reverseKey)!, reverse: true };
    const start = this.anchor(from, to),
      end = this.anchor(to, from);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 0.55;
    const curve = new THREE.CatmullRomCurve3(
      [start, mid, end],
      false,
      'centripetal',
      0.35,
    );
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
    const route = { curve, mesh, active, base };
    this.routes.set(key, route);
    return { route, reverse: false };
  }

  makePart(id: Part, pos: THREE.Vector3, ringRadius: number) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.userData.partId = id;
    this.world.add(g);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, 0.045, 8, 60),
      new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.56;
    g.add(ring);
    const part: PartObject = { group: g, ring };
    this.parts.set(id, part);
    return part;
  }
  partLabel(part: PartObject, id: Part, y: number) {
    const { div } = this.objects.label(part.group, '', 'process-label', vec(0, y, 0));
    div.dataset.node = id;
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selection(id);
    });
    part.label = div;
  }
  addApp(id: Part, pos: THREE.Vector3, consumer: boolean) {
    const o = this.objects;
    const part = this.makePart(id, pos, 1.5);
    const g = part.group;
    const body = o.mat(C.dark);
    o.box(g, 2.6, 0.15, 1.55, 0, 0.63, 0.2, 0x597d6c, 0.07);
    o.box(g, 2.45, 1.6, 0.15, 0, 1.51, -0.32, body, 0.07);
    o.box(g, 2.12, 1.24, 0.025, 0, 1.54, -0.23, consumer ? 0xf0cf9a : 0x8fcdb0, 0.025);
    for (let k = 0; k < 4; k++)
      o.box(
        g,
        k === 0 ? 1.15 : 0.75,
        0.08,
        0.025,
        -0.3 + (k % 2) * 0.2,
        1.9 - k * 0.24,
        -0.2,
        k === 0 ? 0xfff3df : consumer ? 0xb27f3b : 0x316b52,
        0.015,
      );
    for (let k = 0; k < 6; k++)
      o.box(g, 0.23, 0.025, 0.4, -0.87 + k * 0.35, 0.73, 0.45, 0xb5c7b6, 0.025);
    this.partLabel(part, id, 2.85);
    if (consumer) {
      for (let i = 0; i < 6; i++) {
        const tile = o.box(
          g,
          0.95,
          0.14,
          0.6,
          2.05,
          0.7 + i * 0.17,
          0.75,
          0xe8a65a,
          0.04,
        );
        tile.visible = false;
        this.inboxTiles.push(tile);
      }
      this.tokenChip = o.box(g, 0.7, 0.2, 0.5, 2.05, 0.72, -0.85, C.orange, 0.05);
      this.tokenChip.visible = false;
    }
  }
  addServer(id: Part, pos: THREE.Vector3) {
    const o = this.objects;
    const part = this.makePart(id, pos, 1.13);
    const g = part.group;
    const accent = o.mat(C.green);
    o.box(g, 1.9, 0.16, 1.85, 0, 0.56, 0, 0xe0e8dd, 0.1);
    o.box(g, 1.35, 2.15, 1.16, 0, 1.74, 0, 0xeef3e9, 0.13);
    o.box(g, 1.43, 0.2, 1.24, 0, 2.8, 0, accent, 0.06);
    o.box(g, 0.97, 1.47, 0.035, 0, 1.68, 0.591, C.dark, 0.015);
    for (let k = 0; k < 4; k++) {
      o.box(g, 0.76, 0.17, 0.045, -0.025, 2.2 - k * 0.32, 0.625, 0x34594d, 0.015);
      o.box(g, 0.055, 0.055, 0.025, 0.285, 2.2 - k * 0.32, 0.66, 0x9df0b8, 0.01);
    }
    this.partLabel(part, id, 3.55);
  }

  buildOplog() {
    const part = this.makePart('oplog', vec(partX.oplog, 0, 0), 0.01);
    part.ring.visible = false;
    // Invisible hit area so the whole rail selects the oplog.
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(10.6, 0.6, 4.4),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(0, 0.6, 0);
    part.group.add(hit);
    for (let i = 0; i < SLOTS; i++) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xe2e9de,
        roughness: 0.7,
        metalness: 0.025,
      });
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(1.16, 0.42, 2.5, 2, 0.06),
        material,
      );
      mesh.position.set(slotX(i) - partX.oplog, 0.7, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      part.group.add(mesh);
      const { div } = this.objects.label(
        part.group,
        '',
        'oplog-slot-label',
        vec(slotX(i) - partX.oplog, 1.5, 0),
      );
      this.slots.push({ mesh, material, label: div });
    }
    const meta = this.objects.label(part.group, '', 'oplog-meta', vec(0, 0.45, -2.75));
    this.oplogMeta = meta.div;
  }

  buildMarkers() {
    // Cursor: where the stream has read to. Token: the position the consumer persisted.
    const cursorGroup = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.9, 20),
      new THREE.MeshStandardMaterial({ color: C.purple, roughness: 0.45 }),
    );
    cone.rotation.x = Math.PI;
    cone.position.y = 0;
    cone.castShadow = true;
    cursorGroup.add(cone);
    const cursorLabel = this.objects.label(
      cursorGroup,
      '<span>stream cursor</span>',
      'marker-label cursor-label',
      vec(0, 0.85, 0),
    );
    cursorGroup.position.set(slotX(0), 2.15, 0);
    this.world.add(cursorGroup);
    this.cursor = { group: cursorGroup, label: cursorLabel.div };

    const tokenGroup = new THREE.Group();
    const flagMaterial = new THREE.MeshStandardMaterial({
      color: C.orange,
      roughness: 0.5,
    });
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x7c6a52, roughness: 0.6 }),
    );
    pole.position.y = 0.8;
    tokenGroup.add(pole);
    const flag = new THREE.Mesh(
      new RoundedBoxGeometry(0.85, 0.5, 0.06, 2, 0.02),
      flagMaterial,
    );
    flag.position.set(0.45, 1.35, 0);
    flag.castShadow = true;
    tokenGroup.add(flag);
    const tokenLabel = this.objects.label(
      tokenGroup,
      '<span>saved token</span>',
      'marker-label token-label',
      vec(0.3, 1.95, 0),
    );
    tokenGroup.position.set(slotX(0), 0.9, -2.0);
    this.world.add(tokenGroup);
    this.token = { group: tokenGroup, flag: flagMaterial, label: tokenLabel.div };
  }

  update(frame: FeatureFrame) {
    this.frame = frame;
    if (frame.step !== this.lastStep) {
      if (frame.follow && frame.step?.focus.length) {
        const center = new THREE.Vector3();
        frame.step.focus.forEach((id) => center.add(vec(partX[id], 0, 0)));
        center.divideScalar(frame.step.focus.length);
        this.animationTarget = center;
        // A phone cannot show the whole line-up legibly, so follow mode zooms in much further.
        this.targetZoom = this.container.clientWidth < 650 ? 2.1 : 1.25;
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

  applyState() {
    if (!this.frame) return;
    const { state, selected } = this.frame;
    const fresh = new Set(state.fresh);
    this.slots.forEach((slot, i) => {
      const entry = state.oplog[i];
      slot.mesh.visible = true;
      if (!entry) {
        slot.material.color.setHex(0xe2e9de);
        slot.label.innerHTML = '';
        slot.label.className = 'oplog-slot-label';
        return;
      }
      const read = state.savedTs !== null && entry.ts <= state.savedTs;
      slot.material.color.setHex(opColors[entry.op]);
      if (read) slot.material.color.lerp(new THREE.Color(0xe9efe5), 0.62);
      slot.label.className =
        'oplog-slot-label has-entry' +
        (read ? ' is-read' : '') +
        (fresh.has(entry.ts) ? ' is-new' : '');
      slot.label.innerHTML = `<b></b><span></span>`;
      slot.label.querySelector('b')!.textContent = '#' + entry.ts;
      slot.label.querySelector('span')!.textContent = entry.op;
    });
    this.oplogMeta.textContent = `${state.oplog.length} / ${state.oplogCapacity} entries kept`;
    // Markers.
    const oldest = state.oplog[0]?.ts ?? 0;
    const place = (ts: number | null) => {
      if (ts === null) return null;
      const i = state.oplog.findIndex((e) => e.ts === ts);
      return i >= 0 ? slotX(i) : slotX(-1.15);
    };
    const cursorX = place(state.cursorTs);
    this.cursor.group.visible = state.streamOpen && cursorX !== null;
    if (cursorX !== null) this.cursorTarget = cursorX;
    const tokenX = place(state.savedTs);
    this.token.group.visible = tokenX !== null;
    if (tokenX !== null) this.tokenTarget = tokenX;
    const expired = state.savedTs !== null && state.savedTs < oldest;
    this.token.flag.color.setHex(expired ? 0xd9806a : C.orange);
    this.token.label.firstElementChild!.textContent = expired
      ? 'saved token (expired)'
      : 'saved token #' + state.savedTs;
    this.token.label.classList.toggle('is-expired', expired);
    this.cursor.label.firstElementChild!.textContent = 'stream cursor #' + state.cursorTs;
    // Consumer.
    this.inboxTiles.forEach((tile, i) => (tile.visible = i < state.inbox.length));
    this.tokenChip.visible = state.savedTs !== null;
    // Part labels.
    const notes: Record<Part, string> = {
      producer: `writing to #${state.headTs}`,
      primary: `${state.orders.length} orders`,
      oplog: '',
      consumer:
        (state.inbox.length ? `${state.inbox.length} queued · ` : '') +
        (state.savedTs === null ? 'no token' : `token #${state.savedTs}`),
    };
    const roles: Record<Part, string> = {
      producer: 'Writer',
      primary: 'Primary',
      oplog: '',
      consumer: state.error
        ? 'Cannot resume'
        : state.consumer === 'offline'
          ? 'Offline'
          : state.consumer === 'slow'
            ? 'Slow'
            : state.streamOpen
              ? 'Streaming'
              : 'Idle',
    };
    for (const [id, part] of this.parts) {
      if (!part.label) continue;
      const offline =
        id === 'consumer' && (state.consumer === 'offline' || !!state.error);
      part.label.classList.toggle('is-selected', selected === id);
      part.label.classList.toggle('is-offline', offline);
      part.label.innerHTML = `<button type="button" aria-label="Inspect ${partNames[id]}"><span class="node-name"></span><span class="node-role ${id === 'primary' ? 'primary' : ''} ${offline ? 'offline' : ''}"><i></i><u></u></span><em class="label-value"></em></button>`;
      part.label.querySelector('.node-name')!.textContent = partNames[id];
      part.label.querySelector('u')!.textContent = roles[id];
      part.label.querySelector('.label-value')!.textContent = notes[id];
    }
  }

  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const inset = w > 900 ? this.inset : 0,
      aspect = w / h,
      // Fit the scene to the uncovered width, then shift it left within the full canvas.
      height = Math.max(18, (w < 650 ? 36 : 31) / ((w - inset) / h));
    this.camera.left = (-height * aspect) / 2;
    this.camera.right = (height * aspect) / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.setViewOffset(w, h, inset / 2, w > 800 ? h * 0.02 : h * 0.07, w, h);
    this.camera.updateProjectionMatrix();
  }
  setInset(px: number) {
    if (px === this.inset) return;
    this.inset = px;
    this.resize();
  }
  home() {
    this.animationTarget = vec(0.4, 0, 0);
    this.targetZoom = 1;
    this.controls.target.copy(this.animationTarget);
    this.camera.position.copy(
      this.animationTarget
        .clone()
        .add(this.container.clientWidth < 650 ? vec(8, 40, 22) : vec(6, 30, 32)),
    );
    this.camera.zoom = 1;
    this.resize();
  }
  focus(id: Part) {
    this.animationTarget = vec(partX[id], 0, 0);
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
    // Markers glide along the rail as the oplog scrolls or the stream advances.
    const glide = this.reduced ? 1 : 1 - Math.exp(-7 * dt);
    this.cursor.group.position.x +=
      (this.cursorTarget - this.cursor.group.position.x) * glide;
    this.token.group.position.x +=
      (this.tokenTarget - this.token.group.position.x) * glide;
    this.routes.forEach((r) => {
      r.active.visible = false;
      r.mesh.visible = r.base;
    });
    this.packets.forEach((p) => (p.visible = false));
    if (this.frame) {
      const { step, progress, selected } = this.frame;
      const focus = step?.focus ?? [];
      this.parts.forEach((part, id) => {
        const mat = part.ring.material as THREE.MeshBasicMaterial;
        mat.opacity = id !== 'oplog' && (focus.includes(id) || selected === id) ? 0.8 : 0;
      });
      let count = 0;
      for (const flow of step?.flows ?? []) {
        const { route, reverse } = this.getRoute(flow.from, flow.to, flow.kind);
        route.mesh.visible = true;
        route.active.visible = true;
        const mat = route.active.material as THREE.MeshStandardMaterial;
        mat.color.setHex(flowColors[flow.kind]);
        mat.emissive.setHex(flowColors[flow.kind]);
        for (let trail = 0; trail < 3 && count < this.packets.length; trail++) {
          // Match SNAPSHOT_CHANGE_PROGRESS: the leading marker arrives at 0.76.
          const p = progress / 0.76 - trail * 0.065;
          if (p < 0 || p > 1) continue;
          const packet = this.packets[count++];
          packet.visible = !this.reduced;
          packet.position.copy(route.curve.getPoint(reverse ? 1 - p : p));
          packet.position.y += 0.075;
          packet.scale.setScalar(trail ? 1 - trail * 0.22 : 1.15);
          const pm = packet.material as THREE.MeshStandardMaterial;
          pm.color.setHex(flowColors[flow.kind]);
          pm.emissive.setHex(flowColors[flow.kind]);
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
