"use strict";

const state = {
  status: null,
  currentPatch: null,
  busy: false,
  activeLibraryButton: null,
  live: false,
  liveOrigin: null,
  liveTimer: null,
  liveClosing: null,
  livePolling: false,
  liveFailures: 0,
  libraryItems: [],
  deviceLibraryItems: [],
  localLibrary: { patches: [], liveSets: [], warnings: [] },
  librarySource: "device",
  currentLocalSource: null,
  libraryBanked: true,
  libraryView: "list",
  activeLibraryKey: null,
  storeDraft: null,
  pendingNameEdit: null,
  knobLabelMode: "hardware"
};
const $ = (selector) => document.querySelector(selector);
const controlMapping = Me80ControlMapping;
const effectChainMapping = Me80EffectChain;
const knobLabels = Me80KnobLabels;
const KNOB_LABEL_MODE_KEY = "me80-knob-label-mode";

const effectDefinitions = [
  { key: "amp", label: "PREAMP", switchField: "amp_sw", typeField: "amp_type", params: ["amp1", "amp2", "amp3", "amp4", "amp5"], parameterLabels: ["GAIN", "BASS", "MIDDLE", "TREBLE", "LEVEL"], angles: [-137, -103, -69, -35, 0, 35, 69, 103, 137] },
  { key: "fx2", label: "EQ / FX2", switchField: "fx2_sw", typeField: "fx2_type", params: ["fx2_1", "fx2_2", "fx2_3", "fx2_4"], parameterLabels: ["BASS / DRIVE / TIME", "MIDDLE / RATE / FB", "TREBLE / DEPTH", "LEVEL"], angles: [-132, -82, -28, 25, 80, 134] },
  { key: "rev", label: "REVERB", switchField: "rev_sw", typeField: "rev_type", params: [] },
  { key: "pdlfx", label: "PEDAL FX", switchField: "pdlfx_sw", typeField: "pdlfx_type", params: [], angles: [-138, -109, -79, -49, -19, 17, 49, 79, 109, 138] },
  { key: "comp", label: "COMP / FX1", switchField: "comp_sw", typeField: "comp_type", params: ["comp1", "comp2", "comp3"], parameterLabels: ["SUSTAIN / SENS / -1 OCT", "ATTACK / TONE / -2 OCT", "LEVEL / PEAK / DIRECT"], angles: [-139, -112, -84, -56, -28, 0, 28, 56, 84, 112, 139] },
  { key: "odds", label: "OD / DS", switchField: "odds_sw", typeField: "odds_type", params: ["odds1", "odds2", "odds3"], parameterLabels: ["DRIVE", "TONE", "LEVEL"], angles: [-139, -111, -83, -55, -27, 1, 29, 57, 85, 113, 139] },
  { key: "mod", label: "MOD", switchField: "mod_sw", typeField: "mod_type", params: ["mod1", "mod2", "mod3"], parameterLabels: ["RATE / KEY", "DEPTH / HARMONY", "E.LEVEL / RESONANCE"], angles: [-139, -113, -86, -58, -30, -2, 27, 56, 84, 112, 139] },
  { key: "dly", label: "DELAY", switchField: "dly_sw", typeField: "dly_type", params: ["dly1", "dly2", "dly3"], parameterLabels: ["TIME", "FEEDBACK", "E.LEVEL"], angles: [-139, -112, -85, -57, -29, -1, 27, 55, 83, 111, 139] }
];

const ctlEffects = [
  { key: "comp", label: "COMP / FX1", bit: 0x01 }, { key: "odds", label: "OD / DS", bit: 0x02 },
  { key: "mod", label: "MOD", bit: 0x04 }, { key: "dly", label: "DELAY", bit: 0x08 },
  { key: "amp", label: "PREAMP", bit: 0x10 }, { key: "fx2", label: "EQ / FX2", bit: 0x20 },
  { key: "rev", label: "REVERB", bit: 0x40 }, { key: "pdlfx", label: "PEDAL FX", bit: 0x80 }
];

const ctlKnobTargets = [
  ["comp", "comp1", "COMP / FX1 · SUSTAIN / SENS / -1 OCT"], ["comp", "comp2", "COMP / FX1 · ATTACK / TONE / -2 OCT"], ["comp", "comp3", "COMP / FX1 · LEVEL / PEAK / DIRECT"],
  ["odds", "odds1", "OD / DS · DRIVE"], ["odds", "odds2", "OD / DS · TONE"], ["odds", "odds3", "OD / DS · LEVEL"],
  ["mod", "mod1", "MOD · RATE / KEY"], ["mod", "mod2", "MOD · DEPTH / HARMONY"], ["mod", "mod3", "MOD · E.LEVEL / RESONANCE"],
  ["dly", "dly1", "DELAY · TIME"], ["dly", "dly2", "DELAY · FEEDBACK"], ["dly", "dly3", "DELAY · E.LEVEL"],
  ["amp", "amp1", "PREAMP · GAIN"], ["amp", "amp2", "PREAMP · BASS"], ["amp", "amp3", "PREAMP · MIDDLE"], ["amp", "amp4", "PREAMP · TREBLE"], ["amp", "amp5", "PREAMP · LEVEL"],
  ["fx2", "fx2_1", "EQ / FX2 · BASS / DRIVE / TIME"], ["fx2", "fx2_2", "EQ / FX2 · MIDDLE / RATE / FB"], ["fx2", "fx2_3", "EQ / FX2 · TREBLE / DEPTH"], ["fx2", "fx2_4", "EQ / FX2 · LEVEL"]
].map(([effect, field, label], target) => ({ effect, field, label, target }));

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function angleFromPointer(event, element) {
  const rect = element.getBoundingClientRect();
  const x = event.clientX - (rect.left + (rect.width / 2));
  const y = event.clientY - (rect.top + (rect.height / 2));
  return controlMapping.normalizeAngle(Math.atan2(x, -y) * (180 / Math.PI));
}

async function api(path, options = {}) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("The native Tauri bridge is unavailable.");
  const requestBody = options.body === undefined ? {} : JSON.parse(options.body);
  try {
    return await invoke("api", { path, method: options.method || "GET", body: requestBody });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : (error?.message || String(error)));
  }
}

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show${error ? " error" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3200);
}

function setBusy(busy) {
  state.busy = busy;
  $("#audition").disabled = busy || !state.currentPatch || state.live;
  $("#store").disabled = busy || !state.currentPatch;
  $("#read-current").disabled = busy;
  $("#refresh-ports").disabled = busy;
  updateLiveControls();
}

function normalLiveStatus() {
  return state.liveOrigin === "pedal" ? "On · pedal patch" : "On · editor patch";
}

