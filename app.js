/* app.js - Chip Nails booking (Supabase)
   - Có nút "Không chọn giờ" (no-time)
   - Fix lỗi 409 khi nhiều người chọn "Không chọn giờ" (start_at 00:00 + random seconds)
   - Ẩn duration/price nếu NULL
*/

(() => {
  // ====== SUPABASE CONFIG (giữ đúng project của bạn) ======
  const SUPABASE_URL = "https://zaqruavtxyjxwpfdoo1o.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // <-- giữ y hệt key bạn đang dùng

  // Supabase client (yêu cầu bạn đã include supabase-js trên index.html)
  const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  if (!db) {
    console.error("Supabase client not found. Hãy kiểm tra <script src='...supabase-js...'> trong index.html");
    return;
  }

  // ====== DOM ======
  const elService = document.getElementById("service");
  const elDate = document.getElementById("date");
  const elTimeGrid = document.getElementById("timeGrid"); // nơi render các nút giờ
  const elFullName = document.getElementById("fullName");
  const elPhone = document.getElementById("phone");
  const elQty = document.getElementById("qty");
  const elNote = document.getElementById("note");
  const elForm = document.getElementById("bookingForm");
  const elSubmit = document.getElementById("btnSubmit");
  const elStatus = document.getElementById("status"); // nếu không có thì vẫn chạy

  if (!elService || !elDate || !elTimeGrid || !elFullName || !elPhone || !elQty || !elNote || !elForm || !elSubmit) {
    console.error("Thiếu ID element trong index.html. Kiểm tra các id: service, date, timeGrid, fullName, phone, qty, note, bookingForm, btnSubmit");
    return;
  }

  // ====== STATE ======
  let services = [];
  let selectedTime = null; // "08:00" | "08:30" | ... | "__NO_TIME__"

  const TZ_OFFSET = "+07:00"; // VN
  const SLOT_STEP_MIN = 30;
  const OPEN_HOUR = 8;
  const CLOSE_HOUR = 21;

  // ====== UI HELPERS ======
  function setStatus(msg) {
    if (!elStatus) return;
    elStatus.textContent = msg || "";
  }

  function fmtMoney(vnd) {
    try {
      return new Intl.NumberFormat("vi-VN").format(vnd) + "đ";
    } catch {
      return vnd + "đ";
    }
  }

  function getSelectedService() {
    const id = Number(elService.value);
    return services.find(s => Number(s.id) === id) || null;
  }

  function createTimeSlots() {
    const slots = [];
    for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) {
      for (let m = 0; m < 60; m += SLOT_STEP_MIN) {
        if (h === CLOSE_HOUR && m > 0) break; // 21:00 là slot cuối
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        slots.push(`${hh}:${mm}`);
      }
    }
    return slots;
  }

  function randomInt(min, max) {
    // inclusive
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const r = arr[0] / 0xffffffff;
    return Math.floor(r * (max - min + 1)) + min;
  }

  // Tạo start_at cho "Không chọn giờ" để KHÔNG bị trùng (fix 409)
  function buildNoTimeStartAtISO(dateStr) {
    // dateStr dạng "YYYY-MM-DD" từ input type="date"
    // tạo 00:00:SS (SS random 1..59)
    const ss = randomInt(1, 59);
    return `${dateStr}T00:00:${String(ss).padStart(2, "0")}${TZ_OFFSET}`;
  }

  function buildStartAtISO(dateStr, timeStr) {
    // timeStr "HH:MM"
    return `${dateStr}T${timeStr}:00${TZ_OFFSET}`;
  }

  // ====== LOAD SERVICES ======
  async function loadServices() {
    setStatus("Đang tải dịch vụ...");

    const { data, error } = await db
      .from("services")
      .select("id, name, duration_minutes, price_vnd, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      console.error("Load services error:", error);
      setStatus("Lỗi tải dịch vụ: " + (error.message || ""));
      return;
    }

    services = data || [];
    renderServiceOptions();
    setStatus("");
  }

  function renderServiceOptions() {
    elService.innerHTML = "";

    // option placeholder
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "-- Chọn dịch vụ --";
    opt0.disabled = true;
    opt0.selected = true;
    elService.appendChild(opt0);

    for (const s of services) {
      const opt = document.createElement("option");
      opt.value = s.id;

      // ẨN duration & price nếu NULL
      const parts = [String(s.name || "").toUpperCase()];
      if (s.duration_minutes != null) parts.push(`${s.duration_minutes}p`);
      if (s.price_vnd != null) parts.push(fmtMoney(s.price_vnd));
      opt.textContent = parts.join(" • ");

      elService.appendChild(opt);
    }
  }

  // ====== LOAD BOOKINGS (để disable slot đã đặt) ======
  async function fetchBookedTimesForDate(dateStr) {
    // lấy bookings trong ngày đó (00:00 -> 23:59)
    const dayStart = `${dateStr}T00:00:00${TZ_OFFSET}`;
    const dayEnd = `${dateStr}T23:59:59${TZ_OFFSET}`;

    const { data, error } = await db
      .from("bookings")
      .select("start_at")
      .gte("start_at", dayStart)
      .lte("start_at", dayEnd);

    if (error) {
      console.error("Fetch bookings error:", error);
      throw error;
    }

    const booked = new Set();
    for (const r of data || []) {
      if (!r.start_at) continue;

      // nếu là booking "không chọn giờ" => start_at giờ 00:00 => bỏ qua, không block các slot 8-21
      const d = new Date(r.start_at);
      if (d.getHours() < OPEN_HOUR) continue;

      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      booked.add(`${hh}:${mm}`);
    }
    return booked;
  }

  // ====== RENDER TIME GRID ======
  async function renderTimes() {
    elTimeGrid.innerHTML = "";
    selectedTime = null;

    const service = getSelectedService();
    const dateStr = elDate.value;

    if (!service || !dateStr) {
      // Chưa đủ điều kiện
      return;
    }

    setStatus("Đang tải giờ trống...");

    let bookedSet = new Set();
    try {
      bookedSet = await fetchBookedTimesForDate(dateStr);
    } catch (e) {
      setStatus("Lỗi tải giờ trống: " + (e?.message || ""));
      return;
    } finally {
      setStatus("");
    }

    // Nút "Không chọn giờ" (luôn cho chọn)
    const btnNoTime = document.createElement("button");
    btnNoTime.type = "button";
    btnNoTime.className = "time-btn";
    btnNoTime.textContent = "Không chọn giờ";
    btnNoTime.dataset.time = "__NO_TIME__";
    btnNoTime.addEventListener("click", () => {
      selectedTime = "__NO_TIME__";
      highlightSelectedTime();
    });
    elTimeGrid.appendChild(btnNoTime);

    const slots = createTimeSlots();
    for (const t of slots) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "time-btn";
      btn.textContent = t;
      btn.dataset.time = t;

      if (bookedSet.has(t)) {
        btn.disabled = true;
        btn.classList.add("disabled");
      }

      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        selectedTime = t;
        highlightSelectedTime();
      });

      elTimeGrid.appendChild(btn);
    }
  }

  function highlightSelectedTime() {
    const buttons = elTimeGrid.querySelectorAll("button.time-btn");
    buttons.forEach(b => {
      const t = b.dataset.time;
      if (t === selectedTime) b.classList.add("selected");
      else b.classList.remove("selected");
    });
  }

  // ====== SUBMIT BOOKING ======
  async function onSubmit(e) {
    e.preventDefault();

    const service = getSelectedService();
    const dateStr = elDate.value;

    const fullName = (elFullName.value || "").trim();
    const phone = (elPhone.value || "").trim();
    const qty = Number(elQty.value || 1);
    const note = (elNote.value || "").trim();

    if (!service) return alert("Vui lòng chọn dịch vụ.");
    if (!dateStr) return alert("Vui lòng chọn ngày.");
    if (!fullName) return alert("Vui lòng nhập họ và tên.");
    if (!phone) return alert("Vui lòng nhập số điện thoại.");
    if (!Number.isFinite(qty) || qty < 1) return alert("Số lượng không hợp lệ.");

    // Thời gian: cho phép không chọn
    const isNoTime = (selectedTime === "__NO_TIME__" || !selectedTime);

    // start_at:
    // - có giờ => dùng giờ đó
    // - không chọn giờ => 00:00:SS random để tránh trùng -> fix 409
    const startAtIso = isNoTime
      ? buildNoTimeStartAtISO(dateStr)
      : buildStartAtISO(dateStr, selectedTime);

    // duration_minutes:
    // nếu service NULL mà DB bookings đang NOT NULL => gửi 0 để khỏi lỗi
    const durationMinutes = (service.duration_minutes != null) ? Number(service.duration_minutes) : 0;

    // note: gắn nhãn để admin biết là "không chọn giờ"
    const finalNote = isNoTime
      ? `[NO_TIME] ${note || ""}`.trim()
      : note;

    elSubmit.disabled = true;
    elSubmit.textContent = "Đang đặt...";

    try {
      // 1) insert bookings
      const { data: booking, error: bErr } = await db
        .from("bookings")
        .insert({
          service_id: Number(service.id),
          start_at: startAtIso,
          duration_minutes: durationMinutes,
          qty: qty,
          note: finalNote || null
        })
        .select("id")
        .single();

      if (bErr) {
        console.error("Insert bookings error:", bErr);
        alert("Lỗi đặt lịch: " + (bErr.message || JSON.stringify(bErr)));
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
        alert("Đặt lịch thành công nhưng lỗi lưu khách: " + (cErr.message || ""));
        return;
      }

      alert("✅ Đặt lịch thành công!");

      // reload grid giờ trống (để cập nhật)
      await renderTimes();

      // reset form (tuỳ bạn)
      elFullName.value = "";
      elPhone.value = "";
      elQty.value = "1";
      elNote.value = "";
      selectedTime = null;
      highlightSelectedTime();

    } finally {
      elSubmit.disabled = false;
      elSubmit.textContent = "Đặt lịch";
    }
  }

  // ====== EVENTS ======
  elService.addEventListener("change", renderTimes);
  elDate.addEventListener("change", renderTimes);
  elForm.addEventListener("submit", onSubmit);

  // ====== INIT ======
  (async function init() {
    await loadServices();
    // nếu user đã có sẵn date/service thì render
    await renderTimes();
  })();
})();
