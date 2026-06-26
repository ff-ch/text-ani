"use strict";

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
// Offscreen canvas used for motion-blur sub-sampling.
const sub = document.createElement("canvas");
const subCtx = sub.getContext("2d", { willReadFrequently: true });

// ---------------------------------------------------------------------------
//  Fonts — web-safe + a curated set of Google Fonts (loaded on demand).
// ---------------------------------------------------------------------------
const FONTS = [
  { label: "Helvetica / Arial", css: "Helvetica, Arial, sans-serif" },
  { label: "Georgia", css: "Georgia, serif" },
  { label: "Times New Roman", css: "'Times New Roman', serif" },
  { label: "Courier", css: "'Courier New', monospace" },
  { label: "Verdana", css: "Verdana, sans-serif" },
  { label: "Trebuchet MS", css: "'Trebuchet MS', sans-serif" },
  { label: "Impact", css: "Impact, sans-serif" },
  // Google fonts (family name must match the loaded family)
  { label: "Inter", css: "'Inter', sans-serif", g: "Inter:wght@300;400;700;900" },
  { label: "Roboto", css: "'Roboto', sans-serif", g: "Roboto:wght@300;400;700;900" },
  { label: "Montserrat", css: "'Montserrat', sans-serif", g: "Montserrat:wght@300;400;700;900" },
  { label: "Poppins", css: "'Poppins', sans-serif", g: "Poppins:wght@300;400;700;900" },
  { label: "Raleway", css: "'Raleway', sans-serif", g: "Raleway:wght@300;400;700;900" },
  { label: "Oswald", css: "'Oswald', sans-serif", g: "Oswald:wght@300;400;700" },
  { label: "Bebas Neue", css: "'Bebas Neue', sans-serif", g: "Bebas+Neue" },
  { label: "Anton", css: "'Anton', sans-serif", g: "Anton" },
  { label: "Archivo Black", css: "'Archivo Black', sans-serif", g: "Archivo+Black" },
  { label: "Playfair Display", css: "'Playfair Display', serif", g: "Playfair+Display:wght@400;700;900" },
  { label: "Abril Fatface", css: "'Abril Fatface', serif", g: "Abril+Fatface" },
  { label: "Lobster", css: "'Lobster', cursive", g: "Lobster" },
  { label: "Pacifico", css: "'Pacifico', cursive", g: "Pacifico" },
  { label: "Dancing Script", css: "'Dancing Script', cursive", g: "Dancing+Script:wght@400;700" },
  { label: "Bangers", css: "'Bangers', cursive", g: "Bangers" },
  { label: "Permanent Marker", css: "'Permanent Marker', cursive", g: "Permanent+Marker" },
  { label: "Righteous", css: "'Righteous', cursive", g: "Righteous" },
];

(function loadGoogleFonts() {
  const fams = FONTS.filter((f) => f.g).map((f) => "family=" + f.g);
  $("gfonts").href = "https://fonts.googleapis.com/css2?" + fams.join("&") + "&display=swap";
})();

// User-uploaded fonts, pinned to the top of the picker. Persisted to localStorage.
const FKEY = "text-ani-fonts";
let customFonts = [];  // { family, label, css, data(dataURL) }

// Only ever load font/background data from inline data: URLs. An imported preset
// shared by someone else could otherwise smuggle a remote url() in here, making
// the browser fetch (and beacon to) an attacker's server when the preset opens.
const isDataUrl = (v) => typeof v === "string" && /^data:/i.test(v);

function registerFontFace(c) {
  if (!isDataUrl(c.data)) return;
  try {
    const ff = new FontFace(c.family, `url(${c.data})`);
    ff.load().then(() => document.fonts.add(ff)).then(() => { invalidateLayouts(); render(); }).catch(() => {});
  } catch {}
}
function persistCustomFonts() {
  try { localStorage.setItem(FKEY, JSON.stringify(customFonts)); }
  catch { /* font files can exceed the storage quota; they still work this session */ }
}
function loadStoredFonts() {
  try {
    const arr = JSON.parse(localStorage.getItem(FKEY) || "[]");
    if (Array.isArray(arr)) { customFonts = arr; customFonts.forEach(registerFontFace); }
  } catch {}
}
// Merge custom fonts that arrive with an imported preset.
function mergeCustomFonts(incoming) {
  if (!Array.isArray(incoming)) return;
  for (const c of incoming) {
    if (!c || !c.family || !isDataUrl(c.data)) continue;
    if (!customFonts.some((x) => x.family === c.family)) { customFonts.unshift(c); registerFontFace(c); }
  }
  persistCustomFonts();
}