function updateLiveControls() {
  const card = $(".live-card");
  card.classList.toggle("active", state.live);
  $(".audition-card").classList.toggle("hidden", state.live);
  $("#audition").disabled = state.busy || !state.currentPatch || state.live;
  $("#live-sync").checked = state.live;
  $("#live-sync").disabled = state.busy || !state.live;
  $("#live-from-pedal").disabled = state.busy || state.live;
  $("#live-from-editor").disabled = state.busy || state.live || !state.currentPatch;
  $("#input-port").disabled = state.busy || state.live;
  $("#output-port").disabled = state.busy || state.live;
  $("#refresh-ports").disabled = state.busy || state.live;
  $("#read-current").classList.toggle("hidden", state.live);
  $("#live-description").textContent = state.live
    ? (state.liveOrigin === "pedal"
      ? "Started from the pedal's active patch. Changes now synchronize both ways and remain temporary."
      : "The editor patch was loaded into pedal temporary memory. Changes now synchronize both ways and remain temporary.")
    : "Choose which patch should become the starting point. Live changes remain temporary until Store is explicitly used.";
  if (!state.live) $("#live-status").textContent = "Off";
}

function selectedPorts() {
  const inputIndex = Number.parseInt($("#input-port").value, 10);
  const outputIndex = Number.parseInt($("#output-port").value, 10);
  if (!Number.isInteger(inputIndex) || !Number.isInteger(outputIndex)) throw new Error("Select both normal ME-80 MIDI ports.");
  return { inputIndex, outputIndex };
}

function renderPortSelect(select, ports, suggested) {
  select.replaceChildren();
  for (const port of ports) {
    const option = document.createElement("option");
    option.value = String(port.index);
    option.textContent = `[${port.index}] ${port.name}`;
    if (port.index === suggested) option.selected = true;
    select.append(option);
  }
}

async function refreshStatus() {
  try {
    const status = await api("/api/status");
    state.status = status;
    renderPortSelect($("#input-port"), status.inputs.filter((port) => port.normal), status.suggestedInput);
    renderPortSelect($("#output-port"), status.outputs.filter((port) => port.normal), status.suggestedOutput);
    const connected = status.suggestedInput !== undefined && status.suggestedOutput !== undefined;
    $("#status-dot").classList.toggle("online", connected);
    $("#status-label").textContent = connected ? "ME-80 connected" : "ME-80 not found";
    $("#status-detail").textContent = connected ? `Input ${status.suggestedInput} · Output ${status.suggestedOutput}` : "Reconnect USB and refresh";
  } catch (error) {
    $("#status-label").textContent = "MIDI check failed";
    $("#status-detail").textContent = error.message;
    showToast(error.message, true);
  }
}

function patchButton(slot, name, onClick, key = slot) {
  const button = document.createElement("button");
  button.className = "patch-item";
  button.dataset.libraryKey = key;
  button.title = `${slot} · ${name || "(unnamed)"}`;
  button.setAttribute("aria-label", button.title);
  const slotNode = document.createElement("span");
  slotNode.className = "slot";
  slotNode.textContent = slot;
  slotNode.dataset.number = slot.includes("-") ? slot.split("-").at(-1) : slot;
  const nameNode = document.createElement("strong");
  nameNode.textContent = name || "(unnamed)";
  button.append(slotNode, nameNode);
  button.addEventListener("click", async () => {
    const wasLive = state.live;
    try {
      setBusy(true);
      if (wasLive) $("#live-status").textContent = `Loading ${slot}…`;
      const patch = await onClick();

      if (wasLive) {
        // Keep the existing editor-mode connection alive while changing patches.
        // Ordinary audition deliberately closes that connection first.
        const result = await api("/api/device/live-load", {
          method: "POST",
          body: JSON.stringify({ ...selectedPorts(), sessionId: patch.id, confirm: "LIVE_SYNC" })
        });
        addMidiLogs(result.logs);
        state.liveOrigin = "editor";
        state.liveFailures = 0;
      }

      if (state.activeLibraryButton) state.activeLibraryButton.classList.remove("active");
      state.activeLibraryKey = key;
      state.activeLibraryButton = $("#patch-list").querySelector(`[data-library-key="${CSS.escape(key)}"]`) || button;
      state.activeLibraryButton.classList.add("active");
      setPatch(patch, { preserveLive: wasLive });

      if (wasLive) {
        $("#live-status").textContent = normalLiveStatus();
        addActivity("LIVE", `${slot} loaded into temporary memory; synchronization remains on.`);
        showToast(`${slot} loaded temporarily; Live Sync remains on.`);
      }
    } catch (error) {
      showToast(error.message, true);
      addActivity(wasLive ? "LOAD ISSUE" : "ERROR", error.message, true);
      if (wasLive && state.live) $("#live-status").textContent = normalLiveStatus();
    } finally {
      setBusy(false);
    }
  });
  return button;
}

function makeBank(items, label) {
  const bank = document.createElement("section");
  bank.className = "patch-bank";
  const heading = document.createElement("div");
  heading.className = "patch-bank-heading";
  heading.textContent = label;
  const patches = document.createElement("div");
  patches.className = "patch-bank-items";
  for (const item of items) patches.append(patchButton(item.slot, item.name, item.onClick, item.key));
  bank.append(heading, patches);
  return bank;
}

function renderLibrary() {
  if (state.librarySource === "local") {
    renderLocalLibrary();
    return;
  }
  const list = $("#patch-list");
  list.replaceChildren();
  list.className = `patch-list ${state.libraryView}-view${state.libraryBanked ? " banked" : " unbanked"}`;

  if (state.libraryBanked) {
    const banks = new Map();
    for (const item of state.libraryItems) {
      const match = /^([UP]\d)-[1-4]$/u.exec(item.slot);
      const label = match ? match[1] : "Other";
      if (!banks.has(label)) banks.set(label, []);
      banks.get(label).push(item);
    }
    for (const [label, items] of banks) list.append(makeBank(items, label));
  } else if (state.libraryView === "banks") {
    for (let index = 0; index < state.libraryItems.length; index += 4) {
      const items = state.libraryItems.slice(index, index + 4);
      list.append(makeBank(items, `${index + 1}–${index + items.length}`));
    }
  } else {
    for (const item of state.libraryItems) list.append(patchButton(item.slot, item.name, item.onClick, item.key));
  }

  state.activeLibraryButton = state.activeLibraryKey
    ? list.querySelector(`[data-library-key="${CSS.escape(state.activeLibraryKey)}"]`)
    : null;
  if (state.activeLibraryButton) state.activeLibraryButton.classList.add("active");
}

function setLibraryView(view) {
  state.libraryView = view === "banks" ? "banks" : "list";
  $("#patch-view-list").setAttribute("aria-pressed", String(state.libraryView === "list"));
  $("#patch-view-banks").setAttribute("aria-pressed", String(state.libraryView === "banks"));
  try { localStorage.setItem("me80-patch-library-view", state.libraryView); } catch { /* Storage is optional. */ }
  renderLibrary();
}

