/* ============================================================
   PP48 — Simple Paint dengan p5.js
   Seluruh drawing engine menggunakan fungsi p5.js.
   Setiap shape disimpan sebagai object (bukan pixel permanen),
   sehingga dapat di-select, di-transform, dan dihapus.
   ============================================================ */

// ===================== STATE UTAMA =====================
let cnv;
let objects = [];                 // Step 4 — array penyimpan object
let currentTool = "rect";         // Step 8 — tool aktif (default: rect)
let selectedObject = null;        // Step 25 — object terpilih

// Step 17/19/20/21 — style default untuk shape baru
let defaultFill = "#3498db";      // Step 18 — solid fill selalu ada
let outlineEnabled = false;       // Step 19 — outline default OFF
let outlineColor = "#000000";     // Step 20
let outlineWeight = 2;            // Step 21

// ===================== STATE INTERAKSI =====================
let gestureActive = false;        // gesture (tekan) dimulai di dalam canvas
let dragMode = null;              // 'move' | 'resize' | 'rotate' | null
let resizeInfo = null;            // data awal saat resize via handle sudut
let rotateInfo = null;            // data awal saat rotate via handle
let vertexInfo = null;            // data awal saat drag titik bentuk (sudut shape)
let dragLast = { x: 0, y: 0 };
let startPt = null;               // titik awal drag shape
let previewObj = null;            // object preview saat drag

let pendingPoints = [];           // titik sementara triangle/quad/polygon
let pendingType = null;
let pointerOnCanvas = false;      // tekanan mouse dimulai di atas canvas

let arcStartDeg = 0;              // sudut awal arc (derajat, dari UI)
let arcEndDeg = 180;              // sudut akhir arc (derajat, dari UI)

// ===================== STATE VIEW (pan + zoom) =====================
let view = { x: 0, y: 0, zoom: 1 };   // geser layar (px) + faktor zoom
let wx = 0, wy = 0;                   // posisi mouse dalam koordinat dunia
let spaceHeld = false;                // tombol Space ditekan (mode pan)
let panInfo = null;                   // data awal saat pan
let paper = { w: 1400, h: 1000 };     // ukuran kertas / artboard (px dunia) — lebih besar

const ZOOM_MIN = 0.05;                // batas zoom out
const ZOOM_MAX = 12;                  // batas zoom in
const HANDLE_GAP = 24;                // jarak handle rotate dari bbox (px layar)
const WORKSPACE_COLOR = [32, 32, 32]; // warna area kerja di luar kertas

// Semua object BARU diperkecil 20% dari hasil gesture drag/klik
const DEFAULT_SHAPE_SCALE = 0.8;

// Layout UI mengambang (dipakai untuk memusatkan kertas di AREA STAGE,
// bukan tengah jendela — supaya tidak ketutupan sidebar di kiri)
const UI_MARGIN = 12;
const UI_SIDEBAR_W = 240;
const UI_NAV_H = 60;

// Aturan khusus canvas: label zoom 100% = tampilan "fit" awal (bukan 1:1 px).
// Jadi kertas besar tampil agak nge-zoom-out, tapi keterangan tetap 100%.
let VIEW_BASE_ZOOM = 1;

// Warna indikator selection (Twilight Blue — aksen tunggal di kanvas)
const SEL_COLOR = [66, 97, 136];

// ===================== PHASE 1 — SETUP =====================
function setup() {
  // Kanvas = seluruh layar; UI (header/sidebar) mengambang di atasnya
  cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent("canvas-holder");
  background(WORKSPACE_COLOR);        // Step 3 — background awal

  // Guard: hanya tekanan yang dimulai di canvas yang memicu menggambar,
  // klik tombol/input HTML tidak boleh membuat shape.
  cnv.elt.addEventListener("mousedown", () => { pointerOnCanvas = true; });
  window.addEventListener("mouseup", () => { pointerOnCanvas = false; });

  // Zoom dengan scroll wheel (passive:false supaya bisa preventDefault)
  cnv.elt.addEventListener("wheel", onCanvasWheel, { passive: false });

  setTool("rect");                        // set default tool + sync UI
  centerView();                           // kertas di tengah layar
  syncZoomUI();                           // label zoom di sidebar
}

// Kanvas mengikuti ukuran jendela browser
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ===================== PHASE 8 — RENDERING =====================
function draw() {
  background(WORKSPACE_COLOR);
  updateWorldMouse();                 // mouseX/mouseY -> koordinat dunia

  push();
  translate(view.x, view.y);          // pan
  scale(view.zoom);                   // zoom

  drawPaper();                        // kertas / artboard

  // ==== CLIP: object dibatasi visual di dalam kertas ====
  // Bagian shape yang keluar kertas ditutupi "frame" kertas (tidak digambar).
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(0, 0, paper.w, paper.h);
  drawingContext.clip();

  // Step 24 — render seluruh object
  for (let i = 0; i < objects.length; i++) {
    drawObject(objects[i]);
  }

  // Preview shape yang sedang digambar
  if (previewObj) drawObject(previewObj);

  // Guide untuk tool berbasis titik (triangle/quad/polygon) — ikut di-clip
  drawPendingGuide();

  // Step 26 — indikator object terpilih — ikut di-clip (tak nembus frame)
  if (selectedObject) drawSelection(selectedObject);

  drawingContext.restore();           // selesai clip

  drawPaperFrame();                   // batas tegas di tepi kertas

  pop();

  // Feedback kursor: pan / frame / handle / object / default
  const overFrame = overPaperFrame();
  if (dragMode === "pan") cursor("grabbing");
  else if (spaceHeld || currentTool === "hand") cursor("grab");
  else if (overFrame) cursor("not-allowed");          // tepi frame = gabisa diklik
  else if (currentTool === "select" && insideCanvas()) {
    const overHandle = selectedObject && handleAt(selectedObject, wx, wy);
    cursor(overHandle ? "pointer" : (pickObject(wx, wy) ? "move" : "default"));
  } else {
    cursor("default");
  }

  syncZoomUI();                         // label persentase zoom di sidebar
}