async function addCustomFontFile(file) {
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  let base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Custom Font";
  const taken = (fam) => customFonts.some((c) => c.family === fam) || FONTS.some((f) => f.label === fam);
  let family = base, n = 2;
  while (taken(family)) family = base + " " + n++;
  const css = `'${family}', sans-serif`;
  const entry = { family, label: family, css, data };
  try {
    const ff = new FontFace(family, `url(${data})`);
    await ff.load();
    document.fonts.add(ff);
  } catch { alert("Couldn't load that font file. Supported: .ttf, .otf, .woff, .woff2"); return; }
  customFonts.unshift(entry);   // newest custom font goes to the very top
  persistCustomFonts();
  invalidateLayouts();
  chooseFont(css);              // apply to the current layer
  rebuildFontMenu();
}

// ---------------------------------------------------------------------------
//  State — the whole project.
// ---------------------------------------------------------------------------
const DEFAULT_SHADOW = { enabled: false, distance: 8, angle: 45, blur: 8, opacity: 0.5, color: "#000000" };
function layerShadow(L) { if (!L.shadow) L.shadow = { ...DEFAULT_SHADOW }; return L.shadow; }

function newLayer(text = "Hello") {
  return {
    id: Math.random().toString(36).slice(2),
    name: text.split("\n")[0].slice(0, 18) || "Layer",
    visible: true,
    text,
    fontFamily: FONTS[0].css,
    fontWeight: "700",
    fontSize: 120,
    color: "#ffffff",
    tracking: 0,
    wordSpacing: 0,
    lineHeight: 1.1,
    posX: 0,
    posY: 0,
    style: "fade",
    unit: "whole",
    stagger: 0.5,
    easing: 3,
    inDur: 0.8,
    outDur: 0.6,
    rollDur: 0.5,
    rollHold: 1,
    rollLines: 1,
    shadow: { ...DEFAULT_SHADOW },
  };
}

let project = {
  width: 1920, height: 1080, fps: 25, duration: 3,
  motionBlur: { enabled: false, samples: 8, shutter: 0.5, preview: false },
  bgImage: null,            // dataURL, preview only
  layers: [newLayer()],
  selected: 0,
};

const LAYER_FIELDS = ["text","fontFamily","fontWeight","fontSize","color","tracking",
  "wordSpacing","lineHeight","posX","posY","style","unit","stagger","easing","inDur","outDur","rollDur","rollHold","rollLines"];
const NUMERIC = new Set(["fontSize","tracking","wordSpacing","lineHeight","posX","posY","stagger","easing","inDur","outDur","rollDur","rollHold","rollLines"]);

const curLayer = () => project.layers[project.selected];

// ---------------------------------------------------------------------------
//  Easing
// ---------------------------------------------------------------------------
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
// Slider-controlled ease-out: k=1 linear → k=6 very sharp.
const easeK = (t, k) => 1 - Math.pow(1 - t, k);

