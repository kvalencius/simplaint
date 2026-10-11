# PP48 — Simple Paint (p5.js)

Aplikasi paint sederhana: seluruh drawing engine menggunakan **p5.js** (tanpa Canvas API), setiap shape disimpan sebagai **object** sehingga bisa di-select, di-transform, di-delete, dan canvas bisa di-clear.

## Struktur

```
grafika_p5/
├── index.html      # halaman + toolbar UI
├── style.css       # base style (tema gelap "Air")
├── sketch.js       # seluruh logika drawing (p5.js)
├── ui.js           # layout UI: sidebar toggle + popover tool settings
└── assets/         # screenshot dokumentasi
    ├── screenshot-1-awal.png
    ├── screenshot-2-shapes.png
    ├── screenshot-3-transform.png
    └── screenshot-4-outline-panel.png
```

## Layout

Kanvas menempel penuh ke seluruh layar (area kerja gelap + kertas putih di tengah); semua UI mengambang di atasnya.

- **Header (mengambang)** — ☰ toggle sidebar, brand, toolbar tool settings, aksi cepat (Load Image, Delete, Clear) dan tombol **Help** (i).
- **Kiri (panel mengambang)** — sidebar berisi daftar tool (**Hand** untuk menggeser kertas, lalu Select dan shape-shape lain); bisa dibuka/tutup dan di-scroll. Di bawahnya section **View** (indikator zoom + tombol **Reset View**).
- **Atas** — **Fill** tampil langsung (teks + swatch kecil, sekali klik buka color wheel). **Outline**, **Transform**, **Arc**, **Object** berupa dropdown ala Photoshop; klik lagi / klik di luar / `Esc` untuk menutup.
- **Kanvas** — tampilan bisa digeser (**Space + drag** / mouse tengah) dan di-zoom (**scroll wheel**, 10%–800%). Zoom selalu ke titik di bawah kursor. Object tetap di koordinat dunia, jadi handle & toleransi klik disesuaikan agar tetap nyaman di semua zoom. Ukuran jendela browser berapa pun kanvas otomatis mengikuti (`windowResized()`).
- **Tool Polygon** — tidak ada tombol khusus di sidebar; muncul toast di bawah layar (~5 detik, fade in/out) yang mengingatkan untuk menekan **Enter**.

## Menjalankan

Buka `index.html` di browser (butuh internet untuk CDN p5.js), atau jalankan server statis:

```
npx serve .
```

## Alur aplikasi

```
Buka aplikasi → canvas 1000×700 → pilih tool → gambar shape
→ otomatis solid fill (default #3498db) → outline OFF (default)
→ object terpilih → Translate (drag) / Rotate / Scale (panel)
→ outline opsional (ON/OFF, warna, ketebalan)
→ Load Image (opsional) → transform image → Delete / Clear → selesai
```

## Fungsi p5.js yang digunakan

| Kebutuhan | Fungsi p5.js |
|---|---|
| Canvas | `createCanvas()` |
| Background | `background()` |
| Shape | `point()`, `line()`, `rect()`, `ellipse()`, `triangle()`, `quad()`, `arc()`, `beginShape()`, `vertex()`, `endShape(CLOSE)`, `circle()` |
| Color | `fill()`, `stroke()`, `strokeWeight()`, `noStroke()`, `noFill()` |
| Image | `loadImage()`, `image()` |
| Transformasi | `push()`, `pop()`, `translate()`, `rotate()`, `scale()` |
| Interaksi | `mouseX`, `mouseY`, `mousePressed()`, `mouseDragged()`, `mouseReleased()`, `keyPressed()` |
| Utilitas | `radians()`, `degrees()`, `width`, `height`, `keyCode` |

## Checklist requirement (Step 50)

- [x] Load image from source (`loadImage()` + file input `accept="image/*"`)
- [x] Shape primitives p5.js: Point, Line, Rectangle, Ellipse, Triangle, Quad, Arc, Polygon
- [x] Geometry otomatis solid fill (default `#3498db`, warna per object)
- [x] Outline optional — default OFF, bisa ON, atur warna, atur ketebalan
- [x] Shape dapat ditransformasi: translate (drag), rotate (slider/tombol), scale (slider/tombol)
- [x] Transformasi menggunakan p5.js (`push/pop/translate/rotate/scale`), independen per object
- [x] Object dapat dipilih (selection indicator + bounding box)
- [x] Object dapat dihapus (Delete / tombol Delete)
- [x] Canvas dapat di-clear (tombol Clear)
- [x] Seluruh drawing engine menggunakan p5.js

## Cara pakai singkat

| Aksi | Cara |
|---|---|
| Gambar shape | Pilih tool → drag pada canvas (Triangle/Quad/Polygon: klik titik; Polygon selesai dengan **Enter**) |
| Pilih object | Tool **Select** → klik object (klik area kosong = deselect) |
| Pindahkan | Drag tengah object dengan tool **Select** |
| **Resize langsung** | **Tarik handle kotak di 4 sudut bounding box** (sudut berkebalikan tetap terkunci) |
| **Rotate langsung** | **Tarik handle lingkaran di atas bounding box** |
| Rotate / Scale via toolbar | Tombol **Transform** di header (slider + tombol, sinkron dengan handle) |
| Outline | Tombol **Outline** di header → toggle ON/OFF, pilih warna & ketebalan (shape baru **+ object terpilih langsung berubah**) |
| Fill color | Tombol **Fill** di header (shape baru **+ edit warna object terpilih**) |
| Arc angle | Tombol **Arc** di header (start/stop, berlaku untuk arc baru / arc terpilih; **start = stop → lingkaran penuh**) |
| Hapus | Pilih object → **Delete** / tombol Delete |
| Kosongkan | Tombol **Clear** |
| Geser kanvas | Tool **Hand** (pintasan **H**) lalu drag — atau tahan **Space** + drag / **mouse tengah** |
| Zoom kanvas | **Scroll wheel** (zoom ke titik kursor); **Reset View** = kembali 100% |

Kursor berubah otomatis: `hand` saat di atas handle, `move` saat di atas object.
