/* ============================================================
   PP48 — UI layout only
   Sidebar toggle, popover tool settings, dan help.
   Tidak mengubah drawing engine di sketch.js.
   ============================================================ */

function toggleSidebar() {
  document.body.classList.toggle("sidebar-collapsed");
}

function closeAllPops() {
  document.querySelectorAll(".popover.open").forEach(p => p.classList.remove("open"));
  document.querySelectorAll(".tb-btn.active, .icon-btn.active")
    .forEach(b => b.classList.remove("active"));
}

function togglePop(id) {
  const pop = document.getElementById(id);
  if (!pop) return;

  const wasOpen = pop.classList.contains("open");
  closeAllPops();
  if (wasOpen) return;

  pop.classList.add("open");
  const btn = document.querySelector('[data-pop="' + id + '"]');
  if (btn) btn.classList.add("active");
}

// Klik di luar toolbar -> tutup popover
document.addEventListener("click", e => {
  if (!e.target.closest(".tb-wrap")) closeAllPops();
});

// Esc -> tutup popover (shortcut canvas tetap ditangani sketch.js)
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeAllPops();
});

// ===================== COLOR SWATCH =====================
// Klik di mana pun pada baris swatch -> langsung buka color wheel.
// Klik tepat di swatch-nya dibiarkan (browser sudah menanganinya sendiri).
function openColorPicker(e) {
  const input = e.currentTarget.querySelector('input[type="color"]');
  if (!input || e.target === input) return;
  if (typeof input.showPicker === "function") {
    try { input.showPicker(); } catch (err) { /* browser lama: pakai klik swatch */ }
  }
}

// ===================== TOAST =====================
let toastTimer = null;

function showToast(message, duration) {
  const el = document.getElementById("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), duration || 5000);
}

// ===================== POLYGON HINT =====================
// Tombol "Selesai Polygon" di sidebar sudah dihapus — sebagai gantinya
// muncul notifikasi bawah layar saat tool Polygon dipilih.
(function () {
  const originalSetTool = window.setTool;
  window.setTool = function (tool) {
    originalSetTool(tool);
    if (tool === "polygon") {
      showToast("Polygon — klik titik-titiknya, lalu tekan Enter untuk menutup shape.");
    }
  };
})();
