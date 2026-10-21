import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { UseCaseFlow } from '../../lessons/use-cases/types.ts';
import { ClusterObjects } from '../cluster/objects.ts';
import { C } from '../cluster/palette.ts';
import { disposeObjectTree } from '../shared/resources.ts';

export const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The parts of a step a flow scene reads. */
export interface FlowSceneStep<P extends string, K extends string> {
  focus: P[];
  flows: UseCaseFlow<P, K>[];
}
export interface FlowFrame<State, P extends string, Step> {
  state: State;
  step: Step | null;
  progress: number;
  playing: boolean;
  selected: P | null;
  follow: boolean;
}
export interface FlowSceneConfig<P extends string, K extends string> {
  positions: Record<P, THREE.Vector3>;
  colors: Record<K, number>;
  ariaLabel: string;
  /** Where `home()` looks, and the camera offset from there on wide and narrow screens. */
  home: { target: THREE.Vector3; wide: THREE.Vector3; narrow: THREE.Vector3 };
  /** World height that must fit across the uncovered width, on wide and narrow screens. */
  fit: { wide: number; narrow: number };
}
export interface FlowRoute<State> {
  curve: THREE.CatmullRomCurve3;
  mesh: THREE.Mesh;
  active: THREE.Mesh;
  show: (model: State) => boolean;
}
export interface PartObject {
  group: THREE.Group;
  body: THREE.Group;
  ring: THREE.Mesh;
  label: HTMLElement;
  objects: ClusterObjects;
}

/**
 * Shared renderer for use-case scenes: parts on platforms, connected by routes that
 * light up and carry packets while a step plays. Subclasses build the parts and map
 * each published state to what is visible; the lesson clock stays in React.
 *
 * Subclasses call `start()` at the end of their constructor, once their own fields exist.
 */
export abstract class FlowScene<
  State,
  P extends string,
  K extends string,
  Step extends FlowSceneStep<P, K>,
