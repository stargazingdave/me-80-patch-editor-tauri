"use strict";

const state = {
  status: null,
  currentPatch: null,
  busy: false,
  activeLibraryButton: null,
  live: false,
  liveOrigin: null,
  liveTimer: null,
  livePolling: false,
  liveFailures: 0,
  libraryItems: [],
  libraryBanked: true,
  libraryView: "list",
  activeLibraryKey: null
};
const $ = (selector) => document.querySelector(selector);
const controlMapping = Me80ControlMapping;
const effectChainMapping = Me80EffectChain;

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
  $("#audition").disabled = busy || !state.currentPatch;
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
  $("#live-sync").checked = state.live;
  $("#live-sync").disabled = state.busy || !state.live;
  $("#live-from-pedal").disabled = state.busy || state.live;
  $("#live-from-editor").disabled = state.busy || state.live || !state.currentPatch;
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
    renderPortSelect($("#input-port"), status.inputs, status.suggestedInput);
    renderPortSelect($("#output-port"), status.outputs, status.suggestedOutput);
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
        const result = await api("/api/device/audition", {
          method: "POST",
          body: JSON.stringify({ ...selectedPorts(), sessionId: patch.id, confirm: "AUDITION" })
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

async function loadBackupLibrary() {
  try {
    const library = await api("/api/library/backup");
    $("#backup-date").textContent = new Date(library.createdAt).toLocaleDateString();
    $("#library-label").textContent = "USER + PRESET";
    state.libraryBanked = true;
    state.libraryItems = library.patches.map((patch) => ({
      slot: patch.slot,
      name: patch.name,
      key: patch.slot,
      onClick: async () => {
        const result = await api("/api/library/load-backup", { method: "POST", body: JSON.stringify({ slot: patch.slot }) });
        return result.patch;
      }
    }));
    renderLibrary();
  } catch (error) {
    $("#backup-date").textContent = "Unavailable";
    showToast(error.message, true);
  }
}

function setPatch(patch, { preserveLive = false } = {}) {
  if (!preserveLive && state.live && state.currentPatch && state.currentPatch.id !== patch.id) stopLive();
  state.currentPatch = patch;
  $("#empty-state").classList.add("hidden");
  $("#editor").classList.remove("hidden");
  $("#audition").disabled = state.busy;
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

function makeContinuousKnob(field, value, labelText, maximum = 99) {
  const control = document.createElement("label");
  control.className = "continuous-knob-control";
  const label = document.createElement("span");
  label.className = "knob-label";
  label.textContent = labelText;
  const output = document.createElement("output");
  output.textContent = String(value);
  const knob = makeKnobFace("continuous-knob");
  knob.tabIndex = 0;
  knob.setAttribute("role", "slider");
  knob.setAttribute("aria-label", labelText);
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
        parameters.append(makeContinuousKnob(field, values[index], definition.parameterLabels[index]));
      });
      card.append(parameters);
    }
    chain.append(card);
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
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 2) throw new Error("Expected one field or the grouped reverb fields.");
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
  const live = state.live;
  try {
    if (live) {
      setBusy(true);
      $("#live-status").textContent = "Sending name…";
    }
    const result = await api(live ? "/api/device/live-edit" : `/api/session/${encodeURIComponent(state.currentPatch.id)}/edit`, {
      method: "POST",
      body: JSON.stringify(live
        ? { ...selectedPorts(), sessionId: state.currentPatch.id, name, confirm: "LIVE_SYNC" }
        : { name })
    });
    setPatch(result.patch);
    if (live) {
      addMidiLogs(result.logs);
      state.liveFailures = 0;
      $("#live-status").textContent = normalLiveStatus();
    }
  } catch (error) {
    if (live) handleLiveFailure(error, "Name was not synchronized");
    else showToast(error.message, true);
    renderPatch();
  } finally {
    if (live) setBusy(false);
  }
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
    stopLive("Stopped after 3 errors");
    showToast("Live Sync stopped after three consecutive errors.", true);
    return;
  }
  $("#live-status").textContent = `Connection issue · retrying ${state.liveFailures}/3`;
  showToast(`${context}; Live Sync will retry.`, true);
}

function stopLive(status = "Off") {
  if (state.live) {
    api("/api/device/live-stop", { method: "POST", body: "{}" }).catch(() => {});
  }
  state.live = false;
  state.liveOrigin = null;
  state.livePolling = false;
  state.liveFailures = 0;
  if (state.liveTimer) clearInterval(state.liveTimer);
  state.liveTimer = null;
  updateLiveControls();
  $("#live-status").textContent = status;
}

