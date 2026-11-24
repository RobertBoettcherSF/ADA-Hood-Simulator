// The street view: the generated city as simple shapes. Ground, streets and
// block slabs, one box per building lot (height from its storeys, colour
// from its class), low slabs for empty land, flags on the headquarters
// offices (item 4) and the people as small figures coloured by role or gang.
// Buildings and people are instanced, so even the Large city is a few draw
// calls.
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
const FIGURE_H = 1.8, FIGURE_W = 0.9;   // a walker, metres (proposed)
// Item 6: vehicle boxes, metres (proposed): length, width, height.
const CAR_SIZE = [4.4, 1.9, 1.5], TRUCK_SIZE = [6.5, 2.3, 2.6], TRAM_SIZE = [11, 2.4, 3.2];
const FLEET_SIZE = [[4.0, 1.8, 1.3], [4.4, 1.9, 1.5], [6.5, 2.3, 2.6]];   // speedster, coupe, truck
/** City car paint (the traffic's colour numbers) and the tram's livery. */
export const CAR_COLOURS = ['#2b2b2b', '#5a2a27', '#2f3e57', '#44513a', '#6b6155', '#8a7f6a', '#3d3d45', '#7a6040'];
const TRUCK_COLOUR = '#5b4a35', TRAM_COLOUR = '#9b5143';
/** Walker colours by role (ROLES order); gang members take their gang's colour. */
export const ROLE_COLOURS = ['#f1d58f', '#f1d58f', '#f1d58f', '#d8d0b8', '#d8d0b8', '#b9ab8f', '#8c6a46', '#1f3f8f',
  '#c0392b', '#14286a', '#111111', '#111111', '#6b3f8f', '#6b3f8f', '#6b3f8f', '#e5c84a', '#f4f0e6', '#6f8f6a'];

