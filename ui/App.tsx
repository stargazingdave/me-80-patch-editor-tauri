import { useEffect, useRef, useState } from "react";
import Editor from "./Editor";
import LibraryPanel from "./LibraryPanel";
import { ActionPanel, ConfirmDialog, SettingsDialog } from "./Panels";
import {
  api, emptyLocalLibrary, errorMessage, KNOB_LABEL_MODE_KEY, LIBRARY_VIEW_KEY,
  type ActivityEntry, type DevicePatch, type Edit, type LabelMode, type LibrarySource,
  type LibraryView, type LiveOrigin, type LiveSetPatch, type LocalLibrary, type LocalPatch,
  type LocalSource, type MidiLog, type PatchView, type Status, type StoreDraft, type ToastState
} from "./model";

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState("");
  const [inputIndex, setInputIndexState] = useState<number | undefined>();
  const [outputIndex, setOutputIndexState] = useState<number | undefined>();
  const [currentPatch, setCurrentPatchState] = useState<PatchView | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusyState] = useState(false);
  const [live, setLiveState] = useState(false);
  const [liveOrigin, setLiveOriginState] = useState<LiveOrigin | null>(null);
  const [liveStatus, setLiveStatus] = useState("Off");
  const [devicePatches, setDevicePatches] = useState<DevicePatch[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [localLibrary, setLocalLibrary] = useState<LocalLibrary>(emptyLocalLibrary);
  const [librarySource, setLibrarySourceState] = useState<LibrarySource>("device");
  const [libraryView, setLibraryViewState] = useState<LibraryView>(() => { try { return localStorage.getItem(LIBRARY_VIEW_KEY) === "banks" ? "banks" : "list"; } catch { return "list"; } });
  const [activeLibraryKey, setActiveLibraryKey] = useState<string | null>(null);
  const [currentLocalSource, setCurrentLocalSource] = useState<LocalSource | null>(null);
  const [knobLabelMode, setKnobLabelModeState] = useState<LabelMode>(() => { try { return localStorage.getItem(KNOB_LABEL_MODE_KEY) === "current" ? "current" : "hardware"; } catch { return "hardware"; } });
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [storeSlot, setStoreSlot] = useState("U9-4");
  const [confirmText, setConfirmText] = useState("");
  const [storeDraft, setStoreDraft] = useState<StoreDraft | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);
  const currentPatchRef = useRef<PatchView | null>(null);
  const busyRef = useRef(false);
  const liveRef = useRef(false);
  const liveOriginRef = useRef<LiveOrigin | null>(null);
  const inputIndexRef = useRef<number | undefined>(undefined);
  const outputIndexRef = useRef<number | undefined>(undefined);
  const liveTimer = useRef<number | null>(null);
  const livePolling = useRef(false);
  const liveFailures = useRef(0);
  const liveClosing = useRef<Promise<void> | null>(null);
  const pendingNameEdit = useRef<Promise<void> | null>(null);
  const activityId = useRef(0);

  const setBusy = (value: boolean) => { busyRef.current = value; setBusyState(value); };
  const setInputIndex = (value: number | undefined) => { inputIndexRef.current = value; setInputIndexState(value); };
  const setOutputIndex = (value: number | undefined) => { outputIndexRef.current = value; setOutputIndexState(value); };
  const setLive = (value: boolean) => { liveRef.current = value; setLiveState(value); };
  const setLiveOrigin = (value: LiveOrigin | null) => { liveOriginRef.current = value; setLiveOriginState(value); };
  const normalLiveStatus = () => liveOriginRef.current === "pedal" ? "On · pedal patch" : "On · editor patch";
  const setPatch = (patch: PatchView) => { currentPatchRef.current = patch; setCurrentPatchState(patch); setNameDraft(patch.decoded.name.text); };

  const showToast = (message: string, error = false) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    const next = { id: Date.now(), message, error };
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast((value) => value?.id === next.id ? null : value), 3200);
  };
  const addActivity = (label: string, detail: string, error = false) => setActivity((items) => [{ id: ++activityId.current, label, detail, error, time: new Date().toLocaleTimeString() }, ...items]);
  const addMidiLogs = (logs?: MidiLog[]) => { for (const log of logs ?? []) addActivity(log.direction, log.hex); };
  const selectedPorts = () => {
    const input = inputIndexRef.current;
    const output = outputIndexRef.current;
    if (!Number.isInteger(input) || !Number.isInteger(output)) throw new Error("Select both normal ME-80 MIDI ports.");
    return { inputIndex: input as number, outputIndex: output as number };
  };

  async function refreshStatus() {
    try {
      setStatusError("");
      const next = await api<Status>("/api/status");
      setStatus(next);
      const inputs = next.inputs.filter((port) => port.normal);
      const outputs = next.outputs.filter((port) => port.normal);
      setInputIndex(inputs.some((port) => port.index === next.suggestedInput) ? next.suggestedInput : inputs[0]?.index);
      setOutputIndex(outputs.some((port) => port.index === next.suggestedOutput) ? next.suggestedOutput : outputs[0]?.index);
      return next;
    } catch (error) {
      const message = errorMessage(error);
      setStatusError(message);
      showToast(message, true);
      return null;
    }
  }

  async function loadDeviceLibrary(portOverride?: { inputIndex: number; outputIndex: number }) {
    setDeviceLoading(true);
    try {
      setBusy(true);
      const result = await api<{ patches: DevicePatch[]; logs: MidiLog[] }>("/api/library/device", "POST", portOverride ?? selectedPorts());
      setDevicePatches(result.patches);
      addMidiLogs(result.logs);
    } catch (error) {
      showToast(errorMessage(error), true);
    } finally {
      setDeviceLoading(false);
      setBusy(false);
    }
  }

  async function loadLocalLibrary() {
    try {
      const library = await api<LocalLibrary>("/api/local/list");
      setLocalLibrary(library);
      if (library.warnings.length) addActivity("LIBRARY", `${library.warnings.length} invalid file(s) ignored.`, true);
    } catch (error) {
      showToast(errorMessage(error), true);
    }
  }

  async function stopLive(statusText = "Off") {
    let closing = liveClosing.current ?? Promise.resolve();
    if (liveRef.current) {
      closing = api<unknown>("/api/device/live-stop", "POST").then(() => undefined).catch((error) => { addActivity("MIDI CLOSE", errorMessage(error), true); });
      liveClosing.current = closing;
    }
    setLive(false);
    setLiveOrigin(null);
    livePolling.current = false;
    liveFailures.current = 0;
    if (liveTimer.current !== null) window.clearInterval(liveTimer.current);
    liveTimer.current = null;
    setLiveStatus(statusText);
    await closing.finally(() => { if (liveClosing.current === closing) liveClosing.current = null; });
  }

  function activateLive(origin: LiveOrigin) {
    setLive(true);
    setLiveOrigin(origin);
    liveFailures.current = 0;
    if (liveTimer.current !== null) window.clearInterval(liveTimer.current);
    liveTimer.current = window.setInterval(() => { void pollLive(); }, 50);
    setLiveStatus(origin === "pedal" ? "On · pedal patch" : "On · editor patch");
  }

  function handleLiveFailure(error: unknown, context: string) {
    liveFailures.current += 1;
    addActivity("SYNC ISSUE", `${context}: ${errorMessage(error)}`, true);
    if (liveFailures.current >= 3) {
      void stopLive("Stopped after 3 errors");
      showToast("Live Sync stopped after three consecutive errors.", true);
      return;
    }
    setLiveStatus(`Connection issue · retrying ${liveFailures.current}/3`);
    showToast(`${context}; Live Sync will retry.`, true);
  }

  async function pollLive() {
    const patch = currentPatchRef.current;
    if (!liveRef.current || livePolling.current || busyRef.current || !patch) return;
    livePolling.current = true;
    try {
      const result = await api<{ patch: PatchView; changed: boolean; logs: MidiLog[] }>("/api/device/live-poll", "POST", { ...selectedPorts(), sessionId: patch.id, confirm: "LIVE_SYNC" });
      liveFailures.current = 0;
      setLiveStatus(normalLiveStatus());
      if (result.changed) { setPatch(result.patch); addMidiLogs(result.logs); }
    } catch (error) {
      handleLiveFailure(error, "Pedal read was interrupted");
    } finally {
      livePolling.current = false;
    }
  }

  async function loadPatch(slot: string, key: string, loader: () => Promise<PatchView>) {
    const wasLive = liveRef.current;
    try {
      setBusy(true);
      if (wasLive) setLiveStatus(`Loading ${slot}…`);
      const patch = await loader();
      if (wasLive) {
        const result = await api<{ logs: MidiLog[] }>("/api/device/live-load", "POST", { ...selectedPorts(), sessionId: patch.id, confirm: "LIVE_SYNC" });
        addMidiLogs(result.logs);
        setLiveOrigin("editor");
        liveFailures.current = 0;
      }
      setActiveLibraryKey(key);
      setPatch(patch);
      if (wasLive) {
        setLiveStatus("On · editor patch");
        addActivity("LIVE", `${slot} loaded into temporary memory; synchronization remains on.`);
        showToast(`${slot} loaded temporarily; Live Sync remains on.`);
      }
    } catch (error) {
      const message = errorMessage(error);
      showToast(message, true);
      addActivity(wasLive ? "LOAD ISSUE" : "ERROR", message, true);
      if (wasLive && liveRef.current) setLiveStatus(normalLiveStatus());
    } finally {
      setBusy(false);
    }
  }

  async function localMutation(path: string, body: Record<string, unknown>, success?: string) {
    try {
      setBusy(true);
      await api(path, "POST", body);
      await loadLocalLibrary();
      if (success) showToast(success);
    } catch (error) {
      showToast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function editFields(changes: Edit[]) {
    const patch = currentPatchRef.current;
    if (!patch) return;
    if (changes.length < 1 || changes.length > 4) throw new Error("Expected between one and four verified fields.");
    const isLive = liveRef.current;
    try {
      if (isLive) { setBusy(true); setLiveStatus("Sending change…"); }
      const changeBody: Record<string, unknown> = changes.length === 1
        ? { field: changes[0].field, value: changes[0].value }
        : { changes };
      const body = isLive ? { ...selectedPorts(), sessionId: patch.id, ...changeBody, confirm: "LIVE_SYNC" } : changeBody;
      const result = await api<{ patch: PatchView; logs?: MidiLog[] }>(isLive ? "/api/device/live-edit" : `/api/session/${encodeURIComponent(patch.id)}/edit`, "POST", body);
      setPatch(result.patch);
      if (isLive) { addMidiLogs(result.logs); liveFailures.current = 0; setLiveStatus(normalLiveStatus()); }
    } catch (error) {
      if (isLive) handleLiveFailure(error, "Change was not synchronized");
      else showToast(errorMessage(error), true);
    } finally {
      if (isLive) setBusy(false);
    }
  }

  const editField = (field: string, value: number) => { void editFields([{ field, value }]); };
  const editReverb = (typeIndex: number, level: number) => {
    const patch = currentPatchRef.current;
    if (!patch) return;
    const changes: Edit[] = [];
    if (patch.decoded.types.rev !== typeIndex) changes.push({ field: "rev_type", value: typeIndex });
    if (patch.decoded.reverbLevel !== level) changes.push({ field: "rev", value: level });
    if (changes.length) void editFields(changes);
  };

  function commitNameEdit() {
    const patch = currentPatchRef.current;
    const name = nameDraft.trimEnd();
    if (!patch || name === patch.decoded.name.text) return;
    const operation = (async () => {
      try {
        const result = await api<{ patch: PatchView }>(`/api/session/${encodeURIComponent(patch.id)}/edit`, "POST", { name });
        setPatch(result.patch);
        if (liveRef.current) showToast("Name staged. Store the patch to write it permanently.");
      } catch (error) {
        showToast(errorMessage(error), true);
        setNameDraft(currentPatchRef.current?.decoded.name.text ?? "");
      }
    })();
    pendingNameEdit.current = operation;
    void operation.finally(() => { if (pendingNameEdit.current === operation) pendingNameEdit.current = null; });
  }

  async function startLiveFromPedal() {
    try {
      await stopLive();
      setBusy(true);
      setLiveStatus("Reading pedal…");
      const result = await api<{ patch: PatchView; logs: MidiLog[] }>("/api/device/read-current", "POST", selectedPorts());
      setPatch(result.patch);
      addMidiLogs(result.logs);
      activateLive("pedal");
      showToast("Live Sync started from the pedal patch; nothing was loaded onto the pedal.");
    } catch (error) {
      await stopLive("Could not start");
      addActivity("ERROR", errorMessage(error), true);
      showToast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function startLiveFromEditor() {
    const patch = currentPatchRef.current;
    if (!patch) return;
    try {
      await stopLive();
      setBusy(true);
      setLiveStatus("Loading editor patch…");
      const result = await api<{ logs: MidiLog[] }>("/api/device/audition", "POST", { ...selectedPorts(), sessionId: patch.id, confirm: "AUDITION" });
      addMidiLogs(result.logs);
      activateLive("editor");
      showToast("Editor patch loaded into temporary memory; Live Sync is on.");
    } catch (error) {
      await stopLive("Could not start");
      addActivity("ERROR", errorMessage(error), true);
      showToast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function readCurrent() {
    try {
      await stopLive();
      setBusy(true);
      addActivity("RQ1", "Reading the 71-byte temporary patch…");
      const result = await api<{ patch: PatchView; logs: MidiLog[] }>("/api/device/read-current", "POST", selectedPorts());
      setPatch(result.patch);
      addMidiLogs(result.logs);
      showToast("Current patch loaded.");
    } catch (error) {
      showToast(errorMessage(error), true);
      addActivity("ERROR", errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function audition() {
    const patch = currentPatchRef.current;
    if (!patch) return;
    try {
      setBusy(true);
      const result = await api<{ logs: MidiLog[] }>("/api/device/audition", "POST", { ...selectedPorts(), sessionId: patch.id, confirm: "AUDITION" });
      addMidiLogs(result.logs);
      showToast("Temporary patch loaded and verified 71/71.");
    } catch (error) {
      showToast(errorMessage(error), true);
      addActivity("ERROR", errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  function requestStore(name: string) {
    const patch = currentPatchRef.current;
    const trimmed = name.trimEnd();
    if (!patch) return;
    if (!/^[\x20-\x7E]{1,16}$/.test(trimmed)) { showToast("Patch name must contain 1-16 printable ASCII characters.", true); return; }
    setStoreDraft({ sessionId: patch.id, name: trimmed });
    setConfirmText("");
    setConfirmOpen(true);
  }

  async function confirmStore() {
    const draft = storeDraft;
    setConfirmOpen(false);
    setStoreDraft(null);
    if (!draft) { showToast("The patch changed before Store was confirmed. Try again.", true); return; }
    const isLive = liveRef.current;
    try {
      if (pendingNameEdit.current) await pendingNameEdit.current;
      setBusy(true);
      addActivity("STORE", `Reading recovery, then writing ${storeSlot} once…`);
      const result = await api<{ patch?: PatchView; logs: MidiLog[]; slot: string; name: string; recoveryPath: string }>(isLive ? "/api/device/live-store" : "/api/device/store", "POST", { ...selectedPorts(), sessionId: draft.sessionId, name: draft.name, slot: storeSlot, confirm: confirmText, ...(isLive ? { syncConfirm: "LIVE_SYNC" } : {}) });
      addMidiLogs(result.logs);
      if (result.patch && currentPatchRef.current?.id === draft.sessionId) setPatch(result.patch);
      setDevicePatches((items) => items.some((item) => item.slot === result.slot) ? items.map((item) => item.slot === result.slot ? { ...item, name: result.name } : item) : [...items, { slot: result.slot, name: result.name }]);
      if (isLive) { liveFailures.current = 0; setLiveStatus(normalLiveStatus()); }
      addActivity("SAVED", result.recoveryPath);
      showToast(`${storeSlot} stored and verified 71/71.`);
    } catch (error) {
      if (isLive) handleLiveFailure(error, `Could not store ${storeSlot}`);
      else { showToast(errorMessage(error), true); addActivity("ERROR", errorMessage(error), true); }
    } finally {
      setBusy(false);
    }
  }

  async function importTsl(file: File) {
    try {
      setBusy(true);
      const source = await file.text();
      const imported = await api<{ name: string }>("/api/local/import-tsl", "POST", { source });
      setLibrarySourceState("local");
      await loadLocalLibrary();
      showToast(`Imported “${imported.name}” into the local library.`);
    } catch (error) {
      showToast(errorMessage(error), true);
      addActivity("ERROR", errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const next = await refreshStatus();
      if (next?.suggestedInput !== undefined && next.suggestedOutput !== undefined) await loadDeviceLibrary({ inputIndex: next.suggestedInput, outputIndex: next.suggestedOutput });
    })();
    return () => {
      if (liveTimer.current !== null) window.clearInterval(liveTimer.current);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const connected = status?.suggestedInput !== undefined && status?.suggestedOutput !== undefined;
  const normalInputs = status?.inputs.filter((port) => port.normal) ?? [];
  const normalOutputs = status?.outputs.filter((port) => port.normal) ?? [];
  const setLibraryView = (view: LibraryView) => { setLibraryViewState(view); try { localStorage.setItem(LIBRARY_VIEW_KEY, view); } catch { /* Storage is optional. */ } };
  const setLibrarySource = (source: LibrarySource) => { setLibrarySourceState(source); if (source === "local") void loadLocalLibrary(); };
  const setKnobLabelMode = (mode: LabelMode) => { setKnobLabelModeState(mode); try { localStorage.setItem(KNOB_LABEL_MODE_KEY, mode); } catch { /* Storage is optional. */ } };
  const loadDevicePatch = (patch: DevicePatch) => void loadPatch(patch.slot, patch.slot, async () => (await api<{ patch: PatchView }>("/api/library/load-device", "POST", { slot: patch.slot })).patch);
  const loadLocalPatch = (item: LocalPatch | LiveSetPatch, source: LocalSource) => void loadPatch(source.kind === "patch" ? "PATCH" : String(source.index + 1).padStart(2, "0"), `local-${source.kind}-${source.id}-${source.kind === "liveSet" ? source.index : "one"}`, async () => { const result = await api<{ patch: PatchView }>("/api/local/load", "POST", source); setCurrentLocalSource(source); return result.patch; });

  return (
    <>
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><span>ME</span><strong>80</strong></div><div><h1>me-80-patch-editor</h1><p>Hardware-style editor · local only</p></div></div>
        <div className="topbar-actions"><button className="settings-button" type="button" aria-haspopup="dialog" title="Open settings" onClick={() => setSettingsOpen(true)}><span aria-hidden="true">⚙</span><strong>Settings</strong></button><div className="connection"><span className={`status-dot${connected ? " online" : ""}`} /><div><strong>{statusError ? "MIDI check failed" : connected ? "ME-80 connected" : status ? "ME-80 not found" : "Checking device…"}</strong><small>{statusError || (connected ? `Input ${status.suggestedInput} · Output ${status.suggestedOutput}` : status ? "Reconnect USB and refresh" : "Windows MIDI")}</small></div><button className="icon-button" title="Refresh MIDI ports" disabled={busy || live} onClick={() => void (async () => { await stopLive(); const next = await refreshStatus(); if (next) { const input = next.inputs.find((port) => port.normal)?.index; const output = next.outputs.find((port) => port.normal)?.index; if (input !== undefined && output !== undefined) await loadDeviceLibrary({ inputIndex: input, outputIndex: output }); } })()}>↻</button></div></div>
      </header>

      <main className="workspace">
        <LibraryPanel source={librarySource} view={libraryView} activeKey={activeLibraryKey} devicePatches={devicePatches} deviceLoading={deviceLoading} localLibrary={localLibrary} busy={busy} live={live} currentPatch={currentPatch} currentLocalSource={currentLocalSource} fileInput={fileInput} onSource={setLibrarySource} onView={setLibraryView} onImport={(file) => void importTsl(file)} onReadCurrent={() => void readCurrent()} onLoadDevice={loadDevicePatch} onLoadLocal={loadLocalPatch} onLocalMutation={(path, body, success) => void localMutation(path, body, success)} onReloadLocal={() => void loadLocalLibrary()} onToast={showToast} />
        <Editor patch={currentPatch} status={status} nameDraft={nameDraft} labelMode={knobLabelMode} onNameChange={setNameDraft} onNameCommit={commitNameEdit} onEdit={editField} onEditMany={(edits) => { void editFields(edits); }} onEditReverb={editReverb} />
        <ActionPanel inputs={normalInputs} outputs={normalOutputs} inputIndex={inputIndex} outputIndex={outputIndex} busy={busy} live={live} liveOrigin={liveOrigin} liveStatus={liveStatus} patch={currentPatch} storeSlot={storeSlot} nameDraft={nameDraft} onInput={setInputIndex} onOutput={setOutputIndex} onStopLive={() => void stopLive().then(() => addActivity("LIVE", "Live Sync stopped; no automatic MIDI traffic remains."))} onStartPedal={() => void startLiveFromPedal()} onStartEditor={() => void startLiveFromEditor()} onAudition={() => void audition()} onStoreSlot={setStoreSlot} onRequestStore={requestStore} />
      </main>

      <ConfirmDialog open={confirmOpen} slot={storeSlot} text={confirmText} onText={setConfirmText} onClose={() => setConfirmOpen(false)} onConfirm={() => void confirmStore()} />
      <SettingsDialog open={settingsOpen} labelMode={knobLabelMode} activity={activity} onLabelMode={setKnobLabelMode} onClear={() => setActivity([])} onClose={() => setSettingsOpen(false)} />
      <div className={`toast${toast ? ` show${toast.error ? " error" : ""}` : ""}`} role="status">{toast?.message}</div>
    </>
  );
}