// Step 23 — gambar satu object (fill + outline + transform independen)
function drawObject(obj) {
  push();                                 // Step 30 — push/pop per object
  translate(obj.x, obj.y);                // Step 27 — translation
  rotate(obj.rotation);                   // Step 28 — rotation
  scale(obj.scaleX, obj.scaleY);          // Step 29 — scaling
  applyStyle(obj);

  switch (obj.type) {
    case "point":                         // Step 9
      // Point selalu tampil dengan warna fill — strokeWeight = ukuran titik
      stroke(obj.fillColor);
      strokeWeight(Math.max(obj.strokeWeight, 4) * DEFAULT_SHAPE_SCALE);
      point(0, 0);
      break;
    case "line":                          // Step 10
      stroke(obj.hasStroke ? obj.strokeColor : obj.fillColor);
      strokeWeight(Math.max(obj.strokeWeight, 1));
      line(0, 0, obj.x2, obj.y2);
      break;
    case "rect":                          // Step 11
      rect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
      break;
    case "ellipse":                       // Step 12
      ellipse(0, 0, obj.width, obj.height);
      break;
    case "triangle":                      // Step 13
      triangle(
        obj.points[0].x, obj.points[0].y,
        obj.points[1].x, obj.points[1].y,
        obj.points[2].x, obj.points[2].y
      );
      break;
    case "quad":                          // Step 14
      quad(
        obj.points[0].x, obj.points[0].y,
        obj.points[1].x, obj.points[1].y,
        obj.points[2].x, obj.points[2].y,
        obj.points[3].x, obj.points[3].y
      );
      break;
    case "arc":                           // Step 15
      if (arcIsFull(obj)) {
        // start == stop: p5 tidak menggambar apa pun -> gambar lingkaran penuh
        ellipse(0, 0, obj.width, obj.height);
      } else {
        // PIE -> sisi datar (radius) ikut ter-stroke, bukan hanya lengkung luar
        arc(0, 0, obj.width, obj.height, obj.start, obj.stop, PIE);
      }
      break;
    case "polygon":                       // Step 16
      beginShape();
      for (const p of obj.points) vertex(p.x, p.y);
      endShape(CLOSE);
      break;
    case "image":                         // Step 32/33
      if (obj.img) image(obj.img, -obj.width / 2, -obj.height / 2, obj.width, obj.height);
      break;
  }

  pop();
}

// Step 17/19/20/21 — terapkan fill & outline sebuah object
function applyStyle(obj) {
  fill(obj.fillColor);
  if (obj.hasStroke) {
    stroke(obj.strokeColor);
    strokeWeight(obj.strokeWeight);
  } else {
    noStroke();
  }
}

// ===================== OBJECT FACTORY =====================
// Step 5 — struktur object lengkap dengan transform dasar
function baseObject(type) {
  return {
    type: type,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fillColor: defaultFill,
    hasStroke: outlineEnabled,
    strokeColor: outlineColor,
    strokeWeight: Math.max(1, outlineWeight),
    rotation: 0,
    scaleX: 1,
    scaleY: 1
  };
}

// ===================== PHASE 3 — MOUSE =====================
function insideCanvas() {
  return mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
}

// ===================== PAN + ZOOM =====================
// Koordinat layar (mouseX/mouseY) -> koordinat dunia (tempat object hidup)
function updateWorldMouse() {
  wx = (mouseX - view.x) / view.zoom;
  wy = (mouseY - view.y) / view.zoom;
}

function screenToWorld(sx, sy) {
  return { x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom };
}

// Zoom ke titik layar (sx,sy) — titik di bawah kursor tidak berpindah
function zoomAt(sx, sy, newZoom) {
  newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  const p = screenToWorld(sx, sy);
  view.zoom = newZoom;
  view.x = sx - p.x * view.zoom;
  view.y = sy - p.y * view.zoom;
}

// Scroll wheel = zoom in/out (ctrl+scroll dari trackpad pinch juga masuk sini)
function onCanvasWheel(e) {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0015);
  zoomAt(e.offsetX, e.offsetY, view.zoom * factor);
  updateWorldMouse();
}

// Kertas / artboard: bidang putih di atas area kerja yang gelap
function drawPaper() {
  push();
  fill(255);
  stroke(255, 110);                   // garis tipis terang di area gelap
  strokeWeight(1 / view.zoom);
  rect(0, 0, paper.w, paper.h);
  pop();
}

// Area stage = ruang canvas yang benar-benar terlihat (di luar sidebar & nav).
// Dipakai agar kertas selalu tampil di tengah area kerja, bukan tengah jendela
// (kalau tengah jendela, tepi kiri kertas ketutupan sidebar).
function stageRect() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  const left = UI_MARGIN + (collapsed ? 0 : UI_SIDEBAR_W + UI_MARGIN);
  const top = UI_MARGIN + UI_NAV_H + UI_MARGIN;
  return {
    x: left,
    y: top,
    w: Math.max(1, width - left - UI_MARGIN),
    h: Math.max(1, height - top - UI_MARGIN)
  };
}

// Posisikan kertas di tengah AREA STAGE, zoom = muat penuh (fit) * jarak aman.
// Zoom inilah yang dijadikan acuan 100% pada label (aturan khusus canvas),
// sehingga kertas besar tampil agak nge-zoom-out tapi keterangan tetap 100%.
function centerView() {
  const s = stageRect();
  const fit = Math.min(s.w / paper.w, s.h / paper.h) * 0.92;
  VIEW_BASE_ZOOM = fit;
  view.zoom = fit;
  view.x = s.x + (s.w - paper.w * view.zoom) / 2;
  view.y = s.y + (s.h - paper.h * view.zoom) / 2;
}

