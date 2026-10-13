(function () {
  const $ = id => document.getElementById(id);
  const demoPlayers = ["Alex","Bea","Carlo","Dana","Eli","Faith","Gab","Hazel","Ivan","Jade","Ken","Lara","Marco","Nica","Owen","Pat","Queenie","Ralph","Sam","Tina","Uri","Vince","Wendy","Xian","Yana","Zed","Anne","Bryan","Cathy","Diego","Ella","Francis","Gina","Henry","Iris","Josh","Kara","Luis","Mia","Noel"].map((name, index) => ({ id: index + 1, player_name: name, games_played: 0, last_round_played: 0 }));
  const state = { settings: null, days: [], bookings: [], event: null, players: demoPlayers, round: 0, assignments: [], waiting: [] };
  const timeLabel = value => new Date(`2000-01-01T${value}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  async function verifyOwner() {
    if (!window.COURT822_CONFIGURED) return false;
    const { data: { session } } = await courtDb.auth.getSession();
    if (!session) return false;
    const { data } = await courtDb.from("profiles").select("role").eq("id", session.user.id).single();
    return data?.role === "owner";
  }

  async function openDashboard() {
    $("loginScreen").classList.add("hidden"); $("dashboard").classList.remove("hidden");
    if (!window.COURT822_CONFIGURED) { loadDemo(); return; }
    await Promise.all([loadSettings(), loadPayments(), loadRotation()]);
  }

  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!window.COURT822_CONFIGURED) { $("loginMessage").textContent = "Connect Supabase in js/config.js before using the real owner login."; return; }
    const { error } = await courtDb.auth.signInWithPassword({ email: $("ownerEmail").value.trim(), password: $("ownerPassword").value });
    if (error || !(await verifyOwner())) { await courtDb.auth.signOut(); $("loginMessage").textContent = error?.message || "This account is not an owner."; return; }
    openDashboard();
  });

  $("logoutButton").addEventListener("click", async () => { if (window.COURT822_CONFIGURED) await courtDb.auth.signOut(); location.reload(); });
  document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", async () => {
    document.querySelectorAll("[data-tab]").forEach(x => x.classList.remove("active")); button.classList.add("active");
    document.querySelectorAll(".owner-tab").forEach(x => x.classList.remove("active")); $(`${button.dataset.tab}Tab`).classList.add("active");
    if (button.dataset.tab === "payments") await loadPayments();
    if (button.dataset.tab === "rotation") await loadRotation();
  }));

  function loadDemo() {
    state.settings = { morning_rate: 400, afternoon_rate: 500, evening_rate: 650, open_play_fee: 250 };
    state.days = [{ date: "2026-10-14", mode: "regular" },{ date: "2026-10-15", mode: "open_play", open_start_time: "18:00", open_end_time: "22:00" },{ date: "2026-10-16", mode: "regular" },{ date: "2026-10-17", mode: "open_play", open_start_time: "17:00", open_end_time: "21:00" },{ date: "2026-10-18", mode: "regular" }];
    state.bookings = [{ id: 1, customer_name: "Juan Mendoza", booking_date: "2026-10-14", total_amount: 650, paid_amount: 650, remaining_balance: 0, payment_status: "paid", booking_status: "confirmed" },{ id: 2, customer_name: "Kathy Tan", booking_date: "2026-10-15", total_amount: 250, paid_amount: 0, remaining_balance: 250, payment_status: "unpaid", booking_status: "pending" },{ id: 3, customer_name: "Smash Bros Club", booking_date: "2026-10-16", total_amount: 650, paid_amount: 300, remaining_balance: 350, payment_status: "partial", booking_status: "confirmed" }];
    renderSettings(); renderPayments(); randomizeDemo();
  }

  async function loadSettings() {
    const [settingsResult, daysResult] = await Promise.all([courtDb.from("site_settings").select("*").eq("id", 1).single(), courtDb.from("court_days").select("*").order("date").limit(30)]);
    if (settingsResult.error || daysResult.error) return showToast("Could not load settings.");
    state.settings = settingsResult.data; state.days = daysResult.data; renderSettings();
  }

  function renderSettings() {
    $("morningRate").value = state.settings.morning_rate; $("afternoonRate").value = state.settings.afternoon_rate; $("eveningRate").value = state.settings.evening_rate; $("openRate").value = state.settings.open_play_fee;
    $("dateSettings").innerHTML = state.days.map((day, i) => `<div class="setting-row"><b>${day.date}</b><select data-mode="${i}"><option value="regular" ${day.mode === "regular" ? "selected" : ""}>Regular booking</option><option value="open_play" ${day.mode === "open_play" ? "selected" : ""}>Open Play only</option><option value="closed" ${day.mode === "closed" ? "selected" : ""}>Closed</option></select><input type="time" data-open-time="${i}" value="${day.open_start_time || "18:00"}"></div>`).join("");
  }

  $("saveSettings").addEventListener("click", async () => {
    state.settings = { ...state.settings, morning_rate: +$("morningRate").value, afternoon_rate: +$("afternoonRate").value, evening_rate: +$("eveningRate").value, open_play_fee: +$("openRate").value };
    state.days.forEach((day, i) => { day.mode = document.querySelector(`[data-mode="${i}"]`).value; day.open_start_time = document.querySelector(`[data-open-time="${i}"]`).value; });
    if (!window.COURT822_CONFIGURED) return showToast("Demo settings updated locally.");
    const settingsUpdate = await courtDb.from("site_settings").update({ morning_rate: state.settings.morning_rate, afternoon_rate: state.settings.afternoon_rate, evening_rate: state.settings.evening_rate, open_play_fee: state.settings.open_play_fee }).eq("id", 1);
    if (settingsUpdate.error) return showToast(settingsUpdate.error.message);
    for (const day of state.days) {
      const update = await courtDb.from("court_days").update({ mode: day.mode, open_start_time: day.open_start_time }).eq("date", day.date);
      if (update.error) return showToast(update.error.message);
      if (day.mode === "open_play") await courtDb.from("open_play_events").upsert({ event_date: day.date, start_time: day.open_start_time, end_time: day.open_end_time || "22:00", fee: state.settings.open_play_fee, max_players: 40 }, { onConflict: "event_date" });
    }
    showToast("Public schedule and rates updated.");
  });

  async function loadPayments() {
    if (window.COURT822_CONFIGURED) {
      const { data, error } = await courtDb.from("bookings").select("id,customer_name,booking_date,total_amount,paid_amount,remaining_balance,payment_status,booking_status,time_slots(start_time,end_time)").order("created_at", { ascending: false });
      if (error) return showToast(error.message); state.bookings = data;
    }
    renderPayments();
  }

  function renderPayments() {
    const paid = state.bookings.filter(x => x.payment_status === "paid").length;
    $("bookingCount").textContent = state.bookings.length; $("paidCount").textContent = paid; $("outstandingTotal").textContent = money(state.bookings.reduce((sum, x) => sum + Number(x.remaining_balance || 0), 0));
    $("paymentRows").innerHTML = state.bookings.map(row => `<tr><td><b>${escapeHtml(row.customer_name)}</b></td><td>${row.booking_date}<br><small>${row.time_slots ? `${timeLabel(row.time_slots.start_time)}–${timeLabel(row.time_slots.end_time)}` : "Open Play"}</small></td><td>${money(row.total_amount)}</td><td><input type="number" min="0" max="${row.total_amount}" value="${row.paid_amount}" data-paid="${row.id}"></td><td><b>${money(row.remaining_balance)}</b></td><td><select data-payment="${row.id}"><option value="paid" ${row.payment_status === "paid" ? "selected" : ""}>Paid</option><option value="unpaid" ${row.payment_status === "unpaid" ? "selected" : ""}>Unpaid</option><option value="partial" ${row.payment_status === "partial" ? "selected" : ""}>Partial</option></select><br><span class="status ${row.payment_status}">${row.payment_status.toUpperCase()}</span></td><td><select data-booking="${row.id}"><option value="pending" ${row.booking_status === "pending" ? "selected" : ""}>Pending</option><option value="confirmed" ${row.booking_status === "confirmed" ? "selected" : ""}>Confirmed</option><option value="cancelled" ${row.booking_status === "cancelled" ? "selected" : ""}>Cancelled</option></select></td></tr>`).join("");
    document.querySelectorAll("[data-payment]").forEach(select => select.addEventListener("change", () => updatePayment(select.dataset.payment, select.value)));
    document.querySelectorAll("[data-paid]").forEach(input => input.addEventListener("change", () => updatePaid(input.dataset.paid, input.value)));
    document.querySelectorAll("[data-booking]").forEach(select => select.addEventListener("change", () => updateBookingStatus(select.dataset.booking, select.value)));
  }

  async function updatePayment(id, status) { const row = state.bookings.find(x => String(x.id) === String(id)); const paid = status === "paid" ? row.total_amount : status === "unpaid" ? 0 : (row.paid_amount > 0 && row.paid_amount < row.total_amount ? row.paid_amount : Math.round(row.total_amount / 2)); await savePayment(row, paid, status); }
  async function updatePaid(id, value) { const row = state.bookings.find(x => String(x.id) === String(id)); const paid = Math.max(0, Math.min(Number(row.total_amount), Number(value || 0))); const status = paid === 0 ? "unpaid" : paid >= row.total_amount ? "paid" : "partial"; await savePayment(row, paid, status); }
  async function savePayment(row, paid, status) { row.paid_amount = paid; row.remaining_balance = row.total_amount - paid; row.payment_status = status; if (window.COURT822_CONFIGURED) { const { error } = await courtDb.from("bookings").update({ paid_amount: paid, payment_status: status }).eq("id", row.id); if (error) return showToast(error.message); } renderPayments(); showToast("Payment updated."); }
  async function updateBookingStatus(id, status) { const row = state.bookings.find(x => String(x.id) === String(id)); row.booking_status = status; if (window.COURT822_CONFIGURED) { const { error } = await courtDb.from("bookings").update({ booking_status: status }).eq("id", id); if (error) return showToast(error.message); } showToast("Booking status updated."); }

  async function loadRotation() {
    if (!window.COURT822_CONFIGURED) return renderRotation();
    const { data: events } = await courtDb.from("open_play_events").select("id,event_date").gte("event_date", new Date().toISOString().slice(0,10)).order("event_date").limit(1);
    state.event = events?.[0] || null;
    if (!state.event) { state.players = []; return renderRotation(); }
    const { data } = await courtDb.from("open_play_players").select("id,player_name,games_played,last_round_played").eq("event_id", state.event.id);
    state.players = data || []; renderRotation();
  }

  function shuffle(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
  function randomizeDemo() { state.round++; const ranked = state.players.map(player => ({ player, tie: Math.random() })).sort((a,b) => a.player.games_played - b.player.games_played || a.tie - b.tie); state.assignments = shuffle(ranked.slice(0,16).map(x => x.player)); state.waiting = ranked.slice(16).map(x => x.player); state.assignments.forEach(player => player.games_played++); renderRotation(); }
  function renderRotation() { if (!state.assignments.length && state.players.length) { state.assignments = state.players.slice(0,16); state.waiting = state.players.slice(16); } $("roundNumber").textContent = state.round || 1; $("playingCount").textContent = state.assignments.length; $("waitingCount").textContent = state.waiting.length; $("rotationTotal").textContent = `${state.players.length} / 40`; $("courtAssignments").innerHTML = [0,1,2,3].map(court => `<article class="card court-card"><h3>Court ${court+1}</h3><div class="player-grid">${state.assignments.slice(court*4,court*4+4).map(player => `<div class="player-chip"><b>${escapeHtml(player.player_name)}</b><span>${player.games_played} games</span></div>`).join("") || "No players"}</div></article>`).join(""); $("waitingPlayers").innerHTML = state.waiting.map((player,index) => `<div class="waiting-chip"><b>${index+1}. ${escapeHtml(player.player_name)}</b><span>${player.games_played} games</span></div>`).join("") || "No players waiting."; }

  $("nextRound").addEventListener("click", async () => { if (!window.COURT822_CONFIGURED) return randomizeDemo(); if (!state.event) return showToast("No upcoming Open Play event."); const { data, error } = await courtDb.rpc("owner_create_next_round", { p_event_id: state.event.id }); if (error) return showToast(error.message); state.round = data[0]?.round_number || state.round + 1; state.assignments = data.map(row => ({ id: row.player_id, player_name: row.player_name, games_played: row.games_played })); const playingIds = new Set(state.assignments.map(x => x.id)); state.waiting = state.players.filter(x => !playingIds.has(x.id)).sort((a,b) => a.games_played - b.games_played); state.assignments.forEach(updated => { const player = state.players.find(x => x.id === updated.id); if (player) player.games_played = updated.games_played; }); renderRotation(); showToast(`Round ${state.round} created.`); });
  $("resetRotation").addEventListener("click", async () => { if (!window.COURT822_CONFIGURED) { state.players = JSON.parse(JSON.stringify(demoPlayers)); state.round = 0; return randomizeDemo(); } if (!state.event) return; const { error } = await courtDb.rpc("owner_reset_rotation", { p_event_id: state.event.id }); if (error) return showToast(error.message); state.round = 0; state.assignments = []; await loadRotation(); showToast("Rotation reset."); });

  (async () => { if (await verifyOwner()) openDashboard(); })();
})();
