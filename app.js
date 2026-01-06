// app.js - Trang khách đặt lịch (HOÀN CHỈNH)
// Fix lỗi null element: tự tìm đúng input/select theo placeholder/type.
// Yêu cầu: Ẩn duration/price nếu NULL, vẫn cho chọn dịch vụ phụ.
// Nếu khách không chọn giờ -> vẫn đặt được, start_at = 00:00 của ngày đó + note có marker.

// ===================== 1) DÁN SUPABASE CỦA BẠN =====================
const SUPABASE_URL = "https://zaqruavtxyjxwpfdoolo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

// ===================== 2) KHỞI TẠO SUPABASE =====================
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================== 3) AUTO FIND DOM (KHÔNG PHỤ THUỘC ID) =====================
function $q(sel) { return document.querySelector(sel); }

function findServiceSelect() {
  // Ưu tiên select đầu tiên trong phần form
  // (trang bạn dropdown "Dịch vụ" là select đầu tiên)
  return (
    document.getElementById("serviceSelect") ||
    $q('select[name="service"]') ||
    $q("select")
  );
}

function findDateInput() {
  // Trang bạn có date picker
  return (
    document.getElementById("dateInput") ||
    $q('input[type="date"]') ||
    // fallback nếu browser render date dạng text
    $q('input[placeholder*="dd"]') ||
    $q('input[placeholder*="mm"]')
  );
}

function findTimeSelect() {
  // Nếu bạn có select giờ trống
  return (
    document.getElementById("timeSelect") ||
    $q('select[name="time"]') ||
    null
  );
}

function findFullNameInput() {
  return (
    document.getElementById("fullName") ||
    $q('input[placeholder*="Nguyễn"]') ||
    $q('input[placeholder*="Họ"]') ||
    $q('input[name="full_name"]')
  );
}

function findPhoneInput() {
  return (
    document.getElementById("phone") ||
    $q('input[type="tel"]') ||
    $q('input[placeholder*="09"]') ||
    $q('input[name="phone"]')
  );
}

function findQtyInput() {
  return (
    document.getElementById("qty") ||
    $q('input[type="number"]')
  );
}

function findNoteInput() {
  return (
    document.getElementById("note") ||
    $q('input[placeholder*="Ví dụ"]') ||
    $q("textarea") ||
    null
  );
}

function findSubmitBtn() {
  // Nút "Đặt lịch" thường là button cuối
  return (
    document.getElementById("submitBtn") ||
    $q('button[type="submit"]') ||
    [...document.querySelectorAll("button")].find(b => (b.textContent || "").toLowerCase().includes("đặt")) ||
    $q("button")
  );
}

function findMessageBox() {
  return (
    document.getElementById("message") ||
    null
  );
}

// DOM refs
let elService, elDate, elTime, elFullName, elPhone, elQty, elNote, btnSubmit, elMsg;

// ===================== 4) HELPERS =====================
function setMsg(text, isError = false) {
  if (!elMsg) {
    if (text) console.log(text);
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
  // Ẩn duration/price nếu NULL
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
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toISOString();
}

// ===================== 5) LOAD SERVICES =====================
let SERVICES = [];

async function loadServices() {
  // Guard
  if (!elService) {
    alert("Không tìm thấy ô chọn Dịch vụ (select). Vui lòng kiểm tra HTML.");
    return;
  }

  // show loading in dropdown
  elService.innerHTML = `<option value="">Đang tải dịch vụ...</option>`;

  const { data, error } = await db
    .from("services")
    .select("id, name, duration_minutes, price_vnd, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Load services error:", error);
    elService.innerHTML = `<option value="">Lỗi tải dịch vụ</option>`;
    alert("Lỗi tải dịch vụ: " + error.message + "\n\n(Thường do RLS chưa cho public SELECT services)");
    return;
  }

  SERVICES = data || [];

  elService.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— Chọn dịch vụ —";
  elService.appendChild(opt0);

  for (const s of SERVICES) {
    const opt = document.createElement("option");
    opt.value = String(s.id);
    opt.textContent = serviceLabel(s);
    elService.appendChild(opt);
  }
}