export class StreetScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  private city: City | null = null;
  private group = new THREE.Group();
  private buildings: THREE.InstancedMesh | null = null;
  private lotOfInstance: number[] = [];
  private outline: THREE.LineSegments;
  private walkers: THREE.InstancedMesh | null = null;
  private cars: THREE.InstancedMesh | null = null;
  private fleet: THREE.InstancedMesh | null = null;
  private trams: THREE.InstancedMesh | null = null;
  private personOfInstance: number[] = [];
  private gangColour: number[] = [0, 0, 1, 2, 3];
  private ring: THREE.Mesh;
  private markers: THREE.InstancedMesh | null = null;
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
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.2, 24), new THREE.MeshBasicMaterial({ color: 0xffe28a, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  setCity(city: City) {
    // The same city again (a building changed): keep the view.
    const same = !!this.city && this.city.seed === city.seed && this.city.w === city.w && this.city.h === city.h;
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

    // Gang flags on the offices (item 4): a pole and a flag in the gang's colour.
    for (const hq of city.hq) {
      const material = new THREE.MeshLambertMaterial({ color: GANG_COLOURS[hq.colour % 4] });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 40, 8), material);
      pole.position.set(hq.fx * FINE + FINE / 2, 20, hq.fy * FINE + FINE / 2);
      this.group.add(pole);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 0.4), material.clone());
      flag.position.set(hq.fx * FINE + FINE / 2 + 6.5, 36, hq.fy * FINE + FINE / 2);
      this.group.add(flag);
    }
    this.walkers = null;
    this.cars = this.fleet = this.trams = null;
    this.ring.visible = false;
    this.outline.visible = false;
    if (!same) this.view = { x: width / 2, z: depth / 2, zoom: ZOOM_START, turned: false };
    this.update();
  }

  /** Item 5: pins over order sites (metres; the job card's in gold, given orders in the gang's colour). */
  setMarkers(marks: { x: number; y: number; colour: string }[]) {
    if (this.markers) { this.scene.remove(this.markers); this.markers.geometry.dispose(); (this.markers.material as THREE.Material).dispose(); this.markers = null; }
    if (marks.length) {
      const pins = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 7, 10).rotateX(Math.PI), new THREE.MeshBasicMaterial(), marks.length);
      const m = new THREE.Matrix4(), colour = new THREE.Color();
      marks.forEach((k, i) => {
        m.makeTranslation(k.x, 34, k.y);
        pins.setMatrixAt(i, m);
        pins.setColorAt(i, colour.set(k.colour));
      });
      this.markers = pins;
      this.scene.add(pins);
    }
    this.render();
  }

  /** The people layer (x, y, role, gang, indoors per person): figures for
   * everyone not indoors. gangColours maps gang number to colour index. */
  setPeople(layer: Int32Array, gangColours: number[], selected: number) {
    const count = layer.length / 5;
    if (!this.walkers || this.walkers.instanceMatrix.count < count) {
      if (this.walkers) { this.group.remove(this.walkers); this.walkers.geometry.dispose(); (this.walkers.material as THREE.Material).dispose(); }
      const geometry = new THREE.CylinderGeometry(FIGURE_W / 2, FIGURE_W / 2, FIGURE_H, 6);
      geometry.translate(0, FIGURE_H / 2 + SLAB, 0);
      this.walkers = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial(), Math.max(count, 1));
      this.walkers.frustumCulled = false;
      this.group.add(this.walkers);
    }
    this.gangColour = gangColours;
    const m = new THREE.Matrix4(), colour = new THREE.Color();
    let n = 0;
    this.personOfInstance.length = 0;
    for (let i = 0; i < count; i++) {
      const o = i * 5;
      if (layer[o + 4] !== 0) continue;   // indoors (1) or in a car (2)
      m.makeTranslation(layer[o] / 256, 0, layer[o + 1] / 256);
      this.walkers.setMatrixAt(n, m);
      const gang = layer[o + 3];
      this.walkers.setColorAt(n++, colour.set(gang > 0 ? GANG_COLOURS[(this.gangColour[gang] ?? 0) % 4] : ROLE_COLOURS[layer[o + 2]] ?? '#ffffff'));
      this.personOfInstance.push(i);
      if (i === selected) { this.ring.position.set(layer[o] / 256, SLAB + 0.05, layer[o + 1] / 256); }
    }
    this.ring.visible = selected >= 0 && selected < count && layer[selected * 5 + 4] === 0;
    this.walkers.count = n;
    this.walkers.instanceMatrix.needsUpdate = true;
    if (this.walkers.instanceColor) this.walkers.instanceColor.needsUpdate = true;
    this.walkers.computeBoundingSphere();
    this.render();
    return n;
  }

  /** Item 6: one instanced box layer, grown as needed. */
  private boxes(old: THREE.InstancedMesh | null, count: number): THREE.InstancedMesh {
    if (old && old.instanceMatrix.count >= count) return old;
    if (old) { this.group.remove(old); old.geometry.dispose(); (old.material as THREE.Material).dispose(); }
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial(), Math.max(count, 1) + 16);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  /** Item 6: the city's cars (x, y, heading, truck, colour, halted), the gang
   * cars (x, y, kind, gang, crew, riders, heading) and the trams (x, y,
   * direction x, y, on the map, line), positions in 1/256 m. */
  setVehicles(cars: Int32Array, fleet: Int32Array, trams: Int32Array, gangColours: number[]) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), colour = new THREE.Color();
    const place = (mesh: THREE.InstancedMesh, n: number, x: number, y: number, angle: number, size: readonly number[], c: string) => {
      q.setFromAxisAngle(up, angle); s.set(size[0], size[2], size[1]); p.set(x, SLAB, y);
      mesh.setMatrixAt(n, m.compose(p, q, s)); mesh.setColorAt(n, colour.set(c));
    };
    const heading = (h: number) => -h * Math.PI / 2;   // 0 east, 1 south, 2 west, 3 north
    const nc = cars.length / 6;
    this.cars = this.boxes(this.cars, nc);
    for (let i = 0; i < nc; i++) {
      const o = i * 6, truck = cars[o + 3] === 1;
      place(this.cars, i, cars[o] / 256, cars[o + 1] / 256, heading(cars[o + 2]), truck ? TRUCK_SIZE : CAR_SIZE,
        truck ? TRUCK_COLOUR : CAR_COLOURS[cars[o + 4] % CAR_COLOURS.length]);
    }
    this.cars.count = nc;
    const nf = fleet.length / 7;
    this.fleet = this.boxes(this.fleet, nf);
    for (let i = 0; i < nf; i++) {
      const o = i * 7, h = fleet[o + 6];
      place(this.fleet, i, fleet[o] / 256, fleet[o + 1] / 256, heading(h < 0 ? 0 : h), FLEET_SIZE[fleet[o + 2]] ?? CAR_SIZE,
        GANG_COLOURS[(gangColours[fleet[o + 3]] ?? 0) % 4]);
    }
    this.fleet.count = nf;
    const nt = trams.length / 6;
    this.trams = this.boxes(this.trams, nt);
    let k = 0;
    for (let i = 0; i < nt; i++) {
      const o = i * 6;
      if (trams[o + 4] !== 1) continue;
      place(this.trams, k++, trams[o] / 256, trams[o + 1] / 256, -Math.atan2(trams[o + 3], trams[o + 2]), TRAM_SIZE, TRAM_COLOUR);
    }
    this.trams.count = k;
    for (const mesh of [this.cars, this.fleet, this.trams]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.render();
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

  /** What is under a canvas point: a person (nearest figure within a few
   * pixels) or else a lot; -1 for nothing. */
  pick(clientX: number, clientY: number): { person: number; lot: number } {
    if (!this.buildings) return { person: -1, lot: -1 };
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    if (this.walkers && this.walkers.count > 0) {
      // Figures are tiny: take the nearest one on screen within 8 pixels.
      const m = new THREE.Matrix4(), p = new THREE.Vector3();
      let best = -1, bestD = 64;
      for (let k = 0; k < this.walkers.count; k++) {
        this.walkers.getMatrixAt(k, m);
        p.setFromMatrixPosition(m).setY(SLAB + FIGURE_H / 2).project(this.camera);
        const dx = (p.x - ndc.x) * rect.width / 2, dy = (p.y - ndc.y) * rect.height / 2, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best >= 0) return { person: this.personOfInstance[best], lot: -1 };
    }
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.buildings, false)[0];
    return { person: -1, lot: hit?.instanceId != null ? this.lotOfInstance[hit.instanceId] : -1 };
  }

  dispose() { cancelAnimationFrame(this.frame); this.renderer.dispose(); }
}
