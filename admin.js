const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const msgBox = $("msg");
const tbody = $("tbody");

function showMsg(type, text) {
  msgBox.innerHTML = `<div class="${type === "ok" ? "ok" : "err"}">${text}</div>`;
}
function clearMsg(){ msgBox.innerHTML = ""; }
function pad2(n){ return String(n).padStart(2,"0"); }

function isoDateVN(d=new Date()){
  const y=d.getFullYear(), m=pad2(d.getMonth()+1), day=pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

async function sendMagicLink(){
  clearMsg();
  const email = $("email").value.trim();
  if (!email) return showMsg("err","Nhập email admin.");

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      // redirect về trang admin sau khi bấm link trong email
      emailRedirectTo: window.location.href.split("#")[0]
    }
  });

  if (error) return showMsg("err", `Lỗi: ${error.message}`);
  showMsg("ok", "✅ Đã gửi link đăng nhập. Mở email và bấm link.");
}

async function logout(){
  await sb.auth.signOut();
  showMsg("ok","Đã đăng xuất.");
}

async function loadBookings(){
  clearMsg();
  tbody.innerHTML = "";

  const dateYMD = $("date").value;
  if (!dateYMD) return showMsg("err","Chọn ngày.");

  // Query: bookings join services + booking_customers (chỉ hoạt động khi authenticated vì RLS)
  const startISO = `${dateYMD}T00:00:00+07:00`;
  const endISO   = `${dateYMD}T23:59:59+07:00`;

  const { data, error } = await sb
    .from("bookings")
    .select(`
      start_at, qty, note, duration_minutes,
      services(name),
      booking_customers(full_name, phone)
    `)
    .gte("start_at", startISO)
    .lte("start_at", endISO)
    .order("start_at", { ascending: true });

  if (error) {
    return showMsg("err", `Không tải được lịch (có thể bạn chưa đăng nhập). Chi tiết: ${error.message}`);
  }

  if (!data?.length) {
    showMsg("ok", "Không có lịch trong ngày này.");
    return;
  }

  for (const row of data) {
    const d = new Date(row.start_at);
    const hm = d.toLocaleTimeString("vi-VN", { hour:"2-digit", minute:"2-digit", hour12:false });

    const svc = row.services?.name || "-";
    const cust = row.booking_customers?.full_name || "-";
    const phone = row.booking_customers?.phone || "-";
    const note = row.note || "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${hm}</td>
      <td>${svc}</td>
      <td>${row.qty}</td>
      <td>${cust}</td>
      <td>${phone}</td>
      <td>${note}</td>
    `;
    tbody.appendChild(tr);
  }
}

(async function init(){
  $("date").value = isoDateVN(new Date());

  $("login").addEventListener("click", sendMagicLink);
  $("logout").addEventListener("click", logout);
  $("refresh").addEventListener("click", loadBookings);

  // tự tải nếu đã login
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    showMsg("ok","✅ Đã đăng nhập. Bấm 'Tải lịch' để xem.");
  } else {
    showMsg("ok","Nhập email admin và bấm 'Gửi link đăng nhập'.");
  }
})();
