// ====== 1) CẤU HÌNH SUPABASE (dán URL + anon key của bạn vào đây) ======
const SUPABASE_URL = "https://zaqruavtxyjxwpfdoolo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====== 2) Helpers ======
const $ = (id) => document.getElementById(id);
const msgBox = $("msg");

function showMsg(type, text) {
  msgBox.innerHTML = `<div class="${type === "ok" ? "ok" : "err"}">${text}</div>`;
}

function clearMsg() { msgBox.innerHTML = ""; }

function pad2(n){ return String(n).padStart(2,"0"); }

// Convert date (YYYY-MM-DD) + time (HH:mm) in Asia/Ho_Chi_Minh to ISO timestamptz
function localVNToISO(dateYMD, timeHM) {
  // We build a string with explicit +07:00 offset
  // Example: 2026-01-05T10:30:00+07:00
  return `${dateYMD}T${timeHM}:00+07:00`;
}

// ====== 3) UI State ======
let services = [];
let settings = null;
let selectedTime = null; // "HH:mm"

function setSelectedTime(timeHM) {
  selectedTime = timeHM;
  [...document.querySelectorAll(".slot")].forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.time === timeHM);
  });
}

// ====== 4) Load services + settings ======
async function loadServices() {
  const { data, error } = await sb.from("services")
    .select("id,name,duration_minutes,price_vnd,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  services = data || [];

  const sel = $("service");
  sel.innerHTML = "";
  for (const s of services) {
    const price = s.price_vnd ? ` - ${s.price_vnd.toLocaleString("vi-VN")}đ` : "";
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.duration_minutes} phút)${price}`;
    sel.appendChild(opt);
  }
}

async function loadSettings() {
  const { data, error } = await sb.from("business_settings")
    .select("timezone,open_time,close_time,slot_minutes,max_qty,closed_weekdays")
    .eq("id", 1)
    .single();

  if (error) throw error;
  settings = data;
  $("qty").max = String(settings.max_qty ?? 4);
}

function timeRangeSlots(openTime, closeTime, slotMinutes) {
  // openTime/closeTime are "HH:MM:SS" from Postgres time
  const [oh, om] = openTime.split(":").map(Number);
  const [ch, cm] = closeTime.split(":").map(Number);

  const start = oh * 60 + om;
  const end = ch * 60 + cm;
  const step = slotMinutes;

  const slots = [];
  for (let m = start; m + step <= end; m += step) {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    slots.push(`${pad2(hh)}:${pad2(mm)}`);
  }
  return slots;
}

// ====== 5) Availability (RPC) ======
async function loadBookedSlots(dateYMD) {
  // RPC returns { start_at } for that date
  const { data, error } = await sb.rpc("get_booked_slots", { date_ymd: dateYMD });
  if (error) throw error;

  // Convert to "HH:mm" in VN timezone
  const booked = new Set();
  for (const row of (data || [])) {
    const d = new Date(row.start_at);
    // Convert to VN (assume browser in VN; but safe enough because start_at stored with tz)
    // We'll format using toLocaleTimeString with 'vi-VN' and 24h
    const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
    booked.add(hm);
  }
  return booked;
}

async function renderSlots() {
  const dateYMD = $("date").value;
  if (!dateYMD || !settings) return;

  // closed weekdays (0=Sun..6=Sat)
  const weekday = new Date(`${dateYMD}T00:00:00+07:00`).getDay();
  if ((settings.closed_weekdays || []).includes(weekday)) {
    $("slots").innerHTML = `<div class="muted">Ngày này tiệm nghỉ.</div>`;
    selectedTime = null;
    return;
  }

  $("slots").innerHTML = `<div class="muted">Đang tải...</div>`;
  selectedTime = null;

  const all = timeRangeSlots(settings.open_time, settings.close_time, settings.slot_minutes);
  const booked = await loadBookedSlots(dateYMD);

  const wrap = $("slots");
  wrap.innerHTML = "";

  for (const t of all) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot";
    btn.dataset.time = t;
    btn.textContent = t;

    const isBooked = booked.has(t);
    btn.setAttribute("aria-disabled", isBooked ? "true" : "false");
    btn.disabled = isBooked;

    btn.addEventListener("click", () => setSelectedTime(t));
    wrap.appendChild(btn);
  }

  // If all booked
  if (!wrap.children.length) {
    wrap.innerHTML = `<div class="muted">Không có slot.</div>`;
  }
}

// ====== 6) Create booking (RPC) ======
function normalizePhone(p) {
  return (p || "").replace(/\s+/g, "").trim();
}

async function submitBooking() {
  clearMsg();

  const service_id = Number($("service").value);
  const dateYMD = $("date").value;
  const full_name = $("fullName").value.trim();
  const phone = normalizePhone($("phone").value);
  const qty = Number($("qty").value || 1);
  const note = $("note").value.trim();

  if (!service_id) return showMsg("err", "Vui lòng chọn dịch vụ.");
  if (!dateYMD) return showMsg("err", "Vui lòng chọn ngày.");
  if (!selectedTime) return showMsg("err", "Vui lòng chọn giờ.");
  if (!full_name) return showMsg("err", "Vui lòng nhập họ và tên.");
  if (!phone || phone.length < 9) return showMsg("err", "Vui lòng nhập số điện thoại hợp lệ.");
  if (!qty || qty < 1) return showMsg("err", "Số lượng không hợp lệ.");

  const start_at = localVNToISO(dateYMD, selectedTime);

  $("submit").disabled = true;
  $("submit").textContent = "Đang đặt...";

  try {
    const { data, error } = await sb.rpc("create_booking", {
      p_start_at: start_at,
      p_service_id: service_id,
      p_qty: qty,
      p_note: note,
      p_full_name: full_name,
      p_phone: phone
    });

    if (error) throw error;

    showMsg("ok", `✅ Đặt lịch thành công! Mã lịch: <b>${data}</b>`);
    // Refresh slots to mark it booked
    await renderSlots();

    // Clear some fields
    $("note").value = "";
  } catch (e) {
    const msg = (e?.message || "").includes("Slot already booked")
      ? "Giờ này vừa có người đặt trước. Vui lòng chọn giờ khác."
      : `Có lỗi: ${e.message || e}`;
    showMsg("err", msg);
  } finally {
    $("submit").disabled = false;
    $("submit").textContent = "Đặt lịch";
  }
}

// ====== 7) Init ======
(async function init(){
  try {
    await loadSettings();
    await loadServices();

    // default date today VN
    const today = new Date();
    const y = today.getFullYear();
    const m = pad2(today.getMonth()+1);
    const d = pad2(today.getDate());
    $("date").value = `${y}-${m}-${d}`;

    $("date").addEventListener("change", renderSlots);
    $("service").addEventListener("change", () => {}); // reserved
    $("submit").addEventListener("click", submitBooking);

    await renderSlots();
  } catch (e) {
    showMsg("err", `Không tải được dữ liệu. Kiểm tra Supabase URL/Key. Chi tiết: ${e.message || e}`);
  }
})();
