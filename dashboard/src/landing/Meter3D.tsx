// A prepaid electricity meter, modelled from boxes and cylinders: casing, kWh display, spinning disc, nameplate,
// pulse LED, terminal block. Flat shading, ink edges, no glow. Drag to turn it; click it to open the demo.
import * as THREE from "three";
import { useEffect, useRef, useState } from "react";

const PAPER = 0xf3f2ed, INK = 0x111111, ACCENT = 0xff4a1c;

function labelTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!; draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { t, g, c };
}
const edges = (geo: THREE.BufferGeometry, color = INK) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
const box = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, line = true) => {
  const g = new THREE.BoxGeometry(w, h, d); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true }));
  m.position.set(x, y, z); if (line) m.add(edges(g)); return m;
};

export type Callout = { pos: [number, number, number]; label: string; dx: number; dy: number };

export function Meter3D({ onOpen, callouts }: { onOpen: () => void; callouts: Callout[] }) {
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState(false);
  const [ok, setOk] = useState(true);
  const open = useRef(onOpen); open.current = onOpen;

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setOk(false); return; }
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.35); sun.position.set(3, 5, 6); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-4, -2, 3); scene.add(fill);

    const meter = new THREE.Group(); scene.add(meter);
    // back plate and casing
    meter.add(box(3.0, 4.1, 0.14, 0xd9d7cf, 0, 0, -0.62));
    meter.add(box(2.5, 3.5, 1.1, PAPER, 0, 0, 0));
    meter.add(box(2.1, 0.5, 0.22, 0xe4e2da, 0, 1.6, 0.6)); // top cover
    for (const [x, y] of [[-1.35, 1.8], [1.35, 1.8], [-1.35, -1.8], [1.35, -1.8]]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 16), new THREE.MeshBasicMaterial({ color: INK })); h.rotation.x = Math.PI / 2; h.position.set(x, y, -0.55); meter.add(h); }
    // kWh display
    const disp = labelTexture((g, w, h) => { g.fillStyle = "#0e0e0e"; g.fillRect(0, 0, w, h); }, 512, 192);
    const drawDisp = (kwh: number) => { const g = disp.g; g.fillStyle = "#0e0e0e"; g.fillRect(0, 0, 512, 192); g.fillStyle = "#ecebe6"; g.font = "700 96px 'JetBrains Mono Variable', monospace"; g.textBaseline = "middle"; g.fillText(kwh.toFixed(2).padStart(7, "0"), 24, 88); g.font = "500 30px 'JetBrains Mono Variable', monospace"; g.fillStyle = "#ff4a1c"; g.fillText("kWh", 410, 150); disp.t.needsUpdate = true; };
    drawDisp(412.5);
    const display = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.75), new THREE.MeshBasicMaterial({ map: disp.t }));
    display.position.set(0, 1.0, 0.56); meter.add(display);
    const dframe = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.0, 0.75)), new THREE.LineBasicMaterial({ color: INK })); dframe.position.copy(display.position); meter.add(dframe);
    // disc window
    const bezel = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.72, 48), new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide })); bezel.position.set(0, -0.12, 0.56); meter.add(bezel);
    const well = new THREE.Mesh(new THREE.CircleGeometry(0.58, 48), new THREE.MeshBasicMaterial({ color: 0x1b1b1b })); well.position.set(0, -0.12, 0.555); meter.add(well);
    const disc = new THREE.Group(); disc.position.set(0, -0.12, 0.57);
    const dm = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), new THREE.MeshBasicMaterial({ color: 0xc9c8c1 })); disc.add(dm);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.22), new THREE.MeshBasicMaterial({ color: ACCENT })); mark.position.set(0.38, 0, 0.002); disc.add(mark);
    const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.5, 48)), new THREE.LineBasicMaterial({ color: INK })); disc.add(ring);
    meter.add(disc);
    // nameplate
    const plate = labelTexture((g, w, h) => {
      g.fillStyle = "#f3f2ed"; g.fillRect(0, 0, w, h); g.fillStyle = "#111"; g.font = "800 62px Inter, sans-serif"; g.fillText("MOHAR", 20, 74);
      g.font = "500 27px 'JetBrains Mono Variable', monospace"; g.fillText("3200 imp/kWh", 20, 126); g.fillText("230 V  5(60) A  Class 1", 20, 164);
    }, 512, 200);
    const np = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.74), new THREE.MeshBasicMaterial({ map: plate.t })); np.position.set(-0.0, -1.0, 0.56); meter.add(np);
    // pulse LED
    const ledMat = new THREE.MeshBasicMaterial({ color: ACCENT });
    const led = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 20), ledMat); led.rotation.x = Math.PI / 2; led.position.set(0.98, -0.55, 0.58); meter.add(led);
    // terminal block
    meter.add(box(2.2, 0.42, 0.55, 0x2a2a2a, 0, -1.62, 0.3));
    for (const x of [-0.8, -0.27, 0.27, 0.8]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 20), new THREE.MeshBasicMaterial({ color: 0xbdbbb3 })); s.rotation.x = Math.PI / 2; s.position.set(x, -1.62, 0.59); meter.add(s); }

    // interaction
    const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2(); let hovering = false;
    let dragging = false, moved = 0, lx = 0, rotY = 0.45, rotX = -0.06, tY = 0.45, tX = -0.06, auto = true, zoom = 0, entering = 0, sx = 0;
    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(size); ro.observe(el); size();
    const canvas = renderer.domElement; canvas.style.touchAction = "pan-y";
    const pick = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, camera); return ray.intersectObject(meter, true).length > 0; };
    const down = (e: PointerEvent) => { dragging = true; moved = 0; lx = e.clientX; auto = false; canvas.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (dragging) { const dx = e.clientX - lx; lx = e.clientX; moved += Math.abs(dx); tY += dx * 0.008; }
      const h = pick(e); if (h !== hovering) { hovering = h; setHover(h); }
    };
    const up = (e: PointerEvent) => { dragging = false; if (moved < 5 && pick(e) && !entering) entering = performance.now(); };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up);
    const onScroll = () => { sx = clamp01(scrollY / innerHeight); };
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    addEventListener("scroll", onScroll); onScroll();

    const tmp = new THREE.Vector3(); let raf = 0, kwh = 412.5, lastPulse = 0, t0 = performance.now(), lastDisp = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
      if (auto) tY = 0.45 + Math.sin(now / 2600) * 0.22 - sx * 0.9;
      rotY += (tY - rotY) * 0.08; rotX += (tX - rotX) * 0.08;
      meter.rotation.set(rotX, rotY, 0);
      disc.rotation.z -= dt * 1.6;
      // a pulse every 1.1 s: the LED lights and the display ticks, like a real impulse output
      const pulse = (now % 1100) < 160; ledMat.color.setHex(pulse ? ACCENT : 0x5a2a1c);
      if (pulse && now - lastPulse > 600) { lastPulse = now; kwh += 0.3125 / 1000; }
      if (now - lastDisp > 400) { lastDisp = now; drawDisp(kwh); }
      // layout: meter sits right on wide screens
      const wide = el.clientWidth > 900;
      let z = (wide ? 13.5 : 17) - sx * 1.5, x = wide ? 1.4 : 0, y = wide ? -0.1 : 1.6;
      if (entering) { const k = Math.min(1, (now - entering) / 1000); const e = 1 - Math.pow(1 - k, 3); zoom = e; z = z + (4.0 - z) * e; x = x * (1 - e); y = y + (-1.0 - y) * e + 0; tY = rotY * (1 - e); if (k >= 1) { entering = 0; open.current(); } }
      camera.position.set(0, 0, z); meter.position.set(x, y, 0); camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      // callouts
      const s = svg.current; if (s) {
        const w = el.clientWidth, h = el.clientHeight;
        callouts.forEach((c, i) => {
          tmp.set(...c.pos); meter.localToWorld(tmp); tmp.project(camera);
          const px = (tmp.x * 0.5 + 0.5) * w, py = (-tmp.y * 0.5 + 0.5) * h;
          const g = s.children[i] as SVGGElement; if (!g) return;
          const ex = px + c.dx, ey = py + c.dy;
          (g.children[0] as SVGLineElement).setAttribute("x1", String(px)); (g.children[0] as SVGLineElement).setAttribute("y1", String(py)); (g.children[0] as SVGLineElement).setAttribute("x2", String(ex)); (g.children[0] as SVGLineElement).setAttribute("y2", String(ey));
          (g.children[1] as SVGRectElement).setAttribute("x", String(px - 3)); (g.children[1] as SVGRectElement).setAttribute("y", String(py - 3));
          const t = g.children[2] as SVGTextElement; t.setAttribute("x", String(ex + (c.dx > 0 ? 8 : -8))); t.setAttribute("y", String(ey + 4)); t.setAttribute("text-anchor", c.dx > 0 ? "start" : "end");
          g.style.opacity = String(zoom ? 1 - zoom : 1);
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); removeEventListener("scroll", onScroll); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); renderer.dispose(); el.removeChild(canvas); };
  }, []); // eslint-disable-line

  return (
    <div ref={host} className="absolute inset-0" style={{ cursor: hover ? "pointer" : "grab" }}>
      {!ok && <div className="absolute inset-0 grid place-items-center text-sm text-mute">3D isn't available in this browser.</div>}
      <svg ref={svg} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" fontFamily="JetBrains Mono Variable, monospace" fontSize="11">
        {callouts.map((c) => <g key={c.label}><line stroke="#111" strokeWidth="1" /><rect width="6" height="6" fill="#ff4a1c" /><text fill="#111" style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{c.label}</text></g>)}
      </svg>
    </div>
  );
}