function deviceLibraryItem(patch) {
  return {
    slot: patch.slot,
    name: patch.name,
    key: patch.slot,
    onClick: async () => {
      const result = await api("/api/library/load-device", { method: "POST", body: JSON.stringify({ slot: patch.slot }) });
      state.currentLocalSource = null;
      return result.patch;
    }
  };
}

function updateStoredDevicePatch(slot, name) {
  const item = state.deviceLibraryItems.find((candidate) => candidate.slot === slot);
  if (item) item.name = name;
  else state.deviceLibraryItems.push(deviceLibraryItem({ slot, name }));
  if (state.librarySource === "device") {
    state.libraryItems = state.deviceLibraryItems;
    $("#backup-date").textContent = `${state.deviceLibraryItems.length} PATCHES`;
    renderLibrary();
  }
}

async function loadDeviceLibrary() {
  $("#backup-date").textContent = "Reading…";
  $("#library-loader").classList.remove("hidden");
  $("#patch-list").setAttribute("aria-busy", "true");
  try {
    setBusy(true);
    const library = await api("/api/library/device", {
      method: "POST",
      body: JSON.stringify(selectedPorts())
    });
    $("#backup-date").textContent = `${library.patches.length} PATCHES`;
    $("#library-label").textContent = "USER + PRESET";
    state.libraryBanked = true;
    state.deviceLibraryItems = library.patches.map(deviceLibraryItem);
    state.libraryItems = state.deviceLibraryItems;
    addMidiLogs(library.logs);
    if (state.librarySource === "device") renderLibrary();
  } catch (error) {
    $("#backup-date").textContent = "Unavailable";
    showToast(error.message, true);
  } finally {
    $("#library-loader").classList.add("hidden");
    $("#patch-list").removeAttribute("aria-busy");
    setBusy(false);
  }
}

function localActionButton(label, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.addEventListener("click", (event) => { event.stopPropagation(); onClick(); });
  return button;
}

