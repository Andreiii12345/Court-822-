(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let busy = false;
  let tournaments = [];
  const archiveBtn = $("archivePastTournament");
  const deleteBtn = $("deleteEmptyTournament");
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
      if (!preserveMessage) status("Select an unused draft/published tournament to delete, or a completed tournament to archive.");
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
    if (kind === "archive" && selected.status !== "completed") {
      return status("Only completed tournaments can be archived.", true);
    }
    if (kind === "delete" && !["draft", "published"].includes(selected.status)) {
      return status("Only unused draft or published tournaments can be deleted.", true);
    }
    if (kind === "delete") {
      const typed = window.prompt(`Permanently delete '${selected.title}'? This cannot be undone. Type the exact tournament name to confirm:`);
      if (typed === null) return;
      if (typed.trim() !== selected.title.trim()) return status("Tournament name did not match. Nothing was deleted.", true);
    } else if (!window.confirm(`Archive '${selected.title}'? Registration and payment history will be preserved.`)) {
      return;
    }
    busy = true;
    updateActions();
    let completed = false;
    try {
      await requireOwner();
      const functionName = kind === "archive"
        ? "court822_owner_archive_tournament_v1"
        : "court822_owner_delete_empty_tournament_v1";
      const { data, error } = await courtDb.rpc(functionName, { p_tournament_id: selected.id });
      if (error) throw error;
      if (data?.success !== true) throw new Error(data?.error || "Operation did not complete.");
      completed = true;
      status(kind === "archive"
        ? `Archived '${selected.title}'. Its records are preserved.`
        : `Deleted unused tournament '${selected.title}'.`);
    } catch (error) {
      status(error?.message || "Operation failed.", true);
    } finally {
      busy = false;
      updateActions();
    }
    if (completed) await load(true);
  }
  $("pastTournamentRefresh")?.addEventListener("click", () => load());
  archiveBtn?.addEventListener("click", () => act("archive"));
  deleteBtn?.addEventListener("click", () => act("delete"));
  select?.addEventListener("change", updateActions);
  document.querySelector('[data-tab="manager"]')?.addEventListener("click", () => load());
  updateActions();
})();
