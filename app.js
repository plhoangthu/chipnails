/* app.js - stable version:
  IDs required in index.html:
  #service, #date, #slots, #fullName, #phone, #qty, #note, #submit, #msg
*/

(() => {
  // ====== CONFIG ======
  const SUPABASE_URL =
    window.SUPABASE_URL || "https://zaqruavtxyjxwpfdoolo.supabase.co";
  const SUPABASE_ANON_KEY =
    window.SUPABASE_ANON_KEY || "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

  // Business hours
  const OPEN_HOUR = 8;
  const CLOSE_HOUR = 21;
  const STEP_MINUTES = 30;

  // ====== Helpers ======
  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(n).padStart(2, "0");

  function setMsg(text = "", type = "info") {
    const el = $("msg");
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
    el.style.border = "1px solid";
    el.style.borderColor =
      type === "error" ? "#f5c2c7" : type === "ok" ? "#bcd0ff" : "#e5e7eb";
    el.style.background =
      type === "error" ? "#fff5f5" : type === "ok" ? "#eef4ff" : "#f8fafc";
    el.style.padding = text ? "10px 12px" : "0";
    el.style.borderRadius = "10px";
    el.style.whiteSpace = "pre-line";
  }

  function assertDom() {
    const required = [
      "service",
      "date",
      "slots",
      "fullName",
      "phone",
      "qty",
      "note",
      "submit",
      "msg",
    ];
    const missing = required.filter((id) => !$(id));
    if (missing.length) {
      console.error("Thiếu ID element trong index.html:", missing.join(", "));
      setMsg(
        "Lỗi: Thiếu ID trong index.html: " + missing.join(", "),
        "error"
      );
      return false;
    }
    return true;
  }

  function formatServiceLabel(svc) {
    // Ẩn duration/price nếu NULL
    const parts = [svc.name];
    if (svc.duration_minutes !== null && svc.duration_minutes !== undefined) {
      parts.push(`${svc.duration_minutes}p`);
    }
    if (svc.price_vnd !== null && svc.price_vnd !== undefined) {
      parts.push(`${Number(svc.price_vnd).toLocaleString("vi-VN")}đ`);
    }
    return parts.join(" • ");
  }

  function parseYMD(ymd) {
    const [y, m, d] = (ymd || "").split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    return { y, m, d };
  }

  function localDateToISO(ymd, hhmm) {
    // local time -> ISO string
    const p = parseYMD(ymd);
    if (!p) return null;
    const [hh, mm] = (hhmm || "00:00").split(":").map((x) => parseInt(x, 10));
    const dt = new Date(p.y, p.m - 1, p.d, hh || 0, mm || 0, 0, 0);
    return dt.toISOString();
  }

  function buildSlots() {
    const slots = [];
    for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) {
      for (let m = 0; m < 60; m += STEP_MINUTES) {
        if (h === CLOSE_HOUR && m > 0) continue; // stop exactly at 21:00
        slots.push(`${pad2(h)}:${pad2(m)}`);
      }
    }
    return slots;
  }

  function injectSlotGridStyle() {
    if (document.getElementById("slot-style")) return;
    const style = document.createElement("style");
    style.id = "slot-style";
    style.textContent = `
      #slots{
        display:grid;
        grid-template-columns: repeat(4, minmax(0,1fr));
        gap:10px;
        margin-top:10px;
      }
      #slots .slot{
        padding:10px 12px;
        border:1px solid #d1d5db;
        background:#fff;
        border-radius:12px;
        cursor:pointer;
        width:100%;
        font-size:14px;
      }
      #slots .slot.active{
        border-color:#111827;
        box-shadow:0 0 0 2px rgba(17,24,39,.12) inset;
        font-weight:600;
      }
      #slots .slot[disabled]{
        opacity:.45;
        cursor:not-allowed;
      }
      /* Nếu màn nhỏ thì xuống 3 cột */
      @media (max-width: 900px){
        #slots{ grid-template-columns: repeat(3, minmax(0,1fr)); }
      }
      /* Màn rất nhỏ thì 2 cột */
      @media (max-width: 520px){
        #slots{ grid-template-columns: repeat(2, minmax(0,1fr)); }
      }
      /* Nút "Không chọn giờ" chiếm full hàng */
      #slots .slot.no-time{
        grid-column: 1 / -1;
      }
    `;
    document.head.appendChild(style);
  }

  function renderSlotButtons({
    container,
    allSlots,
    bookedSet,
    selectedTime,
    onPick,
  }) {
    container.innerHTML = "";

    // "Không chọn giờ"
    const btnNo = document.createElement("button");
    btnNo.type = "button";
    btnNo.className = "slot no-time";
    btnNo.textContent = "Không chọn giờ";
    if (selectedTime === null) btnNo.classList.add("active");
    btnNo.addEventListener("click", () => onPick(null));
    container.appendChild(btnNo);

    allSlots.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = t;

      const isBooked = bookedSet.has(t);
      if (isBooked) {
        btn.disabled = true;
        btn.title = "Đã có người đặt";
      }
      if (selectedTime === t) btn.classList.add("active");

      btn.addEventListener("click", () => {
        if (!btn.disabled) onPick(t);
      });

      container.appendChild(btn);
    });
  }

  // ====== Main ======
  document.addEventListener("DOMContentLoaded", async () => {
    if (!assertDom()) return;

    if (!window.supabase || !window.supabase.createClient) {
      setMsg(
        "Lỗi: chưa load thư viện Supabase. Kiểm tra CDN @supabase/supabase-js.",
        "error"
      );
      return;
    }
    if (!SUPABASE_URL.startsWith("http")) {
      setMsg("Lỗi: SUPABASE_URL không hợp lệ (phải bắt đầu bằng http/https).", "error");
      return;
    }
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.length < 20) {
      setMsg("Lỗi: SUPABASE_ANON_KEY chưa đúng.", "error");
      return;
    }

    injectSlotGridStyle();

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const elService = $("service");
    const elDate = $("date");
    const elSlots = $("slots");
    const elFullName = $("fullName");
    const elPhone = $("phone");
    const elQty = $("qty");
    const elNote = $("note");
    const btnSubmit = $("submit");

    let services = [];
    let selectedTime = null; // null = "Không chọn giờ"
    const allSlots = buildSlots();

    async function loadServices() {
      setMsg("Đang tải dịch vụ...", "info");
      const { data, error } = await supabase
        .from("services")
        .select("id,name,duration_minutes,price_vnd,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        console.error("load services error:", error);
        setMsg("Lỗi tải dịch vụ: " + (error.message || "unknown"), "error");
        return false;
      }

      services = Array.isArray(data) ? data : [];
      elService.innerHTML = "";

      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "— Chọn dịch vụ —";
      elService.appendChild(opt0);

      services.forEach((svc) => {
        const opt = document.createElement("option");
        opt.value = String(svc.id);
        opt.textContent = formatServiceLabel(svc);
        elService.appendChild(opt);
      });

      setMsg("", "info");
      return true;
    }

    function getSelectedService() {
      const id = elService.value ? Number(elService.value) : null;
      if (!id) return null;
      return services.find((s) => Number(s.id) === id) || null;
    }

    async function loadBookedTimesForDate(ymd) {
      // booked times only where time_selected = true
      const booked = new Set();
      const p = parseYMD(ymd);
      if (!p) return booked;

      const startISO = new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0).toISOString();
      const endISO = new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999).toISOString();

      const { data, error } = await supabase
        .from("bookings")
        .select("start_at,time_selected")
        .eq("time_selected", true)
        .gte("start_at", startISO)
        .lte("start_at", endISO);

      if (error) {
        console.error("load bookings error:", error);
        // nếu bị policy select thì vẫn render tất cả slot (không disable)
        setMsg("Không tải được lịch bận (có thể do policy SELECT). Vẫn có thể đặt lịch.", "error");
        return booked;
      }

      (data || []).forEach((row) => {
        if (!row.start_at) return;
        const dt = new Date(row.start_at);
        booked.add(`${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`);
      });

      return booked;
    }

    async function refreshSlots() {
      const ymd = elDate.value;
      const booked = ymd ? await loadBookedTimesForDate(ymd) : new Set();

      renderSlotButtons({
        container: elSlots,
        allSlots,
        bookedSet: booked,
        selectedTime,
        onPick: (t) => {
          selectedTime = t; // null or HH:mm
          refreshSlots(); // rerender active state
        },
      });
    }

    elService.addEventListener("change", async () => {
      selectedTime = null;
      await refreshSlots();
    });

    elDate.addEventListener("change", async () => {
      selectedTime = null;
      await refreshSlots();
    });

    btnSubmit.addEventListener("click", async () => {
      try {
        setMsg("", "info");

        const selectedService = getSelectedService();
        const ymd = elDate.value;
        const fullName = (elFullName.value || "").trim();
        const phone = (elPhone.value || "").trim();
        const qty = Number(elQty.value || 1);
        const note = (elNote.value || "").trim();

        if (!selectedService) return setMsg("Bạn chưa chọn dịch vụ.", "error");
        if (!ymd) return setMsg("Bạn chưa chọn ngày.", "error");
        if (!fullName) return setMsg("Vui lòng nhập họ và tên.", "error");
        if (!phone) return setMsg("Vui lòng nhập số điện thoại.", "error");
        if (!Number.isFinite(qty) || qty <= 0) return setMsg("Số lượng không hợp lệ.", "error");

        const isNoTime = (selectedTime === null);
        const startISO = localDateToISO(ymd, isNoTime ? "00:00" : selectedTime);
        if (!startISO) return setMsg("Ngày/giờ không hợp lệ.", "error");

        // duration_minutes: nếu service null => lưu null (DB bạn đã cho null)
        const durationToSave =
          selectedService.duration_minutes === null || selectedService.duration_minutes === undefined
            ? null
            : Number(selectedService.duration_minutes);

        const noteToSave = (isNoTime ? "[CHUA CHON GIO] " : "") + (note || "");

        // Insert bookings (quan trọng: time_selected)
        const { data: bookingRows, error: bookingErr } = await supabase
          .from("bookings")
          .insert([
            {
              service_id: Number(selectedService.id),
              start_at: startISO,
              duration_minutes: durationToSave,
              qty,
              note: noteToSave || null,
              time_selected: !isNoTime, // ✅ fix chính ở đây
            },
          ])
          .select("id")
          .limit(1);

        if (bookingErr) {
          console.error("Insert bookings error:", bookingErr);
          // nếu trùng giờ (409/23505) thì báo rõ
          const msg =
            bookingErr.code === "23505"
              ? "Giờ này đã có người đặt. Vui lòng chọn giờ khác."
              : (bookingErr.message || "unknown");
          return setMsg("Lỗi đặt lịch (bookings): " + msg, "error");
        }

        const bookingId = bookingRows?.[0]?.id;
        if (!bookingId) return setMsg("Đặt lịch không thành công (không lấy được bookingId).", "error");

        // Insert booking_customers
        const { error: custErr } = await supabase
          .from("booking_customers")
          .insert([{ booking_id: bookingId, full_name: fullName, phone }]);

        if (custErr) {
          console.error("Insert booking_customers error:", custErr);
          return setMsg("Đặt lịch đã tạo nhưng lưu khách bị lỗi: " + (custErr.message || "unknown"), "error");
        }

        setMsg("✅ Đặt lịch thành công! Cảm ơn bạn.", "ok");

        // Reset form
        elFullName.value = "";
        elPhone.value = "";
        elQty.value = "1";
        elNote.value = "";
        selectedTime = null;

        await refreshSlots();
      } catch (e) {
        console.error(e);
        setMsg("Có lỗi không xác định: " + (e?.message || e), "error");
      }
    });

    // Init
    const ok = await loadServices();
    if (!ok) return;

    // default date = today
    if (!elDate.value) {
      const now = new Date();
      elDate.value = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    }

    await refreshSlots();
  });
})();
