/* admin.js - Chip Nails (Supabase + Cloudflare Pages)
   Upgraded:
   - Load all bookings (optional date filter)
   - Search by name/phone
   - Delete booking (customer cancel) with confirm modal
   - Highlight bookings created within 24h (fallback: start_at if no created_at)
*/

const { createClient } = supabase;

const SUPABASE_URL = "https://zaqruavtxyjxwpfdoolo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elements
const elEmail = document.getElementById("adminEmail");
const elPass = document.getElementById("adminPass");
const btnLogin = document.getElementById("loginBtn");
const btnLogout = document.getElementById("logoutBtn");

const elDate = document.getElementById("dateInput");
const btnLoad = document.getElementById("loadBtn");
const btnClearFilter = document.getElementById("clearFilterBtn");
const elSearch = document.getElementById("searchInput");

const tbody = document.getElementById("bookingBody");

// Modal
function showPopup(type, title, text, opts = {}) {
  const backdrop = document.getElementById("modalBackdrop");
  const box = document.getElementById("modalBox");
  const elTitle = document.getElementById("modalTitle");
  const body = document.getElementById("modalBody");
  const btnOk = document.getElementById("modalOk");
  const btnClose = document.getElementById("modalClose");

  if (!backdrop || !box || !elTitle || !body) {
    alert(`${title}\n\n${text}`);
    return;
  }

  box.classList.remove("ok", "err");
  if (type === "ok") box.classList.add("ok");
  if (type === "err") box.classList.add("err");

  elTitle.textContent = title || "Thông báo";
  body.textContent = text || "";

  backdrop.style.display = "flex";
  backdrop.setAttribute("aria-hidden", "false");

  const close = () => {
    backdrop.style.display = "none";
    backdrop.setAttribute("aria-hidden", "true");
  };

  btnClose.onclick = close;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  window.onkeydown = (e) => { if (e.key === "Escape") close(); };

  // OK handler (optional)
  btnOk.textContent = opts.okText || "OK";
  btnOk.className = opts.okClass || "primary";
  btnOk.onclick = () => {
    close();
    if (typeof opts.onOk === "function") opts.onOk();
  };
}

function setStatus(text) {
  tbody.innerHTML = `<tr><td colspan="7" style="color:#6b7280;">${text}</td></tr>`;
}
function clearTable() { tbody.innerHTML = ""; }

function pad2(n) { return String(n).padStart(2, "0"); }

function fmtDateTimeLocal(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const date = d.toLocaleDateString("vi-VN");
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const t = `${hh}:${mm}`;
  return t === "00:00" ? `${date} (Không chọn giờ)` : `${date} ${t}`;
}

// Tách note dạng: "CẮT DA, SƠN GEL | [KHÔNG CHỌN GIỜ] | Ghi chú..."
function splitServiceAndNote(rawNote) {
  const note = (rawNote || "").trim();
  if (!note) return { serviceFromNote: null, cleanNote: "" };

  if (note.includes("|")) {
    const parts = note.split("|").map(s => s.trim()).filter(Boolean);
    const serviceFromNote = parts[0] || null;

    const rest = parts
      .slice(1)
      .filter(p => !/^\[?\s*không chọn giờ\s*\]?$/i.test(p));
    const cleanNote = rest.join(" | ").trim();

    return { serviceFromNote, cleanNote };
  }

  // format "Dịch vụ:" theo dòng (nếu có)
  const lines = note.split(/\r?\n/).map(s => s.trim());
  const svcLine = lines.find(l => /^dịch vụ\s*:/i.test(l));
  if (svcLine) {
    const serviceFromNote = svcLine.replace(/^dịch vụ\s*:\s*/i, "").trim() || null;
    const cleanNote = lines.filter(l => !/^dịch vụ\s*:/i.test(l)).join("\n").trim();
    return { serviceFromNote, cleanNote };
  }

  return { serviceFromNote: null, cleanNote: note };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function rowHtml({ id, isNew24, timeText, service, qty, name, phone, note }) {
  const newBadge = isNew24 ? `<span class="badgeNew">Mới 24h</span>` : "";
  return `
    <tr class="${isNew24 ? "new24" : ""}" data-id="${id}" data-name="${escapeHtml(name)}" data-phone="${escapeHtml(phone)}">
      <td>${escapeHtml(timeText)} ${newBadge}</td>
      <td>${escapeHtml(service || "")}</td>
      <td>${escapeHtml(qty ?? "")}</td>
      <td>${escapeHtml(name || "")}</td>
      <td>${escapeHtml(phone || "")}</td>
      <td>${escapeHtml(note || "").replace(/\n/g, "<br/>")}</td>
      <td>
        <div class="actions">
      //    <button class="actionBtn danger" data-action="delete" data-id="${id}">Xóa</button>
      <button class="actionBtn danger" data-action="cancel" data-id="${id}">Hủy</button>

        </div>
      </td>
    </tr>
  `;
}

// Cache loaded data (for search filter)
let cachedRows = []; // { id, name, phone, trHtml }

// Hint current user
async function showCurrentUserHint() {
  const { data } = await db.auth.getUser();
  const email = data?.user?.email;
  if (email && elEmail) elEmail.value = email;
}
showCurrentUserHint();

// Login / Logout
btnLogin?.addEventListener("click", async () => {
  const email = (elEmail?.value || "").trim();
  const password = elPass?.value || "";

  if (!email || !password) {
    showPopup("err", "Thiếu thông tin", "Vui lòng nhập Email và Mật khẩu.");
    return;
  }

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    showPopup("err", "Đăng nhập thất bại", error.message);
    return;
  }
  showPopup("ok", "Đăng nhập thành công", "Bạn đã đăng nhập admin.");
});

