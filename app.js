/* app.js — Multi-service + Slots grid + Toast popup + No-time option */

(() => {
  // ====== CONFIG (điền đúng) ======
  const SUPABASE_URL =
    window.SUPABASE_URL || "https://zaqruavtxyjxwpfdoolo.supabase.co";
  const SUPABASE_ANON_KEY =
    window.SUPABASE_ANON_KEY || "sb_publishable_sn53kFJuZmB2dHsBaM7DnQ_H5cQe5Pc";

  // Business hours
  const OPEN_HOUR = 8;
  const CLOSE_HOUR = 22;
  const STEP_MINUTES = 60;

  // ====== Helpers ======
  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(n).padStart(2, "0");

  function assertDom() {
    const required = ["service", "date", "slots", "fullName", "phone", "qty", "note", "submit"];
    const missing = required.filter((id) => !$(id));
    if (missing.length) {
      console.error("Thiếu ID element trong index.html:", missing.join(", "));
      toast("err", "Thiếu element", "Bạn đang thiếu ID trong index.html:\n" + missing.join(", "));
      return false;
    }
    return true;
  }

  // ====== Toast popup ======
  function toast(type, title, message) {
    const overlay = $("toastOverlay");
    const box = $("toastBox");
    const t = $("toastTitle");
    const m = $("toastMsg");
    const close = $("toastClose");
    if (!overlay || !box || !t || !m || !close) {
      // fallback (nếu thiếu toast UI)
      alert((title ? title + "\n\n" : "") + (message || ""));
      return;
    }
    box.classList.remove("ok", "err");
    box.classList.add(type === "ok" ? "ok" : "err");
    t.textContent = title || (type === "ok" ? "Thành công" : "Có lỗi");
    m.textContent = message || "";
    overlay.style.display = "flex";
    close.onclick = () => (overlay.style.display = "none");
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
  }

  // ====== Mini fireworks ======
  function fireworks() {
    const root = document.createElement("div");
    root.className = "fw";
    const icons = ["🎆", "✨", "🧨", "🎇"];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const sp = document.createElement("span");
      sp.textContent = icons[Math.floor(Math.random() * icons.length)];
      const dx = (Math.random() * 360 - 180).toFixed(0) + "px";
      const dy = (Math.random() * 280 - 220).toFixed(0) + "px";
      sp.style.setProperty("--dx", dx);
      sp.style.setProperty("--dy", dy);
      sp.style.opacity = "1";
      root.appendChild(sp);
    }
    document.body.appendChild(root);
    setTimeout(() => root.remove(), 1000);
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

  function renderSlotButtons({ container, allSlots, bookedSet, selectedTime, onPick }) {
    container.innerHTML = "";

    // Nút "Không chọn giờ" — luôn hiển thị, chiếm nguyên hàng
    const btnNo = document.createElement("div");
    btnNo.className = "slot wide" + (selectedTime === null ? " selected" : "");
    btnNo.textContent = "Không chọn giờ";
    btnNo.addEventListener("click", () => onPick(null));
    container.appendChild(btnNo);

    allSlots.forEach((t) => {
      const div = document.createElement("div");
      div.className = "slot" + (selectedTime === t ? " selected" : "");
      div.textContent = t;

      const isBooked = bookedSet.has(t);
      if (isBooked) {
        div.setAttribute("aria-disabled", "true");
      }
      div.addEventListener("click", () => {
        if (isBooked) return;
        onPick(t);
      });
      container.appendChild(div);
    });
  }

  // ====== MAIN ======
  document.addEventListener("DOMContentLoaded", async () => {
    if (!assertDom()) return;

    if (!window.supabase?.createClient) {
      toast("err", "Thiếu thư viện Supabase", "Bạn chưa load được @supabase/supabase-js. Kiểm tra script CDN trong index.html.");
      return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const elService = $("service"); // multiple select
    const elDate = $("date");
    const elServiceList = $("serviceList");
    const elServiceChips = $("serviceChips");
    const elServiceCount = $("serviceCount");
    const elSlots = $("slots");
    const elFullName = $("fullName");
    const elPhone = $("phone");
    const elQty = $("qty");
    const elNote = $("note");
    const btnSubmit = $("submit");

    let services = [];
    let selectedTime = null; // null = "Không chọn giờ"
    let selectedServiceIds = new Set();

function syncHiddenSelect() {
  // cập nhật select ẩn để giữ logic cũ nếu cần
  Array.from(elService.options).forEach(opt => {
    opt.selected = selectedServiceIds.has(Number(opt.value));
  });
}

function renderServiceChips() {
  if (!elServiceChips) return;
  elServiceChips.innerHTML = "";

  const selected = services.filter(s => selectedServiceIds.has(Number(s.id)));
  selected.forEach(svc => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `
      ${svc.name}
      <button type="button" aria-label="Bỏ chọn">×</button>
    `;
    chip.querySelector("button").addEventListener("click", (e) => {
      e.stopPropagation();
      selectedServiceIds.delete(Number(svc.id));
      syncHiddenSelect();
      renderServicesList();
      renderServiceChips();
      refreshSlots();
    });
    elServiceChips.appendChild(chip);
  });

  if (elServiceCount) elServiceCount.textContent = `${selected.length} đã chọn`;
}

function renderServicesList() {
  if (!elServiceList) return;
  elServiceList.innerHTML = "";

  services.forEach((svc) => {
    const div = document.createElement("div");
    const isSel = selectedServiceIds.has(Number(svc.id));
    div.className = "service-item" + (isSel ? " selected" : "");

    // meta: ẩn duration/price nếu null
    const metaParts = [];
    if (svc.duration_minutes !== null && svc.duration_minutes !== undefined) metaParts.push(`${svc.duration_minutes}p`);
    if (svc.price_vnd !== null && svc.price_vnd !== undefined) metaParts.push(`${Number(svc.price_vnd).toLocaleString("vi-VN")}đ`);
    const meta = metaParts.join(" • ");

    div.innerHTML = `
      <div class="service-left">
        <div class="service-name">${svc.name}</div>
        <div class="service-meta">${meta || " "}</div>
      </div>
      <div class="service-tick">✓</div>
    `;

    div.addEventListener("click", () => {
      const id = Number(svc.id);
      if (selectedServiceIds.has(id)) selectedServiceIds.delete(id);
      else selectedServiceIds.add(id);

      syncHiddenSelect();
      renderServicesList();
      renderServiceChips();
      refreshSlots();
    });

    elServiceList.appendChild(div);
  });

  if (elServiceCount) {
    elServiceCount.textContent = `${selectedServiceIds.size} đã chọn`;
  }
}

    const allSlots = buildSlots();

    function getSelectedServiceIds() {
  return Array.from(selectedServiceIds);
}


    function getSelectedServices() {
      const ids = new Set(getSelectedServiceIds());
      return services.filter((s) => ids.has(Number(s.id)));
    }

    async function loadServices() {
      const { data, error } = await supabase
        .from("services")
        .select("id,name,duration_minutes,price_vnd,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        console.error("load services error:", error);
        toast("err", "Lỗi tải dịch vụ", error.message || "Không tải được danh sách dịch vụ.");
        return;
      }

      services = Array.isArray(data) ? data : [];
      elService.innerHTML = "";
      services.forEach((svc) => {
        const opt = document.createElement("option");
        opt.value = String(svc.id);
        opt.textContent = formatServiceLabel(svc);
        elService.appendChild(opt);
      });
      // Render checklist UI
renderServicesList();
renderServiceChips();

    }

    async function loadBookedTimesForDate(ymd) {
      const booked = new Set();
      const p = parseYMD(ymd);
      if (!p) return booked;

      // local day range -> ISO
      const startISO = new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0).toISOString();
      const endISO = new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999).toISOString();

      const { data, error } = await supabase
        .from("bookings")
        .select("start_at, time_selected")
        .gte("start_at", startISO)
        .lte("start_at", endISO);

      if (error) {
        console.warn("Không tải được lịch bận (SELECT bị RLS?)", error);
        // Không chặn UI — vẫn cho đặt, chỉ không disable slot
        return booked;
      }

      (data || []).forEach((row) => {
        if (!row?.start_at) return;
        // Nếu bản ghi là "không chọn giờ" (time_selected=false) thì không block slot
        if (row.time_selected === false) return;

        const dt = new Date(row.start_at);
        const t = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
        if (t !== "00:00") booked.add(t);
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
          selectedTime = t;
          refreshSlots();
        },
      });
    }

    // ===== Events =====
    elService.addEventListener("change", async () => {
      // khi đổi dịch vụ, không cần reset giờ, nhưng bạn có thể reset nếu muốn:
      // selectedTime = null;
      await refreshSlots();
    });

    elDate.addEventListener("change", async () => {
      selectedTime = null;
      await refreshSlots();
    });

    btnSubmit.addEventListener("click", async () => {
      try {
        const ymd = elDate.value;
        const fullName = (elFullName.value || "").trim();
        const phone = (elPhone.value || "").trim();
        const qty = Number(elQty.value || 1);
        const userNote = (elNote.value || "").trim();

        const selectedSvcs = getSelectedServices();
        if (!selectedSvcs.length) {
          toast("err", "Thiếu dịch vụ", "Bạn chưa chọn dịch vụ nào.");
          return;
        }
        if (!ymd) {
          toast("err", "Thiếu ngày", "Bạn chưa chọn ngày.");
          return;
        }
        if (!fullName) {
          toast("err", "Thiếu họ tên", "Vui lòng nhập họ và tên.");
          return;
        }
        if (!phone) {
          toast("err", "Thiếu số điện thoại", "Vui lòng nhập số điện thoại.");
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          toast("err", "Số lượng không hợp lệ", "Vui lòng nhập số lượng >= 1.");
          return;
        }

        // start_at + time_selected
        const timeSelected = selectedTime !== null;
        const startISO = localDateToISO(ymd, timeSelected ? selectedTime : "00:00");
        if (!startISO) {
          toast("err", "Ngày/giờ không hợp lệ", "Vui lòng chọn lại ngày/giờ.");
          return;
        }

        // service_id: lấy dịch vụ đầu tiên làm chính
        const mainService = selectedSvcs[0];

        // duration_minutes: tổng (bỏ qua null); nếu tất cả null -> null
        const durations = selectedSvcs.map(s => s.duration_minutes).filter(v => v !== null && v !== undefined);
        const durationToSave = durations.length ? durations.reduce((a,b)=>a+Number(b||0),0) : null;

        // Note: ghi danh sách dịch vụ + ghi chú + đánh dấu không chọn giờ
        const svcNames = selectedSvcs.map(s => s.name).join(", ");
        const noteParts = [];
        noteParts.push(`DỊCH VỤ: ${svcNames}`);
        if (!timeSelected) noteParts.push("[KHÔNG CHỌN GIỜ]");
        if (userNote) noteParts.push(userNote);
        const noteToSave = noteParts.join(" | ");

        // Insert bookings
        const { data: bookingRows, error: bookingErr } = await supabase
          .from("bookings")
          .insert([{
            service_id: Number(mainService.id),
            start_at: startISO,
            duration_minutes: durationToSave,   // null OK nếu cột cho phép
            qty,
            note: noteToSave || null,
            time_selected: timeSelected,        // ✅ cột mới của bạn
          }])
          .select("id")
          .limit(1);

        if (bookingErr) {
          console.error("Insert bookings error:", bookingErr);

          // 23505 = unique violation
          if (bookingErr.code === "23505") {
            toast("err", "Giờ này đã có người đặt", "Vui lòng chọn giờ khác.");
          } else if (bookingErr.code === "42501" || bookingErr.status === 401 || bookingErr.status === 403) {
            toast("err", "Bị chặn quyền (RLS)", "Bạn cần tạo policy INSERT cho public/authenticated ở bảng bookings + booking_customers.");
          } else {
            toast("err", "Lỗi đặt lịch", bookingErr.message || "Không đặt được lịch.");
          }
          return;
        }

        const bookingId = bookingRows?.[0]?.id;
        if (!bookingId) {
          toast("err", "Không tạo được bookingId", "Đặt lịch không thành công.");
          return;
        }

        // Insert booking_customers
        const { error: custErr } = await supabase
          .from("booking_customers")
          .insert([{ booking_id: bookingId, full_name: fullName, phone }]);

        if (custErr) {
          console.error("Insert booking_customers error:", custErr);
          toast("err", "Lỗi lưu thông tin khách", custErr.message || "Không lưu được thông tin khách.");
          return;
        }

        fireworks();
        toast("ok", "Đặt lịch thành công 🎉", "Cảm ơn bạn! Hẹn gặp bạn tại CHIP NAILS.");

        // Reset input (giữ dịch vụ nếu bạn muốn: comment dòng reset services)
        // elService.selectedIndex = -1; // (không nên dùng với multiple)
        Array.from(elService.options).forEach(o => o.selected = false);
        selectedTime = null;

        elFullName.value = "";
        elPhone.value = "";
        elQty.value = "1";
        elNote.value = "";

        await refreshSlots();
      } catch (e) {
        console.error(e);
        toast("err", "Lỗi không xác định", e?.message || String(e));
      }
    });

    // ===== Init =====
    await loadServices();

    // default date today
    if (!elDate.value) {
      const now = new Date();
      elDate.value = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
    }
    await refreshSlots();
  });
})();
