/* app.js - version for your index.html IDs:
  #service, #date, #slots, #fullName, #phone, #qty, #note, #submit, #msg
*/

(() => {
  // ====== CONFIG (điền đúng của bạn) ======
  // Nếu bạn đã set SUPABASE_URL / SUPABASE_ANON_KEY ở nơi khác thì có thể để như dưới (ưu tiên window.*)
  const SUPABASE_URL =
    window.SUPABASE_URL ||
    "https://zaqruavtxyjxwpfdoolo.supabase.co"; // ví dụ: https://xxxxx.supabase.co
  const SUPABASE_ANON_KEY =
    window.SUPABASE_ANON_KEY ||
    "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

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
    el.style.borderColor =
      type === "error" ? "#f5c2c7" : type === "ok" ? "#bcd0ff" : "#e5e7eb";
    el.style.background =
      type === "error" ? "#fff5f5" : type === "ok" ? "#eef4ff" : "#f8fafc";
  }

  function assertDom() {
    const required = ["service", "date", "slots", "fullName", "phone", "qty", "note", "submit"];
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
    // ymd = 'YYYY-MM-DD'
    const [y, m, d] = (ymd || "").split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    return { y, m, d };
  }

  function localDateToISO(ymd, hhmm) {
    // Create local Date then convert to ISO (timestamptz)
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

  function renderSlotButtons({
    container,
    allSlots,
    bookedSet,
    selectedTime,
    onPick,
    allowNoTime = true,
  }) {
    container.innerHTML = "";

    // "Không chọn giờ"
    if (allowNoTime) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = "Không chọn giờ";
      if (selectedTime === null) btn.classList.add("active");
      btn.addEventListener("click", () => onPick(null));
      container.appendChild(btn);
    }

    allSlots.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = t;

      const isBooked = bookedSet.has(t);
      if (isBooked) {
        btn.disabled = true;
        btn.title = "Đã có người đặt";
        btn.style.opacity = "0.5";
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

    // Basic check supabase client
    if (!window.supabase || !window.supabase.createClient) {
      setMsg("Lỗi: chưa load được thư viện Supabase. Kiểm tra CDN @supabase/supabase-js.", "error");
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

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const elService = $("service");
    const elDate = $("date");
    const elSlots = $("slots");
    const elFullName = $("fullName");
    const elPhone = $("phone");
    const elQty = $("qty");
    const elNote = $("note");
    const btnSubmit = $("submit");

    // State
    let services = [];
    let selectedService = null;
    let selectedTime = null; // null = "Không chọn giờ"
    const allSlots = buildSlots();

    // Ensure HTML has some basic slot button styles even if CSS not present
    // (won't break if you already have)
    if (!document.getElementById("slot-style")) {
      const style = document.createElement("style");
      style.id = "slot-style";
      style.textContent = `
        #slots { display:flex; flex-wrap:wrap; gap:10px; }
        #slots .slot { padding:10px 14px; border:1px solid #d1d5db; background:#fff; border-radius:10px; cursor:pointer; min-width:92px; }
        #slots .slot.active { border-color:#111827; box-shadow:0 0 0 2px rgba(17,24,39,.12) inset; }
      `;
      document.head.appendChild(style);
    }

    async function loadServices() {
      setMsg("Đang tải dịch vụ...", "info");

      // Load active services
      const { data, error } = await supabase
        .from("services")
        .select("id,name,duration_minutes,price_vnd,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        console.error("load services error:", error);
        setMsg("Lỗi tải dịch vụ: " + (error.message || "unknown"), "error");
        return;
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
    }

    function getSelectedService() {
      const id = elService.value ? Number(elService.value) : null;
      if (!id) return null;
      return services.find((s) => Number(s.id) === id) || null;
    }

    async function loadBookedTimesForDate(ymd) {
      // Return Set('08:00', ...)
      const booked = new Set();
      const p = parseYMD(ymd);
      if (!p) return booked;

      // Query range [00:00, 23:59] local -> use ISO range
      const startISO = new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0).toISOString();
      const endISO = new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999).toISOString();

      const { data, error } = await supabase
        .from("bookings")
        .select("start_at")
        .gte("start_at", startISO)
        .lte("start_at", endISO);

      if (error) {
        console.error("load bookings error:", error);
        // Nếu bị RLS SELECT thì vẫn cho người dùng đặt, chỉ không lọc giờ bận
        setMsg("Không tải được lịch bận (có thể do policy). Vẫn có thể đặt lịch.", "error");
        return booked;
      }

      (data || []).forEach((row) => {
        if (!row.start_at) return;
        const dt = new Date(row.start_at);
        const hh = pad2(dt.getHours());
        const mm = pad2(dt.getMinutes());
        const t = `${hh}:${mm}`;

        // Nếu booking là "không chọn giờ" lưu 00:00 thì đừng block slot nào
        if (t !== "00:00") booked.add(t);
      });

      return booked;
    }

    async function refreshSlots() {
      selectedService = getSelectedService();
      const ymd = elDate.value;

      // Nếu chưa chọn ngày thì vẫn render slot nhưng không lọc booked
      const booked = ymd ? await loadBookedTimesForDate(ymd) : new Set();

      // Rule: luôn cho phép "Không chọn giờ"
      renderSlotButtons({
        container: elSlots,
        allSlots,
        bookedSet: booked,
        selectedTime,
        onPick: (t) => {
          selectedTime = t; // null or HH:mm
          refreshSlots(); // rerender active states
        },
        allowNoTime: true,
      });
    }

    // Events
    elService.addEventListener("change", async () => {
      selectedService = getSelectedService();
      selectedTime = null; // reset về "Không chọn giờ"
      await refreshSlots();
    });

    elDate.addEventListener("change", async () => {
      selectedTime = null; // reset
      await refreshSlots();
    });

    btnSubmit.addEventListener("click", async () => {
      try {
        setMsg("", "info");

        selectedService = getSelectedService();
        const ymd = elDate.value;
        const fullName = (elFullName.value || "").trim();
        const phone = (elPhone.value || "").trim();
        const qty = Number(elQty.value || 1);
        const note = (elNote.value || "").trim();

        if (!selectedService) {
          setMsg("Bạn chưa chọn dịch vụ.", "error");
          return;
        }
        if (!ymd) {
          setMsg("Bạn chưa chọn ngày.", "error");
          return;
        }
        if (!fullName) {
          setMsg("Vui lòng nhập họ và tên.", "error");
          return;
        }
        if (!phone) {
          setMsg("Vui lòng nhập số điện thoại.", "error");
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          setMsg("Số lượng không hợp lệ.", "error");
          return;
        }

        // Create booking start_at
        const startISO = localDateToISO(ymd, selectedTime || "00:00");
        if (!startISO) {
          setMsg("Ngày/giờ không hợp lệ.", "error");
          return;
        }

        // duration in DB: nếu bạn đã ALTER TABLE cho phép NULL thì có thể gửi null
        // Nhưng để tránh lỗi NOT NULL còn sót, mình gửi 0 khi duration_minutes là null.
        const durationToSave =
          selectedService.duration_minutes === null || selectedService.duration_minutes === undefined
            ? 0
            : Number(selectedService.duration_minutes);

        const noteToSave =
          (selectedTime === null ? "[KHONG_CHON_GIO] " : "") + (note || "");

        // Insert into bookings
        const { data: bookingRows, error: bookingErr } = await supabase
          .from("bookings")
          .insert([
            {
              service_id: Number(selectedService.id),
              start_at: startISO,
              duration_minutes: durationToSave,
              qty: qty,
              note: noteToSave || null,
            },
          ])
          .select("id")
          .limit(1);

        if (bookingErr) {
          console.error("Insert bookings error:", bookingErr);
          setMsg(
            "Lỗi đặt lịch (bookings): " + (bookingErr.message || "unknown") +
              "\nNếu bạn thấy 401/403/RLS thì cần tạo policy INSERT cho public.",
            "error"
          );
          return;
        }

        const bookingId = bookingRows && bookingRows[0] ? bookingRows[0].id : null;
        if (!bookingId) {
          setMsg("Đặt lịch không thành công (không lấy được bookingId).", "error");
          return;
        }

        // Insert into booking_customers
        const { error: custErr } = await supabase
          .from("booking_customers")
          .insert([
            {
              booking_id: bookingId,
              full_name: fullName,
              phone: phone,
            },
          ]);

        if (custErr) {
          console.error("Insert booking_customers error:", custErr);
          setMsg(
            "Đặt lịch đã tạo nhưng lưu khách bị lỗi: " + (custErr.message || "unknown"),
            "error"
          );
          return;
        }

        setMsg("✅ Đặt lịch thành công! Cảm ơn bạn.", "ok");

        // Reset
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
    await loadServices();

    // default date = today if empty
    if (!elDate.value) {
      const now = new Date();
      const y = now.getFullYear();
      const m = pad2(now.getMonth() + 1);
      const d = pad2(now.getDate());
      elDate.value = `${y}-${m}-${d}`;
    }
    await refreshSlots();
  });
})();