> {
  renderer: THREE.WebGLRenderer;
  labels = new CSS2DRenderer();
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  container: HTMLElement;
  world = new THREE.Group();
  network = new THREE.Group();
  particles = new THREE.Group();
  parts = new Map<P, PartObject>();
  routes = new Map<string, FlowRoute<State>>();
  packets: THREE.Mesh[] = [];
  packetGeometry = new THREE.SphereGeometry(0.115, 12, 8);
  frame: FlowFrame<State, P, Step> | null = null;
  lastState: State | null = null;
  lastSelected: P | null = null;
  lastStep: Step | null = null;
  floor: THREE.Mesh;
  ray = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  pointerDown = { x: 0, y: 0 };
  selection: (id: P) => void;
  animationTarget: THREE.Vector3 | null = null;
  targetZoom = 1;
  lastTime = 0;
  raf = 0;
  disposed = false;
  resizeObserver: ResizeObserver;
  /** Pixels at the right edge covered by a side panel; the scene recenters in the rest. */
  inset = 0;
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  config: FlowSceneConfig<P, K>;

  constructor(
    container: HTMLElement,
    select: (id: P) => void,
    config: FlowSceneConfig<P, K>,
  ) {
    this.container = container;
    this.selection = select;
    this.config = config;
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
    this.renderer.domElement.setAttribute('aria-label', config.ariaLabel);
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
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  /** Build the subclass's parts, then begin rendering. */
  protected start() {
    this.build();
    this.resizeObserver.observe(this.container);
    this.resize();
    this.home();
    this.animate(0);
  }
  protected abstract build(): void;
  /** Map the current frame's state onto visibility, colours and labels. */
  protected abstract applyState(): void;
  /** Extra height for a route's arc, so parallel routes stay distinct. */
  protected routeLift(_from: P, _to: P, _kind: K): number {
    return 0.55;
  }
  /** The colour a flow is drawn in while it plays. */
  protected flowTint(flow: UseCaseFlow<P, K>): number {
    return this.config.colors[flow.kind];
  }
  /** Per-frame work beyond routes and packets, such as easing colours. */
  protected tick(_dt: number, _now: number) {}

  contextLost = (e: Event) => {
    e.preventDefault();
    this.container.dispatchEvent(
      new CustomEvent('scene-error', {
        detail: 'Graphics paused. Reload the page to restore the 3D view.',
      }),
    );
  };

  /** Each part owns a group at the origin; its contents are placed at absolute coordinates. */
  makePart(id: P, ringRadius: number, labelY: number) {
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
    body.position.copy(this.config.positions[id]);
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
    id: P,
    w: number,
    d: number,
    kind: 'app' | 'shard' | 'config',
  ) {
    const at = this.config.positions[id];
    part.objects.platform('', '', at.x, at.z, w, d, kind);
  }
  island(part: PartObject, id: P, name: string, subtitle: string, depth: number) {
    const at = this.config.positions[id];
    const { div } = part.objects.label(
      part.group,
      `<strong>${name}</strong><span>${subtitle}</span>`,
      'island-label',
      vec(at.x, 0.45, at.z + depth / 2 + 0.45),
    );
    div.dataset.group = 'config';
  }
  /** Rewrite a part's label: name, an optional role chip and an optional note. */
  setLabel(
    id: P,
    name: string,
    role: string,
    note: string,
    { primary = false, noteClass = '' }: { primary?: boolean; noteClass?: string } = {},
  ) {
    const part = this.parts.get(id)!;
    part.label.classList.toggle('is-selected', this.frame?.selected === id);
    part.label.innerHTML = `<button type="button" aria-label="Inspect ${name}"><span class="node-name"></span><span class="node-role ${primary ? 'primary' : ''}"><i></i><u></u></span><em class="label-value"></em></button>`;
    part.label.querySelector('.node-name')!.textContent = name;
    part.label.querySelector('u')!.textContent = role;
    const value = part.label.querySelector('.label-value')!;
    value.textContent = note;
    if (noteClass) value.classList.add(noteClass);
    if (!note) value.remove();
    if (!role) part.label.querySelector('.node-role')!.remove();
    return part.label;
  }

  /** Routes are shared by direction: a flow from B to A reuses A–B, played backwards. */
  getRoute(from: P, to: P, kind: K, show?: FlowRoute<State>['show']) {
    const key = from + '-' + to,
      reverseKey = to + '-' + from;
    if (this.routes.has(key)) return { route: this.routes.get(key)!, reverse: false };
    if (this.routes.has(reverseKey))
      return { route: this.routes.get(reverseKey)!, reverse: true };
    const start = this.config.positions[from].clone(),
      end = this.config.positions[to].clone();
    start.y = end.y = 1.0;
    const mid = start.clone().lerp(end, 0.5);
    mid.y += this.routeLift(from, to, kind);
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
    const color = this.config.colors[kind];
    const active = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 50, 0.093, 7, false),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.15,
        roughness: 0.4,
        transparent: true,
        opacity: 0.9,
      }),
    );
    active.visible = false;
    this.network.add(active);
    const route: FlowRoute<State> = { curve, mesh, active, show: show ?? (() => false) };
    this.routes.set(key, route);
    return { route, reverse: false };
  }

  update(frame: FlowFrame<State, P, Step>) {
    this.frame = frame;
    if (frame.step !== this.lastStep) {
      if (frame.follow && frame.step?.focus.length) {
        const center = new THREE.Vector3();
        frame.step.focus.forEach((id) => center.add(this.config.positions[id]));
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

  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const inset = w > 900 ? this.inset : 0;
    // Fit the scene to the uncovered width, then shift it left within the full canvas.
    const fit = w < 650 ? this.config.fit.narrow : this.config.fit.wide;
    const height = Math.max(22, fit / ((w - inset) / h));
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
    const { target, wide, narrow } = this.config.home;
    this.animationTarget = target.clone();
    this.targetZoom = 1;
    this.controls.target.copy(target);
    this.camera.position.copy(
      target.clone().add(this.container.clientWidth < 650 ? narrow : wide),
    );
    this.camera.zoom = 1;
    this.resize();
  }
  focus(id: P) {
    this.animationTarget = this.config.positions[id].clone();
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
    this.tick(dt, now);
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
        const tint = this.flowTint(flow);
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
