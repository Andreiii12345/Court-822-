
/*
 * COURT 822 V4
 * OWNER FREEBIE MANAGEMENT
 *
 * Features:
 * - Owner authentication
 * - Tournament selection
 * - Freebie configuration overview
 * - Eligible player counts
 * - Allocated quantities
 * - Claimed quantities
 * - Unclaimed allocations
 * - Refresh support
 *
 * READ ONLY
 * No payment, checkout, or claim writes.
 */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    tournaments: [],
    initialized: false,
    initializing: false,
    request: 0
  };

  const number = value =>
    Number(value || 0).toLocaleString("en-PH");

  function setMessage(id, text, error = false) {
    const el = $(id);
    if (!el) return;

    el.textContent = text;
    el.classList.toggle("owner-error", error);
  }

  function cell(row, value) {
    const td = document.createElement("td");
    td.textContent = String(value ?? "—");
    row.appendChild(td);
  }

  function setValue(id, value) {
    const el = $(id);
    if (el) el.textContent = number(value);
  }

  function clearOverview() {
    $("freebieRows")?.replaceChildren();

    setValue("freebieCount", 0);
    setValue("freebieClaimRecords", 0);
    setValue("freebieClaimedTotal", 0);
  }

  function clearEligibility() {
    $("freebieEligibilityRows")?.replaceChildren();

    setValue("freebieEligiblePlayers", 0);
    setValue("freebieAllocated", 0);
    setValue("freebieUnclaimed", 0);
  }

  function clearPlayerTracking() {
    $("freebiePlayerTrackingRows")?.replaceChildren();
  }

  function clearAll() {
    clearOverview();
    clearEligibility();
    clearPlayerTracking();
  }

  async function checkOwner() {
    if (!window.courtDb) {
      throw new Error("Supabase client unavailable.");
    }

    const { data: auth, error: authError } =
      await courtDb.auth.getUser();

    if (authError || !auth?.user) {
      throw new Error("Please sign in.");
    }

    const { data, error } =
      await courtDb.rpc("court822_is_owner");

    if (error) throw error;

    if (data !== true) {
      throw new Error("Owner access required.");
    }
  }

  function setTournaments(rows) {
    if (!Array.isArray(rows)) return;

    const select = $("freebieTournament");
    if (!select) return;

    const previous = select.value;

    state.tournaments = rows.filter(
      item => item && item.id && item.title
    );

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

    if (
      state.tournaments.some(
        tournament => tournament.id === previous
      )
    ) {
      select.value = previous;
    } else {
      const battle = state.tournaments.find(
        tournament =>
          tournament.title.toLowerCase()
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

    setMessage(
      "freebieMessage",
      "Loading tournaments..."
    );

    try {
      await checkOwner();

      const { data, error } = await courtDb
        .from("tournaments")
        .select("id,title,status")
        .order("title");

      if (error) throw error;

      setTournaments(data || []);

      if (!state.tournaments.length) {
        clearAll();

        setMessage(
          "freebieMessage",
          "No tournaments available."
        );

        return;
      }

      await load();

    } catch (error) {
      clearAll();

      setMessage(
        "freebieMessage",
        "Unable to load tournaments: " +
          error.message,
        true
      );

      console.error(
        "Court 822 tournament initialization:",
        error
      );

    } finally {
      state.initializing = false;
    }
  }

  async function loadOverview(tournamentId) {
    const { data, error } = await courtDb.rpc(
      "court822_owner_get_freebie_overview",
      {
        p_tournament_id: tournamentId
      }
    );

    if (error) throw error;

    if (!Array.isArray(data)) {
      throw new Error(
        "Invalid freebie overview response."
      );
    }

    return data;
  }

  async function loadEligibility(tournamentId) {
    const { data, error } = await courtDb.rpc(
      "court822_owner_get_freebie_eligibility",
      {
        p_tournament_id: tournamentId
      }
    );

    if (error) throw error;

    if (!Array.isArray(data)) {
      throw new Error(
        "Invalid eligibility response."
      );
    }

    return data;
  }

  async function loadPlayerTracking(tournamentId) {
    const { data, error } = await courtDb.rpc(
      "court822_owner_get_draft_freebie_tracking",
      { p_tournament_id: tournamentId }
    );
    if (error) throw error;
    if (!Array.isArray(data)) {
      throw new Error("Invalid draft player tracking response.");
    }
    return data;
  }

  async function loadConfirmedPlayerTracking(tournamentId) {
    const { data, error } = await courtDb.rpc(
      "court822_owner_get_confirmed_player_freebies",
      { p_tournament_id: tournamentId }
    );
    if (error) throw error;
    if (!Array.isArray(data)) {
      throw new Error("Invalid confirmed player tracking response.");
    }
    return data;
  }

  function renderPlayerTracking(draftData, confirmedData) {
    clearPlayerTracking();
    const tbody = $("freebiePlayerTrackingRows");
    if (!tbody) return;

    // Confirmed entitlements first. The server function returns
    // one row per permanent player ID and freebie.
    for (const item of confirmedData) {
      const tr = document.createElement("tr");
      const sizeLabel = item.size_conflict
        ? "Conflicting sizes"
        : (item.selected_size || (item.requires_size ? "Missing" : "Not required"));
      const registrationLabel = item.registration_status || "Confirmed";
      const eligibilityLabel = item.eligible ? "Yes" : "No";
      const readinessLabel = item.claim_ready
        ? "Ready"
        : (item.size_review_required ? "Needs size review" : "Not ready");

      [
        item.player_name || "Unnamed player",
        item.freebie_name || "—",
        sizeLabel,
        registrationLabel,
        eligibilityLabel + " / " + readinessLabel,
        number(item.claimed_quantity),
        number(item.remaining_quantity)
      ].forEach(value => cell(tr, value));
      tbody.appendChild(tr);
    }

    // Draft selections remain visible but are never treated as eligible.
    for (const item of draftData) {
      const tr = document.createElement("tr");
      [
        item.player_name || "Unnamed player",
        item.freebie_name || "—",
        item.selected_size || (item.requires_size ? "Missing" : "Not required"),
        "Draft — not eligible",
        "No",
        "0",
        "0"
      ].forEach(value => cell(tr, value));
      tbody.appendChild(tr);
    }

    if (!draftData.length && !confirmedData.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.textContent = "No draft selections or confirmed player entitlements for this tournament.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  function renderOverview(data) {
    clearOverview();

    let records = 0;
    let claimed = 0;

    const tbody = $("freebieRows");
    if (!tbody) return;

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

      tbody.appendChild(tr);
    }

    setValue("freebieCount", data.length);
    setValue("freebieClaimRecords", records);
    setValue("freebieClaimedTotal", claimed);
  }

  function renderEligibility(data) {
    clearEligibility();

    const tbody = $("freebieEligibilityRows");
    if (!tbody) return;

    let eligible = 0;
    let allocated = 0;
    let unclaimed = 0;

    for (const item of data) {
      eligible = Math.max(
        eligible,
        Number(item.eligible_players || 0)
      );

      allocated += Number(
        item.allocated_quantity || 0
      );

      unclaimed += Number(
        item.unclaimed_quantity || 0
      );

      const tr = document.createElement("tr");

      [
        item.name,
        number(item.eligible_players),
        number(item.allocated_quantity),
        number(item.claimed_quantity),
        number(item.unclaimed_quantity)
      ].forEach(value => cell(tr, value));

      tbody.appendChild(tr);
    }

    setValue("freebieEligiblePlayers", eligible);
    setValue("freebieAllocated", allocated);
    setValue("freebieUnclaimed", unclaimed);
  }

  async function load() {
    const select = $("freebieTournament");
    if (!select) return;

    const tournamentId = select.value;
    const request = ++state.request;

    if (!tournamentId) {
      clearAll();

      setMessage(
        "freebieMessage",
        "Select a tournament."
      );

      setMessage(
        "freebieEligibilityMessage",
        "Select a tournament."
      );
      setMessage("freebiePlayerTrackingMessage", "Select a tournament.");

      return;
    }

    const refresh = $("freebieRefresh");
    if (refresh) refresh.disabled = true;

    setMessage(
      "freebieMessage",
      "Loading freebie configuration..."
    );

    setMessage(
      "freebieEligibilityMessage",
      "Loading eligibility..."
    );
    setMessage("freebiePlayerTrackingMessage", "Loading draft and confirmed player shirt tracking...");

    try {
      await checkOwner();

      const [overviewResult, eligibilityResult, trackingResult, confirmedTrackingResult] =
        await Promise.allSettled([
          loadOverview(tournamentId),
          loadEligibility(tournamentId),
          loadPlayerTracking(tournamentId),
          loadConfirmedPlayerTracking(tournamentId)
        ]);

      if (
        request !== state.request ||
        tournamentId !== select.value
      ) {
        return;
      }

      if (overviewResult.status === "fulfilled") {
        renderOverview(overviewResult.value);

        setMessage(
          "freebieMessage",
          `${overviewResult.value.length} freebie configuration(s) loaded.`
        );
      } else {
        clearOverview();

        setMessage(
          "freebieMessage",
          "Unable to load freebies: " +
            overviewResult.reason.message,
          true
        );

        console.error(
          "Freebie overview:",
          overviewResult.reason
        );
      }

      if (eligibilityResult.status === "fulfilled") {
        renderEligibility(eligibilityResult.value);

        setMessage(
          "freebieEligibilityMessage",
          `${eligibilityResult.value.length} eligibility record(s) loaded.`
        );
      } else {
        clearEligibility();

        setMessage(
          "freebieEligibilityMessage",
          "Unable to load eligibility: " +
            eligibilityResult.reason.message,
          true
        );

        console.error(
          "Freebie eligibility:",
          eligibilityResult.reason
        );
      }

      if (
        trackingResult.status === "fulfilled" &&
        confirmedTrackingResult.status === "fulfilled"
      ) {
        renderPlayerTracking(
          trackingResult.value,
          confirmedTrackingResult.value
        );
        setMessage(
          "freebiePlayerTrackingMessage",
          `${confirmedTrackingResult.value.length} confirmed player entitlement(s) and ${trackingResult.value.length} draft player selection(s) loaded.`
        );
      } else {
        clearPlayerTracking();
        const errors = [];
        if (trackingResult.status === "rejected") {
          errors.push("Draft tracking: " + trackingResult.reason.message);
          console.error("Freebie draft player tracking:", trackingResult.reason);
        }
        if (confirmedTrackingResult.status === "rejected") {
          errors.push("Confirmed tracking: " + confirmedTrackingResult.reason.message);
          console.error("Freebie confirmed player tracking:", confirmedTrackingResult.reason);
        }
        setMessage(
          "freebiePlayerTrackingMessage",
          "Unable to load complete player tracking: " + errors.join("; "),
          true
        );
      }

    } catch (error) {
      if (request !== state.request) return;

      clearAll();

      setMessage(
        "freebieMessage",
        "Unable to load freebie data: " +
          error.message,
        true
      );

      setMessage(
        "freebieEligibilityMessage",
        "Eligibility unavailable.",
        true
      );
      setMessage("freebiePlayerTrackingMessage", "Player tracking unavailable.", true);

      console.error(
        "Court 822 Freebie Management:",
        error
      );

    } finally {
      if (refresh) refresh.disabled = false;
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

    select.addEventListener("change", load);

    refresh.addEventListener("click", () => {
      if (state.initialized) {
        load();
      } else {
        initialize();
      }
    });

    window.addEventListener(
      "court822:tournaments",
      event => {
        if (
          Array.isArray(event.detail) &&
          event.detail.length
        ) {
          const previous = select.value;

          setTournaments(event.detail);

          if (select.value !== previous) {
            load();
          }
        }
      }
    );

    window.addEventListener(
      "court822:freebies",
      () => {
        if (state.initialized) {
          load();
        } else {
          initialize();
        }
      }
    );

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
