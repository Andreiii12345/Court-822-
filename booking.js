(function () {
  const demoSettings = {
    morning_rate: 400,
    afternoon_rate: 500,
    evening_rate: 650,
    open_play_fee: 250
  };

  const demoDays = [
    { date: "2026-10-14", mode: "regular" },
    {
      date: "2026-10-15",
      mode: "open_play",
      event_id: "demo-open",
      start_time: "18:00",
      end_time: "22:00",
      joined: 32,
      max_players: 40
    },
    { date: "2026-10-16", mode: "regular" },
    {
      date: "2026-10-17",
      mode: "open_play",
      event_id: "demo-open-2",
      start_time: "17:00",
      end_time: "21:00",
      joined: 26,
      max_players: 40
    },
    { date: "2026-10-18", mode: "regular" },
    { date: "2026-10-19", mode: "closed" },
    { date: "2026-10-20", mode: "regular" }
  ];

  const demoSlots = [
    {
      id: "d1",
      start_time: "07:00",
      end_time: "08:00",
      rate_key: "morning"
    },
    {
      id: "d2",
      start_time: "09:00",
      end_time: "10:00",
      rate_key: "morning"
    },
    {
      id: "d3",
      start_time: "11:00",
      end_time: "12:00",
      rate_key: "afternoon"
    },
    {
      id: "d4",
      start_time: "13:00",
      end_time: "14:00",
      rate_key: "afternoon"
    },
    {
      id: "d5",
      start_time: "15:00",
      end_time: "16:00",
      rate_key: "afternoon"
    },
    {
      id: "d6",
      start_time: "17:00",
      end_time: "18:00",
      rate_key: "evening"
    },
    {
      id: "d7",
      start_time: "19:00",
      end_time: "20:00",
      rate_key: "evening"
    },
    {
      id: "d8",
      start_time: "21:00",
      end_time: "22:00",
      rate_key: "evening"
    }
  ];

  const state = {
    settings: demoSettings,
    days: demoDays,
    slots: demoSlots,
    day: null,
    slot: null
  };

  const $ = id => document.getElementById(id);

  const timeLabel = value =>
    new Date(`2000-01-01T${value}`).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    });

  const dateLabel = value =>
    new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    });

  const slotPrice = slot =>
    state.settings[`${slot.rate_key}_rate`];

  async function loadData() {
    if (!window.COURT822_CONFIGURED) {
      $("connectionStatus").textContent = "Demo data";
      render();
      return;
    }

    try {
      const [
        settingsResult,
        daysResult,
        slotsResult,
        eventsResult
      ] = await Promise.all([
        courtDb
          .from("site_settings")
          .select("*")
          .eq("id", 1)
          .single(),

        courtDb
          .from("court_days")
          .select("date,mode")
          .gte("date", new Date().toISOString().slice(0, 10))
          .order("date")
          .limit(14),

        courtDb
          .from("time_slots")
          .select("*")
          .eq("active", true)
          .order("start_time"),

        courtDb
          .from("open_play_public")
          .select("*")
      ]);

      if (settingsResult.error) {
        throw settingsResult.error;
      }

      if (daysResult.error) {
        throw daysResult.error;
      }

      if (slotsResult.error) {
        throw slotsResult.error;
      }

      state.settings = settingsResult.data;
      state.slots = slotsResult.data;

      const events = new Map(
        (eventsResult.data || []).map(event => [
          event.event_date,
          event
        ])
      );

      state.days = daysResult.data.map(day => ({
        ...day,
        ...(events.get(day.date) || {})
      }));

      $("connectionStatus").textContent = "Live availability";
      $("connectionStatus").classList.add("success");

      render();
    } catch (error) {
      console.error(error);

      $("connectionStatus").textContent =
        "Could not load schedules";

      showToast(
        "Unable to connect to the booking database."
      );
    }
  }

  function render() {
    if (!state.day && state.days.length) {
      state.day = state.days[0];
    }

    renderDates();
    renderMode();
  }

  function renderDates() {
    $("dateList").innerHTML = state.days
      .map(day => {
        const active =
          state.day?.date === day.date ? " active" : "";

        const modeClass =
          day.mode === "open_play"
            ? " open"
            : day.mode === "closed"
            ? " closed"
            : "";

        const label =
          day.mode === "regular"
            ? "Court booking"
            : day.mode === "open_play"
            ? "Open Play"
            : "Closed";

        const date = new Date(
          `${day.date}T00:00:00`
        );

        return `
          <button
            class="date-card${modeClass}${active}"
            data-date="${day.date}"
          >
            <span>
              ${date
                .toLocaleDateString("en-US", {
                  weekday: "short"
                })
                .toUpperCase()}
            </span>

            <b>${date.getDate()}</b>
            <small>${label}</small>
          </button>
        `;
      })
      .join("");

    document
      .querySelectorAll("[data-date]")
      .forEach(button => {
        button.addEventListener("click", () => {
          state.day = state.days.find(
            day => day.date === button.dataset.date
          );

          state.slot = null;
          render();
        });
      });
  }

  function renderMode() {
    const day = state.day;

    if (!day) {
      return;
    }

    $("regularBooking").classList.toggle(
      "hidden",
      day.mode !== "regular"
    );

    $("openPlayBox").classList.toggle(
      "hidden",
      day.mode !== "open_play"
    );

    $("closedBox").classList.toggle(
      "hidden",
      day.mode !== "closed"
    );

    $("continueButton").disabled =
      day.mode === "closed" ||
      (day.mode === "regular" && !state.slot) ||
      (day.mode === "open_play" &&
        Number(day.joined) >= Number(day.max_players));

    $("summaryDate").textContent =
      dateLabel(day.date);

    $("summaryType").textContent =
      day.mode === "regular"
        ? "Court reservation"
        : day.mode === "open_play"
        ? "Open Play player"
        : "Unavailable";

    if (day.mode === "regular") {
      renderSlots();
    }

    if (day.mode === "open_play") {
      $("openPlayText").textContent =
        `${timeLabel(day.start_time)}–` +
        `${timeLabel(day.end_time)}. ` +
        "Court assignments are managed by the owner.";

      $("openProgress").style.width =
        `${Math.min(
          100,
          Number(day.joined) /
            Number(day.max_players) *
            100
        )}%`;

      $("openCapacity").textContent =
        `${day.joined} of ${day.max_players} joined · ` +
        `${day.max_players - day.joined} spaces remaining`;

      $("summaryTime").textContent =
        `${timeLabel(day.start_time)}–` +
        `${timeLabel(day.end_time)}`;

      $("summaryCapacity").textContent =
        `${day.joined} / ${day.max_players}`;

      $("summaryPrice").textContent =
        `${money(
          day.fee || state.settings.open_play_fee
        )} / player`;

      $("continueButton").textContent =
        "Join Open Play";
    } else if (day.mode === "closed") {
      $("summaryTime").textContent = "—";
      $("summaryCapacity").textContent = "—";
      $("summaryPrice").textContent = "—";
      $("continueButton").textContent = "Unavailable";
    }
  }

  function renderSlots() {
    $("slotList").innerHTML = state.slots
      .map(slot => {
        const active =
          state.slot?.id === slot.id
            ? " active"
            : "";

        return `
          <button
            class="slot-card${active}"
            data-slot="${slot.id}"
          >
            <em>${money(slotPrice(slot))}</em>
            <b>${timeLabel(slot.start_time)}</b>
            <small>
              1 hour · court assigned automatically
            </small>
          </button>
        `;
      })
      .join("");

    document
      .querySelectorAll("[data-slot]")
      .forEach(button => {
        button.addEventListener("click", () => {
          state.slot = state.slots.find(
            slot =>
              String(slot.id) ===
              button.dataset.slot
          );

          renderMode();
        });
      });

    $("summaryTime").textContent =
      state.slot
        ? `${timeLabel(state.slot.start_time)}–` +
          `${timeLabel(state.slot.end_time)}`
        : "Select a time";

    $("summaryCapacity").textContent =
      "Up to 4 players";

    $("summaryPrice").textContent =
      state.slot
        ? money(slotPrice(state.slot))
        : "—";

    $("continueButton").textContent =
      "Continue";

    $("continueButton").disabled =
      !state.slot;
  }

  function openBookingModal() {
    $("modalTitle").textContent =
      state.day.mode === "open_play"
        ? "Join Open Play"
        : "Complete court booking";

    $("modalSchedule").textContent =
      `${dateLabel(state.day.date)} · ` +
      `${$("summaryTime").textContent}`;

    $("playerCountLabel").classList.toggle(
      "hidden",
      state.day.mode === "open_play"
    );

    $("bookingModal").classList.remove("hidden");
  }

  function closeBookingModal() {
    $("bookingModal").classList.add("hidden");
  }

  $("continueButton").addEventListener(
    "click",
    openBookingModal
  );

  const closeButton =
    $("closeModal") ||
    document.querySelector("[data-close]");

  if (closeButton) {
    closeButton.addEventListener(
      "click",
      closeBookingModal
    );
  }

  $("bookingModal").addEventListener(
    "click",
    event => {
      if (event.target === $("bookingModal")) {
        closeBookingModal();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape" &&
        !$("bookingModal").classList.contains("hidden")
      ) {
        closeBookingModal();
      }
    }
  );

  $("bookingForm").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const name =
        $("customerName").value.trim();

      const phone =
        $("customerPhone").value.trim();

      const players =
        Number($("playerCount").value || 1);

      try {
        if (!window.COURT822_CONFIGURED) {
          showToast(
            "Demo booking received. Connect Supabase to save it online."
          );
        } else if (
          state.day.mode === "open_play"
        ) {
          const { error } = await courtDb.rpc(
            "public_join_open_play",
            {
              p_event_id: state.day.event_id,
              p_customer_name: name,
              p_mobile_number: phone
            }
          );

          if (error) {
            throw error;
          }
        } else {
          const { error } = await courtDb.rpc(
            "public_create_booking",
            {
              p_customer_name: name,
              p_mobile_number: phone,
              p_booking_date: state.day.date,
              p_slot_id: state.slot.id,
              p_player_count: players
            }
          );

          if (error) {
            throw error;
          }
        }

        closeBookingModal();
        $("bookingForm").reset();

        showToast(
          "Booking submitted and marked Unpaid."
        );

        if (window.COURT822_CONFIGURED) {
          await loadData();
        }
      } catch (error) {
        console.error(error);

        showToast(
          error.message ||
          "Booking could not be completed."
        );
      }
    }
  );

  loadData();
})();