btnLogout?.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) {
    showPopup("err", "Đăng xuất thất bại", error.message);
    return;
  }
  showPopup("ok", "Đã đăng xuất", "Bạn đã đăng xuất.");
});

// Optional: clear filter
btnClearFilter?.addEventListener("click", async () => {
  if (elDate) elDate.value = "";
  if (elSearch) elSearch.value = "";
  await loadBookings();
});

// Search filter on cached rows
elSearch?.addEventListener("input", () => {
  const q = (elSearch.value || "").trim().toLowerCase();
  if (!q) {
    tbody.innerHTML = cachedRows.map(r => r.trHtml).join("");
    bindRowActions();
    return;
  }
  const filtered = cachedRows.filter(r =>
    (r.name || "").toLowerCase().includes(q) ||
    (r.phone || "").toLowerCase().includes(q)
  );
  tbody.innerHTML = filtered.map(r => r.trHtml).join("") || `<tr><td colspan="7" class="muted">Không tìm thấy.</td></tr>`;
  bindRowActions();
});

// Load bookings
btnLoad?.addEventListener("click", loadBookings);

async function loadBookings() {
  clearTable();
  setStatus("Đang tải danh sách...");

  const { data: userData } = await db.auth.getUser();
  if (!userData?.user) {
    setStatus("Bạn chưa đăng nhập admin. Vui lòng đăng nhập trước.");
    showPopup("err", "Chưa đăng nhập", "Vui lòng đăng nhập admin trước khi tải lịch.");
    return;
  }

  // Query bookings with optional date filter
  let query = db
    .from("bookings")
    // cố gắng lấy created_at nếu có
    .select("id, start_at, created_at, service_id, qty, note")
    .order("start_at", { ascending: false })
    .limit(300);

  const dateStr = (elDate?.value || "").trim();
  if (dateStr) {
    const startLocal = new Date(`${dateStr}T00:00:00`);
    const endLocal = new Date(`${dateStr}T23:59:59`);
    query = query.gte("start_at", startLocal.toISOString()).lte("start_at", endLocal.toISOString());
  }

  const { data: bookings, error: bErr } = await query;

  if (bErr) {
    setStatus("Lỗi load bookings: " + bErr.message);
    showPopup("err", "Lỗi tải lịch", bErr.message);
    return;
  }

  if (!bookings || bookings.length === 0) {
    setStatus("Không có lịch.");
    cachedRows = [];
    return;
  }

  // Load customers for these bookings
  const bookingIds = bookings.map(b => b.id);

  const { data: customers, error: cErr } = await db
    .from("booking_customers")
    .select("booking_id, full_name, phone")
    .in("booking_id", bookingIds);

  if (cErr) {
    setStatus("Lỗi load khách: " + cErr.message);
    showPopup("err", "Lỗi tải khách", cErr.message);
    return;
  }

  const custMap = new Map();
  (customers || []).forEach(c => custMap.set(c.booking_id, c));

  // Load services map
  const serviceIds = [...new Set(bookings.map(b => b.service_id).filter(Boolean))];
  const serviceMap = new Map();
  if (serviceIds.length) {
    const { data: svcs, error: sErr } = await db
      .from("services")
      .select("id, name")
      .in("id", serviceIds);

    if (sErr) {
      setStatus("Lỗi load services: " + sErr.message);
      showPopup("err", "Lỗi tải dịch vụ", sErr.message);
      return;
    }
    (svcs || []).forEach(s => serviceMap.set(s.id, s.name));
  }

  // Build rows
  const now = Date.now();
  cachedRows = [];

  for (const b of bookings) {
    const c = custMap.get(b.id) || {};
    const timeText = fmtDateTimeLocal(b.start_at);

    // Tách note để dịch vụ nằm đúng cột, ghi chú nằm đúng cột
    const { serviceFromNote, cleanNote } = splitServiceAndNote(b.note);

    const serviceName =
      serviceFromNote ||
      serviceMap.get(b.service_id) ||
      (b.service_id ? `#${b.service_id}` : "");

    const noteText = cleanNote || "";

    // Highlight mới 24h: ưu tiên created_at nếu có, fallback start_at
    const createdIso = b.created_at || b.start_at;
    const createdMs = createdIso ? new Date(createdIso).getTime() : 0;
    const isNew24 = createdMs ? (now - createdMs <= 24 * 60 * 60 * 1000) : false;

    const trHtml = rowHtml({
      id: b.id,
      isNew24,
      timeText,
      service: serviceName,
      qty: b.qty,
      name: c.full_name || "",
      phone: c.phone || "",
      note: noteText,
    });

    cachedRows.push({
      id: b.id,
      name: c.full_name || "",
      phone: c.phone || "",
      trHtml
    });
  }

  // Apply search filter immediately if user typed something
  const q = (elSearch?.value || "").trim().toLowerCase();
  if (q) {
    const filtered = cachedRows.filter(r =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.phone || "").toLowerCase().includes(q)
    );
    tbody.innerHTML = filtered.map(r => r.trHtml).join("") || `<tr><td colspan="7" class="muted">Không tìm thấy.</td></tr>`;
  } else {
    tbody.innerHTML = cachedRows.map(r => r.trHtml).join("");
  }

  bindRowActions();
}

