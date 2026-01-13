/* admin.js - Chip Nails (Supabase + Cloudflare Pages)
   Login: email + password
   Load bookings by date, join services + customers
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
const tbody = document.getElementById("bookingBody");

// Popup
function showPopup(type, title, text) {
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
  box.classList.add(type === "ok" ? "ok" : type === "err" ? "err" : "");

  elTitle.textContent = title || "Thông báo";
  body.textContent = text || "";

  backdrop.style.display = "flex";
  backdrop.setAttribute("aria-hidden", "false");

  const close = () => {
    backdrop.style.display = "none";
    backdrop.setAttribute("aria-hidden", "true");
  };

  btnOk.onclick = close;
  btnClose.onclick = close;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  window.onkeydown = (e) => { if (e.key === "Escape") close(); };
}

function setStatus(text) {
  tbody.innerHTML = `<tr><td colspan="6" style="color:#555;">${text}</td></tr>`;
}

function clearTable() {
  tbody.innerHTML = "";
}

//function fmtTimeLocal(iso) {
 // const d = new Date(iso);
 // const hh = String(d.getHours()).padStart(2, "0");
  //const mm = String(d.getMinutes()).padStart(2, "0");
  //return `${hh}:${mm}`;
//}
function fmtTimeLocal(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";

  const date = d.toLocaleDateString("vi-VN");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${date} ${hh}:${mm}`;
}


// Nếu note có dòng "Dịch vụ: ..." thì ưu tiên hiển thị nó (nhiều dịch vụ)
function extractServicesFromNote(note) {
  if (!note) return null;
  const lines = String(note).split(/\r?\n/);
  const line = lines.find(l => l.trim().toLowerCase().startsWith("dịch vụ:"));
  if (!line) return null;
  return line.replace(/^dịch vụ:\s*/i, "").trim() || null;
}

function cleanNote(note) {
  if (!note) return "";
  const lines = String(note).split(/\r?\n/);
  // bỏ dòng "Dịch vụ:" ra khỏi ghi chú để note gọn
  const filtered = lines.filter(l => !l.trim().toLowerCase().startsWith("dịch vụ:"));
  return filtered.join("\n").trim();
}

function rowHtml({ time, service, qty, name, phone, note }) {
  return `
    <tr>
      <td>${time || ""}</td>
      <td>${service || ""}</td>
      <td>${qty ?? ""}</td>
      <td>${name || ""}</td>
      <td>${phone || ""}</td>
      <td>${(note || "").replace(/\n/g, "<br/>")}</td>
    </tr>
  `;
}

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

// Load lịch theo ngày
btnLoad?.addEventListener("click", async () => {
  clearTable();

  const { data: userData } = await db.auth.getUser();
  if (!userData?.user) {
    setStatus("Bạn chưa đăng nhập admin. Vui lòng đăng nhập trước.");
    showPopup("err", "Chưa đăng nhập", "Vui lòng đăng nhập admin trước khi tải lịch.");
    return;
  }

 // const dateStr = elDate?.value;
  //if (!dateStr) {
   // setStatus("Vui lòng chọn ngày.");
    //showPopup("err", "Thiếu thông tin", "Vui lòng chọn ngày.");
    //return;
  //}

  //const startLocal = new Date(`${dateStr}T00:00:00`);
  //const endLocal = new Date(`${dateStr}T23:59:59`);
  //const startIso = startLocal.toISOString();
  //const endIso = endLocal.toISOString();

 // const { data: bookings, error: bErr } = await db
  //  .from("bookings")
   // .select("id, start_at, service_id, qty, note")
    //.gte("start_at", startIso)
    //.lte("start_at", endIso)
    //.order("start_at", { ascending: true });
const { data: bookings, error: bErr } = await db
  .from("bookings")
  .select("id, start_at, service_id, qty, note")
  .order("start_at", { ascending: false }) // mới nhất lên trên
  .limit(200); // tránh load quá nặng

  if (bErr) {
    setStatus("Lỗi load bookings: " + bErr.message);
    showPopup("err", "Lỗi tải lịch", bErr.message);
    return;
  }

  if (!bookings || bookings.length === 0) {
    setStatus("Không có lịch cho ngày này.");
    return;
  }

  const bookingIds = bookings.map((b) => b.id);

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
  (customers || []).forEach((c) => custMap.set(c.booking_id, c));

  const serviceIds = [...new Set(bookings.map((b) => b.service_id).filter(Boolean))];
  let serviceMap = new Map();

  if (serviceIds.length > 0) {
    const { data: svcs, error: sErr } = await db
      .from("services")
      .select("id, name")
      .in("id", serviceIds);

    if (sErr) {
      setStatus("Lỗi load services: " + sErr.message);
      showPopup("err", "Lỗi tải dịch vụ", sErr.message);
      return;
    }
    (svcs || []).forEach((s) => serviceMap.set(s.id, s.name));
  }

  for (const b of bookings) {
    const c = custMap.get(b.id) || {};
    const time = fmtTimeLocal(b.start_at);
// Tách note dạng: "CẮT DA, SƠN GEL | [KHÔNG CHỌN GIỜ] | Đắp sơn"
function splitServiceAndNote(rawNote) {
  const note = (rawNote || "").trim();
  if (!note) return { serviceFromNote: null, cleanNote: "" };

  // Ưu tiên format dùng dấu |
  if (note.includes("|")) {
    const parts = note.split("|").map(s => s.trim()).filter(Boolean);

    const serviceFromNote = parts[0] || null;

    // Bỏ tag không chọn giờ khỏi ghi chú
    const rest = parts.slice(1).filter(p => !/^\[?\s*không chọn giờ\s*\]?$/i.test(p));
    const cleanNote = rest.join(" | ").trim();

    return { serviceFromNote, cleanNote };
  }

  // Nếu format "Dịch vụ: ..." theo dòng
  const lines = note.split(/\r?\n/).map(s => s.trim());
  const svcLine = lines.find(l => /^dịch vụ\s*:/i.test(l));
  if (svcLine) {
    const serviceFromNote = svcLine.replace(/^dịch vụ\s*:\s*/i, "").trim() || null;
    const cleanNote = lines.filter(l => !/^dịch vụ\s*:/i.test(l)).join("\n").trim();
    return { serviceFromNote, cleanNote };
  }

  // Không có pattern -> coi như chỉ là ghi chú
  return { serviceFromNote: null, cleanNote: note };
}

    // Dịch vụ: CHỈ lấy từ bảng services (service_id), KHÔNG lấy từ note nữa
//const serviceName = serviceMap.get(b.service_id) || (b.service_id ? `#${b.service_id}` : "");

// Ghi chú: giữ nguyên note khách nhập (không tự cắt dòng "Dịch vụ:" nữa)
//const clean = (b.note || "").trim();
// Tách dịch vụ & ghi chú từ note (vì bạn đang lưu chung bằng dấu |)
const { serviceFromNote, cleanNote } = splitServiceAndNote(b.note);

// Ưu tiên hiển thị nhiều dịch vụ từ note, nếu không có thì fallback service_id
const serviceName =
  serviceFromNote ||
  serviceMap.get(b.service_id) ||
  (b.service_id ? `#${b.service_id}` : "");

// Ghi chú: chỉ phần ghi chú sau khi đã tách
const clean = cleanNote;


    tbody.insertAdjacentHTML(
      "beforeend",
      rowHtml({
        time,
        service: serviceName,
        qty: b.qty,
        name: c.full_name || "",
        phone: c.phone || "",
        note: clean || "",
      })
    );
  }
});
