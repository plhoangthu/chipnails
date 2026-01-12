// ====== 1) CẤU HÌNH SUPABASE ======
const SUPABASE_URL = "https://zaqruavtxyjxwpfdoolo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====== 2) Helpers ======
const $ = (id) => document.getElementById(id);

function pad2(n){ return String(n).padStart(2,"0"); }

// Convert date (YYYY-MM-DD) + time (HH:mm) in Asia/Ho_Chi_Minh to ISO timestamptz
function localVNToISO(dateYMD, timeHM) {
  return `${dateYMD}T${timeHM}:00+07:00`;
}

function normalizePhone(p) {
  return (p || "").replace(/\s+/g, "").trim();
}

// ====== 3) POPUP MODAL (thay cho #msg) ======
function modalEls() {
  return {
    backdrop: $("modalBackdrop"),
    box: $("modalBox"),
    title: $("modalTitle"),
    body: $("modalBody"),
    btnOk: $("modalOk"),
    btnClose: $("modalClose"),
  };
}

function showPopup(type, title, text) {
  const { backdrop, box, title: elTitle, body, btnOk, btnClose } = modalEls();
  if (!backdrop || !box || !elTitle || !body) {
    // fallback nếu thiếu modal trong HTML
    alert(`${title}\n\n${text}`);
    return;
  }

  box.classList.remove("modal-ok", "modal-err", "modal-info");
  box.classList.add(type === "ok" ? "modal-ok" : type === "err" ? "modal-err" : "modal-info");

  elTitle.textContent = title || "Thông báo";
  body.textContent = text || "";

  backdrop.style.display = "flex";
  backdrop.setAttribute("aria-hidden", "false");

  const close = () => {
    backdrop.style.display = "none";
    backdrop.setAttribute("aria-hidden", "true");
  };

  btnOk?.onclick = close;
  btnClose?.onclick = close;

  // bấm nền để đóng
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };

  // ESC để đóng
  window.onkeydown = (e) => {
    if (e.key === "Escape") close();
  };
}

// ====== 4) UI State ======
let services = [];
let settings = null;
let selectedTime = null; // "HH:mm"

function setSelectedTime(timeHM) {
  selectedTime = timeHM;
  [...document.querySelectorAll(".slot")].forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.time === timeHM);
  });
}

// Lấy danh sách service_id đã chọn (multi-select)
function getSelectedServiceIds() {
  const sel = $("service");
  if (!sel) return [];
  return [...sel.selectedOptions].map(o => Number(o.value)).filter(n => Number.isFinite(n));
}

function formatServiceLabel(s) {
  // Ẩn duration/price nếu null
  const parts = [s.name];
  if (s.duration_minutes !== null && s.duration_minutes !== undefined) {
    parts.push(`${s.duration_minutes}p`);
  }
  if (s.price_vnd !== null && s.price_vnd !== undefined) {
    parts.push(`${Number(s.price_vnd).toLocaleString("vi-VN")}đ`);
  }
  return parts.join(" • ");
}

// ====== 5) Load services + settings ======
async function loadServices() {
  const { data, error } = await sb.from("services")
    .select("id,name,duration_minutes,price_vnd,sort_order,is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  services = data || [];

  const sel = $("service");
  sel.innerHTML = "";

  for (const s of services) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = formatServiceLabel(s);
    sel.appendChild(opt);
  }

  // auto select first
  if (sel.options.length > 0) sel.options[0].selected = true;
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

// ====== 6) Availability (RPC) ======
async function loadBookedSlots(dateYMD) {
  const { data, error } = await sb.rpc("get_booked_slots", { date_ymd: dateYMD });
  if (error) throw error;

  const booked = new Set();
  for (const row of (data || [])) {
    const d = new Date(row.start_at);
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

  if (!wrap.children.length) {
    wrap.innerHTML = `<div class="muted">Không có slot.</div>`;
  }
}

// ====== 7) Create booking (RPC) ======
async function submitBooking() {
  const btn = $("submit");
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "Đang đặt...";

  try {
    const selectedIds = getSelectedServiceIds();
    const dateYMD = $("date").value;
    const full_name = $("fullName").value.trim();
    const phone = normalizePhone($("phone").value);
    const qty = Number($("qty").value || 1);
    const noteRaw = $("note").value.trim();

    if (!selectedIds.length) {
      showPopup("err", "Thiếu thông tin", "Vui lòng chọn ít nhất 1 dịch vụ.");
      return;
    }
    if (!dateYMD) {
      showPopup("err", "Thiếu thông tin", "Vui lòng chọn ngày.");
      return;
    }
    if (!selectedTime) {
      showPopup("err", "Thiếu thông tin", "Vui lòng chọn giờ.");
      return;
    }
    if (!full_name) {
      showPopup("err", "Thiếu thông tin", "Vui lòng nhập họ và tên.");
      return;
    }
    if (!phone || phone.length < 9) {
      showPopup("err", "Thiếu thông tin", "Vui lòng nhập số điện thoại hợp lệ.");
      return;
    }
    if (!qty || qty < 1) {
      showPopup("err", "Thiếu thông tin", "Số lượng không hợp lệ.");
      return;
    }

    // Primary service = service đầu tiên (vì RPC hiện tại chỉ nhận 1 service_id)
    const primaryServiceId = selectedIds[0];
    const selectedNames = selectedIds
      .map(id => services.find(s => s.id === id)?.name)
      .filter(Boolean);

    const start_at = localVNToISO(dateYMD, selectedTime);

    // Gộp nhiều dịch vụ vào note để admin xem được
    const serviceLine = selectedNames.length ? `Dịch vụ: ${selectedNames.join(", ")}` : "";
    const note = [serviceLine, noteRaw].filter(Boolean).join("\n");

    const { data, error } = await sb.rpc("create_booking", {
      p_start_at: start_at,
      p_service_id: primaryServiceId,
      p_qty: qty,
      p_note: note,
      p_full_name: full_name,
      p_phone: phone
    });

    if (error) throw error;

    showPopup("ok", "Đặt lịch thành công", `✅ Đặt lịch thành công!\nMã lịch: ${data}\n\n${serviceLine}\nNgày: ${dateYMD}\nGiờ: ${selectedTime}`);

    await renderSlots();
    $("note").value = "";
  } catch (e) {
    const msg = (e?.message || "").includes("Slot already booked")
      ? "Giờ này vừa có người đặt trước. Vui lòng chọn giờ khác."
      : `Có lỗi: ${e.message || e}`;
    showPopup("err", "Đặt lịch thất bại", msg);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

// ====== 8) Init ======
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
    $("service").addEventListener("change", () => {}); // multi select
    $("submit").addEventListener("click", submitBooking);

    await renderSlots();
  } catch (e) {
    showPopup("err", "Không tải được dữ liệu", `Kiểm tra Supabase URL/Key.\nChi tiết: ${e.message || e}`);
  }
})();
