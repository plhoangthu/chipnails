
// app.js - Trang khách đặt lịch
// Yêu cầu: Ẩn duration/price nếu NULL, vẫn cho chọn dịch vụ phụ.
// Nếu khách không chọn giờ -> vẫn đặt được, start_at = 00:00 của ngày đó, note tự thêm "[CHƯA CHỌN GIỜ]".

/* ==== 1) DÁN THÔNG TIN SUPABASE CỦA BẠN ==== */
const SUPABASE_URL = "https://zaqruavtxyjxwpfdoolo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

/* ==== 2) KHỞI TẠO SUPABASE ==== */
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==== 3) DOM IDs (nếu file HTML bạn đặt khác id thì đổi ở đây) ==== */
const elService = document.getElementById("serviceSelect"); // <select>
const elDate = document.getElementById("dateInput");        // <input type="date">
const elTime = document.getElementById("timeSelect");       // <select> giờ (cho phép bỏ trống)
const elFullName = document.getElementById("fullName");     // <input>
const elPhone = document.getElementById("phone");           // <input>
const elQty = document.getElementById("qty");               // <input type="number">
const elNote = document.getElementById("note");             // <textarea>
const btnSubmit = document.getElementById("submitBtn");     // <button>
const elMsg = document.getElementById("message");           // <div> (tuỳ chọn)

/* ==== 4) Helpers ==== */
function setMsg(text, isError = false) {
  if (!elMsg) {
    if (text) alert(text);
    return;
  }
  elMsg.textContent = text || "";
  elMsg.style.color = isError ? "crimson" : "#111";
}

function formatMinutes(n) {
  if (n === null || n === undefined) return "";
  return `${n} phút`;
}
function formatVnd(n) {
  if (n === null || n === undefined) return "";
  return Number(n).toLocaleString("vi-VN") + "đ";
}
function serviceLabel(s) {
  const parts = [s.name];
  const dur = formatMinutes(s.duration_minutes);
  const price = formatVnd(s.price_vnd);
  if (dur) parts.push(dur);
  if (price) parts.push(price);
  return parts.join(" • ");
}

function toIsoAtLocalTime(dateStr, timeStr) {
  // dateStr: yyyy-mm-dd, timeStr: HH:MM
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return d.toISOString();
}

function toIsoAtStartOfDay(dateStr) {
  // yyyy-mm-dd -> 00:00 local -> ISO
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toISOString();
}

/* ==== 5) Load services ==== */
let SERVICES = []; // cache

async function loadServices() {
  setMsg("Đang tải dịch vụ...");

  const { data, error } = await db
    .from("services")
    .select("id, name, duration_minutes, price_vnd, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);
    setMsg("Lỗi tải dịch vụ: " + error.message, true);
    return;
  }

  SERVICES = data || [];

  // Render select
  elService.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— Chọn dịch vụ —";
  elService.appendChild(opt0);

  for (const s of SERVICES) {
    const opt = document.createElement("option");
    opt.value = String(s.id);
    opt.textContent = serviceLabel(s); // Ẩn duration/price nếu NULL
    elService.appendChild(opt);
  }

  setMsg("");
}

/* ==== 6) Time slots (tuỳ chọn)
   - Bạn có thể bỏ phần này nếu bạn không dùng timeSelect.
   - Mình để timeSelect có option trống (cho phép không chọn giờ).
==== */
function renderTimeOptions() {
  if (!elTime) return;

  // Luôn cho phép "không chọn giờ"
  elTime.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— (Không chọn giờ) —";
  elTime.appendChild(opt0);

  // Nếu bạn muốn giờ cố định (ví dụ 09:00-20:00 mỗi 30 phút)
  // bạn có thể điều chỉnh ở đây:
  const startHour = 9;
  const endHour = 20;
  const stepMin = 30;

  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      if (h === endHour && m > 0) break;
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const t = `${hh}:${mm}`;
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      elTime.appendChild(opt);
    }
  }
}

/* ==== 7) Submit booking ==== */
async function submitBooking() {
  setMsg("");

  const serviceId = elService.value;
  const dateStr = elDate.value;
  const timeStr = elTime ? elTime.value : ""; // có thể rỗng
  const fullName = (elFullName.value || "").trim();
  const phone = (elPhone.value || "").trim();
  const qty = Number(elQty.value || 1);
  let note = (elNote.value || "").trim();

  if (!serviceId) return setMsg("Vui lòng chọn dịch vụ.", true);
  if (!dateStr) return setMsg("Vui lòng chọn ngày.", true);
  if (!fullName) return setMsg("Vui lòng nhập họ và tên.", true);
  if (!phone) return setMsg("Vui lòng nhập số điện thoại.", true);
  if (!Number.isFinite(qty) || qty <= 0) return setMsg("Số lượng không hợp lệ.", true);

  const selectedService = SERVICES.find(s => String(s.id) === String(serviceId));
  if (!selectedService) return setMsg("Dịch vụ không hợp lệ.", true);

  // start_at: nếu có giờ -> dùng giờ đó; nếu không -> 00:00 của ngày
  const startAtIso = timeStr ? toIsoAtLocalTime(dateStr, timeStr) : toIsoAtStartOfDay(dateStr);

  // Nếu không chọn giờ -> thêm marker để admin biết
  if (!timeStr) {
    note = note ? `[CHƯA CHỌN GIỜ] ${note}` : "[CHƯA CHỌN GIỜ]";
  }

  // duration_minutes có thể NULL (dịch vụ phụ)
  const durationMinutes = selectedService.duration_minutes ?? null;

  setMsg("Đang gửi đặt lịch...");

  // 1) Insert bookings
  const { data: booking, error: bErr } = await db
    .from("bookings")
    .insert({
      service_id: selectedService.id,
      start_at: startAtIso,                     // luôn có ngày; nếu không chọn giờ thì 00:00
      duration_minutes: durationMinutes,        // NULL ok
      qty: qty,
      note: note || null
    })
    .select("id")
    .single();

  if (bErr) {
    console.error(bErr);
    setMsg("Lỗi đặt lịch: " + bErr.message, true);
    return;
  }

  // 2) Insert booking_customers
  const { error: cErr } = await db
    .from("booking_customers")
    .insert({
      booking_id: booking.id,
      full_name: fullName,
      phone: phone
    });

  if (cErr) {
    console.error(cErr);
    setMsg("Đặt lịch thành công nhưng lỗi lưu thông tin khách: " + cErr.message, true);
    return;
  }

  setMsg("✅ Đặt lịch thành công!");
  // Reset nhẹ
  // elService.value = "";
  // elDate.value = "";
  // if (elTime) elTime.value = "";
  // elFullName.value = "";
  // elPhone.value = "";
  // elQty.value = "1";
  // elNote.value = "";
}

/* ==== 8) Wire events ==== */
document.addEventListener("DOMContentLoaded", async () => {
  await loadServices();
  renderTimeOptions();
});

btnSubmit?.addEventListener("click", (e) => {
  e.preventDefault();
  submitBooking();
});