// ---------------------------------------------------------------------------
//  Layout — string → positioned glyphs (independent of time). Cached per layer.
// ---------------------------------------------------------------------------
function layoutLayer(layer) {
  const sig = [layer.text, layer.fontFamily, layer.fontWeight, layer.fontSize,
    layer.tracking, layer.wordSpacing, layer.lineHeight, layer.posX, layer.posY,
    project.width, project.height].join("|");
  if (layer._sig === sig && layer._layout) return layer._layout;

  ctx.font = `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
  const lines = layer.text.split("\n");
  const lineH = layer.fontSize * layer.lineHeight;
  const blockH = lineH * lines.length;
  const offX = (layer.posX / 100) * project.width;
  const offY = (layer.posY / 100) * project.height;
  const startY = project.height / 2 - blockH / 2 + lineH / 2 + offY;

  const glyphs = [];
  let gi = 0, word = 0;

  lines.forEach((line, li) => {
    // Measure full line width including tracking + word spacing.
    let lineW = 0;
    for (const ch of line) {
      lineW += ctx.measureText(ch).width + layer.tracking + (ch === " " ? layer.wordSpacing : 0);
    }
    lineW -= layer.tracking; // no trailing track
    let x = project.width / 2 - lineW / 2 + offX;
    const y = startY + li * lineH;
    let inWord = false;

    for (const ch of line) {
      const cw = ctx.measureText(ch).width;
      if (ch === " ") { if (inWord) { word++; inWord = false; } }
      else inWord = true;
      glyphs.push({ ch, x: x + cw / 2, y, gi, word, line: li, draw: ch !== " " });
      x += cw + layer.tracking + (ch === " " ? layer.wordSpacing : 0);
      gi++;
    }
    if (inWord) word++;
  });

  layer._sig = sig;
  layer._layout = { glyphs, totalWords: Math.max(1, word) };
  return layer._layout;
}

// Group glyphs into animated elements by unit.
function buildElements(lay, unit) {
  const draw = lay.glyphs.filter((g) => g.draw);
  if (unit === "whole") return [{ glyphs: draw, order: 0 }];
  if (unit === "letter") return draw.map((g, i) => ({ glyphs: [g], order: i }));
  // word or line: group glyphs by the relevant key, ordered by reading order.
  const key = unit === "line" ? (g) => g.line : (g) => g.word;
  const map = new Map();
  for (const g of draw) {
    const k = key(g);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(g);
  }
  return [...map.keys()].sort((a, b) => a - b).map((k, i) => ({ glyphs: map.get(k), order: i }));
}

function centroid(glyphs) {
  let sx = 0, sy = 0;
  for (const g of glyphs) { sx += g.x; sy += g.y; }
  return { cx: sx / glyphs.length, cy: sy / glyphs.length };
}

// ---------------------------------------------------------------------------
//  Draw one layer at time t.
// ---------------------------------------------------------------------------
function styleTransform(style, p, fontSize) {
  const dist = fontSize * 0.9;
  switch (style) {
    case "fade":       return { alpha: p, dx: 0, dy: 0, scale: 1 };
    case "slideUp":    return { alpha: p, dx: 0, dy: (1 - p) * dist, scale: 1 };
    case "slideDown":  return { alpha: p, dx: 0, dy: -(1 - p) * dist, scale: 1 };
    case "slideLeft":  return { alpha: p, dx: (1 - p) * dist, dy: 0, scale: 1 };
    case "slideRight": return { alpha: p, dx: -(1 - p) * dist, dy: 0, scale: 1 };
    case "pop":        return { alpha: p, dx: 0, dy: 0, scale: easeOutBack(clamp(p)) };
    case "zoomIn":     return { alpha: p, dx: 0, dy: 0, scale: 0.4 + 0.6 * p };
    case "zoomOut":    return { alpha: p, dx: 0, dy: 0, scale: 1.6 - 0.6 * p };
    default:           return { alpha: p, dx: 0, dy: 0, scale: 1 };
  }
}

// "Roll" — slot-machine reel. Lines share a window (clipped to N line heights,
// where N = rollLines lines per turn) at the layer position. Each turn advances
// the reel by one block of N lines: the window shows lines [b·N … b·N+N-1] for
// block b. The reel position u is the (fractional) line index centred in the
// window; it advances N notches per roll (eased) and parks during holds,
// running from one block below the window → the last block rolled out the top.
function drawRollLayer(c, layer, t, lay) {
  const lineCount = layer.text.split("\n").length;
  const perTurn = Math.max(1, Math.min(3, Math.round(+layer.rollLines || 1)));
  const blocks = Math.ceil(lineCount / perTurn);
  const lineH = layer.fontSize * layer.lineHeight;
  const winH = perTurn * lineH;                       // window is N lines tall
  const cy = project.height / 2 + (layer.posY / 100) * project.height;
  const rollDur = Math.max(0.05, +layer.rollDur || 0.5);
  const cycle = rollDur + Math.max(0, +layer.rollHold || 0);

  // Park centre of block b (line index centred in the window). Blocks are
  // evenly spaced by perTurn, so park(k) = k·perTurn + (perTurn−1)/2.
  const park = (k) => k * perTurn + (perTurn - 1) / 2;
  const k = Math.min(Math.floor(t / cycle), blocks); // which roll/hold we're in
  const tk = t - k * cycle;
  const u = tk < rollDur
    ? park(k - 1) + easeK(clamp(tk / rollDur), layer.easing) * perTurn
    : park(k);
  if (u <= park(-1) || u >= park(blocks)) return;

  c.save();
  c.beginPath();
  c.rect(0, cy - winH / 2, project.width, winH);
  c.clip();
  for (const g of lay.glyphs) {
    if (!g.draw) continue;
    const off = (g.line - u) * lineH;
    if (Math.abs(off) >= (perTurn + 1) * lineH / 2) continue;
    c.fillText(g.ch, g.x, cy + off);
  }
  c.restore();
}

function drawLayer(c, layer, t) {
  if (!layer.visible) return;
  const lay = layoutLayer(layer);
  c.font = `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
  c.fillStyle = layer.color;
  c.textAlign = "center";
  c.textBaseline = "middle";

  // Drop shadow (native canvas shadow). Reset at the end so it doesn't bleed
  // into the next layer.
  const sh = layerShadow(layer);
  if (sh.enabled) {
    const rad = (sh.angle * Math.PI) / 180;
    c.shadowColor = hexToRgba(sh.color, sh.opacity);
    c.shadowBlur = sh.blur;
    c.shadowOffsetX = sh.distance * Math.cos(rad);
    c.shadowOffsetY = sh.distance * Math.sin(rad);
  } else {
    c.shadowColor = "rgba(0,0,0,0)"; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
  }

  // Roll runs its own per-line in/hold/out timeline, so it skips the
  // style×unit×stagger pipeline and the exit fade (its last roll is the exit).
  if (layer.style === "roll") {
    drawRollLayer(c, layer, t, lay);
    c.shadowColor = "rgba(0,0,0,0)"; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
    return;
  }

  // Exit fade over the last outDur seconds.
  let exit = 1;
  if (layer.outDur > 0 && t > project.duration - layer.outDur) {
    exit = easeK(clamp((project.duration - t) / layer.outDur), 2);
  }

  const els = buildElements(lay, layer.unit);
  const count = els.length;
  const inDur = Math.max(0.0001, layer.inDur);
  const spread = inDur * layer.stagger;
  const each = Math.max(0.0001, inDur - spread);

  for (const el of els) {
    const start = count > 1 ? (el.order / (count - 1)) * spread : 0;
    const pRaw = clamp((t - start) / each);
    const p = easeK(pRaw, layer.easing);
    const tr = styleTransform(layer.style, p, layer.fontSize);
    const a = clamp(tr.alpha) * exit;
    if (a <= 0) continue;
    const { cx, cy } = centroid(el.glyphs);
    c.globalAlpha = a;
    for (const g of el.glyphs) {
      c.save();
      c.translate(cx + tr.dx, cy + tr.dy);
      c.scale(tr.scale, tr.scale);
      c.fillText(g.ch, g.x - cx, g.y - cy);
      c.restore();
    }
  }
  c.globalAlpha = 1;
  c.shadowColor = "rgba(0,0,0,0)"; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
}