// Balikkan tampilan ke posisi awal (kertas muat di tengah stage, label 100%)
function resetView() {
  centerView();
}

function mousePressed(e) {
  // Hanya bereaksi bila tekanan benar-benar terjadi di atas canvas
  if (e && e.target && cnv && e.target !== cnv.elt) return;
  if (!pointerOnCanvas) return;
  if (!insideCanvas()) return;

  updateWorldMouse();

  // ---- PAN: tool Hand, tahan Space + drag, atau klik mouse tengah ----
  if (spaceHeld || currentTool === "hand" || (e && e.button === 1)) {
    gestureActive = true;
    dragMode = "pan";
    panInfo = { sx: view.x, sy: view.y, mx: mouseX, my: mouseY };
    if (e && e.button === 1 && e.preventDefault) e.preventDefault();
    return false;
  }

  gestureActive = true;

  // ---- SELECT TOOL: handle -> resize/rotate, klik object -> pindah ----
  if (currentTool === "select") {
    // 1) Cek handle sudut / handle rotate object terpilih dulu
    if (selectedObject) {
      const h = handleAt(selectedObject, wx, wy);
      if (h) {
        beginHandleDrag(h);
        return;
      }
    }
    // 2) Kalau tidak kena handle, klik object untuk memilih
    selectedObject = pickObject(wx, wy);
    syncSelectionUI();
    if (selectedObject) {
      dragMode = "move";
      dragLast = { x: wx, y: wy };
    }
    return;
  }

  // ---- POINT: klik tunggal ----
  if (currentTool === "point") {
    startPt = { x: wx, y: wy };
    return;
  }

  // ---- DRAG SHAPES: line / rect / ellipse / arc ----
  if (currentTool === "line" || currentTool === "rect" ||
      currentTool === "ellipse" || currentTool === "arc") {
    startPt = { x: wx, y: wy };
    previewObj = null;
    return;
  }

  // ---- CLICK SHAPES: triangle / quad / polygon ----
  addPendingPoint(wx, wy);
}

function mouseDragged() {
  if (!gestureActive) return;
  updateWorldMouse();

  // Geser tampilan (pan) — kanvas bergerak, object tetap di tempatnya
  if (dragMode === "pan" && panInfo) {
    view.x = panInfo.sx + (mouseX - panInfo.mx);
    view.y = panInfo.sy + (mouseY - panInfo.my);
    return;
  }

  // Resize object dengan menarik handle sudut
  if (dragMode === "resize" && selectedObject) {
    applyHandleResize(wx, wy);
    return;
  }

  // Ubah bentuk object dengan menarik titik sudutnya
  if (dragMode === "vertex" && selectedObject) {
    applyVertexDrag(wx, wy);
    return;
  }

  // Rotate object dengan menarik handle lingkaran atas
  if (dragMode === "rotate" && selectedObject) {
    applyHandleRotate(wx, wy);
    return;
  }

  // Pindahkan object terpilih (translation) — delta dalam koordinat dunia
  if (dragMode === "move" && selectedObject) {
    selectedObject.x += wx - dragLast.x;
    selectedObject.y += wy - dragLast.y;
    dragLast = { x: wx, y: wy };
    return;
  }

  // Bangun preview shape dari titik awal ke posisi mouse
  if (startPt) previewObj = buildPreview(wx, wy);
}

function mouseReleased() {
  if (!gestureActive) return;
  gestureActive = false;

  if (dragMode) {
    dragMode = null;
    resizeInfo = null;
    rotateInfo = null;
    vertexInfo = null;
    panInfo = null;
    return;
  }

  if (!startPt) return;

  // POINT — langsung jadi object saat dilepas
  if (currentTool === "point") {
    const o = baseObject("point");       // pakai setting panel apa adanya
    o.x = startPt.x;
    o.y = startPt.y;
    pushObject(o);
    startPt = null;
    return;
  }

  // Shape drag — commit bila ukuran valid
  if (previewObj) {
    let valid = false;
    if (currentTool === "line") {
      valid = Math.hypot(previewObj.x2, previewObj.y2) > 3;
    } else {
      valid = previewObj.width > 3 && previewObj.height > 3;
    }
    if (valid) pushObject(previewObj);
    previewObj = null;
  }
  startPt = null;
}

function buildPreview(mx, my) {
  const s = startPt;
  const o = baseObject(currentTool);
  const k = DEFAULT_SHAPE_SCALE;       // object baru 20% lebih kecil dari gesture

  if (currentTool === "line") {
    o.x = s.x;
    o.y = s.y;
    o.x2 = (mx - s.x) * k;
    o.y2 = (my - s.y) * k;
    return o;
  }

  // Pusat tetap di tengah gesture, tapi ukuran diperkecil 20%
  o.x = (s.x + mx) / 2;
  o.y = (s.y + my) / 2;
  o.width = Math.abs(mx - s.x) * k;
  o.height = Math.abs(my - s.y) * k;
  if (currentTool === "arc") {
    o.start = radians(arcStartDeg);
    o.stop = radians(arcEndDeg);
  }
  return o;
}

function pushObject(o) {
  objects.push(o);
  selectedObject = o;
  syncSelectionUI();
}

// ===================== TOOL MULTI-TITIK =====================
function addPendingPoint(x, y) {
  pendingPoints.push({ x: x, y: y });

  const need = pendingType === "triangle" ? 3 : pendingType === "quad" ? 4 : 0;
  if (need && pendingPoints.length >= need) commitPendingShape();
}

