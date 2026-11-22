// The street view: the generated city as simple shapes. Ground, streets and
// block slabs, one box per building lot (height from its storeys, colour
// from its class), low slabs for empty land, flags on the headquarters
// sites. Buildings are instanced, so even the Large city is a few draw calls.
import * as THREE from 'three';
import { CELL, City, blockRect } from '../city';
import { CameraState, DISTANCE, ZOOM_START, clampTarget, clampZoom, dragged, towardsCamera, viewHeight } from './camera';

export const CLASS_COLOURS = ['#5d5240', '#c49a6c', '#9b5a48', '#5f8fa8', '#7c7a74', '#e0d9c6', '#a08cc0', '#7a3b3b'];
export const USE_COLOURS = ['#8a8478', '#4f6e3a', '#9b9688', '#a99f8a', '#47474a', '#2e4f66'];
export const GANG_COLOURS = ['#c0392b', '#2e8b57', '#2f5fb3', '#d9822b'];
const STREET_COLOUR = '#3a3937';
const BACKGROUND = 0x2b3038;
const STOREY = 4.2;        // metres per storey (proposed)
const SLAB = 0.3;          // pavement slab height
const MARGIN = 0.8;        // gap between neighbouring buildings
const FINE = CELL / 5;     // the headquarters' fine cells

export class StreetScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  private city: City | null = null;
  private group = new THREE.Group();
  private buildings: THREE.InstancedMesh | null = null;
  private lotOfInstance: number[] = [];
  private outline: THREE.LineSegments;
  private raycaster = new THREE.Raycaster();
  view: CameraState = { x: 0, z: 0, zoom: ZOOM_START, turned: false };
  private frame = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.fog = new THREE.Fog(BACKGROUND, DISTANCE + 300, DISTANCE + 2600);
    this.scene.add(new THREE.HemisphereLight(0xe8e2d4, 0x3a3328, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.8);
    sun.position.set(-300, 600, -150);
    this.scene.add(sun);
    this.scene.add(this.group);
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xffe28a }));
    this.outline.visible = false;
    this.scene.add(this.outline);
  }

  setCity(city: City) {
    this.city = city;
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.Mesh) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
    }
    const width = city.w * CELL, depth = city.h * CELL;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(width + 400, depth + 400),
      new THREE.MeshLambertMaterial({ color: STREET_COLOUR }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(width / 2, 0, depth / 2);
    this.group.add(ground);

    // Block slabs, one instance each, coloured by use.
    const roots = city.blocks.filter(b => b.merged < 0);
    const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), roots.length);
    const m = new THREE.Matrix4(), colour = new THREE.Color();
    roots.forEach((b, i) => {
      const r = blockRect(b), flat = b.use === 4 || b.use === 5;
      const hgt = flat ? 0.05 : SLAB;
      m.makeScale(r.w, hgt, r.h).setPosition(r.x + r.w / 2, hgt / 2, r.y + r.h / 2);
      slabs.setMatrixAt(i, m);
      slabs.setColorAt(i, colour.set(USE_COLOURS[b.use] ?? USE_COLOURS[0]));
    });
    this.group.add(slabs);

    // Buildings and empty land.
    this.lotOfInstance = city.lots.map(l => l.id);
    const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), city.lots.length);
    city.lots.forEach((l, i) => {
      const empty = l.cls === 0;
      const hgt = empty ? 0.25 : Math.max(1, l.storeys) * STOREY;
      const w = Math.max(0.5, l.w - 2 * MARGIN), d = Math.max(0.5, l.h - 2 * MARGIN);
      m.makeScale(w, hgt, d).setPosition(l.x + l.w / 2, SLAB + hgt / 2, l.y + l.h / 2);
      boxes.setMatrixAt(i, m);
      boxes.setColorAt(i, colour.set(CLASS_COLOURS[l.cls] ?? CLASS_COLOURS[0]));
    });
    this.buildings = boxes;
    this.group.add(boxes);

    // Headquarters flags (Standard city): a pole on the front's fine cell.
    for (const hq of city.hq) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 40, 8),
        new THREE.MeshLambertMaterial({ color: GANG_COLOURS[(hq.gang - 1) % 4] }));
      pole.position.set(hq.fx * FINE + FINE / 2, 20, hq.fy * FINE + FINE / 2);
      this.group.add(pole);
    }
    this.outline.visible = false;
    this.view = { x: width / 2, z: depth / 2, zoom: ZOOM_START, turned: false };
    this.update();
  }

  select(lotId: number) {
    const lot = this.city?.lots[lotId];
    if (!lot) { this.outline.visible = false; this.render(); return; }
    const hgt = lot.cls === 0 ? 0.6 : Math.max(1, lot.storeys) * STOREY + 0.4;
    this.outline.scale.set(lot.w, hgt, lot.h);
    this.outline.position.set(lot.x + lot.w / 2, SLAB + hgt / 2, lot.y + lot.h / 2);
    this.outline.visible = true;
    this.render();
  }

  private size() { const c = this.renderer.domElement; return { w: c.clientWidth || 1, h: c.clientHeight || 1 }; }

  /** Applies the view: clamps it, places the camera, renders. */
  update() {
    if (!this.city) return;
    const { w, h } = this.size();
    this.renderer.setSize(w, h, false);
    this.view = clampTarget({ ...this.view, zoom: clampZoom(this.view.zoom) }, w / h, this.city.w * CELL, this.city.h * CELL);
    const vh = viewHeight(this.view.zoom), vw = vh * (w / h);
    Object.assign(this.camera, { left: -vw / 2, right: vw / 2, top: vh / 2, bottom: -vh / 2 });
    this.camera.updateProjectionMatrix();
    const [dx, dy, dz] = towardsCamera(this.view.turned);
    this.camera.position.set(this.view.x + dx * DISTANCE, dy * DISTANCE, this.view.z + dz * DISTANCE);
    this.camera.lookAt(this.view.x, 0, this.view.z);
    this.render();
  }

  render() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
  }

  drag(dx: number, dy: number) { this.view = dragged(this.view, dx, dy, this.size().h); this.update(); }
  zoomBy(factor: number) { this.view = { ...this.view, zoom: this.view.zoom * factor }; this.update(); }
  turn() { this.view = { ...this.view, turned: !this.view.turned }; this.update(); }
  lookAt(x: number, z: number) { this.view = { ...this.view, x, z }; this.update(); }

  /** The lot under a canvas point, or -1. */
  pick(clientX: number, clientY: number): number {
    if (!this.buildings) return -1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.buildings, false)[0];
    return hit?.instanceId != null ? this.lotOfInstance[hit.instanceId] : -1;
  }

  dispose() { cancelAnimationFrame(this.frame); this.renderer.dispose(); }
}
