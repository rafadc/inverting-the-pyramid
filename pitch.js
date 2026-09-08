// Shared three.js helpers for every chapter page: a pitch, players, ball,
// formation layout, smooth tweening and scroll-driven steps.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export { THREE };

export const L = 105, W = 68; // pitch length (z axis) and width (x axis), metres

// Build renderer/scene/camera/pitch inside `el`. Returns the app handle.
export function createApp(el, { cameraPos = [0, 70, -95], autoRotate = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05070d, 300, 900); // far cameras must not fade to black
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1500);
  camera.position.set(...cameraPos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 0.4;

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x203020, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(60, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 300 });
  scene.add(sun);

  scene.add(buildPitch());

  const tweens = new Set();
  const app = {
    renderer, scene, camera, controls, tweens,
    clock: new THREE.Clock(),
    onFrame: [],           // push (dt, t) callbacks here for custom animation
    player: (o) => player(app, o),
    ball: () => ball(app),
    arrow: (a, b, c) => arrow(app, a, b, c),
    zone: (o) => zone(app, o),
    label: (t, o) => floatingLabel(app, t, o),
    flyTo: (pos, target = [0, 0, 0], d = 1.8) => {
      tween(app, camera.position, new THREE.Vector3(...pos), d);
      tween(app, controls.target, new THREE.Vector3(...target), d);
    },
    clear: () => {
      for (const o of app.dynamic.splice(0)) {
        scene.remove(o);
        o.traverse((c) => { c.geometry?.dispose(); if (c.material && !c.isSprite) c.material.dispose(); });
      }
    },
    dynamic: [],           // objects removed by clear()
  };

  const resize = () => {
    const w = el.clientWidth, h = el.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(el);
  resize();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(app.clock.getDelta(), 0.05), t = app.clock.elapsedTime;
    for (const tw of tweens) tw(dt);
    for (const f of app.onFrame) f(dt, t);
    controls.update();
    renderer.render(scene, camera);
  });
  return app;
}

function buildPitch() {
  const g = new THREE.Group();
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 12, L + 12),
    new THREE.MeshStandardMaterial({ color: 0x1d6b33, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  g.add(grass);
  // mowing stripes
  for (let i = 0; i < 12; i++) {
    if (i % 2) continue;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(W, L / 12),
      new THREE.MeshStandardMaterial({ color: 0x227a3b, roughness: 1 }));
    s.rotation.x = -Math.PI / 2;
    s.position.set(0, 0.01, -L / 2 + L / 24 + i * L / 12);
    g.add(s);
  }
  const lines = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const line = (pts) => lines.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0.03, z))), mat));
  const rect = (x0, z0, x1, z1) => line([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]);
  rect(-W / 2, -L / 2, W / 2, L / 2);
  line([[-W / 2, 0], [W / 2, 0]]);
  const circle = (cx, cz, r, a0 = 0, a1 = Math.PI * 2) => {
    const pts = [];
    for (let i = 0; i <= 64; i++) { const a = a0 + (a1 - a0) * i / 64; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    line(pts);
  };
  circle(0, 0, 9.15);
  for (const s of [-1, 1]) {
    const gl = s * L / 2;
    rect(-20.16, gl, 20.16, gl - s * 16.5);   // penalty area
    rect(-9.16, gl, 9.16, gl - s * 5.5);      // six-yard box
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    spot.rotation.x = -Math.PI / 2; spot.position.set(0, 0.03, gl - s * 11); lines.add(spot);
    // D
    const a = Math.acos(5.5 / 9.15);
    circle(0, gl - s * 11, 9.15, s > 0 ? Math.PI + a : a, s > 0 ? Math.PI * 2 - a : Math.PI - a);
    // goal
    const goal = new THREE.Group();
    const post = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (const x of [-3.66, 3.66]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.44), post);
      p.position.set(x, 1.22, gl); goal.add(p);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7.32), post);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, 2.44, gl); goal.add(bar);
    const net = new THREE.Mesh(new THREE.BoxGeometry(7.32, 2.44, 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, wireframe: true }));
    net.position.set(0, 1.22, gl + s * 1); goal.add(net);
    g.add(goal);
  }
  g.add(lines);
  return g;
}