function hexToRgba(hex, a) {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16), g = parseInt(m.substring(2, 4), 16), b = parseInt(m.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function drawAll(c, t) {
  c.clearRect(0, 0, project.width, project.height);
  for (const layer of project.layers) drawLayer(c, layer, t);
}

// ---------------------------------------------------------------------------
//  Motion blur — accumulate sub-frames (premultiplied) and average.
// ---------------------------------------------------------------------------
function renderFrame(t, allowBlur) {
  const mb = project.motionBlur;
  if (!(allowBlur && mb.enabled && mb.samples > 1)) { drawAll(ctx, t); return; }

  const w = project.width, h = project.height, N = mb.samples;
  sub.width = w; sub.height = h;
  const acc = new Float32Array(w * h * 4); // sumPremR, sumPremG, sumPremB, sumA
  const frameDur = 1 / project.fps;

  for (let j = 0; j < N; j++) {
    const st = clamp(t + (j / (N - 1) - 0.5) * mb.shutter * frameDur, 0, project.duration);
    drawAll(subCtx, st);
    const data = subCtx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < data.length; i += 4) {
      const al = data[i + 3] / 255;
      acc[i]     += data[i]     * al;
      acc[i + 1] += data[i + 1] * al;
      acc[i + 2] += data[i + 2] * al;
      acc[i + 3] += data[i + 3];
    }
  }

  const out = ctx.createImageData(w, h);
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    const aAvg = acc[i + 3] / N;          // 0..255 straight alpha
    o[i + 3] = aAvg;
    if (aAvg > 0) {
      const m = aAvg / 255;                // un-premultiply
      o[i]     = (acc[i]     / N) / m;
      o[i + 1] = (acc[i + 1] / N) / m;
      o[i + 2] = (acc[i + 2] / N) / m;
    }
  }
  ctx.putImageData(out, 0, 0);
}

// ---------------------------------------------------------------------------
//  Preview playback
// ---------------------------------------------------------------------------
let playing = false, playT = 0, lastTs = 0;

function applySize() { canvas.width = project.width; canvas.height = project.height; }

function render() {
  // Blur on static frames always; during playback only if the user opted in.
  renderFrame(playT, !playing || project.motionBlur.preview);
  $("scrub").value = Math.round((playT / project.duration) * 1000);
  $("timeLabel").textContent = playT.toFixed(2) + "s";
}

function tick(ts) {
  if (!playing) return;
  if (!lastTs) lastTs = ts;
  playT += (ts - lastTs) / 1000; lastTs = ts;
  if (playT >= project.duration) playT = 0;
  render();
  requestAnimationFrame(tick);
}
function play() { playing = true; lastTs = 0; $("playBtn").textContent = "❚❚"; requestAnimationFrame(tick); }
function pause() { playing = false; $("playBtn").textContent = "▶"; render(); }