// Bind delete buttons
function bindRowActions() {
  tbody.querySelectorAll('button[data-action="cancel"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const bookingId = btn.getAttribute("data-id");
      if (!bookingId) return;

      // find row info for display
      const tr = tbody.querySelector(`tr[data-id="${bookingId}"]`);
      const name = tr?.getAttribute("data-name") || "";
      const phone = tr?.getAttribute("data-phone") || "";

      showPopup(
        "err",
        "Xác nhận hủy lịch",
        `Bạn chắc chắn muốn xóa booking này?\n\nKhách: ${name}\nSĐT: ${phone}\n\nHành động này không thể hoàn tác.`,
        {
          okText: "hủy lich",
          okClass: "danger",
          onOk: async () => {
            await cancelBooking(bookingId);
          }
        }
      );
    });
  });
}

/*async function deleteBooking(bookingId) {
  try {
    setStatus("Đang xóa booking...");

    // 1) Xóa customer trước (tránh FK)
    const { error: cDelErr } = await db
      .from("booking_customers")
      .delete()
      .eq("booking_id", bookingId);

    if (cDelErr) {
      showPopup("err", "Xóa khách thất bại", cDelErr.message);
      await loadBookings();
      return;
    }

    // 2) Xóa booking
    const { error: bDelErr } = await db
      .from("bookings")
      .delete()
      .eq("id", bookingId);

    if (bDelErr) {
      showPopup("err", "Xóa booking thất bại", bDelErr.message);
      await loadBookings();
      return;
    }

    showPopup("ok", "Đã xóa", "Booking đã được xóa khỏi hệ thống.");
    await loadBookings();
  } catch (e) {
    showPopup("err", "Lỗi", e?.message || String(e));
    await loadBookings();
  }
}*/


async function cancelBooking(bookingId) {
  try {
    setStatus("Đang hủy lịch...");

    const { error } = await db
      .from("bookings")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (error) {
      showPopup("err", "Hủy lịch thất bại", error.message);
      await loadBookings();
      return;
    }

    showPopup("ok", "Đã hủy", "Booking đã được chuyển sang trạng thái HỦY.");
    await loadBookings();
  } catch (e) {
    showPopup("err", "Lỗi", e?.message || String(e));
    await loadBookings();
  }
}

