
/*
 * COURT 822 V4
 * FREEBIE MANAGEMENT - OWNER DASHBOARD
 *
 * FIXES:
 * - Loads tournaments directly from Supabase
 * - Works even if dashboard events were missed
 * - Automatically selects Battle for Novice
 * - Loads freebie data when tournament changes
 * - Supports manual refresh
 * - Preserves owner-only authorization
 *
 * READ ONLY:
 * No allocation, claim, or payment writes.
 */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    tournaments: [],
    initialized: false,
    loading: false,
    initializing: false,
    request: 0
  };

  const number = value =>
    Number(value || 0).toLocaleString("en-PH");

  function status(text, isError = false) {
    const el = $("freebieMessage");
    if (!el) return;

    el.textContent = text;
    el.classList.toggle("owner-error", isError);
  }

  function cell(row, value) {
    const td = document.createElement("td");
    td.textContent = String(value ?? "—");
    row.appendChild(td);
  }

  function clear() {
    $("freebieRows").replaceChildren();
    $("freebieCount").textContent = "0";
    $("freebieClaimRecords").textContent = "0";
    $("freebieClaimedTotal").textContent = "0";
  }

  async function checkOwner() {
    if (!window.courtDb) {
      throw new Error("Supabase client unavailable.");
    }

    const { data: auth, error: authError } =
      await courtDb.auth.getUser();

    if (authError || !auth?.user) {
      throw new Error(
        "Please sign in using your owner account."
      );
    }

    const { data, error } =
      await courtDb.rpc("court822_is_owner");

    if (error || data !== true) {
      throw new Error("Owner access required.");
    }
  }

  function setTournaments(rows) {
    if (!Array.isArray(rows)) return;

    state.tournaments = rows.filter(
      t => t && t.id && t.title
    );

    const select = $("freebieTournament");
    const previous = select.value;

    select.replaceChildren(
      new Option("Select tournament", "")
    );

    for (const tournament of state.tournaments) {
      select.add(
        new Option(
          tournament.title,
          tournament.id
        )
      );
    }

    if (state.tournaments.some(
      t => t.id === previous
    )) {
      select.value = previous;
    } else {
      const battle = state.tournaments.find(
        t => t.title.toLowerCase()
          .includes("battle for novice")
      );

      if (battle) {
        select.value = battle.id;
      } else if (state.tournaments.length) {
        select.value = state.tournaments[0].id;
      }
    }

    state.initialized = true;
  }

  async function initialize() {
    if (state.initializing) return;

    state.initializing = true;

    status("Loading tournaments...");

    try {
      await checkOwner();

      const { data, error } = await courtDb
        .from("tournaments")
        .select("id,title,status")
        .order("title");

      if (error) throw error;

      setTournaments(data || []);

      if (!state.tournaments.length) {
        clear();
        status("No tournaments available.");
        return;
      }

      await load();

    } catch (error) {
      console.error(
        "Court 822 freebie initialization:",
        error
      );

      clear();

      status(
        "Unable to load tournaments: " +
        error.message,
        true
      );

    } finally {
      state.initializing = false;
    }
  }

  async function load() {
    const select = $("freebieTournament");

    if (!select) return;

    const id = select.value;

    // Invalidate previous requests.
    const request = ++state.request;

    if (!id) {
      clear();
      status("Select a tournament.");
      return;
    }

    if (state.loading) return;

    state.loading = true;

    const refresh = $("freebieRefresh");
    if (refresh) refresh.disabled = true;

    status("Loading freebie configuration...");

    try {
      await checkOwner();

      const { data, error } = await courtDb.rpc(
        "court822_owner_get_freebie_overview",
        {
          p_tournament_id: id
        }
      );

      if (error) throw error;

      if (!Array.isArray(data)) {
        throw new Error(
          "Unexpected freebie overview response."
        );
      }

      // Ignore outdated responses.
      if (
        request !== state.request ||
        id !== select.value
      ) {
        return;
      }

      clear();

      let records = 0;
      let claimed = 0;

      for (const item of data) {
        records += Number(item.claim_records || 0);
        claimed += Number(item.total_claimed || 0);

        const tr = document.createElement("tr");

        [
          item.name,
          item.requires_size ? "Yes" : "No",
          number(item.quantity_per_player),
          item.is_active ? "Active" : "Inactive",
          number(item.claim_records),
          number(item.total_claimed)
        ].forEach(value => cell(tr, value));

        $("freebieRows").appendChild(tr);
      }

      $("freebieCount").textContent =
        number(data.length);

      $("freebieClaimRecords").textContent =
        number(records);

      $("freebieClaimedTotal").textContent =
        number(claimed);

      status(
        data.length
          ? `${data.length} freebie configuration(s) loaded.`
          : "No freebies configured for this tournament."
      );

    } catch (error) {
      if (request === state.request) {
        clear();

        status(
          "Unable to load freebie overview: " +
          error.message,
          true
        );
      }

      console.error(
        "Court 822 freebie overview:",
        error
      );

    } finally {
      state.loading = false;

      if (refresh) refresh.disabled = false;

      // Reload if the selection changed mid-request.
      if (
        request !== state.request &&
        select.value
      ) {
        load();
      }
    }
  }

  function setup() {
    const select = $("freebieTournament");
    const refresh = $("freebieRefresh");

    if (!select || !refresh) {
      console.error(
        "Freebie Management HTML elements missing."
      );
      return;
    }

    select.addEventListener("change", () => {
      state.request++;
      load();
    });

    refresh.addEventListener("click", async () => {
      if (!state.initialized) {
        await initialize();
      } else {
        await load();
      }
    });

    // Compatibility with existing dashboard events.
    window.addEventListener(
      "court822:tournaments",
      event => {
        if (
          Array.isArray(event.detail) &&
          event.detail.length
        ) {
          setTournaments(event.detail);
        }
      }
    );

    window.addEventListener(
      "court822:freebies",
      async () => {
        if (!state.initialized) {
          await initialize();
        } else {
          await load();
        }
      }
    );

    // Independent startup: no event required.
    initialize();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      setup,
      { once: true }
    );
  } else {
    setup();
  }

})();
