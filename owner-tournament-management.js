(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let busy = false;
  const status = (text, bad = false) => {
    const e = $("pastTournamentMessage");
    if (e) { e.textContent = text; e.classList.toggle("owner-error", bad); }
  };
  async function owner() {
    const {data: a, error: ae} = await courtDb.auth.getUser();
    if (ae || !a?.user) throw new Error("Sign in as owner first");
    const {data, error} = await courtDb.rpc("court822_is_owner");
    if (error || data !== true) throw new Error("Owner access required");
  }
  async function load() {
    if (busy) return;
    busy = true;
    try {
      await owner();
      const {data, error} = await courtDb.from("tournaments")
        .select("id,title,status,start_date,end_date")
        .in("status", ["draft", "completed", "archived"])
        .order("start_date", {ascending:false});
      if (error) throw error;
      const select = $("pastTournamentSelect");
      const old = select.value;
      select.replaceChildren(new Option("Choose a tournament", ""));
      for (const t of data || []) select.add(new Option(`${t.title} (${t.status})`, t.id));
      if ((data || []).some(t => t.id === old)) select.value = old;
      status("Only completed tournaments may be archived. Only completely empty drafts may be deleted.");
    } catch (err) { status(err.message || "Unable to load tournaments", true); }
    finally { busy = false; }
  }
  async function act(kind) {
    if (busy) return;
    const id = $("pastTournamentSelect")?.value;
    if (!id) { status("Choose a tournament first.", true); return; }
    const action = kind === "archive" ? "archive" : "permanently DELETE";
    if (!window.confirm(`Do you want to ${action} the selected tournament?`)) return;
    if (kind === "delete" && window.prompt("Type DELETE to confirm permanent deletion") !== "DELETE") return;
    busy = true;
    try {
      await owner();
      const name = kind === "archive" ? "court822_owner_archive_tournament_v1" : "court822_owner_delete_empty_tournament_v1";
      const {data, error} = await courtDb.rpc(name, {p_tournament_id:id});
      if (error || data?.success !== true) throw new Error(error?.message || data?.error || "Operation failed");
      status(kind === "archive" ? "Tournament archived." : "Empty draft deleted.");
    } catch (err) { status(err.message || "Operation failed", true); }
    finally { busy = false; await load(); }
  }
  $("pastTournamentRefresh")?.addEventListener("click", load);
  $("archivePastTournament")?.addEventListener("click", () => act("archive"));
  $("deleteEmptyTournament")?.addEventListener("click", () => act("delete"));
  document.querySelector('[data-tab="manager"]')?.addEventListener("click", load);
})();