function commitPendingShape() {
  if (pendingPoints.length < 3) return;

  // Anchor = rata-rata seluruh titik, sisanya jadi koordinat lokal
  let ax = 0, ay = 0;
  for (const p of pendingPoints) { ax += p.x; ay += p.y; }
  ax /= pendingPoints.length;
  ay /= pendingPoints.length;

  const local = pendingPoints.map(p => ({
    x: (p.x - ax) * DEFAULT_SHAPE_SCALE,
    y: (p.y - ay) * DEFAULT_SHAPE_SCALE
  }));

  const o = baseObject(pendingType);
  o.x = ax;
  o.y = ay;
  o.points = local;

  pendingPoints = [];
  pushObject(o);
}

function finishPolygon() {
  if (currentTool !== "polygon") return;
  commitPendingShape();
}

function cancelPending() {
  pendingPoints = [];
  pendingType = (currentTool === "triangle" || currentTool === "quad" || currentTool === "polygon")
    ? currentTool : null;
  previewObj = null;
  startPt = null;
}

// Guide visual untuk penempatan titik
function drawPendingGuide() {
  if (!pendingType || pendingPoints.length === 0) return;

  const showMouse = insideCanvas();
  const s = 1 / view.zoom;            // jaga ketebalan/ukuran tetap di layar

  push();
  noFill();
  stroke(SEL_COLOR[0], SEL_COLOR[1], SEL_COLOR[2]);
  strokeWeight(1.5 * s);
  beginShape();
  for (const p of pendingPoints) vertex(p.x, p.y);
  if (showMouse) vertex(wx, wy);
  if (pendingPoints.length >= 2) vertex(pendingPoints[0].x, pendingPoints[0].y);
  endShape();

  noStroke();
  fill(SEL_COLOR[0], SEL_COLOR[1], SEL_COLOR[2]);
  for (const p of pendingPoints) circle(p.x, p.y, 8 * s);
  pop();
}

// ===================== PHASE 9 — SELECTION =====================
function pickObject(px, py) {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (hitTest(objects[i], px, py)) return objects[i];
  }
  return null;
}

// Koordinat layar -> koordinat lokal object (inverse transform)
function toLocal(obj, px, py) {
  const dx = px - obj.x;
  const dy = py - obj.y;
  const cosI = Math.cos(-obj.rotation);
  const sinI = Math.sin(-obj.rotation);
  const rx = dx * cosI - dy * sinI;
  const ry = dx * sinI + dy * cosI;
  return {
    x: rx / (Math.abs(obj.scaleX) < 0.0001 ? 1 : obj.scaleX),
    y: ry / (Math.abs(obj.scaleY) < 0.0001 ? 1 : obj.scaleY)
  };
}

// Koordinat lokal object -> koordinat layar
function worldPoint(obj, lx, ly) {
  const sx = lx * obj.scaleX;
  const sy = ly * obj.scaleY;
  const cosR = Math.cos(obj.rotation);
  const sinR = Math.sin(obj.rotation);
  return {
    x: obj.x + sx * cosR - sy * sinR,
    y: obj.y + sx * sinR + sy * cosR
  };
}

// ===================== FRAME KERTAS (clip + indikator) =====================
// Bagian shape di luar kertas ditutup oleh "frame" kertas (clip di draw()).
// Ini adalah garis batas tegas yang digambar di tepi kertas.
function drawPaperFrame() {
  push();
  noFill();
  stroke(SEL_COLOR[0], SEL_COLOR[1], SEL_COLOR[2]);
  strokeWeight(2 / view.zoom);
  rect(0, 0, paper.w, paper.h);
  pop();
}

// Apakah kursor sedang berada DI TEPAT BATAS (frame) kertas?
// True bila berada dalam pita tipis di sepanjang tepi kertas (dalam/luar).
// Dipakai untuk menampilkan kursor "not-allowed" (gabisa diklik).
function overPaperFrame() {
  if (!insideCanvas()) return false;
  const th = 8 / view.zoom;             // ketebalan pita frame (~8px layar)

  const inside = wx >= 0 && wx <= paper.w && wy >= 0 && wy <= paper.h;
  if (inside) {
    // Jarak ke tepi terdekat — dianggap "di frame" bila melekat pada tepi
    const edge = Math.min(wx, paper.w - wx, wy, paper.h - wy);
    return edge <= th;
  }
  // Di luar kertas — jarak ke rectangle kertas
  const cx = Math.max(0, Math.min(paper.w, wx));
  const cy = Math.max(0, Math.min(paper.h, wy));
  return Math.hypot(wx - cx, wy - cy) <= th;
}

function hitTest(obj, px, py) {
  const p = toLocal(obj, px, py);
  const s = 1 / view.zoom;          // toleransi klik tetap sama di layar

  switch (obj.type) {
    case "point":
      return Math.hypot(p.x, p.y) <= 8 * s;
    case "line": {
      const pad = Math.max(obj.strokeWeight, 4) / 2 + 4 * s;
      return distToSegment(p, { x: 0, y: 0 }, { x: obj.x2, y: obj.y2 }) <= pad;
    }
    case "rect":
    case "image":
      return Math.abs(p.x) <= obj.width / 2 && Math.abs(p.y) <= obj.height / 2;
    case "ellipse":
      return ellipseHit(p, obj.width / 2, obj.height / 2);
    case "arc":
      if (!ellipseHit(p, obj.width / 2, obj.height / 2)) return false;
      if (arcIsFull(obj)) return true;
      return angleInArc(Math.atan2(p.y, p.x), obj.start, obj.stop);
    case "triangle":
    case "quad":
    case "polygon":
      return pointInPolygon(p, obj.points);
  }
  return false;
}

