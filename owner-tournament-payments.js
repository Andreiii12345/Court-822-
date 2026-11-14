
/*
 COURT 822 V4
 OWNER TOURNAMENT PAYMENT DASHBOARD

 Features:
 - Owner authentication
 - Tournament selection
 - Registration checkout overview
 - GCash / Maya payment details
 - Payment reference numbers
 - Secure receipt preview
 - Private 60-second receipt URLs

 Payment verification: DISABLED
 Automatic QR issuance: DISABLED

 Existing 8-digit OTP: UNCHANGED
*/

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const BUCKET = "court822-tournament-receipts";

  // Keep false until owner verification, QR storage and delivery
  // have passed a controlled end-to-end test. This frontend
  // flag is NOT a security boundary: the Edge Function must
  // independently enforce COURT822_VERIFY_PAYMENT_ENABLED.
  const VERIFY_UI_ENABLED = false;

  const state = {
    busy: false,
    loaded: false,
    openingReceipt: false
  };

  const money = value =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP"
    }).format(Number(value || 0));

  function el(tag, text = "", className = "") {
    const node = document.createElement(tag);

    node.textContent = String(text ?? "");

    if (className) {
      node.className = className;
    }

    return node;
  }

  function message(text, error = false) {
    const node = $("paymentMessage");

    if (!node) return;

    node.textContent = text;
    node.classList.toggle("owner-error", error);
  }

  async function requireOwner() {
    if (!window.courtDb) {
      throw new Error(
        "Supabase connection unavailable."
      );
    }

    const {
      data: auth,
      error: authError
    } = await courtDb.auth.getUser();

    if (authError || !auth?.user) {
      throw new Error(
        "Owner sign-in required."
      );
    }

    const { data, error } = await courtDb.rpc(
      "court822_is_owner"
    );

    if (error || data !== true) {
      throw new Error(
        "Owner access required."
      );
    }

    return true;
  }

  async function loadTournaments() {
    await requireOwner();

    const { data, error } = await courtDb
      .from("tournaments")
      .select("id,title")
      .order("created_at", {
        ascending: false
      });

    if (error) throw error;

    const select = $("paymentTournamentSelect");

    if (!select) {
      throw new Error(
        "Payment tournament selector missing."
      );
    }

    const previous = select.value;

    select.replaceChildren();

    for (const tournament of data || []) {
      select.append(
        new Option(
          tournament.title,
          tournament.id
        )
      );
    }

    if (
      previous &&
      (data || []).some(t => t.id === previous)
    ) {
      select.value = previous;
    }

    state.loaded = true;
  }

  // Secure owner-only receipt preview.
  async function viewReceipt(checkoutId, path) {
    if (state.openingReceipt) return;

    if (
      !path ||
      typeof path !== "string" ||
      !path.startsWith(checkoutId + "/")
    ) {
      message(
        "Invalid receipt file path.",
        true
      );
      return;
    }

    state.openingReceipt = true;

    // Open the tab immediately to avoid
    // popup blockers after async requests.
    const preview = window.open(
      "",
      "_blank"
    );

    if (preview) {
      preview.opener = null;
      preview.document.title =
        "Court 822 Payment Receipt";
      preview.document.body.textContent =
        "Loading secure payment receipt...";
    }

    try {
      await requireOwner();

      const { data, error } = await courtDb
        .storage
        .from(BUCKET)
        .createSignedUrl(path, 60);

      if (error) throw error;

      if (!data?.signedUrl) {
        throw new Error(
          "Unable to generate receipt link."
        );
      }

      // Signed URL expires after 60 seconds.
      if (preview && !preview.closed) {
        preview.location.replace(data.signedUrl);
      } else {
        message(
          "Your browser blocked the receipt window. " +
          "Allow pop-ups for Court 822 and retry.",
          true
        );
      }

    } catch (error) {
      if (preview && !preview.closed) {
        preview.close();
      }

      console.error(
        "Court 822 receipt preview:",
        error
      );

      message(
        "Unable to open receipt: " +
        (error.message || "Unknown error"),
        true
      );

    } finally {
      state.openingReceipt = false;
    }
  }

  async function loadPaymentDetails(
    checkout,
    card
  ) {
    if (
      ![
        "pending_payment",
        "pending_verification",
        "confirmed"
      ].includes(checkout.status)
    ) {
      return;
    }

    const { data, error } = await courtDb.rpc(
      "court822_owner_checkout_payment_details",
      {
        p_checkout_id: checkout.checkout_id
      }
    );

    if (error) {
      card.append(
        el(
          "p",
          "Unable to load payment details: " +
          error.message,
          "owner-error"
        )
      );
      return;
    }

    if (!Array.isArray(data)) {
      card.append(
        el(
          "p",
          "Unexpected payment details response.",
          "owner-error"
        )
      );
      return;
    }

    if (!data.length) {
      card.append(
        el(
          "p",
          "No payment submissions recorded.",
          "muted"
        )
      );
      return;
    }

    for (const payment of data) {
      const detail = el("div");

      detail.className = "review-meta";

      detail.style.cssText = [
        "border-top:1px solid #ddd",
        "padding:14px 0",
        "display:grid",
        "gap:7px"
      ].join(";");

      detail.append(
        el(
          "strong",
          money(payment.amount) +
          " · " +
          String(
            payment.payment_method || "Unknown"
          ).toUpperCase()
        )
      );

      detail.append(
        el(
          "p",
          "Payment status: " +
          (payment.status || "Unknown")
        )
      );

      detail.append(
        el(
          "p",
          "Transaction reference: " +
          (payment.reference_number || "Not supplied")
        )
      );

      if (payment.created_at) {
        detail.append(
          el(
            "p",
            "Submitted: " +
            new Date(
              payment.created_at
            ).toLocaleString("en-PH"),
            "muted"
          )
        );
      }

      if (payment.verified_at) {
        detail.append(
          el(
            "p",
            "Verified: " +
            new Date(
              payment.verified_at
            ).toLocaleString("en-PH"),
            "muted"
          )
        );
      }

      if (
        payment.has_receipt &&
        payment.receipt_path
      ) {
        const button = el(
          "button",
          "View Payment Receipt",
          "btn secondary"
        );

        button.type = "button";

        button.addEventListener(
          "click",
          async () => {
            button.disabled = true;

            try {
              await viewReceipt(
                checkout.checkout_id,
                payment.receipt_path
              );
            } finally {
              button.disabled = false;
            }
          }
        );

        detail.append(button);

      } else {
        detail.append(
          el(
            "p",
            "No receipt file uploaded.",
            "muted"
          )
        );
      }

      if (payment.status === "pending") {
        detail.append(
          el(
            "p",
            "Awaiting owner verification. " +
            "Check the actual GCash/Maya " +
            "receiving account before approval.",
            "muted"
          )
        );

        if (checkout.status === "pending_verification") {
          const approval = document.createElement("label");
          approval.style.cssText =
            "display:flex;gap:10px;align-items:flex-start;margin-top:10px";
          const checked = document.createElement("input");
          checked.type = "checkbox";
          checked.disabled = !VERIFY_UI_ENABLED;
          const wording = el(
            "span",
            "I independently checked the receiving GCash/Maya account " +
            "and confirmed this exact payment and reference."
          );
          approval.append(checked, wording);
          detail.append(approval);

          const verify = el("button", "Verify Payment", "btn");
          verify.type = "button";
          verify.disabled = true;
          checked.addEventListener("change", () => {
            verify.disabled = !VERIFY_UI_ENABLED || !checked.checked;
          });
          verify.addEventListener("click", async () => {
            if (!VERIFY_UI_ENABLED || !checked.checked || state.busy) return;
            const paymentId = payment.payment_id || payment.id;
            if (!paymentId || !checkout.checkout_id) {
              message("Payment identifier missing. Verification blocked.", true);
              return;
            }
            if (!window.confirm(
              "Confirm actual receipt of " + money(payment.amount) +
              " in your receiving account? This will issue team QR credentials."
            )) return;
            state.busy = true;
            verify.disabled = true;
            try {
              await requireOwner();
              const { data: result, error: invokeError } =
                await courtDb.functions.invoke("court822-verify-payment", {
                  body: {
                    checkout_id: checkout.checkout_id,
                    payment_id: paymentId,
                    receipt_confirmed_in_receiving_account: true
                  }
                });
              if (invokeError) {
                let serverMessage = invokeError.message;
                if (invokeError.context instanceof Response) {
                  const payload = await invokeError.context.clone().json().catch(() => null);
                  serverMessage = payload?.error || serverMessage;
                }
                throw new Error(serverMessage || "Verification failed");
              }
              if (!result?.success) {
                throw new Error(result?.error || "Verification was not confirmed");
              }
              message("Payment verified. Refreshing checkout status...");
            } catch (err) {
              message("Verification failed: " + (err.message || "Unknown error"), true);
            } finally {
              state.busy = false;
              await refresh();
            }
          });
          detail.append(verify);
          if (!VERIFY_UI_ENABLED) {
            detail.append(el("p", "Verification locked until the backend and QR email tests pass.", "muted"));
          }
        }
      }

      card.append(detail);
    }
  }

  async function refresh() {
    if (state.busy) return;

    state.busy = true;

    const refreshButton = $("paymentRefresh");

    if (refreshButton) {
      refreshButton.disabled = true;
    }

    message("Loading payment records...");

    try {
      if (!state.loaded) {
        await loadTournaments();
      }

      await requireOwner();

      const tournamentId =
        $("paymentTournamentSelect")?.value;

      if (!tournamentId) {
        message("Select a tournament first.");
        return;
      }

      const { data, error } = await courtDb.rpc(
        "court822_owner_get_checkouts",
        {
          p_tournament_id: tournamentId
        }
      );

      if (error) throw error;

      if (!Array.isArray(data)) {
        throw new Error(
          "Unexpected checkout response."
        );
      }

      const awaiting = data.filter(
        x => x.status === "pending_verification"
      ).length;

      const confirmed = data.filter(
        x => x.status === "confirmed"
      ).length;

      const total = data.reduce(
        (sum, x) =>
          sum + Number(x.total_amount || 0),
        0
      );

      $("paymentAwaiting").textContent =
        awaiting;

      $("paymentConfirmed").textContent =
        confirmed;

      $("paymentTotal").textContent =
        money(total);

      const list = $("paymentCheckoutList");

      list.replaceChildren();

      for (const checkout of data) {
        const card = el(
          "article",
          "",
          "card panel"
        );

        card.append(
          el(
            "h3",
            "Checkout " +
            String(
              checkout.checkout_id || ""
            ).slice(0, 8)
          )
        );

        const teamCount =
          Array.isArray(checkout.teams)
            ? checkout.teams.length
            : 0;

        card.append(
          el(
            "p",
            "Status: " +
            (checkout.status || "Unknown") +
            " | " +
            money(checkout.total_amount) +
            " | " +
            teamCount +
            " team(s)"
          )
        );

        await loadPaymentDetails(
          checkout,
          card
        );

        card.append(
          el(
            "p",
            VERIFY_UI_ENABLED
              ? "Payment actions require independent receipt confirmation."
              : "Payment verification and QR issuance remain locked pending tests.",
            "muted"
          )
        );

        list.append(card);
      }

      if (!data.length) {
        list.append(
          el(
            "p",
            "No submitted checkouts " +
            "for this tournament.",
            "muted"
          )
        );
      }

      message(
        data.length +
        " checkout(s) loaded. " +
        "Payment receipt review is available. " +
        (VERIFY_UI_ENABLED ? "Owner verification controls available." : "Verification remains disabled.")
      );

    } catch (error) {
      console.error(
        "Court 822 payment dashboard:",
        error
      );

      message(
        error.message ||
        "Unable to load payments.",
        true
      );

    } finally {
      state.busy = false;

      if (refreshButton) {
        refreshButton.disabled = false;
      }
    }
  }

  $("paymentRefresh")?.addEventListener(
    "click",
    refresh
  );

  $("paymentTournamentSelect")?.addEventListener(
    "change",
    refresh
  );

  document
    .querySelector('[data-tab="payments"]')
    ?.addEventListener("click", refresh);

})();