const labelCache = new Map();
// Text sprite sized to fit its text: canvas grows with the string, sprite keeps a fixed height.
function textSprite(text, color = '#fff', size = 44) {
  const key = text + color + size;
  if (!labelCache.has(key)) {
    const c = document.createElement('canvas');
    const x = c.getContext('2d');
    x.font = `bold ${size}px system-ui, sans-serif`;
    const w = Math.ceil(x.measureText(text).width) + 24;
    c.width = Math.max(128, w); c.height = 128;
    x.font = `bold ${size}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText(text, c.width / 2, 64);
    x.fillStyle = color; x.fillText(text, c.width / 2, 64);
    labelCache.set(key, { tex: new THREE.CanvasTexture(c), aspect: c.width / c.height });
  }
  const { tex, aspect } = labelCache.get(key);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(4 * aspect, 4, 1);
  s.userData.aspect = aspect;
  return s;
}

// A player token. opts: {color, label, x, z}. Position is in metres, z = length axis.
// Team A defends z<0 and attacks +z; team B the reverse.
function player(app, { color = 0xe63946, label = '', x = 0, z = 0 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.2, 24), mat);
  body.position.y = 1.1; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.7 }));
  head.position.y = 2.9; head.castShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.7, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  g.add(body, head, ring);
  if (label) { const s = textSprite(label); s.position.y = 5; g.add(s); }
  g.position.set(x, 0, z);
  g.target = g.position.clone();
  g.userData.ring = ring;
  g.moveTo = (x, z, d = 1.2) => { tween(app, g.position, new THREE.Vector3(x, 0, z), d); return g; };
  g.highlight = (on = true) => { ring.material.opacity = on ? 1 : 0.5; ring.scale.setScalar(on ? 1.4 : 1); return g; };
  app.scene.add(g); app.dynamic.push(g);
  return g;
}

function ball(app) {
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  b.castShadow = true; b.position.y = 0.5;
  b.moveTo = (x, z, d = 0.8, arc = 0) => { tween(app, b.position, new THREE.Vector3(x, 0.5, z), d, arc); return b; };
  app.scene.add(b); app.dynamic.push(b);
  return b;
}

function arrow(app, [x0, z0], [x1, z1], color = 0xffd166) {
  const from = new THREE.Vector3(x0, 1.5, z0), to = new THREE.Vector3(x1, 1.5, z1);
  const dir = to.clone().sub(from), len = dir.length();
  const a = new THREE.ArrowHelper(dir.normalize(), from, len, color, Math.min(3, len * 0.3), Math.min(1.6, len * 0.15));
  a.line.material.linewidth = 2;
  app.scene.add(a); app.dynamic.push(a);
  return a;
}

// Translucent highlighted rectangle on the turf: {x, z, w, h, color}
function zone(app, { x = 0, z = 0, w = 20, h = 20, color = 0xffd166, opacity = 0.25 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z);
  app.scene.add(m); app.dynamic.push(m);
  return m;
}

function floatingLabel(app, text, { x = 0, z = 0, y = 6, color = '#ffd166', size = 40 } = {}) {
  const s = textSprite(text, color, size);
  s.position.set(x, y, z); s.scale.set(8 * s.userData.aspect, 8, 1);
  app.scene.add(s); app.dynamic.push(s);
  return s;
}

// Smoothly move `obj` (a Vector3) to `to` over `d` seconds; `arc` lifts it mid-way (for lobbed balls).
export function tween(app, obj, to, d = 1, arc = 0) {
  const from = obj.clone(); let t = 0;
  const f = (dt) => {
    t = Math.min(1, t + dt / d);
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
    obj.lerpVectors(from, to, e);
    if (arc) obj.y += Math.sin(t * Math.PI) * arc;
    if (t >= 1) app.tweens.delete(f);
  };
  app.tweens.add(f);
}

// Formation string like "2-3-5" or "3-2-2-3" (defence first, GK implied) → 11 [x, z] positions.
// side: 1 = team defending z<0 (attacking upward), -1 = mirrored opponent.
export function formation(str, side = 1, { depth = 0.9, width = 0.85 } = {}) {
  const lines = str.split('-').map(Number);
  const pos = [[0, -L / 2 + 3]];
  const zStart = -L / 2 + 12, zEnd = -L / 2 + 12 + (L - 24) * depth;
  lines.forEach((n, i) => {
    const z = lines.length === 1 ? zStart : zStart + (zEnd - zStart) * i / (lines.length - 1);
    for (let k = 0; k < n; k++) {
      const x = n === 1 ? 0 : (-W / 2 * width) + (W * width) * k / (n - 1);
      pos.push([x, z]);
    }
  });
  return pos.map(([x, z]) => [x * side, z * side]);
}

// Build 11 players from a formation. Returns array of player groups (index 0 = GK).
export function team(app, str, { side = 1, color = 0xe63946, labels } = {}) {
  return formation(str, side).map(([x, z], i) =>
    app.player({ color, x, z, label: labels ? labels[i] : String(i + 1) }));
}

// Move an existing team array to a new formation string.
export function reshape(players, str, side = 1, d = 1.6) {
  formation(str, side).forEach(([x, z], i) => players[i] && players[i].moveTo(x, z, d));
}

// Button-driven steps: shows one <section class="step"> at a time with a Back / Next bar
// and calls onStep(i, el) each time a step is shown. Arrow keys work too.
export function steps(onStep, selector = '.step') {
  const els = [...document.querySelectorAll(selector)];
  const hero = document.querySelector('header.hero');
  const nextChapter = document.querySelector('footer.chapter-nav a:last-of-type');
  document.body.classList.add('stepped');
  const bar = document.createElement('div');
  bar.className = 'stepbar';
  bar.innerHTML = '<button class="prev" type="button">◀ Back</button><span class="count"></span><a class="next" href="#">Start ▶</a>';
  document.body.appendChild(bar);
  const prev = bar.querySelector('.prev'), next = bar.querySelector('.next'), count = bar.querySelector('.count');
  let current = -1;
  const show = (i) => {
    i = Math.max(-1, Math.min(els.length - 1, i));
    if (i === current) return;
    current = i;
    if (hero) hero.hidden = current >= 0;
    els.forEach((el, k) => el.classList.toggle('active', k === current));
    prev.disabled = current <= 0; // the hero is the intro; its scene is not re-runnable
    count.textContent = current < 0 ? '' : `${current + 1} / ${els.length}`;
    const last = current === els.length - 1;
    next.textContent = last ? (nextChapter ? nextChapter.textContent : 'The end') : current < 0 ? 'Start ▶' : 'Next ▶';
    next.href = last && nextChapter ? nextChapter.href : '#';
    if (current >= 0) onStep(current, els[current]);
  };
  prev.onclick = () => show(current - 1);
  next.onclick = (e) => { if (next.getAttribute('href') === '#') { e.preventDefault(); show(current + 1); } };
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && current < els.length - 1) show(current + 1);
    if (e.key === 'ArrowLeft') show(current - 1);
  });
  show(-1);
  return els;
}
