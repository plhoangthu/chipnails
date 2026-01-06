// admin.js - Trang admin
// Login: email + password
// Load bookings theo ngày, join customers + services.name
// Nếu note có "[CHƯA CHỌN GIỜ]" và giờ 00:00 -> hiển thị "Chưa hẹn giờ"

const { createClient } = supabase;

/* ==== 1) DÁN THÔNG TIN SUPABASE CỦA BẠN ==== */
const SUPABASE_URL = "https://zaqruavtxyjxwpfdoolo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==== 2) DOM IDs (đổi nếu admin.html bạn đặt khác) ==== */
const elEmail = document.getElementById("adminEmail");
const elPass = document.getElementById("adminPass");
const btnLogin = document.getElementById("loginBtn");
const btnLogout = document.getElementById("logoutBtn");

const elDate = document.getElementById("dateInput");
const btnLoad = document.getElementById("loadBtn");
const tbody = document.getElementById("bookingBody");

function setRowStatus(text) {
  tbody.innerHTML = `<tr><td colspan="6" style="color:#555;">${text}</td></tr>`;
}

function fmtTimeForAdmin(startAtIso, note) {
  if (!startAtIso) return "Chưa hẹn giờ";

  const d = new Date(startAtIso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  // Nếu không chọn giờ -> mình lưu 00:00 và note có marker
  if ((hh === "00" && mm === "00") && (note || "").includes("[CHƯA CHỌN GIỜ]")) {
    return "Chưa hẹn giờ";
  }
  return `${hh}:${mm}`;
}

/* ==== Login/Logout ==== */
btnLogin?.addEventListener("click", async () => {
  const email = (elEmail?.value || "").trim();
  const password = elPass?.value || "";

  if (!email || !password) return alert("Nhập Email và Mật khẩu.");

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return alert("Lỗi đăng nhập: " + error.message);

  alert("Đăng nhập thành công!");
});

btnLogout?.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) return alert("Lỗi đăng xuất: " + error.message);
  alert("Đã đăng xuất");
});

/* ==== Load lịch ==== */
btnLoad?.addEventListener("click", async () => {
  tbody.innerHTML = "";

  // Check login
  const { data: userData } = await db.auth.getUser();
  if (!userData?.user) {
    setRowStatus("Bạn chưa đăng nhập admin.");
    return;
  }

  const dateStr = elDate?.value; // yyyy-mm-dd
  if (!dateStr) {
    setRowStatus("Vui lòng chọn ngày.");
    return;
  }

  // Range trong ngày (local) -> ISO
  const startIso = new Date(`${dateStr}T00:00:00`).toISOString();
  const endIso = new Date(`${dateStr}T23:59:59`).toISOString();

  // 1) bookings
  const { data: bookings, error: bErr } = await db
    .from("bookings")
    .select("id, start_at, service_id, qty, note")
    .gte("start_at", startIso)
    .lte("start_at", endIso)
    .order("start_at", { ascending: true });

  if (bErr) {
    setRowStatus("Lỗi load bookings: " + bErr.message);
    return;
  }

  if (!bookings || bookings.length === 0) {
    setRowStatus("Không có lịch cho ngày này.");
    return;
  }

  const bookingIds = bookings.map(b => b.id);
  const serviceIds = [...new Set(bookings.map(b => b.service_id).filter(Boolean))];

  // 2) customers
  const { data: customers, error: cErr } = await db
    .from("booking_customers")
    .select("booking_id, full_name, phone")
    .in("booking_id", bookingIds);

  if (cErr) {
    setRowStatus("Lỗi load khách: " + cErr.message);
    return;
  }

  const custMap = new Map();
  (customers || []).forEach(c => custMap.set(c.booking_id, c));

  // 3) services name
  let serviceMap = new Map();
  if (serviceIds.length > 0) {
    const { data: services, error: sErr } = await db
      .from("services")
      .select("id, name")
      .in("id", serviceIds);

    if (sErr) {
      setRowStatus("Lỗi load services: " + sErr.message);
      return;
    }
    (services || []).forEach(s => serviceMap.set(s.id, s.name));
  }

  // 4) render
  for (const b of bookings) {
    const c = custMap.get(b.id) || {};
    const timeText = fmtTimeForAdmin(b.start_at, b.note);
    const serviceName = serviceMap.get(b.service_id) || `#${b.service_id}`;

    tbody.insertAdjacentHTML(
      "beforeend",
      `
      <tr>
        <td>${timeText}</td>
        <td>${serviceName}</td>
        <td>${b.qty ?? ""}</td>
        <td>${c.full_name || ""}</td>
        <td>${c.phone || ""}</td>
        <td>${b.note || ""}</td>
      </tr>
      `
    );
  }
});