function ellipseHit(p, rx, ry) {
  if (rx <= 0 || ry <= 0) return false;
  return (p.x * p.x) / (rx * rx) + (p.y * p.y) / (ry * ry) <= 1;
}

function distToSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = p.x - a.x, wy = p.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const hit = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function angleInArc(a, start, stop) {
  const norm = v => ((v % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const A = norm(a), S = norm(start), E = norm(stop);
  if (S <= E) return A >= S && A <= E;
  return A >= S || A <= E;
}

// Arc dianggap lingkaran penuh bila selisih start/stop ~0 (atau kelipatan 360°).
// P5 sendiri membatalkan gambar bila start === stop, jadi kasus ini
// ditangani di sini agar object tetap terlihat & bisa di-select.
function arcIsFull(obj) {
  const d = obj.stop - obj.start;
  const n = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.abs(n) < 0.00001;         // epsilon sama dengan p5
}

// Step 26 — bounding box + handle di sekitar object terpilih
function drawSelection(obj) {
  const b = localBBox(obj);
  const s = 1 / view.zoom;                // ukuran handle tetap di layar
  const c = [
    worldPoint(obj, b.x, b.y),
    worldPoint(obj, b.x + b.w, b.y),
    worldPoint(obj, b.x + b.w, b.y + b.h),
    worldPoint(obj, b.x, b.y + b.h)
  ];

  push();
  noFill();
  stroke(SEL_COLOR[0], SEL_COLOR[1], SEL_COLOR[2]);
  strokeWeight(1.5 * s);
  beginShape();
  for (const p of c) vertex(p.x, p.y);
  endShape();

  // Handle rotate: garis + lingkaran di atas bbox
  const topMid = worldPoint(obj, b.x + b.w / 2, b.y);
  const rotH = worldPoint(obj, b.x + b.w / 2, b.y - HANDLE_GAP * s);
  line(topMid.x, topMid.y, rotH.x, rotH.y);
  fill(SEL_COLOR[0], SEL_COLOR[1], SEL_COLOR[2]);
  noStroke();
  circle(rotH.x, rotH.y, 12 * s);

  // Handle sudut bbox: kotak kecil (hanya shape kotak/lingkaran)
  if (hasBoxHandles(obj)) {
    for (const p of c) rect(p.x - 5 * s, p.y - 5 * s, 10 * s, 10 * s);
  }

  // Handle titik bentuk: lingkaran putih di sudut asli object —
  // ditarik untuk mengubah bentuk (vertex polygon, ujung line, ujung arc)
  for (const v of getHandles(obj).vertices) {
    fill(255);
    stroke(SEL_COLOR[0], SEL_COLOR[1], SEL_COLOR[2]);
    strokeWeight(1.5 * s);
    circle(v.pos.x, v.pos.y, 12 * s);
  }
  pop();
}

// ===================== DIRECT HANDLE TRANSFORM =====================
// Titik-titik bentuk ASLI (bukan bbox) — untuk mengubah bentuk object:
// triangle/quad/polygon -> tiap vertex, line -> kedua ujung,
// arc -> dua ujung lengkung (mengubah sudut start/stop)
function shapeHandles(obj) {
  switch (obj.type) {
    case "triangle":
    case "quad":
    case "polygon":
      return obj.points.map((p, i) => ({ kind: "point", target: i, local: p }));
    case "line":
      return [
        { kind: "point", target: 0, local: { x: 0, y: 0 } },
        { kind: "point", target: 1, local: { x: obj.x2, y: obj.y2 } }
      ];
    case "arc":
      return [
        { kind: "arcEnd", target: 0, local: arcEndLocal(obj, obj.start) },
        { kind: "arcEnd", target: 1, local: arcEndLocal(obj, obj.stop) }
      ];
  }
  return [];
}

// Handle sudut bbox hanya untuk shape yang bentuknya kotak/lingkaran
// (triangle/quad/polygon/line pakai titik bentuknya sendiri)
function hasBoxHandles(obj) {
  return obj.type !== "triangle" && obj.type !== "quad" &&
         obj.type !== "polygon" && obj.type !== "line";
}

// Posisi lokal ujung arc untuk sudut tertentu (koreksi sudut mengikuti p5,
// sehingga arah ujung = sudut yang diminta meski w != h)
function arcEndLocal(obj, ang) {
  const rx = obj.width / 2, ry = obj.height / 2;
  if (rx <= 0 || ry <= 0) return { x: 0, y: 0 };
  const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const k = (obj.width / obj.height) * Math.tan(a);
  let t;
  if (a <= Math.PI / 2) t = Math.atan(k);
  else if (a <= 3 * Math.PI / 2) t = Math.atan(k) + Math.PI;
  else t = Math.atan(k) + Math.PI * 2;
  return { x: rx * Math.cos(t), y: ry * Math.sin(t) };
}

// Titik-titik handle dalam koordinat layar (kanvas)
function getHandles(obj) {
  const b = localBBox(obj);
  const localCorners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h }
  ];
  return {
    rotate: worldPoint(obj, b.x + b.w / 2, b.y - HANDLE_GAP / view.zoom),
    corners: hasBoxHandles(obj) ? localCorners.map((lc, i) => ({
      index: i,
      local: lc,
      pos: worldPoint(obj, lc.x, lc.y)
    })) : [],
    vertices: shapeHandles(obj).map(s => ({
      kind: s.kind,
      target: s.target,
      local: s.local,
      pos: worldPoint(obj, s.local.x, s.local.y)
    }))
  };
}

