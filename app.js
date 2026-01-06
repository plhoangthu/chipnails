// app.js - Trang khách đặt lịch (BẢN CHUẨN CHO index.html DÙNG #slots)
// - Hiển thị giờ 08:00–21:00 (mỗi 30 phút) vào div#slots
// - Click chọn giờ -> lưu selectedTime
// - Tự disable giờ đã đặt theo ngày (đọc bảng bookings)
// - Ẩn duration/price nếu NULL trong label dịch vụ
// - Cho phép không chọn giờ (tùy chọn): sẽ lưu start_at = 00:00 và note có marker

// ===================== 1) DÁN SUPABASE CỦA BẠN =====================
const SUPABASE_URL = "https://zaqruavtxyjxwpfdoolo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

// ===================== 2) KHỞI TẠO SUPABASE =====================
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================== 3) DOM =====================
const elService = document.getElementById("service");
const elDate = document.getElementById("date");
const elSlots = document.getElementById("slots");
const elMsg = document.getElementById("msg");

const elFullName = document.getElementById("fullName");
const elPhone = document.getElementById("phone");
const elQty = document.getElementById("qty");
const elNote = document.getElementById("note");
const btnSubmit = document.getElementById("submit");

// ===================== 4) STATE =====================
let SERVICES = [];
let selectedTime = ""; // "HH:MM" hoặc "" (không chọn)

// ===================== 5) UI HELPERS =====================
function showMsg(type, text) {
  if (!elMsg) return;
  if (!text) {
    elMsg.innerHTML = "";
    return;
  }
  const cls = type === "err" ? "err" : "ok";
  elMsg.innerHTML = `<div class="${cls}">${text}</div>`;
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

function ymd(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function makeIsoLocal(dateStr, timeStr) {
  // dateStr: yyyy-mm-dd, timeStr: HH:MM
  // Tạo Date theo local rồi toISOString() để lưu timestamptz
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return d.toISOString();
}

function makeIsoStartOfDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toISOString();
}

// ===================== 6) LOAD SERVICES =====================
async function loadServices() {
  if (!elService) {
    alert("Không tìm thấy select #service");
    return;
  }
  elService.innerHTML = `<option value="">Đang tải dịch vụ...</option>`;

  const { data, error } = await db
    .from("services")
    .select("id, name, duration_minutes, price_vnd, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);
    elService.innerHTML = `<option value="">Lỗi tải dịch vụ</option>`;
    showMsg("err", "Lỗi tải dịch vụ: " + error.message);
    return;
  }

  SERVICES = data || [];

  elService.innerHTML = `<option value="">— Chọn dịch vụ —</option>`;
  for (const s of SERVICES) {
    const opt = document.createElement("option");
    opt.value = String(s.id);
    opt.textContent = serviceLabel(s);
    elService.appendChild(opt);
  }
}

// ===================== 7) LOAD BOOKINGS IN DAY (để disable slot) =====================
async function loadBookedTimesForDate(dateStr) {
  // Lấy tất cả booking trong khoảng [date 00:00, date+1 00:00)
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data, error } = await db
    .from("bookings")
    .select("start_at")
    .gte("start_at", start.toISOString())
    .lt("start_at", end.toISOString());

  if (error) {
    console.error("loadBookedTimesForDate error:", error);
    // nếu lỗi RLS thì vẫn cho hiển thị slot (không disable)
    return new Set();
  }

  const set = new Set();
  for (const row of (data || [])) {
    if (!row.start_at) continue;
    const d = new Date(row.start_at);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    set.add(`${hh}:${mm}`);
  }
  return set;
}