$("playBtn").onclick = () => (playing ? pause() : play());
$("scrub").oninput = (e) => { pause(); playT = (e.target.value / 1000) * project.duration; render(); };

// ---------------------------------------------------------------------------
//  UI binding
// ---------------------------------------------------------------------------
function syncControlsFromState() {
  const L = curLayer();
  LAYER_FIELDS.forEach((f) => { const el = $(f); if (el) el.value = L[f]; });
  setFontPickerLabel(L.fontFamily);
  const sizeVal = project.width + "x" + project.height;
  $("sizePreset").value = [...$("sizePreset").options].some((o) => o.value === sizeVal) ? sizeVal : "custom";
  $("customSizeRow").hidden = $("sizePreset").value !== "custom";
  $("canvasW").value = project.width; $("canvasH").value = project.height;
  $("duration").value = project.duration; $("fps").value = project.fps;
  $("mbEnabled").checked = project.motionBlur.enabled;
  $("mbSamples").value = project.motionBlur.samples;
  $("mbShutter").value = project.motionBlur.shutter;
  $("mbPreview").checked = !!project.motionBlur.preview;
  const sh = layerShadow(L);
  $("shEnabled").checked = sh.enabled;
  $("shDistance").value = sh.distance;
  $("shAngle").value = sh.angle;
  $("shBlur").value = sh.blur;
  $("shOpacity").value = sh.opacity;
  $("shColor").value = sh.color;
  updateValueLabels();
}

function updateValueLabels() {
  const L = curLayer();
  $("fontSizeVal").textContent = L.fontSize;
  $("trackingVal").textContent = L.tracking;
  $("wordSpacingVal").textContent = L.wordSpacing;
  $("lineHeightVal").textContent = (+L.lineHeight).toFixed(2);
  $("posXVal").textContent = L.posX;
  $("posYVal").textContent = L.posY;
  $("staggerVal").textContent = (+L.stagger).toFixed(2);
  $("easingVal").textContent = (+L.easing).toFixed(1);
  $("mbSamplesVal").textContent = project.motionBlur.samples;
  $("mbShutterVal").textContent = (+project.motionBlur.shutter).toFixed(2);
  const sh = layerShadow(L);
  $("shDistanceVal").textContent = sh.distance;
  $("shAngleVal").textContent = sh.angle;
  $("shBlurVal").textContent = sh.blur;
  $("shOpacityVal").textContent = (+sh.opacity).toFixed(2);

  // Roll swaps the stagger/unit/in-out controls for its own timing fields.
  const isRoll = L.style === "roll";
  $("unitField").hidden = isRoll;
  $("staggerField").hidden = isRoll;
  $("inOutRow").hidden = isRoll;
  $("rollOpts").hidden = !isRoll;
  if (isRoll) {
    const n = L.text.split("\n").length;
    const perTurn = Math.max(1, Math.min(3, Math.round(+L.rollLines || 1)));
    const turns = Math.ceil(n / perTurn);
    const roll = +L.rollDur || 0.5, hold = Math.max(0, +L.rollHold || 0);
    const total = turns * (roll + hold) + roll;
    $("rollHint").textContent =
      `${n} line${n === 1 ? "" : "s"} → ${turns} turn${turns === 1 ? "" : "s"} × ${perTurn} line${perTurn === 1 ? "" : "s"} → ${total.toFixed(1)}s total (set Duration ≥ ${total.toFixed(1)}s to see every roll).`;
  }
}

// Layer-field controls (fontFamily is handled by the custom font picker below)
LAYER_FIELDS.filter((f) => f !== "fontFamily").forEach((f) => {
  $(f).addEventListener("input", (e) => {
    const L = curLayer();
    L[f] = NUMERIC.has(f) ? parseFloat(e.target.value) : e.target.value;
    if (f === "text") { L.name = L.text.split("\n")[0].slice(0, 18) || "Layer"; renderLayerList(); }
    if (f === "fontWeight") ensureFont(L).then(render);
    updateValueLabels();
    if (playT > project.duration) playT = 0;
    render();
  });
});