// Apakah (px,py) menempel pada handle object? (radius 12px layar)
function handleAt(obj, px, py) {
  const h = getHandles(obj);
  const s = 1 / view.zoom;
  if (Math.hypot(px - h.rotate.x, py - h.rotate.y) <= 12 * s) {
    return { kind: "rotate" };
  }
  // Titik bentuk diprioritaskan (bisa bertumpuk dengan sudut bbox)
  for (const v of h.vertices) {
    if (Math.hypot(px - v.pos.x, py - v.pos.y) <= 10 * s) {
      return { kind: "vertex", vertex: v };
    }
  }
  for (const c of h.corners) {
    if (Math.hypot(px - c.pos.x, py - c.pos.y) <= 10 * s) {
      return { kind: "resize", corner: c };
    }
  }
  return null;
}

function beginHandleDrag(h) {
  const o = selectedObject;

  if (h.kind === "rotate") {
    dragMode = "rotate";
    rotateInfo = {
      startAngle: Math.atan2(wy - o.y, wx - o.x),
      startRot: o.rotation
    };
    return;
  }

  // Tarik titik bentuk -> ubah bentuk object
  if (h.kind === "vertex") {
    dragMode = "vertex";
    vertexInfo = { handle: h };
    // Titik awal line digeser -> titik akhir harus tetap di tempat
    if (o.type === "line" && h.vertex.target === 0) {
      vertexInfo.endWorld = worldPoint(o, o.x2, o.y2);
    }
    return;
  }

  // Resize: anchor = sudut bbox berkebalikan dari sudut yang dipegang
  const b = localBBox(o);
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h }
  ];
  const cornerLocal = corners[h.corner.index];
  const anchorLocal = corners[(h.corner.index + 2) % 4];

  dragMode = "resize";
  resizeInfo = {
    cornerLocal: cornerLocal,
    anchorLocal: anchorLocal,
    anchorWorld: worldPoint(o, anchorLocal.x, anchorLocal.y),
    startRot: o.rotation
  };
}

// Tarik titik bentuk -> mengubah bentuk object (bukan sekadar scale)
function applyVertexDrag(mx, my) {
  const o = selectedObject;
  const info = vertexInfo;
  if (!o || !info) return;
  const v = info.handle.vertex;

  if (o.type === "line") {
    if (v.target === 0) {
      // Geser titik awal, titik akhir dikompensasi agar tidak ikut pindah
      o.x = mx;
      o.y = my;
      const end = toLocal(o, info.endWorld.x, info.endWorld.y);
      o.x2 = end.x;
      o.y2 = end.y;
    } else {
      const p = toLocal(o, mx, my);
      o.x2 = p.x;
      o.y2 = p.y;
    }
    return;
  }

  if (o.type === "arc") {
    const p = toLocal(o, mx, my);
    const ang = Math.atan2(p.y, p.x);
    if (v.target === 0) o.start = ang;
    else o.stop = ang;
    syncArcUI();                        // panel Arc Angle ikut berubah
    return;
  }

  // triangle / quad / polygon
  const p = toLocal(o, mx, my);
  o.points[v.target].x = p.x;
  o.points[v.target].y = p.y;
}

// Tarik handle sudut -> scale object, sudut berkebalikan tetap terkunci
function applyHandleResize(mx, my) {
  const o = selectedObject;
  const r = resizeInfo;
  if (!r) return;

  // Vektor mouse dari anchor, diputar ke frame lokal object
  const dx = mx - r.anchorWorld.x;
  const dy = my - r.anchorWorld.y;
  const cosI = Math.cos(-r.startRot);
  const sinI = Math.sin(-r.startRot);
  const m = { x: dx * cosI - dy * sinI, y: dx * sinI + dy * cosI };

  const w = r.cornerLocal.x - r.anchorLocal.x;
  const h = r.cornerLocal.y - r.anchorLocal.y;
  if (Math.abs(w) > 1e-6) o.scaleX = Math.max(0.05, m.x / w);
  if (Math.abs(h) > 1e-6) o.scaleY = Math.max(0.05, m.y / h);

  // Posisi object disesuaikan agar anchor tidak bergeser
  const cosR = Math.cos(o.rotation);
  const sinR = Math.sin(o.rotation);
  const offX = r.anchorLocal.x * o.scaleX * cosR - r.anchorLocal.y * o.scaleY * sinR;
  const offY = r.anchorLocal.x * o.scaleX * sinR + r.anchorLocal.y * o.scaleY * cosR;
  o.x = r.anchorWorld.x - offX;
  o.y = r.anchorWorld.y - offY;

  syncSelectionUI();
}

// Tarik handle lingkaran atas -> rotasi mengikuti mouse
function applyHandleRotate(mx, my) {
  const o = selectedObject;
  if (!rotateInfo) return;
  const cur = Math.atan2(my - o.y, mx - o.x);
  o.rotation = rotateInfo.startRot + (cur - rotateInfo.startAngle);
  syncSelectionUI();
}

// Bounding box dalam koordinat lokal object
function localBBox(obj) {
  switch (obj.type) {
    case "point":
      return { x: -8, y: -8, w: 16, h: 16 };
    case "line": {
      const pad = Math.max(obj.strokeWeight, 4) / 2 + 2;
      const x1 = Math.min(0, obj.x2), y1 = Math.min(0, obj.y2);
      const x2 = Math.max(0, obj.x2), y2 = Math.max(0, obj.y2);
      return { x: x1 - pad, y: y1 - pad, w: (x2 - x1) + pad * 2, h: (y2 - y1) + pad * 2 };
    }
    case "rect":
    case "ellipse":
    case "arc":
    case "image":
      return { x: -obj.width / 2, y: -obj.height / 2, w: obj.width, h: obj.height };
    case "triangle":
    case "quad":
    case "polygon": {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of obj.points) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      return { x: minX - 4, y: minY - 4, w: (maxX - minX) + 8, h: (maxY - minY) + 8 };
    }
  }
  return { x: -10, y: -10, w: 20, h: 20 };
}

