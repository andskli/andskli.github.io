import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type {
  IndexView,
  ModelingDocument,
  ModelingLesson,
  ModelingState,
  ModelingStep,
} from '../../lessons/data-modeling/types.ts';
import { disposeObjectTree } from '../shared/resources.ts';
import { colors, createDocumentTexture, createIndexTexture } from './textures.ts';

export interface ModelingFrame {
  lesson: ModelingLesson;
  step: ModelingStep | null;
  state: ModelingState;
  progress: number;
  selected: string | null;
}
interface Card {
  group: THREE.Group;
  face: THREE.Mesh;
  texture: THREE.CanvasTexture | null;
  label: HTMLElement;
  labelObject: CSS2DObject;
  outline: THREE.Mesh;
  signature: string;
}
interface Link {
  curve: THREE.CatmullRomCurve3;
  line: THREE.Mesh;
  packet: THREE.Mesh;
}

const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Model state belongs to the lesson; this class owns only its visual representation.
 * update() projects a playback frame into retained meshes/textures. RAF handles camera
 * controls and drawing independently, including while the lesson clock is paused.
 */
export class ModelingScene {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  labels = new CSS2DRenderer();
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  world = new THREE.Group();
  cards = new Map<string, Card>();
  links = new Map<string, Link>();
  indexLinks = new Map<string, Link>();
  frame: ModelingFrame | null = null;
  lessonId = '';
  presentation: ModelingLesson['presentation'] = { worldWidth: 25, minHeight: 10.6 };
  observer: ResizeObserver;
  raf = 0;
  disposed = false;
  ray = new THREE.Raycaster();
  pointerDown = { x: 0, y: 0 };
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  container: HTMLElement;
  select: (id: string) => void;
  constructor(container: HTMLElement, select: (id: string) => void) {
    this.container = container;
    this.select = select;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = 'world-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D documents and collections. Drag to orbit, scroll to zoom, or select a document to inspect its fields.',
    );
    this.labels.domElement.className = 'world-labels modeling-labels';
    container.append(this.renderer.domElement, this.labels.domElement);
    this.scene.background = new THREE.Color('#e9eee6');
    this.camera = new THREE.OrthographicCamera(-17, 17, 11, -11, 0.1, 180);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 2.4;
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9eafa0, 2.8));
    const sun = new THREE.DirectionalLight(0xfffaf0, 3.4);
    sun.position.set(-12, 28, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -28,
      right: 28,
      top: 24,
      bottom: -24,
      near: 1,
      far: 85,
    });
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: '#e9eee6', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.26;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(120, 100, 0xc9d6c9, 0xd2ded0);
    grid.position.y = -0.24;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.4;
    this.scene.add(grid, this.world);
    this.renderer.domElement.addEventListener('pointerdown', this.onDown);
    this.renderer.domElement.addEventListener('pointerup', this.onUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onLost);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.home();
    this.animate();
  }
  box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: string,
    r = 0.1,
  ) {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, d, 3, r),
      new THREE.MeshStandardMaterial({ color, roughness: 0.72 }),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  label(
    parent: THREE.Object3D,
    text: string,
    className: string,
    position: THREE.Vector3,
  ) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    const object = new CSS2DObject(element);
    object.position.copy(position);
    parent.add(object);
    return { element, object };
  }
  clearWorld() {
    // Material disposal does not dispose its map. The card cache owns those textures.
    this.cards.forEach((c) => c.texture?.dispose());
    this.cards.clear();
    this.links.clear();
    this.indexLinks.clear();
    disposeObjectTree(this.world);
  }
  /**
   * Allocate the complete roster from the first snapshot. Later steps must keep card IDs
   * and relationship endpoints stable; hide a card with scale: 0 instead of removing it.
   * Option variants with the same lesson.id reuse this roster rather than rebuilding it.
   */
  build(lesson: ModelingLesson) {
    this.clearWorld();
    this.lessonId = lesson.id;
    this.presentation = lesson.presentation;
    for (const tray of lesson.trays) {
      const group = new THREE.Group();
      group.position.set(tray.x, 0, tray.z);
      this.world.add(group);
      this.box(group, tray.width, 0.35, tray.depth, 0, 0, 0, '#c6d6c7', 0.18);
      this.box(
        group,
        tray.width - 0.15,
        0.12,
        tray.depth - 0.15,
        0,
        0.23,
        0,
        '#f8fbf5',
        0.12,
      );
      this.box(
        group,
        tray.width - 1,
        0.07,
        0.1,
        0,
        0.33,
        tray.depth / 2 - 0.38,
        tray.color,
        0.03,
      );
      const label = this.label(
        group,
        '',
        'collection-caption',
        vec(0, 0.3, tray.depth / 2 + 0.9),
      );
      const strong = document.createElement('strong');
      strong.textContent = tray.label;
      const small = document.createElement('span');
      small.textContent = tray.detail;
      label.element.append(strong, small);
    }
    for (const document of lesson.steps[0].before.documents) {
      const group = new THREE.Group();
      group.userData.documentId = document.id;
      this.world.add(group);
      this.box(group, 6.1, 0.16, 2.05, 0, 0.46, 0, '#d6e3d3', 0.13);
      const body = this.box(group, 5.65, 7.0, 0.34, 0, 4.05, 0, '#ffffff', 0.16);
      this.box(group, 5.65, 0.16, 0.38, 0, 7.49, 0, colors[document.kind], 0.05);
      this.box(group, 0.12, 6.75, 0.38, -2.79, 4.05, 0, colors[document.kind], 0.04);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(5.42, 6.78),
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      );
      face.position.set(0, 4.05, 0.185);
      group.add(face);
      const outline = this.box(
        group,
        6.35,
        0.055,
        2.28,
        0,
        0.37,
        0,
        colors[document.kind],
        0.15,
      );
      outline.visible = false;
      const label = this.label(group, '', 'document-label', vec(0, 8.05, 0));
      const button = globalThis.document.createElement('button');
      button.type = 'button';
      button.setAttribute(
        'aria-label',
        `Inspect ${document.storage === 'view' ? 'view' : 'document'} ${document.title}`,
      );
      button.textContent = document.title;
      button.addEventListener('click', () => this.select(document.id));
      label.element.append(button);
      this.cards.set(document.id, {
        group,
        face,
        texture: null,
        label: label.element,
        labelObject: label.object,
        outline,
        signature: '',
      });
      body.userData.documentId = document.id;
    }
    // Relationship curves use the initial card positions. Lessons that move linked cards
    // would also need to update these curves; visibility alone is updated during playback.
    for (const relation of lesson.steps[0].before.relationships) {
      const docs = lesson.steps[0].before.documents;
      const from = docs.find((d) => d.id === relation.from)!,
        to = docs.find((d) => d.id === relation.to)!;
      const start = vec(from.position[0] + 3, 1.1, from.position[1]),
        end = vec(to.position[0] - 3, 1.1, to.position[1]);
      const curve = new THREE.CatmullRomCurve3([
        start,
        start
          .clone()
          .lerp(end, 0.25)
          .add(vec(0, 0.3, relation.from === 'order1' ? 4 : 2.5)),
        start
          .clone()
          .lerp(end, 0.75)
          .add(vec(0, 0.3, relation.from === 'order1' ? 4 : 2.5)),
        end,
      ]);
      const line = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 50, 0.065, 8, false),
        new THREE.MeshStandardMaterial({ color: '#a5b8cf', roughness: 0.7 }),
      );
      this.world.add(line);
      const packet = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 14, 10),
        new THREE.MeshStandardMaterial({
          color: '#627faa',
          emissive: '#627faa',
          emissiveIntensity: 0.3,
        }),
      );
      packet.visible = false;
      this.world.add(packet);
      this.links.set(`${relation.from}:${relation.to}`, { curve, line, packet });
    }
    // Reserve the board even if present is false: the lesson may build the index later.
    if (lesson.steps[0].before.indexView) this.buildIndexBoard(lesson);
    if (lesson.presentation.relationshipCaption)
      this.label(
        this.world,
        lesson.presentation.relationshipCaption,
        'relationship-caption',
        vec(3.6, 0.8, 3.8),
      );
    this.home();
  }

  update(frame: ModelingFrame) {
    this.frame = frame;
    if (frame.lesson.id !== this.lessonId) this.build(frame.lesson);
    const before = frame.step?.before ?? frame.state,
      after = frame.step?.after ?? frame.state;
    // The after snapshot describes work in flight; frame.state supplies the data currently
    // visible in inspectors. Keeping these separate lets a scan animate before its result appears.
    const trace = frame.step?.after.indexView;
    // Finish movement at SNAPSHOT_CHANGE_PROGRESS (0.76), when React switches the data.
    // Smoothstep eases both ends; reduced motion jumps straight to the destination geometry.
    const raw = frame.step ? Math.min(1, frame.progress / 0.76) : 1,
      t = this.reduced ? 1 : raw * raw * (3 - 2 * raw);
    for (const current of frame.state.documents) {
      const card = this.cards.get(current.id)!;
      const start = before.documents.find((d) => d.id === current.id) ?? current,
        end = after.documents.find((d) => d.id === current.id) ?? current;
      const scale = THREE.MathUtils.lerp(start.scale, end.scale, t);
      card.group.visible = scale > 0.015;
      card.group.position.set(
        THREE.MathUtils.lerp(start.position[0], end.position[0], t),
        0,
        THREE.MathUtils.lerp(start.position[1], end.position[1], t),
      );
      card.group.scale.setScalar(scale);
      // Hide the DOM label before a shrinking/embedded card becomes too small to read.
      card.labelObject.visible = scale > 0.8;
      const matched =
        frame.state.matches === null ? null : frame.state.matches.includes(current.id);
      // Repaint only when the face content changes, not on every animation tick. Title,
      // kind, collection and storage are assumed stable; include them here if that changes.
      const signature = JSON.stringify([current.data, frame.state.highlights, matched]);
      if (signature !== card.signature) {
        card.texture?.dispose();
        card.texture = createDocumentTexture(
          current,
          frame.state.highlights,
          matched,
          this.renderer.capabilities.getMaxAnisotropy(),
        );
        (card.face.material as THREE.MeshBasicMaterial).map = card.texture;
        (card.face.material as THREE.MeshBasicMaterial).needsUpdate = true;
        card.signature = signature;
      }
      const selected = frame.selected === current.id;
      const scanning =
        trace?.operation === 'scan' && frame.progress > 0 && frame.progress < 0.76;
      const active = scanning
        ? trace.visited[
            Math.min(trace.visited.length - 1, Math.floor(raw * trace.visited.length))
          ] === current.id
        : frame.state.focus.includes(current.id);
      card.outline.visible = selected || active;
      card.label.classList.toggle('selected', selected);
      card.label.classList.toggle('not-matched', matched === false);
    }
    for (const relation of frame.state.relationships) {
      const link = this.links.get(`${relation.from}:${relation.to}`)!;
      link.line.visible =
        frame.state.documents.some((d) => d.id === relation.from && d.scale > 0) &&
        frame.state.documents.some((d) => d.id === relation.to && d.scale > 0);
      (link.line.material as THREE.MeshStandardMaterial).color.set(
        relation.active ? '#6688b8' : '#b9c5cd',
      );
      link.packet.visible = false;
      const transition = after.relationships.find(
        (r) => r.from === relation.from && r.to === relation.to,
      )?.active;
      if (
        transition &&
        frame.step &&
        frame.progress > 0 &&
        frame.progress < 0.76 &&
        !this.reduced
      ) {
        link.packet.visible = true;
        link.packet.position.copy(link.curve.getPoint(frame.progress / 0.76));
      }
    }
    if (frame.state.indexView)
      this.updateIndex(
        frame.state.indexView,
        trace,
        frame.progress,
        frame.state.documents,
      );
  }
  buildIndexBoard(lesson: ModelingLesson) {
    const group = new THREE.Group();
    group.position.set(12, 0, 0);
    // Reserved selection ID shared with ModelingView; lesson documents must not use it.
    group.userData.documentId = '@index';
    this.world.add(group);
    this.box(group, 6.15, 0.16, 2.05, 0, 0.46, 0, '#dcd8e7', 0.13);
    this.box(group, 5.9, 7, 0.34, 0, 4.05, 0, '#f7f5fb', 0.16);
    this.box(group, 5.9, 0.16, 0.38, 0, 7.49, 0, '#8b78ba', 0.05);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(5.65, 6.78),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    );
    face.position.set(0, 4.05, 0.185);
    group.add(face);
    const outline = this.box(group, 6.4, 0.055, 2.28, 0, 0.37, 0, '#8b78ba', 0.15);
    outline.visible = false;
    const label = this.label(group, '', 'document-label index-label', vec(0, 8.05, 0));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Query index';
    button.setAttribute('aria-label', 'Inspect query index');
    button.addEventListener('click', () => this.select('@index'));
    label.element.append(button);
    this.cards.set('@index', {
      group,
      face,
      texture: null,
      label: label.element,
      labelObject: label.object,
      outline,
      signature: '',
    });
    for (const doc of lesson.steps[0].before.documents) {
      const start = vec(doc.position[0] + 2.4, 0.8, 2),
        end = vec(9.1, 1.2, 0);
      const curve = new THREE.CatmullRomCurve3([
        start,
        start.clone().add(vec(1, 0.2, 2)),
        end.clone().add(vec(-1, 0.2, 3)),
        end,
      ]);
      const line = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 50, 0.045, 8, false),
        new THREE.MeshStandardMaterial({
          color: '#afa0c6',
          transparent: true,
          opacity: 0.55,
        }),
      );
      line.visible = false;
      this.world.add(line);
      const packet = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 8),
        new THREE.MeshStandardMaterial({
          color: '#8b6cb3',
          emissive: '#8b6cb3',
          emissiveIntensity: 0.3,
        }),
      );
      packet.visible = false;
      this.world.add(packet);
      this.indexLinks.set(doc.id, { curve, line, packet });
    }
  }

  updateIndex(
    view: IndexView,
    trace: IndexView | undefined,
    progress: number,
    docs: ModelingDocument[],
  ) {
    const board = this.cards.get('@index');
    if (!board) return;
    const signature = JSON.stringify(view);
    if (board.signature !== signature) {
      board.texture?.dispose();
      board.texture = createIndexTexture(
        view,
        docs,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
      (board.face.material as THREE.MeshBasicMaterial).map = board.texture;
      (board.face.material as THREE.MeshBasicMaterial).needsUpdate = true;
      board.signature = signature;
    }
    board.outline.visible = view.present;
    for (const [id, link] of this.indexLinks) {
      const operation = trace?.operation ?? 'idle';
      // Curves run document -> index for writes/builds and backwards for indexed reads.
      const incoming = operation === 'build' || operation === 'maintain';
      // The current maintenance example changes `book`. Generalizing it to other fixtures
      // requires an affected-document list in the trace instead of this fixed ID.
      const active = incoming
        ? operation === 'build' || id === 'book'
        : trace?.visited.includes(id) && operation !== 'scan';
      link.line.visible = view.present && !!active;
      link.packet.visible = !!active && progress > 0 && progress < 0.76 && !this.reduced;
      if (link.packet.visible)
        link.packet.position.copy(
          link.curve.getPoint(incoming ? progress / 0.76 : 1 - progress / 0.76),
        );
    }
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const aspect = w / h,
      worldWidth = this.presentation.worldWidth;
    const height = Math.max(this.presentation.minHeight, worldWidth / aspect);
    this.camera.left = (-height * aspect) / 2;
    this.camera.right = (height * aspect) / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
  }
  home() {
    this.camera.position.set(9, 20, 43);
    this.controls.target.set(0, 3.3, 0);
    this.camera.zoom = 1;
    this.resize();
    this.controls.update();
  }
  zoomBy(factor: number) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 0.65, 2.4);
    this.camera.updateProjectionMatrix();
  }
  onDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY };
  };
  onUp = (e: PointerEvent) => {
    // Treat a pointer gesture as selection only if it was not an orbit/pan drag.
    if (Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y) > 6)
      return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    for (const hit of this.ray.intersectObjects(this.world.children, true)) {
      let target: THREE.Object3D | null = hit.object;
      while (target) {
        if (target.userData.documentId) {
          this.select(target.userData.documentId);
          return;
        }
        target = target.parent;
      }
    }
  };
  onLost = (e: Event) => {
    e.preventDefault();
    this.container.dispatchEvent(
      new CustomEvent('scene-error', {
        detail: 'Reload the page to restore the document view.',
      }),
    );
  };
  animate = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };
  dispose() {
    // Unmount must stop the loop and observers before tearing down GPU and DOM resources.
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.controls.dispose();
    this.clearWorld();
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onLost);
    // clearWorld removed lesson meshes; the ground and grid are owned by the scene itself.
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          m.dispose(),
        );
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
