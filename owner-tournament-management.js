(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let busy = false;
  let tournaments = [];
  const archiveBtn = $("archivePastTournament");
  const deleteBtn = $("deleteEmptyTournament");
  const deleteCompletedBtn = $("deleteCompletedTournament");
  const select = $("pastTournamentSelect");
  const status = (message, bad = false) => {
    const node = $("pastTournamentMessage");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("owner-error", bad);
  };
  function updateActions() {
    const selected = tournaments.find(t => t.id === select?.value);
    if (archiveBtn) archiveBtn.disabled = busy || !selected || selected.status !== "completed";
    if (deleteBtn) deleteBtn.disabled = busy || !selected || !["draft", "published"].includes(selected.status);
    if (deleteCompletedBtn) deleteCompletedBtn.disabled = busy || !selected || !["completed", "archived"].includes(selected.status);
  }
  async function requireOwner() {
    const { data: auth, error: authError } = await courtDb.auth.getUser();
    if (authError || !auth?.user) throw new Error("Sign in as owner first.");
    const { data, error } = await courtDb.rpc("court822_is_owner");
    if (error || data !== true) throw new Error("Owner access required.");
  }
  async function load(preserveMessage = false) {
    if (busy) return;
    busy = true;
    updateActions();
    try {
      await requireOwner();
      const { data, error } = await courtDb.from("tournaments")
        .select("id,title,status,start_date,end_date")
        .in("status", ["draft", "published", "completed", "archived"])
        .order("start_date", { ascending: false });
      if (error) throw error;
      tournaments = data || [];
      const previous = select?.value;
      if (select) {
        select.replaceChildren(new Option("Choose a tournament", ""));
        for (const t of tournaments) select.add(new Option(`${t.title} (${t.status})`, t.id));
        if (tournaments.some(t => t.id === previous)) select.value = previous;
      }
      if (!preserveMessage) status("Draft/published unused tournaments can be deleted. Completed tournaments can be archived or permanently deleted with financial audit retention.");
    } catch (error) {
      status(error?.message || "Unable to load tournaments.", true);
    } finally {
      busy = false;
      updateActions();
    }
  }
  async function act(kind) {
    if (busy) return;
    const selected = tournaments.find(t => t.id === select?.value);
    if (!selected) return status("Choose a tournament first.", true);
    if (kind === "archive" && selected.status !== "completed") return status("Only completed tournaments can be archived.", true);
    if (kind === "deleteUnused" && !["draft", "published"].includes(selected.status)) return status("Only unused draft or published tournaments can be deleted here.", true);
    if (kind === "deleteCompleted" && !["completed", "archived"].includes(selected.status)) return status("Only completed or archived tournaments can use audited permanent deletion.", true);

    let typed = null;
    if (kind === "deleteUnused" || kind === "deleteCompleted") {
      const warning = kind === "deleteCompleted"
        ? `Permanently delete '${selected.title}'? Operational registrations, teams, QR and check-in data will be removed. A financial audit snapshot and receipt references will be retained. Type the exact tournament name to confirm:`
        : `Permanently delete unused '${selected.title}'? Type the exact tournament name to confirm:`;
      typed = window.prompt(warning);
      if (typed === null) return;
      if (typed.trim() !== selected.title.trim()) return status("Tournament name did not match. Nothing was deleted.", true);
      if (!window.confirm(kind === "deleteCompleted"
        ? "FINAL CONFIRMATION: This permanently removes tournament operations. Financial audit data and receipt files are retained. Continue?"
        : "Permanently delete this unused tournament? This cannot be undone.")) return;
    } else if (!window.confirm(`Archive '${selected.title}'? Its operational and financial records will be preserved.`)) return;

    busy = true;
    updateActions();
    let completed = false;
    try {
      await requireOwner();
      let functionName, args;
      if (kind === "archive") {
        functionName = "court822_owner_archive_tournament_v1";
        args = { p_tournament_id: selected.id };
      } else if (kind === "deleteUnused") {
        functionName = "court822_owner_delete_empty_tournament_v1";
        args = { p_tournament_id: selected.id };
      } else {
        functionName = "court822_owner_delete_completed_tournament_with_audit";
        args = { p_tournament_id: selected.id, p_confirmation_title: typed.trim() };
      }
      const { data, error } = await courtDb.rpc(functionName, args);
      if (error) throw error;
      if (data?.success !== true) throw new Error(data?.error || "Operation did not complete.");
      completed = true;
      if (kind === "archive") status(`Archived '${selected.title}'. Its records are preserved.`);
      else if (kind === "deleteUnused") status(`Deleted unused tournament '${selected.title}'.`);
      else status(`Deleted '${selected.title}'. Financial archive ${data.financial_archive_id} retained. Verified payment total: ₱${Number(data.verified_payment_total || 0).toFixed(2)}.`);
    } catch (error) {
      status(error?.message || "Operation failed.", true);
    } finally {
      busy = false;
      updateActions();
    }
    if (completed) {
      await load(true);
      await loadFinancialArchives();
    }
  }
  async function loadFinancialArchives() {
    const msg = $("financialArchiveMessage");
    const rows = $("financialArchiveRows");
    if (!msg || !rows) return;
    msg.textContent = "Loading financial archives...";
    rows.replaceChildren();
    try {
      await requireOwner();
      const { data, error } = await courtDb.rpc("court822_owner_list_tournament_financial_archives");
      if (error) throw error;
      for (const item of data || []) {
        const tr = document.createElement("tr");
        const values = [item.tournament_title, item.original_status, item.archived_at ? new Date(item.archived_at).toLocaleString() : "", item.checkout_count, item.checkout_payment_count, item.legacy_payment_count, `₱${Number(item.verified_payment_total || 0).toFixed(2)}`];
        for (const value of values) {
          const td = document.createElement("td");
          td.textContent = String(value ?? "");
          tr.appendChild(td);
        }
        rows.appendChild(tr);
      }
      msg.textContent = `${(data || []).length} financial archive(s). Receipt files remain in their original Storage locations.`;
    } catch (error) {
      msg.textContent = error?.message || "Unable to load financial archives.";
      msg.classList.add("owner-error");
    }
  }
  $("pastTournamentRefresh")?.addEventListener("click", () => load());
  archiveBtn?.addEventListener("click", () => act("archive"));
  deleteBtn?.addEventListener("click", () => act("deleteUnused"));
  deleteCompletedBtn?.addEventListener("click", () => act("deleteCompleted"));
  $("financialArchiveRefresh")?.addEventListener("click", loadFinancialArchives);
  select?.addEventListener("change", updateActions);
  document.querySelector('[data-tab="manager"]')?.addEventListener("click", () => load());
  updateActions();
})();