// ===================== PHASE 4 — TOOL SELECTION =====================
function setTool(tool) {
  currentTool = tool;
  pendingPoints = [];
  pendingType = (tool === "triangle" || tool === "quad" || tool === "polygon") ? tool : null;
  previewObj = null;
  startPt = null;
  gestureActive = false;
  dragMode = null;
  resizeInfo = null;
  rotateInfo = null;
  vertexInfo = null;
  panInfo = null;
  updateToolUI();
  updateStatus();
}

function updateToolUI() {
  document.querySelectorAll(".tool").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === currentTool);
  });
  const finishBtn = document.getElementById("btnFinishPolygon");
  if (finishBtn) finishBtn.style.display = currentTool === "polygon" ? "block" : "none";
}

function updateStatus() {
  const hints = {
    hand: "Hand — tarik pada canvas untuk menggeser tampilan (pan). Scroll untuk zoom.",
    select: "Select — klik object untuk memilih. Lingkaran putih di sudut bentuk = ubah bentuk, kotak sudut = resize, lingkaran atas = rotate, drag tengah = pindah. Warna/outline: toolbar di atas.",
    point: "Point — klik pada canvas untuk membuat titik.",
    line: "Line — tarik dari titik awal ke titik akhir.",
    rect: "Rectangle — tarik pada canvas untuk menentukan ukuran.",
    ellipse: "Ellipse — tarik pada canvas untuk menentukan ukuran.",
    triangle: "Triangle — klik 3 titik secara berurutan.",
    quad: "Quad — klik 4 titik secara berurutan.",
    arc: "Arc — tarik untuk ukuran, atur sudut di tombol Arc (header).",
    polygon: "Polygon — klik titik-titik, tekan Enter untuk menutup."
  };
  const el = document.getElementById("statusTool");
  if (el) el.textContent = hints[currentTool] || "";
}

// ===================== PHASE 6 & 7 — STYLE UI =====================
// Setting panel berlaku ganda: jadi default object BARU, dan bila ada
// object terpilih maka object tersebut ikut di-update (edit in place).
function onFillInput(v) {
  defaultFill = v;
  if (selectedObject) selectedObject.fillColor = v;
}

function onOutlineColorInput(v) {
  outlineColor = v;
  if (selectedObject) selectedObject.strokeColor = v;
}

function onStrokeWeightInput(v) {
  outlineWeight = Math.max(1, Math.min(40, parseInt(v, 10) || 1));
  if (selectedObject) selectedObject.strokeWeight = outlineWeight;
}

function toggleOutline() {
  outlineEnabled = !outlineEnabled;      // Step 22 — toggle ON/OFF
  if (selectedObject) selectedObject.hasStroke = outlineEnabled;
  updateOutlineToggleUI();
}

function updateOutlineToggleUI() {
  const btn = document.getElementById("outlineToggle");
  if (btn) {
    btn.textContent = outlineEnabled ? "Outline: ON" : "Outline: OFF";
    btn.classList.toggle("on", outlineEnabled);
  }
}

// ===================== PHASE 10 — TRANSFORM UI =====================
function hasSelection() { return !!selectedObject; }

function onRotateInput(v) {
  if (!hasSelection()) return;
  selectedObject.rotation = radians(parseFloat(v));
  document.getElementById("rotVal").textContent = v + "\u00B0";
}

function onScaleXInput(v) {
  if (!hasSelection()) return;
  selectedObject.scaleX = parseFloat(v);
  document.getElementById("sxVal").textContent = parseFloat(v).toFixed(2);
}

function onScaleYInput(v) {
  if (!hasSelection()) return;
  selectedObject.scaleY = parseFloat(v);
  document.getElementById("syVal").textContent = parseFloat(v).toFixed(2);
}

function nudgeRotate(deg) {
  if (!hasSelection()) return;
  selectedObject.rotation += radians(deg);
  syncSelectionUI();
}

function nudgeScale(f) {
  if (!hasSelection()) return;
  selectedObject.scaleX = Math.max(0.1, selectedObject.scaleX * f);
  selectedObject.scaleY = Math.max(0.1, selectedObject.scaleY * f);
  syncSelectionUI();
}

function resetTransform() {
  if (!hasSelection()) return;
  selectedObject.rotation = 0;
  selectedObject.scaleX = 1;
  selectedObject.scaleY = 1;
  syncSelectionUI();
}

// Sinkron panel Fill/Outline dengan selection.
// Panel = satu-satunya sumber kebenaran: apa yang tampil di panel selalu
// sama dengan setting object terpilih DAN setting object baru berikutnya.
function syncStyleUI() {
  const sel = selectedObject;

  const fill = sel ? sel.fillColor : defaultFill;
  const oCol = sel ? sel.strokeColor : outlineColor;
  const oW = sel ? sel.strokeWeight : outlineWeight;
  const oOn = sel ? sel.hasStroke : outlineEnabled;

  // Jadikan juga sebagai setting terbaru untuk object baru
  defaultFill = fill;
  outlineColor = oCol;
  outlineWeight = Math.max(1, Math.min(40, oW));
  outlineEnabled = oOn;

  const fi = document.getElementById("fillInput");
  if (fi) fi.value = fill;
  const ci = document.getElementById("outlineColorInput");
  if (ci) ci.value = oCol;
  const sw = document.getElementById("strokeWeightInput");
  if (sw) sw.value = outlineWeight;
  updateOutlineToggleUI();
}