// Project controls
$("sizePreset").addEventListener("input", (e) => {
  if (e.target.value === "custom") { $("customSizeRow").hidden = false; }
  else { const [w, h] = e.target.value.split("x").map(Number); project.width = w; project.height = h; $("customSizeRow").hidden = true; invalidateLayouts(); applySize(); render(); }
});
$("canvasW").addEventListener("input", (e) => { project.width = parseInt(e.target.value) || 1920; invalidateLayouts(); applySize(); render(); });
$("canvasH").addEventListener("input", (e) => { project.height = parseInt(e.target.value) || 1080; invalidateLayouts(); applySize(); render(); });
$("duration").addEventListener("input", (e) => { project.duration = parseFloat(e.target.value) || 3; render(); });
$("fps").addEventListener("input", (e) => { project.fps = parseInt(e.target.value); });
$("mbEnabled").addEventListener("input", (e) => { project.motionBlur.enabled = e.target.checked; render(); });
$("mbSamples").addEventListener("input", (e) => { project.motionBlur.samples = parseInt(e.target.value); updateValueLabels(); render(); });
$("mbShutter").addEventListener("input", (e) => { project.motionBlur.shutter = parseFloat(e.target.value); updateValueLabels(); render(); });
$("mbPreview").addEventListener("input", (e) => { project.motionBlur.preview = e.target.checked; render(); });

// Drop-shadow controls (per layer)
const SHADOW_NUM = { shDistance: "distance", shAngle: "angle", shBlur: "blur", shOpacity: "opacity" };
Object.entries(SHADOW_NUM).forEach(([id, key]) => {
  $(id).addEventListener("input", (e) => { layerShadow(curLayer())[key] = parseFloat(e.target.value); updateValueLabels(); render(); });
});
$("shEnabled").addEventListener("input", (e) => { layerShadow(curLayer()).enabled = e.target.checked; render(); });
$("shColor").addEventListener("input", (e) => { layerShadow(curLayer()).color = e.target.value; render(); });

function invalidateLayouts() { project.layers.forEach((l) => { l._sig = null; }); }

// ---------------------------------------------------------------------------
//  Layer list UI
// ---------------------------------------------------------------------------
function renderLayerList() {
  const list = $("layerList");
  list.innerHTML = "";
  project.layers.forEach((l, i) => {
    const row = document.createElement("div");
    row.className = "layer-row" + (i === project.selected ? " active" : "");
    const vis = document.createElement("span");
    vis.className = "vis" + (l.visible ? "" : " off");
    vis.textContent = l.visible ? "👁" : "🚫";
    vis.onclick = (e) => { e.stopPropagation(); l.visible = !l.visible; renderLayerList(); render(); };
    const name = document.createElement("span");
    name.className = "name"; name.textContent = l.name || "Layer";
    row.append(vis, name);
    row.onclick = () => { project.selected = i; syncControlsFromState(); renderLayerList(); };
    list.appendChild(row);
  });
}

$("addLayer").onclick = () => { project.layers.push(newLayer("New text")); project.selected = project.layers.length - 1; syncControlsFromState(); renderLayerList(); render(); };
$("dupLayer").onclick = () => { const c = JSON.parse(JSON.stringify(curLayer())); c.id = Math.random().toString(36).slice(2); c._sig = null; project.layers.splice(project.selected + 1, 0, c); project.selected++; syncControlsFromState(); renderLayerList(); render(); };
$("delLayer").onclick = () => { if (project.layers.length === 1) return; project.layers.splice(project.selected, 1); project.selected = Math.max(0, project.selected - 1); syncControlsFromState(); renderLayerList(); render(); };
$("layerUp").onclick = () => { const i = project.selected; if (i === 0) return; [project.layers[i - 1], project.layers[i]] = [project.layers[i], project.layers[i - 1]]; project.selected--; renderLayerList(); render(); };
$("layerDown").onclick = () => { const i = project.selected; if (i === project.layers.length - 1) return; [project.layers[i + 1], project.layers[i]] = [project.layers[i], project.layers[i + 1]]; project.selected++; renderLayerList(); render(); };

// ---------------------------------------------------------------------------
//  Fonts loading helper
// ---------------------------------------------------------------------------
function ensureFont(layer) {
  const spec = `${layer.fontWeight} 100px ${layer.fontFamily}`;
  try { return document.fonts.load(spec).then(() => { invalidateLayouts(); }); }
  catch { return Promise.resolve(); }
}

