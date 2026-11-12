
/*
 COURT 822 V3 — OWNER FREEBIES MANAGER
 Uses existing:
 - courtDb
 - currentId
 - tournament_freebies
 - tournament-admin.html
*/

(function () {
  "use strict";

  const db = window.courtDb;
  const $ = id => document.getElementById(id);

  let selectedTournament = null;
  let loading = false;

  const style = document.createElement("style");
  style.textContent = `
    .freebie-row {
      border:1px solid #ddd3c4;
      border-radius:12px;
      padding:16px;
      margin:12px 0;
      background:#faf8f3;
    }
    .freebie-row h3 {margin:0 0 12px}
    .freebie-grid {
      display:grid;
      grid-template-columns:2fr 1fr;
      gap:12px;
    }
    .freebie-actions {
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      margin-top:12px;
    }
    .freebie-status {
      margin-top:14px;
      padding:12px;
      background:#e6ece7;
      border-radius:9px;
      font-size:13px;
      white-space:pre-wrap;
    }
    @media(max-width:700px) {
      .freebie-grid {grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.id = "freebiesPanel";

  panel.innerHTML = `
    <h2>Tournament Freebies</h2>

    <p class="muted">
      Customize the freebies included in each tournament.
      Each player receives one allocation per freebie,
      regardless of how many categories they enter.
    </p>

    <p id="freebieTournament" class="summary">
      Save or select a tournament first.
    </p>

    <div id="freebiesList"></div>

    <div class="actions">
      <button
        id="addFreebie"
        type="button"
        class="button light">
        + Add Freebie
      </button>
    </div>

    <p id="freebieMessage"
       class="freebie-status"
       role="status">
      Ready.
    </p>
  `;

  const manager = $("manager");

  if (!manager || !db) {
    console.error("Freebies Manager unavailable.");
    return;
  }

  // Insert after the existing tournament selector.
  manager.children[0].after(panel);

  const list = $("freebiesList");
  const addButton = $("addFreebie");

  function status(text) {
    $("freebieMessage").textContent = text;
  }

  function field(label, input) {
    const wrapper = document.createElement("label");
    wrapper.className = "field";
    wrapper.textContent = label;
    wrapper.appendChild(input);
    return wrapper;
  }

  function input(type, value, options = {}) {
    const el = document.createElement("input");
    el.type = type;
    el.value = value ?? "";

    if (options.min !== undefined) el.min = options.min;
    if (options.max !== undefined) el.maxLength = options.max;

    return el;
  }

  function createRow(item = {}) {
    const row = document.createElement("div");
    row.className = "freebie-row";
    row.dataset.id = item.id || "";

    const heading = document.createElement("h3");
    heading.textContent = item.id
      ? "Edit Freebie"
      : "New Freebie";

    const grid = document.createElement("div");
    grid.className = "freebie-grid";

    const name = input("text", item.name || "", {
      max: 100
    });
    name.placeholder = "e.g. Tournament Shirt";
    name.required = true;

    const quantity = input(
      "number",
      item.quantity_per_player ?? 1,
      { min: 1 }
    );
    quantity.step = "1";
    quantity.required = true;

    grid.append(
      field("Freebie Name", name),
      field("Quantity Per Player", quantity)
    );

    const sizeLabel = document.createElement("label");
    sizeLabel.className = "field";

    const size = document.createElement("input");
    size.type = "checkbox";
    size.checked = Boolean(item.requires_size);

    sizeLabel.append(
      size,
      document.createTextNode(" Requires clothing size")
    );

    const activeLabel = document.createElement("label");
    activeLabel.className = "field";

    const active = document.createElement("input");
    active.type = "checkbox";
    active.checked = item.is_active !== false;

    activeLabel.append(
      active,
      document.createTextNode(" Active for this tournament")
    );

    const actions = document.createElement("div");
    actions.className = "freebie-actions";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "button";
    save.textContent = "Save Freebie";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button light";
    remove.textContent = item.id
      ? "Disable Freebie"
      : "Cancel";

    save.addEventListener("click", async () => {
      if (!selectedTournament) {
        status("Select a saved tournament first.");
        return;
      }

      const freebieName = name.value.trim();
      const qty = Number(quantity.value);

      if (!freebieName || !Number.isSafeInteger(qty) || qty < 1) {
        status("Enter a valid name and quantity.");
        return;
      }

      save.disabled = true;
      status("Saving freebie...");

      try {
        const payload = {
          tournament_id: selectedTournament,
          name: freebieName,
          quantity_per_player: qty,
          requires_size: size.checked,
          is_active: active.checked
        };

        let result;

        if (row.dataset.id) {
          result = await db
            .from("tournament_freebies")
            .update(payload)
            .eq("id", row.dataset.id)
            .eq("tournament_id", selectedTournament);
        } else {
          result = await db
            .from("tournament_freebies")
            .insert(payload);
        }

        if (result.error) throw result.error;

        status("Freebie saved successfully.");
        await loadFreebies(selectedTournament);

      } catch (error) {
        console.error("Freebie save:", error);
        status("Save failed: " + error.message);
      } finally {
        save.disabled = false;
      }
    });

    remove.addEventListener("click", async () => {
      if (!row.dataset.id) {
        row.remove();
        return;
      }

      if (!confirm(
        "Disable this freebie? Existing claim records will be kept."
      )) return;

      remove.disabled = true;

      try {
        const { error } = await db
          .from("tournament_freebies")
          .update({ is_active: false })
          .eq("id", row.dataset.id)
          .eq("tournament_id", selectedTournament);

        if (error) throw error;

        status("Freebie disabled.");
        await loadFreebies(selectedTournament);

      } catch (error) {
        status("Unable to disable: " + error.message);
        remove.disabled = false;
      }
    });

    actions.append(save, remove);

    row.append(
      heading,
      grid,
      sizeLabel,
      activeLabel,
      actions
    );

    list.appendChild(row);
  }

  async function loadFreebies(tournamentId) {
    selectedTournament = tournamentId || null;
    list.replaceChildren();

    if (!selectedTournament) {
      $("freebieTournament").textContent =
        "Save or select a tournament first.";
      addButton.disabled = true;
      status("No tournament selected.");
      return;
    }

    addButton.disabled = false;
    $("freebieTournament").textContent =
      "Managing freebies for the selected tournament.";

    loading = true;

    try {
      const { data, error } = await db
        .from("tournament_freebies")
        .select(
          "id,name,quantity_per_player,requires_size,is_active"
        )
        .eq("tournament_id", selectedTournament)
        .order("created_at", { ascending: true });

      if (error) throw error;

      (data || []).forEach(createRow);

      status(
        data?.length
          ? `${data.length} freebie(s) loaded.`
          : "No freebies yet. Click Add Freebie."
      );

    } catch (error) {
      console.error("Freebie loading:", error);
      status("Unable to load freebies: " + error.message);
    } finally {
      loading = false;
    }
  }

  addButton.addEventListener("click", () => {
    if (!selectedTournament || loading) return;
    createRow();
  });

  // Follow the existing tournament manager selection.
  $("existing").addEventListener("change", event => {
    loadFreebies(event.target.value);
  });

  $("newTournament").addEventListener("click", () => {
    loadFreebies(null);
  });

  // Refresh after the existing tournament save finishes.
  // The existing save flow updates the selected tournament ID.
  const originalLoadOne = window.loadOne;

  if (typeof originalLoadOne === "function") {
    window.loadOne = async function(id) {
      const result = await originalLoadOne(id);
      await loadFreebies(id);
      return result;
    };
  }

  // Existing script may expose loadOne as a global function.
  // Load when the owner selects a tournament.
  addButton.disabled = true;
  loadFreebies(null);
})();