function syncSelectionUI() {
  const sel = selectedObject;
  const ids = ["rotRange", "sxRange", "syRange"];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !sel;
  });

  if (sel) {
    let deg = Math.round(degrees(sel.rotation));
    deg = ((deg + 180) % 360 + 360) % 360 - 180;
    const rot = document.getElementById("rotRange");
    const sx = document.getElementById("sxRange");
    const sy = document.getElementById("syRange");
    if (rot) rot.value = deg;
    if (sx) sx.value = sel.scaleX;
    if (sy) sy.value = sel.scaleY;
    document.getElementById("rotVal").textContent = deg + "\u00B0";
    document.getElementById("sxVal").textContent = sel.scaleX.toFixed(2);
    document.getElementById("syVal").textContent = sel.scaleY.toFixed(2);
  } else {
    document.getElementById("rotVal").textContent = "0\u00B0";
    document.getElementById("sxVal").textContent = "1.00";
    document.getElementById("syVal").textContent = "1.00";
  }

  syncStyleUI();        // panel Fill/Outline mengikuti selection
  syncArcUI();          // panel Arc Angle mengikuti selection (di todo 4)
}

// Sudut arc — berlaku untuk arc baru dan arc terpilih
function normDeg(d) {
  return ((d % 360) + 360) % 360;
}

// Sinkron panel Arc Angle dengan selection agar pengaturan sudut
// selalu menampilkan sudut object yang sedang dipilih
function syncArcUI() {
  const sel = (selectedObject && selectedObject.type === "arc") ? selectedObject : null;
  if (sel) {
    arcStartDeg = normDeg(degrees(sel.start));
    arcEndDeg = normDeg(degrees(sel.stop));
  }

  const s = Math.round(arcStartDeg);
  const e = Math.round(arcEndDeg);

  const sr = document.getElementById("arcStartRange");
  const er = document.getElementById("arcEndRange");
  if (sr) sr.value = s;
  if (er) er.value = e;

  const sv = document.getElementById("arcStartVal");
  const ev = document.getElementById("arcEndVal");
  if (sv) sv.textContent = s + "\u00B0";
  if (ev) ev.textContent = e + "\u00B0";
}

function onArcStartInput(v) {
  arcStartDeg = parseFloat(v);
  document.getElementById("arcStartVal").textContent = v + "\u00B0";
  if (selectedObject && selectedObject.type === "arc") {
    selectedObject.start = radians(arcStartDeg);
  }
}

function onArcEndInput(v) {
  arcEndDeg = parseFloat(v);
  document.getElementById("arcEndVal").textContent = v + "\u00B0";
  if (selectedObject && selectedObject.type === "arc") {
    selectedObject.stop = radians(arcEndDeg);
  }
}

// ===================== ZOOM LABEL (sidebar) =====================
let lastZoomLabel = "";

function syncZoomUI() {
  // Aturan khusus canvas: label menunjukkan persentase terhadap zoom dasar
  // (VIEW_BASE_ZOOM), bukan terhadap 1:1 pixel. Jadi tampilan fit awal = 100%.
  const pct = Math.round((view.zoom / VIEW_BASE_ZOOM) * 100) + "%";
  if (pct === lastZoomLabel) return;
  lastZoomLabel = pct;
  const el = document.getElementById("zoomVal");
  if (el) el.textContent = pct;
}

// ===================== PHASE 11 — LOAD IMAGE =====================
function triggerLoadImage() {
  document.getElementById("imageInput").click();
}

function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  loadImage(url, img => {
    const maxW = 500, maxH = 400;
    const s = Math.min(maxW / img.width, maxH / img.height, 1) * DEFAULT_SHAPE_SCALE;
    const o = baseObject("image");
    o.img = img;
    o.width = img.width * s;
    o.height = img.height * s;
    const center = screenToWorld(width / 2, height / 2);   // tengah layar saat ini
    o.x = center.x;
    o.y = center.y;
    pushObject(o);
    setTool("select");
    URL.revokeObjectURL(url);
  }, () => {
    alert("Gagal memuat gambar.");
    URL.revokeObjectURL(url);
  });
}

// ===================== PHASE 12 — OBJECT MANAGEMENT =====================
function deleteSelected() {
  if (!selectedObject) return;
  const idx = objects.indexOf(selectedObject);
  if (idx >= 0) objects.splice(idx, 1);
  selectedObject = null;
  syncSelectionUI();
}

function clearCanvas() {
  objects = [];
  selectedObject = null;
  pendingPoints = [];
  previewObj = null;
  startPt = null;
  gestureActive = false;
  dragMode = null;
  resizeInfo = null;
  rotateInfo = null;
  vertexInfo = null;
  syncSelectionUI();
}

// ===================== KEYBOARD =====================
function keyPressed() {
  // Jangan rebutan tombol dengan input/form
  const ae = document.activeElement;
  const inInput = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");

  // Space = mode pan (tahan Space lalu drag kanvas)
  if (!inInput && keyCode === SPACE) {
    spaceHeld = true;
    return false;                     // cegat scroll halaman
  }

  // H = tool Hand (geser kanvas)
  if (!inInput && (key === "h" || key === "H")) {
    setTool("hand");
    return false;
  }

  if (inInput) return;

  if (keyCode === DELETE || keyCode === BACKSPACE) {
    if (selectedObject) {
      deleteSelected();
      return false;
    }
  }
  if (keyCode === ENTER && currentTool === "polygon") {
    finishPolygon();
    return false;
  }
  if (keyCode === ESCAPE) {
    cancelPending();
    return false;
  }
}

function keyReleased() {
  if (keyCode === SPACE) spaceHeld = false;
}

// ===================== DOM WIRING =====================
document.getElementById("imageInput").addEventListener("change", e => {
  const file = e.target.files && e.target.files[0];
  if (file) loadImageFile(file);
  e.target.value = "";
});