async function localMutation(path, body, success) {
  try {
    setBusy(true);
    await api(path, { method: "POST", body: JSON.stringify(body) });
    await loadLocalLibrary();
    if (success) showToast(success);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

function renderLocalPatchRow(item, source, actions = []) {
  const row = document.createElement("div");
  row.className = "local-patch-row";
  const button = patchButton(source.kind === "patch" ? "PATCH" : String(source.index + 1).padStart(2, "0"), item.name, async () => {
    const result = await api("/api/local/load", { method: "POST", body: JSON.stringify(source) });
    state.currentLocalSource = source;
    return result.patch;
  }, `local-${source.kind}-${source.id}-${source.index ?? "one"}`);
  row.append(button);
  if (actions.length) {
    const controls = document.createElement("div");
    controls.className = "local-row-actions";
    actions.forEach((action) => controls.append(action));
    row.append(controls);
  }
  return row;
}

function renderLocalLibrary() {
  const list = $("#patch-list");
  list.replaceChildren();
  list.className = "patch-list list-view unbanked";
  for (const patch of state.localLibrary.patches) {
    const rename = localActionButton("✎", "Rename patch", async () => {
      const name = window.prompt("Patch name (1–16 characters)", patch.name);
      if (name) await localMutation("/api/local/rename", { kind: "patch", id: patch.id, name }, "Patch renamed.");
    });
    const remove = localActionButton("×", "Delete patch", async () => {
      if (window.confirm(`Delete local patch “${patch.name}”?`)) await localMutation("/api/local/delete", { kind: "patch", id: patch.id }, "Patch deleted.");
    });
    const duplicate = localActionButton("⧉", "Duplicate patch", () => localMutation("/api/local/duplicate", { kind: "patch", id: patch.id }, "Patch duplicated."));
    list.append(renderLocalPatchRow(patch, { kind: "patch", id: patch.id }, [duplicate, rename, remove]));
  }
  for (const liveSet of state.localLibrary.liveSets) {
    const section = document.createElement("section");
    section.className = "local-set";
    const heading = document.createElement("div");
    heading.className = "local-set-heading";
    const title = document.createElement("strong");
    title.textContent = `${liveSet.name} · ${liveSet.patches.length}`;
    const controls = document.createElement("div");
    controls.className = "local-set-actions";
    controls.append(
      localActionButton("+", "Add the patch currently open in the editor", async () => {
        if (!state.currentPatch) return showToast("Open a patch first.", true);
        await localMutation("/api/local/add-to-set", { setId: liveSet.id, sessionId: state.currentPatch.id }, "Patch added to Live Set.");
      }),
      localActionButton("✎", "Rename Live Set", async () => {
        const name = window.prompt("Live Set name", liveSet.name);
        if (name) await localMutation("/api/local/rename", { kind: "liveSet", id: liveSet.id, name }, "Live Set renamed.");
      }),
      localActionButton("⧉", "Duplicate Live Set", () => localMutation("/api/local/duplicate", { kind: "liveSet", id: liveSet.id }, "Live Set duplicated.")),
      localActionButton("×", "Delete Live Set", async () => {
        if (window.confirm(`Delete Live Set “${liveSet.name}”?`)) await localMutation("/api/local/delete", { kind: "liveSet", id: liveSet.id }, "Live Set deleted.");
      })
    );
    heading.append(title, controls);
    section.append(heading);
    for (const item of liveSet.patches) {
      const up = localActionButton("↑", "Move up", async () => {
        if (item.index > 0) await localMutation("/api/local/move-live-patch", { id: liveSet.id, from: item.index, to: item.index - 1 });
      });
      const down = localActionButton("↓", "Move down", async () => {
        if (item.index + 1 < liveSet.patches.length) await localMutation("/api/local/move-live-patch", { id: liveSet.id, from: item.index, to: item.index + 1 });
      });
      const remove = localActionButton("×", "Remove from Live Set", async () => {
        if (window.confirm(`Remove “${item.name}” from “${liveSet.name}”?`)) await localMutation("/api/local/remove-live-patch", { id: liveSet.id, index: item.index }, "Patch removed from Live Set.");
      });
      section.append(renderLocalPatchRow(item, { kind: "liveSet", id: liveSet.id, index: item.index }, [up, down, remove]));
    }
    list.append(section);
  }
  if (!state.localLibrary.patches.length && !state.localLibrary.liveSets.length) {
    const empty = document.createElement("p");
    empty.className = "local-empty";
    empty.textContent = "No local patches or Live Sets yet. Save the open patch, create a set, or import a .tsl file.";
    list.append(empty);
  }
}

async function loadLocalLibrary() {
  try {
    const library = await api("/api/local/list");
    state.localLibrary = library;
    $("#library-label").textContent = "LOCAL LIBRARY";
    $("#backup-date").textContent = `${library.patches.length + library.liveSets.length} FILES`;
    renderLocalLibrary();
    if (library.warnings.length) addActivity("LIBRARY", `${library.warnings.length} invalid file(s) ignored.`, true);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function setLibrarySource(source) {
  state.librarySource = source;
  $("#source-device").setAttribute("aria-selected", String(source === "device"));
  $("#source-local").setAttribute("aria-selected", String(source === "local"));
  $("#local-actions").classList.toggle("hidden", source !== "local");
  $("#read-current").classList.toggle("hidden", source !== "device");
  $(".view-switch").classList.toggle("hidden", source === "local");
  if (source === "local") await loadLocalLibrary();
  else {
    state.libraryItems = state.deviceLibraryItems;
    $("#library-label").textContent = "USER + PRESET";
    $("#backup-date").textContent = `${state.deviceLibraryItems.length} PATCHES`;
    renderLibrary();
  }
}

function setPatch(patch, { preserveLive = false } = {}) {
  if (!preserveLive && state.live && state.currentPatch && state.currentPatch.id !== patch.id) void stopLive();
  state.currentPatch = patch;
  $("#empty-state").classList.add("hidden");
  $("#editor").classList.remove("hidden");
  $("#audition").disabled = state.busy || state.live;
  $("#store").disabled = state.busy;
  updateLiveControls();
  renderPatch();
}

function updateKnobFace(knob, value, minimum, maximum) {
  const angle = controlMapping.valueToAngle(value, minimum, maximum);
  knob.style.setProperty("--knob-angle", `${angle}deg`);
  knob.setAttribute("aria-valuenow", String(value));
}

function makeKnobFace(className) {
  const knob = document.createElement("span");
  knob.className = `knob-face ${className}`;
  const rotor = document.createElement("span");
  rotor.className = "knob-rotor";
  const indicator = document.createElement("span");
  indicator.className = "knob-indicator";
  rotor.append(indicator);
  knob.append(rotor);
  return knob;
}

function renderKnobLabel(label, model) {
  label.replaceChildren();
  label.classList.toggle("current-only", state.knobLabelMode === knobLabels.LABEL_MODES.CURRENT);
  label.classList.toggle("unused", !model.activeFunction);
  if (!model.segments.length) {
    label.textContent = "—";
    return;
  }
  model.segments.forEach((segment, index) => {
    if (index) {
      const separator = document.createElement("span");
      separator.className = "knob-label-separator";
      separator.textContent = " / ";
      label.append(separator);
    }
    const part = document.createElement("span");
    part.className = `knob-label-part${segment.active ? " active" : ""}`;
    part.textContent = segment.text;
    label.append(part);
  });
}

function makeContinuousKnob(definition, parameterIndex, field, value, labelText, typeIndex, maximum = 99) {
  const control = document.createElement("label");
  control.className = "continuous-knob-control";
  const label = document.createElement("span");
  label.className = "knob-label";
  const labelModel = knobLabels.describe(definition.key, typeIndex, parameterIndex, labelText, state.knobLabelMode);
  renderKnobLabel(label, labelModel);
  const output = document.createElement("output");
  output.textContent = String(value);
  const knob = makeKnobFace("continuous-knob");
  knob.tabIndex = 0;
  knob.setAttribute("role", "slider");
  const accessibleFunction = labelModel.activeFunction || "Unused parameter";
  knob.setAttribute("aria-label", `${definition.label} ${accessibleFunction}`);
  control.title = labelModel.activeFunction ? `Current function: ${labelModel.activeFunction}` : "Not used by the selected effect type";
  knob.setAttribute("aria-valuemin", "0");
  knob.setAttribute("aria-valuemax", String(maximum));
  updateKnobFace(knob, value, 0, maximum);

  let preview = value;
  const show = (next) => {
    preview = clamp(next, 0, maximum);
    output.textContent = String(preview);
    updateKnobFace(knob, preview, 0, maximum);
  };
  knob.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    knob.focus();
    knob.setPointerCapture(event.pointerId);
    const move = (moveEvent) => show(controlMapping.angleToValue(angleFromPointer(moveEvent, knob), 0, maximum));
    const finish = () => {
      knob.removeEventListener("pointermove", move);
      knob.removeEventListener("pointerup", finish);
      knob.removeEventListener("pointercancel", finish);
      if (preview !== value) editField(field, preview);
    };
    knob.addEventListener("pointermove", move);
    knob.addEventListener("pointerup", finish);
    knob.addEventListener("pointercancel", finish);
    move(event);
  });
  knob.addEventListener("keydown", (event) => {
    const increments = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    let next = preview;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = maximum;
    else if (increments[event.key] !== undefined) next += increments[event.key];
    else return;
    event.preventDefault();
    next = clamp(next, 0, maximum);
    show(next);
    if (next !== value) editField(field, next);
  });
  control.append(label, knob, output);
  return control;
}

function makeOptionKnob(definition, decoded) {
  const labels = state.status.effectTypes[definition.key];
  const angles = definition.angles;
  if (!Array.isArray(angles) || angles.length !== labels.length) {
    throw new Error(`${definition.label} requires one explicit angle for every option.`);
  }
  let selected = decoded.types[definition.key];
  const control = document.createElement("div");
  control.className = "option-knob-control";
  const stage = document.createElement("div");
  stage.className = "option-knob-stage";
  const knob = makeKnobFace("option-knob");
  knob.tabIndex = 0;
  knob.setAttribute("role", "slider");
  knob.setAttribute("aria-label", `${definition.label} type`);
  knob.setAttribute("aria-valuemin", "0");
  knob.setAttribute("aria-valuemax", String(labels.length - 1));
  const optionButtons = labels.map((label, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "option-label";
    option.textContent = label;
    option.title = label;
    const radians = angles[index] * (Math.PI / 180);
    option.style.setProperty("--option-x", `${50 + (Math.sin(radians) * 45)}%`);
    option.style.setProperty("--option-y", `${50 - (Math.cos(radians) * 45)}%`);
    option.addEventListener("click", () => {
      if (index !== selected) editField(definition.typeField, index);
    });
    stage.append(option);
    return option;
  });

  const show = (index) => {
    selected = clamp(index, 0, labels.length - 1);
    knob.style.setProperty("--knob-angle", `${angles[selected]}deg`);
    knob.setAttribute("aria-valuenow", String(selected));
    knob.setAttribute("aria-valuetext", labels[selected]);
    optionButtons.forEach((option, index) => option.classList.toggle("selected", index === selected));
  };
  show(selected);

  knob.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    knob.focus();
    knob.setPointerCapture(event.pointerId);
    const choose = (pointerEvent) => show(controlMapping.nearestOptionIndex(angleFromPointer(pointerEvent, knob), angles));
    const finish = () => {
      knob.removeEventListener("pointermove", choose);
      knob.removeEventListener("pointerup", finish);
      knob.removeEventListener("pointercancel", finish);
      if (selected !== decoded.types[definition.key]) editField(definition.typeField, selected);
    };
    choose(event);
    knob.addEventListener("pointermove", choose);
    knob.addEventListener("pointerup", finish);
    knob.addEventListener("pointercancel", finish);
  });
  knob.addEventListener("keydown", (event) => {
    let next = selected;
    if (["ArrowUp", "ArrowRight"].includes(event.key)) next += 1;
    else if (["ArrowDown", "ArrowLeft"].includes(event.key)) next -= 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = labels.length - 1;
    else return;
    event.preventDefault();
    next = clamp(next, 0, labels.length - 1);
    show(next);
    if (next !== decoded.types[definition.key]) editField(definition.typeField, next);
  });
  stage.append(knob);
  control.append(stage);
  return control;
}

