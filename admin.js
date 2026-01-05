/* admin.js - Chip Nails (Supabase + Cloudflare Pages)
   Login: email + password
   Load bookings by date, join services + customers
*/

const { createClient } = supabase;

// === 1) DÁN THÔNG TIN SUPABASE CỦA BẠN ===
const SUPABASE_URL = "https://zaqruavtxyjxwpfdoolo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === 2) LẤY ELEMENTS ===
const elEmail = document.getElementById("adminEmail");
const elPass = document.getElementById("adminPass");
const btnLogin = document.getElementById("loginBtn");
const btnLogout = document.getElementById("logoutBtn");

const elDate = document.getElementById("dateInput");
const btnLoad = document.getElementById("loadBtn");
const tbody = document.getElementById("bookingBody");

function setStatus(text) {
  // Hiện status đơn giản ngay trên bảng
  tbody.innerHTML = `<tr><td colspan="6" style="color:#555;">${text}</td></tr>`;
}

function clearTable() {
  tbody.innerHTML = "";
}

function fmtTimeLocal(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function rowHtml({ time, service, qty, name, phone, note }) {
  return `
    <tr>
      <td>${time || ""}</td>
      <td>${service || ""}</td>
      <td>${qty ?? ""}</td>
      <td>${name || ""}</td>
      <td>${phone || ""}</td>
      <td>${note || ""}</td>
    </tr>
  `;
}

// === 3) HIỂN THỊ USER HIỆN TẠI (nếu muốn) ===
async function showCurrentUserHint() {
  const { data } = await db.auth.getUser();
  const email = data?.user?.email;
  if (email && elEmail) elEmail.value = email;
}

showCurrentUserHint();

// === 4) LOGIN / LOGOUT ===
btnLogin?.addEventListener("click", async () => {
  const email = (elEmail?.value || "").trim();
  const password = elPass?.value || "";

  if (!email || !password) {
    alert("Vui lòng nhập Email và Mật khẩu.");
    return;
  }

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  console.log("[login]", { data, error });

  if (error) {
    alert("Lỗi đăng nhập: " + error.message);
    return;
  }

  alert("Đăng nhập thành công!");
});

btnLogout?.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  console.log("[logout]", { error });

  if (error) {
    alert("Lỗi đăng xuất: " + error.message);
    return;
  }
  alert("Đã đăng xuất");
});

// === 5) LOAD LỊCH THEO NGÀY ===
btnLoad?.addEventListener("click", async () => {
  clearTable();

  // Kiểm tra đã đăng nhập chưa
  const { data: userData } = await db.auth.getUser();
  if (!userData?.user) {
    setStatus("Bạn chưa đăng nhập admin. Vui lòng đăng nhập trước.");
    return;
  }

  const dateStr = elDate?.value; // yyyy-mm-dd
  if (!dateStr) {
    setStatus("Vui lòng chọn ngày.");
    return;
  }

  // Tạo khoảng thời gian trong ngày (local) rồi convert ISO (UTC)
  const startLocal = new Date(`${dateStr}T00:00:00`);
  const endLocal = new Date(`${dateStr}T23:59:59`);

  const startIso = startLocal.toISOString();
  const endIso = endLocal.toISOString();

  console.log("[load] range", { dateStr, startIso, endIso });

  // 5.1) Lấy bookings trong khoảng (KHÔNG dùng service_name)
  const { data: bookings, error: bErr } = await db
    .from("bookings")
    .select("id, start_at, service_id, duration_minutes, qty, note")
    .gte("start_at", startIso)
    .lte("start_at", endIso)
    .order("start_at", { ascending: true });

  console.log("[bookings]", { count: bookings?.length, bErr, bookings });

  if (bErr) {
    setStatus("Lỗi load bookings: " + bErr.message);
    return;
  }

  if (!bookings || bookings.length === 0) {
    setStatus("Không có lịch cho ngày này.");
    return;
  }

  // 5.2) Lấy customers theo booking_id
  const bookingIds = bookings.map((b) => b.id);

  const { data: customers, error: cErr } = await db
    .from("booking_customers")
    .select("booking_id, full_name, phone")
    .in("booking_id", bookingIds);

  console.log("[customers]", { count: customers?.length, cErr, customers });

  if (cErr) {
    setStatus("Lỗi load khách: " + cErr.message);
    return;
  }

  const custMap = new Map();
  (customers || []).forEach((c) => custMap.set(c.booking_id, c));

  // 5.3) Lấy tên services theo service_id (services.name)
  const serviceIds = [
    ...new Set(bookings.map((b) => b.service_id).filter((x) => x !== null && x !== undefined)),
  ];

  let serviceMap = new Map();
  if (serviceIds.length > 0) {
    const { data: services, error: sErr } = await db
      .from("services")
      .select("id, name")
      .in("id", serviceIds);

    console.log("[services]", { count: services?.length, sErr, services });

    if (sErr) {
      setStatus("Lỗi load services: " + sErr.message);
      return;
    }

    (services || []).forEach((s) => serviceMap.set(s.id, s.name));
  }

  // 5.4) Render
  for (const b of bookings) {
    const c = custMap.get(b.id) || {};
    const time = fmtTimeLocal(b.start_at);
    const serviceName = serviceMap.get(b.service_id) || `#${b.service_id}`;

    tbody.insertAdjacentHTML(
      "beforeend",
      rowHtml({
        time,
        service: serviceName,
        qty: b.qty,
        name: c.full_name || "",
        phone: c.phone || "",
        note: b.note || "",
      })
    );
  }
});
