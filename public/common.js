// Shared helpers for presenter and participant pages
const LETTERS = ["A", "B", "C", "D"];
const SHAPES = ["▲", "◆", "●", "■"];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function $(id) { return document.getElementById(id); }
function show(id) {
  document.querySelectorAll("[data-screen]").forEach((el) => el.classList.toggle("hidden", el.id !== id));
}
function store(kind, key, val) {
  try {
    const s = kind === "local" ? localStorage : sessionStorage;
    if (val === undefined) return s.getItem(key);
    if (val === null) s.removeItem(key); else s.setItem(key, val);
  } catch { return null; }
}
function toast(msg, ms = 3500) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// Server clock offset so every screen counts down to the same instant.
let clockOffset = 0;
function serverNow() { return Date.now() + clockOffset; }

// Auto-reconnecting WebSocket.
function liveSocket(path, { onOpen, onMessage, onStatus }) {
  let ws, retry = 0, closedByUs = false, pingTimer;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  function open() {
    ws = new WebSocket(`${proto}//${location.host}${path}`);
    ws.onopen = () => {
      retry = 0; onStatus && onStatus(true); onOpen && onOpen(ws);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { try { ws.send(JSON.stringify({ t: "ping" })); } catch {} }, 20000);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (typeof m.now === "number") clockOffset = m.now - Date.now();
      onMessage(m, ws);
    };
    ws.onclose = (e) => {
      clearInterval(pingTimer);
      onStatus && onStatus(false);
      if (closedByUs || e.code === 4000 || e.code === 4001 || e.code === 1008) return;
      setTimeout(open, Math.min(8000, 600 * 2 ** retry++));
    };
    ws.onerror = () => {};
  }
  open();
  return {
    send: (obj) => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; } return false; },
    close: () => { closedByUs = true; try { ws.close(); } catch {} },
  };
}

// Confetti burst for the winners screen. Brand colours, ~5 s, skipped for reduced-motion users.
function celebrate(opts = {}) {
  try { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch {}
  const colors = ["#f64932", "#0075de", "#ffb110", "#02093a", "#62aef0", "#e89d01"];
  const cv = document.createElement("canvas");
  cv.className = "confetti";
  cv.setAttribute("aria-hidden", "true");
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W, H;
  const size = () => { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size(); addEventListener("resize", size);
  const n = opts.count || (W < 600 ? 120 : 220);
  const bits = [];
  const burst = (x, count, delay) => {
    for (let i = 0; i < count; i++) {
      const a = (-90 + (Math.random() - 0.5) * 110) * Math.PI / 180;
      const v = (W < 600 ? 9 : 13) * (0.55 + Math.random() * 0.6);
      bits.push({
        x, y: H + 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 1.35,
        w: 6 + Math.random() * 7, h: 8 + Math.random() * 10,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        tilt: Math.random() * Math.PI, vt: 0.05 + Math.random() * 0.1,
        c: colors[(Math.random() * colors.length) | 0], round: Math.random() < 0.25,
        born: delay,
      });
    }
  };
  burst(W * 0.15, n / 3, 0); burst(W * 0.85, n / 3, 0); burst(W * 0.5, n / 3, 450);
  const t0 = performance.now(), life = 5200;
  function frame(now) {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    const fade = t > life - 1000 ? Math.max(0, (life - t) / 1000) : 1;
    for (const b of bits) {
      if (t < b.born) continue;
      b.vy += 0.22; b.vx *= 0.992; b.vy *= 0.992;
      b.x += b.vx + Math.sin(b.tilt) * 0.6; b.y += b.vy;
      b.r += b.vr; b.tilt += b.vt;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      if (b.round) { ctx.beginPath(); ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else { const sy = Math.abs(Math.cos(b.tilt)); ctx.fillRect(-b.w / 2, -(b.h * sy) / 2, b.w, b.h * sy + 0.5); }
      ctx.restore();
    }
    if (t < life) requestAnimationFrame(frame);
    else { removeEventListener("resize", size); cv.remove(); }
  }
  requestAnimationFrame(frame);
}