function makeCardHeader(definition, decoded, enabled) {
  const head = document.createElement("div");
  head.className = "effect-card-head";
  const indicator = document.createElement("span");
  indicator.className = "effect-indicator";
  const title = document.createElement("div");
  title.className = "effect-card-title";
  const strong = document.createElement("strong");
  strong.textContent = definition.label;
  const small = document.createElement("small");
  small.textContent = decoded.typeNames[definition.key] || `Type ${decoded.types[definition.key]}`;
  title.append(strong, small);
  const toggleLabel = document.createElement("label");
  toggleLabel.className = "effect-switch";
  toggleLabel.title = `${definition.label} on/off`;
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = enabled;
  toggle.setAttribute("aria-label", `${definition.label} on/off`);
  const switchFace = document.createElement("span");
  toggle.addEventListener("change", () => editField(definition.switchField, toggle.checked ? 1 : 0));
  toggleLabel.append(toggle, switchFace);
  head.append(indicator, title, toggleLabel);
  return head;
}

function makeReverbCard(definition, decoded, enabled) {
  const card = document.createElement("section");
  card.className = `effect-card reverb-card${enabled ? "" : " off"}`;
  card.dataset.effect = definition.key;
  card.append(makeCardHeader(definition, decoded, enabled));

  const typeIndex = clamp(decoded.types.rev, 0, controlMapping.REVERB_TYPES.length - 1);
  const level = clamp(decoded.reverbLevel, 0, controlMapping.REVERB_SECTION_SIZE - 1);
  let position = controlMapping.reverbToPosition(typeIndex, level);
  const control = document.createElement("div");
  control.className = "reverb-control";
  const stage = document.createElement("div");
  stage.className = "reverb-stage";
  const knob = makeKnobFace("reverb-knob");
  knob.tabIndex = 0;
  knob.setAttribute("role", "slider");
  knob.setAttribute("aria-label", "Reverb type and level");
  knob.setAttribute("aria-valuemin", "0");
  knob.setAttribute("aria-valuemax", String(controlMapping.REVERB_POSITION_MAX));
  const output = document.createElement("output");
  output.className = "reverb-readout";
  const show = (nextPosition) => {
    position = clamp(nextPosition, 0, controlMapping.REVERB_POSITION_MAX);
    const mapped = controlMapping.positionToReverb(position);
    updateKnobFace(knob, position, 0, controlMapping.REVERB_POSITION_MAX);
    knob.setAttribute("aria-valuetext", `${mapped.type} ${mapped.level}`);
    output.textContent = String(mapped.level);
    stage.dataset.section = String(mapped.typeIndex);
  };
  const commit = () => {
    const mapped = controlMapping.positionToReverb(position);
    editReverb(mapped.typeIndex, mapped.level);
  };

  controlMapping.REVERB_TYPES.forEach((label, index) => {
    const section = document.createElement("button");
    section.type = "button";
    section.className = `reverb-sector reverb-sector-${index}`;
    section.textContent = label;
    section.setAttribute("aria-label", `Select ${label} reverb while preserving level`);
    section.addEventListener("click", () => {
      show(controlMapping.reverbToPosition(index, controlMapping.positionToReverb(position).level));
      commit();
    });
    stage.append(section);
  });
  show(position);
  knob.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    knob.focus();
    knob.setPointerCapture(event.pointerId);
    const choose = (pointerEvent) => {
      show(controlMapping.angleToValue(angleFromPointer(pointerEvent, knob), 0, controlMapping.REVERB_POSITION_MAX));
    };
    const finish = () => {
      knob.removeEventListener("pointermove", choose);
      knob.removeEventListener("pointerup", finish);
      knob.removeEventListener("pointercancel", finish);
      commit();
    };
    choose(event);
    knob.addEventListener("pointermove", choose);
    knob.addEventListener("pointerup", finish);
    knob.addEventListener("pointercancel", finish);
  });
  knob.addEventListener("keydown", (event) => {
    let next = position;
    if (["ArrowUp", "ArrowRight"].includes(event.key)) next += 1;
    else if (["ArrowDown", "ArrowLeft"].includes(event.key)) next -= 1;
    else if (event.key === "PageUp") next += 5;
    else if (event.key === "PageDown") next -= 5;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = controlMapping.REVERB_POSITION_MAX;
    else return;
    event.preventDefault();
    show(clamp(next, 0, controlMapping.REVERB_POSITION_MAX));
    commit();
  });
  stage.append(knob, output);
  control.append(stage);
  card.append(control);
  return card;
}

function renderPatch() {
  const patch = state.currentPatch;
  if (!patch) return;
  const decoded = patch.decoded;
  $("#patch-source").textContent = patch.sourceLabel;
  $("#patch-name").value = decoded.name.text;
  $("#change-count").textContent = String(patch.changes.length);
  $("#raw-data").textContent = patch.dataHex;
  $("#ns-thresh").value = String(decoded.noiseSuppressorThreshold);
  $("#ns-value").textContent = String(decoded.noiseSuppressorThreshold);
  renderSignalChain(decoded);
  renderCtl(decoded);

  const chain = $("#effect-chain");
  chain.replaceChildren();
  for (const definition of effectDefinitions) {
    const enabled = decoded.switches[definition.key] === 1;
    if (definition.key === "rev") {
      chain.append(makeReverbCard(definition, decoded, enabled));
      continue;
    }

    const card = document.createElement("section");
    card.className = `effect-card${enabled ? "" : " off"}`;
    card.dataset.effect = definition.key;
    card.append(makeCardHeader(definition, decoded, enabled), makeOptionKnob(definition, decoded));

    if (definition.params.length) {
      const parameters = document.createElement("div");
      parameters.className = "parameter-grid";
      const values = decoded.parameters[definition.key];
      definition.params.forEach((field, index) => {
        parameters.append(makeContinuousKnob(definition, index, field, values[index], definition.parameterLabels[index], decoded.types[definition.key]));
      });
      card.append(parameters);
    }
    chain.append(card);
  }
}

function ctlCode(control) {
  return ((control.targetBytes[0] & 0x0f) << 4) | (control.targetBytes[1] & 0x0f);
}

function ctlTargetBytes(code) {
  return { high: (code >> 4) & 0x0f, low: code & 0x0f };
}

function ctlKnobCurrentValue(decoded, target) {
  const definition = ctlKnobTargets[target];
  if (!definition) return 0;
  const sectionTargets = ctlKnobTargets.filter((item) => item.effect === definition.effect);
  const index = sectionTargets.findIndex((item) => item.target === target);
  return decoded.parameters[definition.effect][index];
}