// ===================== 8) RENDER SLOTS 08:00–21:00 =====================
async function renderSlots() {
  if (!elSlots) return;

  const dateStr = elDate?.value;
  if (!dateStr) {
    elSlots.innerHTML = "";
    return;
  }

  elSlots.innerHTML = "";
  showMsg("", "");

  // Lấy giờ đã đặt trong ngày để disable
  const booked = await loadBookedTimesForDate(dateStr);

  // (Tùy chọn) slot "Không chọn giờ"
  const noTime = document.createElement("div");
  noTime.className = "slot";
  noTime.textContent = "Không chọn giờ";
  noTime.dataset.time = "";
  if (selectedTime === "") noTime.classList.add("selected");
  noTime.addEventListener("click", () => {
    selectedTime = "";
    // reset selected state
    [...elSlots.querySelectorAll(".slot")].forEach(x => x.classList.remove("selected"));
    noTime.classList.add("selected");
  });
  elSlots.appendChild(noTime);

  const startHour = 8;
  const endHour = 21;
  const stepMin = 30;

  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      // cho phép 21:00 nhưng không cho 21:30
      if (h === endHour && m > 0) break;

      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const t = `${hh}:${mm}`;

      const slot = document.createElement("div");
      slot.className = "slot";
      slot.textContent = t;
      slot.dataset.time = t;

      const isBooked = booked.has(t);
      if (isBooked) {
        slot.setAttribute("aria-disabled", "true");
      }

      if (selectedTime === t) slot.classList.add("selected");

      slot.addEventListener("click", () => {
        if (slot.getAttribute("aria-disabled") === "true") return;

        selectedTime = t;
        [...elSlots.querySelectorAll(".slot")].forEach(x => x.classList.remove("selected"));
        slot.classList.add("selected");
      });

      elSlots.appendChild(slot);
    }
  }
}

// ===================== 9) SUBMIT =====================
async function submitBooking() {
  const serviceId = elService?.value || "";
  const dateStr = elDate?.value || "";
  const fullName = (elFullName?.value || "").trim();
  const phone = (elPhone?.value || "").trim();
  const qty = Number(elQty?.value || 1);
  let note = (elNote?.value || "").trim();

  if (!serviceId) return alert("Vui lòng chọn dịch vụ.");
  if (!dateStr) return alert("Vui lòng chọn ngày.");
  if (!fullName) return alert("Vui lòng nhập họ và tên.");
  if (!phone) return alert("Vui lòng nhập số điện thoại.");
  if (!Number.isFinite(qty) || qty <= 0) return alert("Số lượng không hợp lệ.");

  const svc = SERVICES.find(s => String(s.id) === String(serviceId));
  if (!svc) return alert("Dịch vụ không hợp lệ.");

  // Nếu không chọn giờ -> lưu 00:00 và đánh dấu
  const startAtIso = selectedTime
    ? makeIsoLocal(dateStr, selectedTime)
    : makeIsoStartOfDay(dateStr);

  if (!selectedTime) {
    note = note ? `[CHƯA CHỌN GIỜ] ${note}` : "[CHƯA CHỌN GIỜ]";
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Đang gửi...";

  // 1) insert bookings
  const { data: booking, error: bErr } = await db
    .from("bookings")
    .insert({
      service_id: Number(svc.id),
      start_at: startAtIso,
      duration_minutes: svc.duration_minutes ?? null,
      qty: qty,
      note: note || null
    })
    .select("id")
    .single();

  if (bErr) {
    console.error("Insert bookings error:", bErr);
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
    console.error("Insert booking_customers error:", cErr);
    alert("Đặt lịch thành công nhưng lỗi lưu khách: " + cErr.message);
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Đặt lịch";
    return;
  }

  alert("✅ Đặt lịch thành công!");
  btnSubmit.disabled = false;
  btnSubmit.textContent = "Đặt lịch";

  // Sau khi đặt: load lại slot để disable giờ vừa đặt
  await renderSlots();
}

// ===================== 10) INIT =====================
document.addEventListener("DOMContentLoaded", async () => {
  // set mặc định ngày hôm nay nếu trống
  if (elDate && !elDate.value) elDate.value = ymd(new Date());

  await loadServices();
  await renderSlots();

  if (elDate) elDate.addEventListener("change", renderSlots);

  if (btnSubmit) {
    btnSubmit.addEventListener("click", (e) => {
      e.preventDefault();
      submitBooking();
    });
  }
});