// ---------------------------------------------------------------------------
//  Font picker — custom dropdown with live previews; custom fonts pinned on top.
// ---------------------------------------------------------------------------
function fontLabel(css) {
  const f = [...customFonts, ...FONTS].find((x) => x.css === css);
  return f ? f.label : css;
}
function setFontPickerLabel(css) {
  const el = $("fontPickerLabel");
  el.textContent = fontLabel(css);
  el.style.fontFamily = css;
}
function chooseFont(css) {
  const L = curLayer();
  L.fontFamily = css;
  setFontPickerLabel(css);
  ensureFont(L).then(render);
  closeFontMenu();
  render();
}
function fontItemEl(entry, removable) {
  const d = document.createElement("div");
  d.className = "fp-item" + (entry.css === curLayer().fontFamily ? " sel" : "");
  d.textContent = entry.label;
  d.style.fontFamily = entry.css;
  d.title = entry.label;
  d.onclick = () => chooseFont(entry.css);
  if (removable) {
    const x = document.createElement("span");
    x.className = "fp-del"; x.textContent = "✕"; x.title = "Remove custom font";
    x.onclick = (e) => {
      e.stopPropagation();
      customFonts = customFonts.filter((c) => c.family !== entry.family);
      persistCustomFonts();
      rebuildFontMenu();
    };
    d.appendChild(x);
  }
  return d;
}
function header(text) { const h = document.createElement("div"); h.className = "fp-header"; h.textContent = text; return h; }

function rebuildFontMenu() {
  const menu = $("fontPickerMenu");
  menu.innerHTML = "";
  const add = document.createElement("div");
  add.className = "fp-item action"; add.textContent = "＋  Add custom font…";
  add.onclick = () => $("fontFile").click();
  menu.appendChild(add);
  if (customFonts.length) {
    menu.appendChild(header("Custom"));
    customFonts.forEach((c) => menu.appendChild(fontItemEl(c, true)));
  }
  menu.appendChild(header("Built-in"));
  FONTS.forEach((f) => menu.appendChild(fontItemEl(f, false)));
}
function openFontMenu() {
  rebuildFontMenu();
  $("fontPickerMenu").hidden = false;
  // Kick off loads so previews render in their real typeface.
  [...customFonts, ...FONTS].forEach((f) => { try { document.fonts.load(`400 19px ${f.css}`); } catch {} });
}
function closeFontMenu() { $("fontPickerMenu").hidden = true; }

$("fontPickerBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if ($("fontPickerMenu").hidden) openFontMenu(); else closeFontMenu();
});
document.addEventListener("click", (e) => {
  if (!$("fontPicker").contains(e.target)) closeFontMenu();
});
$("fontFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) addCustomFontFile(file);
  e.target.value = "";
});

// ---------------------------------------------------------------------------
//  Reference background (preview only)
// ---------------------------------------------------------------------------
const wrap = $("canvasWrap");
function applyBg() {
  if (isDataUrl(project.bgImage)) { wrap.style.setProperty("--bg-img", `url(${project.bgImage})`); wrap.classList.add("has-bg"); }
  else { wrap.classList.remove("has-bg"); }
}
$("bgFile").addEventListener("change", (e) => {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => { project.bgImage = r.result; applyBg(); };
  r.readAsDataURL(file);
});
$("clearBg").onclick = () => { project.bgImage = null; $("bgFile").value = ""; applyBg(); };
$("checker").addEventListener("change", (e) => wrap.classList.toggle("checker", e.target.checked));
wrap.classList.add("checker");