function activateLive(origin) {
  state.live = true;
  state.liveOrigin = origin;
  state.liveFailures = 0;
  if (state.liveTimer) clearInterval(state.liveTimer);
  state.liveTimer = setInterval(pollLive, 350);
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
      showToast("Pedal change synchronized.");
    }
  } catch (error) {
    handleLiveFailure(error, "Pedal read was interrupted");
  } finally {
    state.livePolling = false;
  }
}

async function toggleLive(event) {
  if (!event.target.checked) {
    stopLive();
    addActivity("LIVE", "Live Sync stopped; no automatic MIDI traffic remains.");
    return;
  }
  event.target.checked = state.live;
}

async function startLiveFromPedal() {
  try {
    stopLive();
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
    stopLive("Could not start");
    addActivity("ERROR", error.message, true);
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function startLiveFromEditor() {
  if (!state.currentPatch) return;
  try {
    stopLive();
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
    stopLive("Could not start");
    addActivity("ERROR", error.message, true);
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function readCurrent() {
  try {
    stopLive();
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
  try {
    setBusy(true);
    const result = await api("/api/device/audition", {
      method: "POST",
      body: JSON.stringify({ ...selectedPorts(), sessionId: state.currentPatch.id, confirm: "AUDITION" })
    });
    addMidiLogs(result.logs);
    showToast("Temporary patch loaded and verified 71/71.");
  } catch (error) {
    showToast(error.message, true);
    addActivity("ERROR", error.message, true);
  } finally {
    setBusy(false);
  }
}

async function storeConfirmed(event) {
  event.preventDefault();
  const slot = $("#store-slot").value;
  $("#confirm-dialog").close();
  stopLive();
  try {
    setBusy(true);
    addActivity("STORE", `Reading recovery, then writing ${slot} once…`);
    const result = await api("/api/device/store", {
      method: "POST",
      body: JSON.stringify({ ...selectedPorts(), sessionId: state.currentPatch.id, slot, confirm: $("#confirm-slot-input").value })
    });
    addMidiLogs(result.logs);
    addActivity("SAVED", result.recoveryPath);
    showToast(`${slot} stored and verified 71/71.`);
  } catch (error) {
    showToast(error.message, true);
    addActivity("ERROR", error.message, true);
  } finally {
    setBusy(false);
  }
}

async function importTsl(file) {
  try {
    setBusy(true);
    const source = await file.text();
    const imported = await api("/api/library/import-tsl", { method: "POST", body: JSON.stringify({ source }) });
    $("#backup-date").textContent = `${imported.patches.length} imported`;
    $("#library-label").textContent = imported.liveSetName.toUpperCase();
    state.activeLibraryButton = null;
    state.activeLibraryKey = null;
    state.libraryBanked = false;
    state.libraryItems = imported.patches.map((patch, index) => ({
      slot: String(index + 1).padStart(2, "0"),
      name: patch.decoded.name.text,
      key: `import-${index}`,
      onClick: async () => patch
    }));
    renderLibrary();
    showToast(`Imported ${imported.patches.length} validated patches.`);
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

$("#refresh-ports").addEventListener("click", () => { stopLive(); refreshStatus(); });
$("#read-current").addEventListener("click", readCurrent);
$("#import-button").addEventListener("click", () => $("#tsl-file").click());
$("#patch-view-list").addEventListener("click", () => setLibraryView("list"));
$("#patch-view-banks").addEventListener("click", () => setLibraryView("banks"));
$("#tsl-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) importTsl(file);
  event.target.value = "";
});
$("#patch-name").addEventListener("blur", editName);
$("#patch-name").addEventListener("keydown", (event) => { if (event.key === "Enter") event.target.blur(); });
$("#ns-thresh").addEventListener("input", (event) => { $("#ns-value").textContent = event.target.value; });
$("#ns-thresh").addEventListener("change", (event) => editField("ns_thresh", Number.parseInt(event.target.value, 10)));
$("#audition").addEventListener("click", audition);
$("#live-sync").addEventListener("change", toggleLive);
$("#live-from-pedal").addEventListener("click", startLiveFromPedal);
$("#live-from-editor").addEventListener("click", startLiveFromEditor);
$("#store").addEventListener("click", () => {
  const slot = $("#store-slot").value;
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
setLibraryView(state.libraryView);
updateLiveControls();
Promise.all([refreshStatus(), loadBackupLibrary()]);
