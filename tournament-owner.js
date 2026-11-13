 
/*
  COURT 822 V3
  TOURNAMENT OWNER DASHBOARD

  Checkpoint 3:
  Captain Registration + Owner Verification

  Payment verification: DISABLED
  QR generation: DISABLED
*/

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    tournaments: [],
    checkouts: [],
    initialized: false,
    loading: false,
    busy: false
  };

  const money = value =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP"
    }).format(Number(value || 0));

  const dateText = value => {
    if (!value) return "Not available";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Not available"
      : date.toLocaleString("en-PH");
  };

  function make(tag, className = "", text = "") {
    const el = document.createElement(tag);

    if (className) el.className = className;

    el.textContent = String(text);

    return el;
  }

  function setMessage(text, error = false) {
    const el = $("tournamentReviewMessage");

    if (!el) return;

    el.textContent = text;
    el.classList.toggle("error", error);
  }

  function info(label, value) {
    const box = make("div");

    box.append(
      make("small", "muted", label),
      make("p", "", value ?? "Not available")
    );

    return box;
  }

  async function requireOwner() {
    if (!window.courtDb) {
      throw new Error("Supabase connection unavailable.");
    }

    const { data: auth, error: authError } =
      await courtDb.auth.getUser();

    if (authError || !auth?.user) {
      throw new Error("Please sign in as owner.");
    }

    const { data, error } =
      await courtDb.rpc("court822_is_owner");

    if (error || data !== true) {
      throw new Error("Owner access required.");
    }

    return true;
  }

  async function initialize() {
    if (state.loading) return;

    state.loading = true;

    setMessage("Loading tournaments...");

    try {
      await requireOwner();

      const { data, error } = await courtDb
        .from("tournaments")
        .select("id,title,status")
        .order("created_at", {
          ascending: false
        });

      if (error) throw error;

      state.tournaments = data || [];

      const select = $("ownerTournamentSelect");
      select.replaceChildren();

      if (!state.tournaments.length) {
        select.append(
          new Option("No tournaments found", "")
        );

        setMessage("No tournaments available.");
        return;
      }

      for (const tournament of state.tournaments) {
        select.append(
          new Option(
            tournament.title,
            tournament.id
          )
        );
      }

      const systemTest = state.tournaments.find(
        t => t.title.trim().toLowerCase() ===
          "system test"
      );

      if (systemTest) {
        select.value = systemTest.id;
      }

      state.initialized = true;

    } catch (error) {
      console.error("Tournament initialization:", error);
      setMessage(error.message, true);

    } finally {
      state.loading = false;
    }

    if (state.initialized) {
      await loadRegistrations();
    }
  }

  async function loadRegistrations() {
    if (state.busy || state.loading) return;

    const tournamentId =
      $("ownerTournamentSelect")?.value;

    if (!tournamentId) {
      setMessage("Select a tournament first.");
      return;
    }

    state.busy = true;

    const refresh = $("refreshTournamentRegistrations");
    refresh.disabled = true;

    setMessage("Loading registrations...");

    try {
      await requireOwner();

      const { data, error } = await courtDb.rpc(
        "court822_owner_get_checkouts",
        {
          p_tournament_id: tournamentId
        }
      );

      if (error) throw error;

      if (!Array.isArray(data)) {
        throw new Error(
          "Unexpected registration response."
        );
      }

      state.checkouts = data;

      renderRegistrations();

      setMessage(
        `${data.length} checkout(s) loaded. ` +
        "Payment verification is disabled."
      );

    } catch (error) {
      console.error("Loading registrations:", error);

      state.checkouts = [];
      renderRegistrations();

      setMessage(error.message, true);

    } finally {
      state.busy = false;
      refresh.disabled = false;
    }
  }

  function renderRegistrations() {
    const root = $("tournamentRegistrationList");
    root.replaceChildren();

    const checkouts = state.checkouts;

    $("tournamentCheckoutCount").textContent =
      checkouts.length;

    $("tournamentPendingCount").textContent =
      checkouts.filter(
        c => c.owner_review_status === "pending"
      ).length;

    $("tournamentApprovedCount").textContent =
      checkouts.filter(
        c => c.owner_review_status === "approved"
      ).length;

    if (!checkouts.length) {
      const empty = make("div", "card panel");

      empty.append(
        make(
          "p",
          "muted",
          "No registrations found for this tournament."
        )
      );

      root.append(empty);
      return;
    }

    for (const checkout of checkouts) {
      root.append(renderCheckout(checkout));
    }
  }

  function renderCheckout(checkout) {
    const card = make(
      "article",
      "card panel tournament-review-card"
    );

    const header = make("div", "toolbar");

    const heading = make(
      "h2",
      "",
      "Registration Checkout"
    );

    const status = make(
      "span",
      "review-status " +
      (checkout.owner_review_status || "pending"),
      checkout.owner_review_status || "pending"
    );

    header.append(heading, status);
    card.append(header);

    card.append(
      make(
        "p",
        "muted",
        "Checkout ID: " + checkout.checkout_id
      )
    );

    const details = make("div", "review-meta");

    details.append(
      info("Checkout Status", checkout.status),
      info(
        "Owner Review",
        checkout.owner_review_status
      ),
      info(
        "Combined Total",
        money(checkout.total_amount)
      ),
      info(
        "Created At",
        dateText(checkout.created_at)
      ),
      info(
        "Captain Consent",
        checkout.captain_consent_confirmed
          ? "Confirmed"
          : "Missing"
      ),
      info(
        "Payment",
        "Not verified in this dashboard"
      )
    );

    card.append(details);

    const teams = Array.isArray(checkout.teams)
      ? checkout.teams
      : [];

    card.append(
      make("h3", "", `Registered Teams (${teams.length})`)
    );

    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];

      const teamCard = make(
        "div",
        "tournament-team"
      );

      teamCard.append(
        make("h3", "", `Team ${i + 1}`),
        info("Player 1", team.player1_name),
        info("Player 2", team.player2_name),
        info("Category ID", team.category_id),
        info("Team Status", team.status)
      );

      card.append(teamCard);
    }

    const actions = make(
      "div",
      "tournament-actions"
    );

    const canReview =
      checkout.status === "draft" &&
      checkout.owner_review_status === "pending" &&
      checkout.captain_consent_confirmed === true &&
      teams.length > 0;

    if (canReview) {
      const approve = make(
        "button",
        "btn",
        "Approve Registration Details"
      );

      approve.type = "button";

      approve.onclick = () => reviewCheckout(
        checkout.checkout_id,
        "approved"
      );

      const reject = make(
        "button",
        "btn danger",
        "Reject Registration Details"
      );

      reject.type = "button";

      reject.onclick = () => reviewCheckout(
        checkout.checkout_id,
        "rejected"
      );

      actions.append(approve, reject);

    } else {
      let label = "Not eligible for review";

      if (checkout.owner_review_status === "approved") {
        label = "Registration Details Reviewed";
      }

      if (checkout.owner_review_status === "rejected") {
        label = "Registration Details Rejected";
      }

      actions.append(
        make("span", "review-status", label)
      );
    }

    card.append(actions);

    card.append(
      make(
        "p",
        "muted",
        "Owner review does not verify payment, " +
        "confirm the checkout, reserve slots, " +
        "or generate team QR codes."
      )
    );

    return card;
  }

  async function reviewCheckout(checkoutId, decision) {
    if (state.busy || state.loading) return;

    const checkout = state.checkouts.find(
      c => c.checkout_id === checkoutId
    );

    if (!checkout) return;

    if (
      checkout.status !== "draft" ||
      checkout.owner_review_status !== "pending"
    ) {
      setMessage(
        "This checkout is not awaiting review.",
        true
      );
      return;
    }

    const action =
      decision === "approved" ? "approve" : "reject";

    const confirmed = window.confirm(
      `Do you want to ${action} this registration?\n\n` +
      "This action reviews registration details only.\n" +
      "It does not verify payment or confirm a team."
    );

    if (!confirmed) return;

    const notes = window.prompt(
      "Enter review notes:",
      "System Test registration reviewed."
    );

    if (notes === null) return;

    if (notes.length > 2000) {
      setMessage(
        "Review notes must be 2000 characters or fewer.",
        true
      );
      return;
    }

    state.busy = true;
    setMessage("Saving owner review...");

    try {
      await requireOwner();

      const { data, error } = await courtDb.rpc(
        "court822_owner_review_checkout",
        {
          p_checkout_id: checkoutId,
          p_decision: decision,
          p_notes: notes
        }
      );

      if (error) throw error;

      if (!data?.success) {
        throw new Error("Owner review failed.");
      }

      setMessage(
        `Registration details ${decision}. ` +
        "Payment remains unverified."
      );

    } catch (error) {
      console.error("Owner review error:", error);
      setMessage(error.message, true);

    } finally {
      state.busy = false;
    }

    await loadRegistrations();
  }

  function setup() {
    const tab = document.querySelector(
      '[data-tab="tournaments"]'
    );

    if (!tab) {
      console.error("Tournament tab not found.");
      return;
    }

    tab.addEventListener("click", () => {
      if (!state.initialized) {
        initialize();
      } else {
        loadRegistrations();
      }
    });

    $("ownerTournamentSelect").addEventListener(
      "change",
      loadRegistrations
    );

    $("refreshTournamentRegistrations").addEventListener(
      "click",
      () => {
        if (!state.initialized) {
          initialize();
        } else {
          loadRegistrations();
        }
      }
    );
  }

  setup();
})();