function renderCtl(decoded) {
  const control = decoded.control;
  const effectsMode = control.assignmentType === "effects";
  const code = ctlCode(control);
  document.querySelectorAll('input[name="ctl-kind"]').forEach((input) => { input.checked = input.value === control.assignmentType; });
  $("#ctl-mode").value = String(control.mode);
  $("#ctl-effects").classList.toggle("hidden", !effectsMode);
  $("#ctl-knob").classList.toggle("hidden", effectsMode);

  const effects = $("#ctl-effects");
  effects.replaceChildren();
  for (const definition of ctlEffects) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const text = document.createElement("span");
    input.type = "checkbox";
    input.checked = (code & definition.bit) !== 0;
    input.dataset.bit = String(definition.bit);
    text.textContent = definition.label;
    input.addEventListener("change", () => {
      let mask = 0;
      effects.querySelectorAll("input:checked").forEach((item) => { mask |= Number(item.dataset.bit); });
      const target = ctlTargetBytes(mask);
      editFields([{ field: "ctrl_knob_value", value: 100 }, { field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }]);
    });
    label.append(input, text);
    effects.append(label);
  }

  const targetSelect = $("#ctl-knob-target");
  targetSelect.replaceChildren();
  for (const target of ctlKnobTargets) {
    const option = document.createElement("option");
    option.value = String(target.target);
    option.textContent = target.label;
    targetSelect.append(option);
  }
  const safeTarget = code <= 0x14 ? code : 0;
  targetSelect.value = String(safeTarget);
  const value = effectsMode ? ctlKnobCurrentValue(decoded, safeTarget) : control.knobValue;
  $("#ctl-knob-value").value = String(value);
  $("#ctl-knob-output").textContent = String(value);
  const mode = control.mode === 1 ? "Toggle" : "Momentary";
  if (effectsMode) {
    const selected = ctlEffects.filter((effect) => (code & effect.bit) !== 0).map((effect) => effect.label);
    $("#ctl-summary").textContent = `${mode} · ${selected.length ? selected.join(" + ") : "No effects"}`;
  } else {
    $("#ctl-summary").textContent = `${mode} · ${ctlKnobTargets[safeTarget].label} → ${control.knobValue}`;
  }
}

function renderSignalChain(decoded) {
  const flow = $("#signal-chain-flow");
  flow.replaceChildren();

  const input = document.createElement("span");
  input.className = "signal-chain-endpoint";
  input.textContent = "IN";
  flow.append(input);

  for (const block of effectChainMapping.deriveEffectChain(decoded)) {
    const node = document.createElement("span");
    node.className = `signal-chain-node${block.enabled ? "" : " off"}`;
    node.dataset.effect = block.key;
    node.title = `${block.label}: ${block.type} · ${block.enabled ? "On" : "Off"} · routing slot ${block.slot}`;

    const lamp = document.createElement("span");
    lamp.className = "signal-chain-lamp";
    const label = document.createElement("strong");
    label.textContent = block.label;
    const type = document.createElement("small");
    type.textContent = block.type;
    node.append(lamp, label, type);
    flow.append(node);
  }

  const output = document.createElement("span");
  output.className = "signal-chain-endpoint";
  output.textContent = "OUT";
  flow.append(output);
}

function editField(field, value) {
  return editFields([{ field, value }]);
}

function editReverb(typeIndex, level) {
  if (!state.currentPatch) return Promise.resolve();
  const changes = [];
  if (state.currentPatch.decoded.types.rev !== typeIndex) changes.push({ field: "rev_type", value: typeIndex });
  if (state.currentPatch.decoded.reverbLevel !== level) changes.push({ field: "rev", value: level });
  if (changes.length === 0) return Promise.resolve();
  return editFields(changes);
}

async function editFields(changes) {
  if (!state.currentPatch) return;
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 4) throw new Error("Expected between one and four verified fields.");
  const live = state.live;
  try {
    if (live) {
      setBusy(true);
      $("#live-status").textContent = "Sending change…";
    }
    const changeBody = changes.length === 1 ? changes[0] : { changes };
    const result = await api(live ? "/api/device/live-edit" : `/api/session/${encodeURIComponent(state.currentPatch.id)}/edit`, {
      method: "POST",
      body: JSON.stringify(live
        ? { ...selectedPorts(), sessionId: state.currentPatch.id, ...changeBody, confirm: "LIVE_SYNC" }
        : changeBody)
    });
    setPatch(result.patch);
    if (live) {
      addMidiLogs(result.logs);
      state.liveFailures = 0;
      $("#live-status").textContent = normalLiveStatus();
    }
  } catch (error) {
    if (live) handleLiveFailure(error, "Change was not synchronized");
    else showToast(error.message, true);
    renderPatch();
  } finally {
    if (live) setBusy(false);
  }
}