// ---------------------------------------------------------------------------
//  Presets — localStorage + JSON import/export
// ---------------------------------------------------------------------------
const PKEY = "text-ani-presets";
function loadPresetStore() { try { return JSON.parse(localStorage.getItem(PKEY) || "{}"); } catch { return {}; } }
function refreshPresetList() {
  const store = loadPresetStore();
  const sel = $("presetList");
  sel.innerHTML = '<option value="">— saved presets —</option>';
  Object.keys(store).forEach((n) => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
}
function serialize() {
  const clean = JSON.parse(JSON.stringify(project, (k, v) => (k === "_sig" || k === "_layout" || k === "customFonts") ? undefined : v));
  clean.customFonts = customFonts;   // embed uploaded fonts so presets are portable
  return clean;
}
function hydrate(p) {
  const incomingFonts = p.customFonts; delete p.customFonts;
  project = p; project.selected = 0;
  if (!project.motionBlur) project.motionBlur = { enabled: false, samples: 8, shutter: 0.5 };
  project.layers.forEach((l) => { if (l.rollDur == null) l.rollDur = 0.5; if (l.rollHold == null) l.rollHold = 1; if (l.rollLines == null) l.rollLines = 1; });
  mergeCustomFonts(incomingFonts);
  invalidateLayouts(); applySize(); applyBg(); syncControlsFromState(); renderLayerList();
  Promise.all(project.layers.map(ensureFont)).then(render);
  render();
}
$("savePreset").onclick = () => {
  const name = $("presetName").value.trim(); if (!name) { alert("Name your preset first."); return; }
  const store = loadPresetStore(); store[name] = serialize();
  try { localStorage.setItem(PKEY, JSON.stringify(store)); } catch { alert("Storage full — try exporting to .json instead (large background images don't fit in browser storage)."); return; }
  refreshPresetList(); $("presetList").value = name;
};
$("loadPreset").onclick = () => { const n = $("presetList").value; if (!n) return; const store = loadPresetStore(); if (store[n]) hydrate(JSON.parse(JSON.stringify(store[n]))); };
$("delPreset").onclick = () => { const n = $("presetList").value; if (!n) return; const store = loadPresetStore(); delete store[n]; localStorage.setItem(PKEY, JSON.stringify(store)); refreshPresetList(); };
$("exportPreset").onclick = () => {
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = ($("presetName").value.trim() || "text-ani-preset") + ".json"; a.click();
};
$("importPreset").onclick = () => $("importPresetFile").click();
$("importPresetFile").addEventListener("change", (e) => {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => { try { hydrate(JSON.parse(r.result)); } catch { alert("Invalid preset file."); } };
  r.readAsText(file);
});

// ---------------------------------------------------------------------------
//  Export → stream raw RGBA frames straight into one ffmpeg process (no PNG
//  encoding, no temp files; render and encode run concurrently).
// ---------------------------------------------------------------------------
let exportCancelled = false;
let exportJobId = null;
let exportAbort = null;

$("cancelBtn").onclick = () => {
  exportCancelled = true;
  $("progressLabel").textContent = "Cancelling…";
  if (exportAbort) exportAbort.abort();
  if (exportJobId) fetch(`/api/export/cancel?job=${exportJobId}`, { method: "POST" }).catch(() => {});
};

$("exportBtn").onclick = async () => {
  pause();
  applySize();
  await Promise.all(project.layers.map(ensureFont));
  await document.fonts.ready.catch(() => {});

  const W = project.width, H = project.height;
  const frameCount = Math.max(1, Math.round(project.duration * project.fps));
  const btn = $("exportBtn"), progress = $("progress"), barFill = $("barFill"), label = $("progressLabel");
  exportCancelled = false; exportJobId = null;
  exportAbort = new AbortController();
  const sig = exportAbort.signal;
  btn.disabled = true; progress.hidden = false; barFill.style.width = "0%";
  $("cancelBtn").hidden = false;
  const t0 = performance.now();

  try {
    label.textContent = "Starting…";
    const { id } = await (await fetch("/api/export/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width: W, height: H, fps: project.fps }), signal: sig,
    })).json();
    exportJobId = id;

    for (let i = 0; i < frameCount; i++) {
      if (exportCancelled) break;
      renderFrame(i / project.fps, true);     // always blur on export if enabled
      // Raw straight-alpha RGBA bytes — exactly what ffmpeg -f rawvideo wants.
      const buf = ctx.getImageData(0, 0, W, H).data.buffer;
      await fetch(`/api/export/frame?job=${id}`, {
        method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: buf, signal: sig,
      });
      const pct = Math.round(((i + 1) / frameCount) * 100);
      barFill.style.width = pct + "%";
      const fps = (i + 1) / ((performance.now() - t0) / 1000);
      label.textContent = `Rendering & encoding ${i + 1} / ${frameCount}  (${fps.toFixed(1)} fps)`;
    }

    if (exportCancelled) { label.textContent = "Render cancelled ✕"; return; }

    label.textContent = "Finalising ProRes 4444…"; barFill.style.width = "100%";
    const finishRes = await fetch(`/api/export/finish?job=${id}`, { method: "POST", signal: sig });
    if (!finishRes.ok) { const err = await finishRes.json().catch(() => ({})); throw new Error(err.error || "encoding failed"); }
    const url = URL.createObjectURL(await finishRes.blob());
    const a = document.createElement("a"); a.href = url; a.download = "text-animation.mov"; a.click();
    URL.revokeObjectURL(url);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    label.textContent = `Done — ${frameCount} frames in ${secs}s ✓`;
  } catch (err) {
    if (exportCancelled || err.name === "AbortError") label.textContent = "Render cancelled ✕";
    else { label.textContent = "Error: " + err.message; console.error(err); }
  } finally {
    btn.disabled = false;
    $("cancelBtn").hidden = true;
    exportAbort = null; exportJobId = null;
    setTimeout(() => { if (!btn.disabled) progress.hidden = true; }, 5000);
  }
};

// ---------------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------------
loadStoredFonts();
applySize();
syncControlsFromState();
renderLayerList();
rebuildFontMenu();
refreshPresetList();
ensureFont(curLayer()).then(render);
render();
play();