// ===================== 6) TIME OPTIONS (TUỲ CHỌN) =====================
function renderTimeOptions() {
  if (!elTime) return; // nếu trang bạn không dùng select giờ thì bỏ qua

  elTime.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— (Không chọn giờ) —";
  elTime.appendChild(opt0);

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

// ===================== 7) SUBMIT BOOKING =====================
async function submitBooking() {
  if (!elService || !elDate || !elFullName || !elPhone || !elQty || !btnSubmit) {
    alert("Thiếu trường trong form. Hãy kiểm tra HTML / ID.");
    return;
  }

  const serviceId = elService.value;
  const dateStr = elDate.value;
  const timeStr = elTime ? elTime.value : ""; // có thể rỗng
  const fullName = (elFullName.value || "").trim();
  const phone = (elPhone.value || "").trim();
  const qty = Number(elQty.value || 1);
  let note = (elNote?.value || "").trim();

  if (!serviceId) return alert("Vui lòng chọn dịch vụ.");
  if (!dateStr) return alert("Vui lòng chọn ngày.");
  if (!fullName) return alert("Vui lòng nhập họ và tên.");
  if (!phone) return alert("Vui lòng nhập số điện thoại.");
  if (!Number.isFinite(qty) || qty <= 0) return alert("Số lượng không hợp lệ.");

  const selectedService = SERVICES.find(s => String(s.id) === String(serviceId));
  if (!selectedService) return alert("Dịch vụ không hợp lệ.");

  // start_at: nếu có giờ -> dùng giờ đó; nếu không -> 00:00 của ngày
  const startAtIso = timeStr ? toIsoAtLocalTime(dateStr, timeStr) : toIsoAtStartOfDay(dateStr);

  // Nếu không chọn giờ -> thêm marker để admin biết
  if (!timeStr) {
    note = note ? `[CHƯA CHỌN GIỜ] ${note}` : "[CHƯA CHỌN GIỜ]";
  }

  const durationMinutes = selectedService.duration_minutes ?? null;

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Đang gửi...";

  // 1) insert bookings
  const { data: booking, error: bErr } = await db
    .from("bookings")
    .insert({
      service_id: selectedService.id,
      start_at: startAtIso,
      duration_minutes: durationMinutes, // NULL ok
      qty: qty,
      note: note || null
    })
    .select("id")
    .single();

  if (bErr) {
    console.error("Insert booking error:", bErr);
    alert("Lỗi đặt lịch: " + bErr.message);
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Đặt lịch";
    return;
  }

  // 2) insert booking_customers
  const { error: cErr } = await db
    .from("booking_customers")
    .insert({
      booking_id: booking.id,
      full_name: fullName,
      phone: phone
    });

  if (cErr) {
    console.error("Insert customer error:", cErr);
    alert("Đặt lịch thành công nhưng lỗi lưu khách: " + cErr.message);
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Đặt lịch";
    return;
  }

  alert("✅ Đặt lịch thành công!");

  btnSubmit.disabled = false;
  btnSubmit.textContent = "Đặt lịch";

  // reset nhẹ (tuỳ bạn)
  // elService.value = "";
  // elDate.value = "";
  // if (elTime) elTime.value = "";
  // elFullName.value = "";
  // elPhone.value = "";
  // elQty.value = "1";
  // if (elNote) elNote.value = "";
}

// ===================== 8) INIT =====================
document.addEventListener("DOMContentLoaded", async () => {
  // bind DOM
  elService = findServiceSelect();
  elDate = findDateInput();
  elTime = findTimeSelect();
  elFullName = findFullNameInput();
  elPhone = findPhoneInput();
  elQty = findQtyInput();
  elNote = findNoteInput();
  btnSubmit = findSubmitBtn();
  elMsg = findMessageBox();

  // debug nhanh (bạn có thể xoá sau)
  console.log("DOM found:", {
    elService: !!elService,
    elDate: !!elDate,
    elTime: !!elTime,
    elFullName: !!elFullName,
    elPhone: !!elPhone,
    elQty: !!elQty,
    elNote: !!elNote,
    btnSubmit: !!btnSubmit
  });

  await loadServices();
  renderTimeOptions();

  if (btnSubmit) {
    btnSubmit.addEventListener("click", (e) => {
      e.preventDefault();
      submitBooking();
    });
  }
});