async function editName() {
  if (!state.currentPatch) return;
  const name = $("#patch-name").value.trimEnd();
  if (name === state.currentPatch.decoded.name.text) return;
  try {
    const result = await api(`/api/session/${encodeURIComponent(state.currentPatch.id)}/edit`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
    setPatch(result.patch, { preserveLive: state.live });
    if (state.live) showToast("Name staged. Store the patch to write it permanently.");
  } catch (error) {
    showToast(error.message, true);
    renderPatch();
  }
}

function commitNameEdit() {
  const operation = editName();
  state.pendingNameEdit = operation;
  operation.finally(() => {
    if (state.pendingNameEdit === operation) state.pendingNameEdit = null;
  });
  return operation;
}

function addActivity(label, detail, error = false) {
  const log = $("#activity-log");
  if (log.querySelector(".muted")) log.replaceChildren();
  const entry = document.createElement("div");
  entry.className = `log-entry${error ? " error" : ""}`;
  const title = document.createElement("strong");
  title.textContent = label;
  const time = document.createElement("span");
  time.textContent = new Date().toLocaleTimeString();
  const code = document.createElement("code");
  code.textContent = detail;
  entry.append(title, time, code);
  log.prepend(entry);
}

function addMidiLogs(logs) {
  for (const log of logs || []) addActivity(log.direction, log.hex);
}

function handleLiveFailure(error, context) {
  state.liveFailures += 1;
  addActivity("SYNC ISSUE", `${context}: ${error.message}`, true);
  if (state.liveFailures >= 3) {
    void stopLive("Stopped after 3 errors");
    showToast("Live Sync stopped after three consecutive errors.", true);
    return;
  }
  $("#live-status").textContent = `Connection issue · retrying ${state.liveFailures}/3`;
  showToast(`${context}; Live Sync will retry.`, true);
}

function stopLive(status = "Off") {
  let closing = state.liveClosing || Promise.resolve();
  if (state.live) {
    closing = api("/api/device/live-stop", { method: "POST", body: "{}" }).catch((error) => {
      addActivity("MIDI CLOSE", error.message, true);
    });
    state.liveClosing = closing;
  }
  state.live = false;
  state.liveOrigin = null;
  state.livePolling = false;
  state.liveFailures = 0;
  if (state.liveTimer) clearInterval(state.liveTimer);
  state.liveTimer = null;
  updateLiveControls();
  $("#live-status").textContent = status;
  return closing.finally(() => {
    if (state.liveClosing === closing) state.liveClosing = null;
    if (!state.live) {
      updateLiveControls();
      $("#live-status").textContent = status;
    }
  });
}

function activateLive(origin) {
  state.live = true;
  state.liveOrigin = origin;
  state.liveFailures = 0;
  if (state.liveTimer) clearInterval(state.liveTimer);
  state.liveTimer = setInterval(pollLive, 50);
  updateLiveControls();
  $("#live-status").textContent = normalLiveStatus();
}

async function pollLive() {
  if (!state.live || state.livePolling || state.busy || !state.currentPatch) return;
  state.livePolling = true;
  try {
    const result = await api("/api/device/live-poll", {
      method: "POST",
      body: JSON.stringify({ ...selectedPorts(), sessionId: state.currentPatch.id, confirm: "LIVE_SYNC" })
    });
    state.liveFailures = 0;
    $("#live-status").textContent = normalLiveStatus();
    if (result.changed) {
      setPatch(result.patch);
      addMidiLogs(result.logs);
      // Physical controls can emit many values per second; keep synchronization quiet.
    }
  } catch (error) {
    handleLiveFailure(error, "Pedal read was interrupted");
  } finally {
    state.livePolling = false;
  }
}

async function toggleLive(event) {
  if (!event.target.checked) {
    await stopLive();
    addActivity("LIVE", "Live Sync stopped; no automatic MIDI traffic remains.");
    return;
  }
  event.target.checked = state.live;
}

async function startLiveFromPedal() {
  try {
    await stopLive();
    setBusy(true);
    $("#live-status").textContent = "Reading pedal…";
    const result = await api("/api/device/read-current", {
      method: "POST",
      body: JSON.stringify(selectedPorts())
    });
    setPatch(result.patch);
    addMidiLogs(result.logs);
    activateLive("pedal");
    showToast("Live Sync started from the pedal patch; nothing was loaded onto the pedal.");
  } catch (error) {
    await stopLive("Could not start");
    addActivity("ERROR", error.message, true);
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function startLiveFromEditor() {
  if (!state.currentPatch) return;
  try {
    await stopLive();
    setBusy(true);
    $("#live-status").textContent = "Loading editor patch…";
    const result = await api("/api/device/audition", {
      method: "POST",
      body: JSON.stringify({ ...selectedPorts(), sessionId: state.currentPatch.id, confirm: "AUDITION" })
    });
    addMidiLogs(result.logs);
    activateLive("editor");
    showToast("Editor patch loaded into temporary memory; Live Sync is on.");
  } catch (error) {
    await stopLive("Could not start");
    addActivity("ERROR", error.message, true);
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function readCurrent() {
  try {
    await stopLive();
    setBusy(true);
    const ports = selectedPorts();
    addActivity("RQ1", "Reading the 71-byte temporary patch…");
    const result = await api("/api/device/read-current", { method: "POST", body: JSON.stringify(ports) });
    setPatch(result.patch);
    addMidiLogs(result.logs);
    showToast("Current patch loaded.");
  } catch (error) {
    showToast(error.message, true);
    addActivity("ERROR", error.message, true);
  } finally {
    setBusy(false);
  }
}

async function audition() {
  const live = state.live;
  try {
    setBusy(true);
    const result = await api(live ? "/api/device/live-load" : "/api/device/audition", {
      method: "POST",
      body: JSON.stringify({
        ...selectedPorts(),
        sessionId: state.currentPatch.id,
        confirm: live ? "LIVE_SYNC" : "AUDITION"
      })
    });
    addMidiLogs(result.logs);
    if (live) state.liveFailures = 0;
    showToast("Temporary patch loaded and verified 71/71.");
  } catch (error) {
    if (live) handleLiveFailure(error, "Temporary patch was not reloaded");
    else {
      showToast(error.message, true);
      addActivity("ERROR", error.message, true);
    }
  } finally {
    setBusy(false);
  }
}

async function storeConfirmed(event) {
  event.preventDefault();
  const slot = $("#store-slot").value;
  const live = state.live;
  const draft = state.storeDraft;
  $("#confirm-dialog").close();
  state.storeDraft = null;
  if (!draft) return showToast("The patch changed before Store was confirmed. Try again.", true);
  try {
    // The dialog itself blurs the title. Let that edit finish so its busy-state
    // cleanup cannot race and re-enable controls during the permanent write.
    if (state.pendingNameEdit) await state.pendingNameEdit;
    setBusy(true);
    addActivity("STORE", `Reading recovery, then writing ${slot} once…`);
    const result = await api(live ? "/api/device/live-store" : "/api/device/store", {
      method: "POST",
      body: JSON.stringify({
        ...selectedPorts(),
        sessionId: draft.sessionId,
        name: draft.name,
        slot,
        confirm: $("#confirm-slot-input").value,
        ...(live ? { syncConfirm: "LIVE_SYNC" } : {})
      })
    });
    addMidiLogs(result.logs);
    if (result.patch && state.currentPatch?.id === draft.sessionId) {
      setPatch(result.patch, { preserveLive: live });
    }
    updateStoredDevicePatch(result.slot, result.name);
    if (live) {
      state.liveFailures = 0;
      $("#live-status").textContent = normalLiveStatus();
    }
    addActivity("SAVED", result.recoveryPath);
    showToast(`${slot} stored and verified 71/71.`);
  } catch (error) {
    if (live) handleLiveFailure(error, `Could not store ${slot}`);
    else {
      showToast(error.message, true);
      addActivity("ERROR", error.message, true);
    }
  } finally {
    setBusy(false);
  }
}

async function importTsl(file) {
  try {
    setBusy(true);
    const source = await file.text();
    const imported = await api("/api/local/import-tsl", { method: "POST", body: JSON.stringify({ source }) });
    await setLibrarySource("local");
    showToast(`Imported “${imported.name}” into the local library.`);
  } catch (error) {
    showToast(error.message, true);
    addActivity("ERROR", error.message, true);
  } finally {
    setBusy(false);
  }
}

function initializeSlots() {
  const select = $("#store-slot");
  for (let bank = 1; bank <= 9; bank += 1) {
    for (let number = 1; number <= 4; number += 1) {
      const slot = `U${bank}-${number}`;
      const option = document.createElement("option");
      option.value = slot;
      option.textContent = slot;
      if (slot === "U9-4") option.selected = true;
      select.append(option);
    }
  }
}

$("#refresh-ports").addEventListener("click", async () => {
  await stopLive();
  await refreshStatus();
  await loadDeviceLibrary();
});
$("#settings-button").addEventListener("click", () => {
  document.querySelectorAll('input[name="knob-label-mode"]').forEach((input) => {
    input.checked = input.value === state.knobLabelMode;
  });
  $("#settings-dialog").showModal();
});
document.querySelectorAll('input[name="knob-label-mode"]').forEach((input) => input.addEventListener("change", (event) => {
  if (!event.target.checked) return;
  state.knobLabelMode = event.target.value === knobLabels.LABEL_MODES.CURRENT
    ? knobLabels.LABEL_MODES.CURRENT
    : knobLabels.LABEL_MODES.HARDWARE;
  try { localStorage.setItem(KNOB_LABEL_MODE_KEY, state.knobLabelMode); } catch { /* Storage is optional. */ }
  renderPatch();
}));
$("#source-device").addEventListener("click", () => setLibrarySource("device"));
$("#source-local").addEventListener("click", () => setLibrarySource("local"));
$("#reload-local").addEventListener("click", loadLocalLibrary);
$("#new-live-set").addEventListener("click", async () => {
  const name = window.prompt("New Live Set name");
  if (name) await localMutation("/api/local/create-set", { name }, "Live Set created.");
});
$("#save-local-patch").addEventListener("click", async () => {
  if (!state.currentPatch) return showToast("Open a patch first.", true);
  if (state.currentLocalSource?.kind === "liveSet") {
    await localMutation("/api/local/save-live-patch", {
      setId: state.currentLocalSource.id,
      index: state.currentLocalSource.index,
      sessionId: state.currentPatch.id
    }, "Live Set patch saved.");
    return;
  }
  const existing = state.currentLocalSource?.kind === "patch" ? state.currentLocalSource.id : undefined;
  const name = state.currentPatch.decoded.name.text;
  await localMutation("/api/local/save-patch", { sessionId: state.currentPatch.id, id: existing, name }, existing ? "Local patch saved." : "Patch added to local library.");
});
$("#read-current").addEventListener("click", readCurrent);
$("#import-button").addEventListener("click", () => $("#tsl-file").click());
$("#patch-view-list").addEventListener("click", () => setLibraryView("list"));
$("#patch-view-banks").addEventListener("click", () => setLibraryView("banks"));
$("#tsl-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) importTsl(file);
  event.target.value = "";
});
$("#patch-name").addEventListener("blur", commitNameEdit);
$("#patch-name").addEventListener("keydown", (event) => { if (event.key === "Enter") event.target.blur(); });
$("#ns-thresh").addEventListener("input", (event) => { $("#ns-value").textContent = event.target.value; });
$("#ns-thresh").addEventListener("change", (event) => editField("ns_thresh", Number.parseInt(event.target.value, 10)));
document.querySelectorAll('input[name="ctl-kind"]').forEach((input) => input.addEventListener("change", (event) => {
  if (!event.target.checked || !state.currentPatch) return;
  const decoded = state.currentPatch.decoded;
  const code = ctlCode(decoded.control);
  if (event.target.value === "effects") {
    const current = ctlKnobTargets[Math.min(code, 0x14)] || ctlKnobTargets[0];
    const mask = ctlEffects.find((effect) => effect.key === current.effect)?.bit || 0x01;
    const target = ctlTargetBytes(mask);
    editFields([{ field: "ctrl_knob_value", value: 100 }, { field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }]);
  } else {
    const firstSelected = ctlEffects.find((effect) => (code & effect.bit) !== 0 && ctlKnobTargets.some((target) => target.effect === effect.key));
    const targetDefinition = ctlKnobTargets.find((target) => target.effect === firstSelected?.key) || ctlKnobTargets[0];
    const target = ctlTargetBytes(targetDefinition.target);
    editFields([{ field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }, { field: "ctrl_knob_value", value: ctlKnobCurrentValue(decoded, targetDefinition.target) }]);
  }
}));
$("#ctl-mode").addEventListener("change", (event) => editField("ctl_mode", Number.parseInt(event.target.value, 10)));
$("#ctl-knob-target").addEventListener("change", (event) => {
  if (!state.currentPatch) return;
  const targetCode = Number.parseInt(event.target.value, 10);
  const target = ctlTargetBytes(targetCode);
  const value = state.currentPatch.decoded.control.assignmentType === "knob"
    ? state.currentPatch.decoded.control.knobValue
    : ctlKnobCurrentValue(state.currentPatch.decoded, targetCode);
  editFields([{ field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }, { field: "ctrl_knob_value", value }]);
});
$("#ctl-knob-value").addEventListener("input", (event) => { $("#ctl-knob-output").textContent = event.target.value; });
$("#ctl-knob-value").addEventListener("change", (event) => editField("ctrl_knob_value", Number.parseInt(event.target.value, 10)));
$("#audition").addEventListener("click", audition);
$("#live-sync").addEventListener("change", toggleLive);
$("#live-from-pedal").addEventListener("click", startLiveFromPedal);
$("#live-from-editor").addEventListener("click", startLiveFromEditor);
// Keep the title focused through mousedown. Otherwise its live blur-save marks
// the app busy and disables this button before the subsequent click can fire.
$("#store").addEventListener("mousedown", (event) => event.preventDefault());
$("#store").addEventListener("click", () => {
  const slot = $("#store-slot").value;
  const name = $("#patch-name").value.trimEnd();
  if (!/^[\x20-\x7E]{1,16}$/.test(name)) {
    showToast("Patch name must contain 1-16 printable ASCII characters.", true);
    return;
  }
  // Capture the visible title together with the session. The blur handler may
  // still be finishing while the confirmation dialog is open.
  state.storeDraft = { sessionId: state.currentPatch.id, name };
  $("#confirm-slot-label").textContent = slot;
  $("#confirm-slot-prompt").textContent = slot;
  $("#confirm-slot-input").value = "";
  $("#confirm-store").disabled = true;
  $("#confirm-dialog").showModal();
  $("#confirm-slot-input").focus();
});
$("#confirm-slot-input").addEventListener("input", (event) => {
  $("#confirm-store").disabled = event.target.value !== $("#store-slot").value;
});
$("#confirm-store").addEventListener("click", storeConfirmed);
$("#clear-log").addEventListener("click", () => { $("#activity-log").innerHTML = '<p class="muted">No operations yet.</p>'; });

initializeSlots();
try { state.libraryView = localStorage.getItem("me80-patch-library-view") === "banks" ? "banks" : "list"; } catch { /* Storage is optional. */ }
try { state.knobLabelMode = localStorage.getItem(KNOB_LABEL_MODE_KEY) === knobLabels.LABEL_MODES.CURRENT ? knobLabels.LABEL_MODES.CURRENT : knobLabels.LABEL_MODES.HARDWARE; } catch { /* Storage is optional. */ }
setLibraryView(state.libraryView);
updateLiveControls();
(async () => {
  await refreshStatus();
  await loadDeviceLibrary();
})();
