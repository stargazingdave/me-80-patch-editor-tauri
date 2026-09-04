import { useEffect, useRef, useState } from "react";
import {
  type DevicePatch, type Edit, type LabelMode,
  type LiveSetPatch, type LocalPatch,
  type LocalSource, type MidiLog, type PatchView, type StoreDraft
} from "../domain/types";
import { api, errorMessage } from "../services/tauriApi";
import { useNotifications } from "../hooks/useNotifications";
import { useStoredPreference } from "../hooks/useStoredPreference";
import { useMidiStatus } from "../features/device/useMidiStatus";
import { useLiveSync } from "../features/device/useLiveSync";
import { usePatchSession } from "../features/editor/usePatchSession";
import { usePatchLibrary } from "../features/library/usePatchLibrary";

const KNOB_LABEL_MODE_KEY = "me80-knob-label-mode";

export function useAppController() {
  const { activity, toast, showToast, addActivity, addMidiLogs, clearActivity } = useNotifications();
  const { status, statusError, inputIndex, outputIndex, setInputIndex, setOutputIndex, selectedPorts, refreshStatus, connected, normalInputs, normalOutputs } = useMidiStatus(showToast);
  const liveRef = useRef(false);
  const { currentPatch, currentPatchRef, nameDraft, pendingNameEdit, setNameDraft, setPatch, commitNameEdit } = usePatchSession({ liveRef, showToast });
  const [busy, setBusyState] = useState(false);
  const [knobLabelMode, setKnobLabelMode] = useStoredPreference<LabelMode>(KNOB_LABEL_MODE_KEY, "hardware", (value): value is LabelMode => value === "hardware" || value === "current");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [storeSlot, setStoreSlot] = useState("U9-4");
  const [confirmText, setConfirmText] = useState("");
  const [storeDraft, setStoreDraft] = useState<StoreDraft | null>(null);

  const busyRef = useRef(false);

  const setBusy = (value: boolean) => { busyRef.current = value; setBusyState(value); };
  const {
    live,
    origin: liveOrigin,
    status: liveStatus,
    failures: liveFailures,
    setOrigin: setLiveOrigin,
    setStatus: setLiveStatus,
    normalStatus: normalLiveStatus,
    stop: stopLive,
    activate: activateLive,
    handleFailure: handleLiveFailure,
  } = useLiveSync({ liveRef, busyRef, currentPatchRef, selectedPorts, setPatch, showToast, addActivity, addMidiLogs });
  const {
    source: librarySource,
    view: libraryView,
    activeKey: activeLibraryKey,
    devicePatches,
    deviceLoading,
    localLibrary,
    currentLocalSource,
    fileInput,
    setView: setLibraryView,
    setActiveKey: setActiveLibraryKey,
    setCurrentLocalSource,
    setDevicePatches,
    setSource: setLibrarySource,
    loadDeviceLibrary,
    loadLocalLibrary,
    mutateLocal,
    importTsl,
  } = usePatchLibrary({ selectedPorts, setBusy, showToast, addActivity, addMidiLogs });

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

  useEffect(() => {
    void (async () => {
      const next = await refreshStatus();
      if (next?.suggestedInput !== undefined && next.suggestedOutput !== undefined) await loadDeviceLibrary({ inputIndex: next.suggestedInput, outputIndex: next.suggestedOutput });
    })();
  }, []);

  const loadDevicePatch = (patch: DevicePatch) => void loadPatch(patch.slot, patch.slot, async () => (await api<{ patch: PatchView }>("/api/library/load-device", "POST", { slot: patch.slot })).patch);
  const loadLocalPatch = (item: LocalPatch | LiveSetPatch, source: LocalSource) => void loadPatch(source.kind === "patch" ? "PATCH" : String(source.index + 1).padStart(2, "0"), `local-${source.kind}-${source.id}-${source.kind === "liveSet" ? source.index : "one"}`, async () => { const result = await api<{ patch: PatchView }>("/api/local/load", "POST", source); setCurrentLocalSource(source); return result.patch; });

  const refreshDevice = async () => {
    await stopLive();
    const next = await refreshStatus();
    if (!next) return;
    const input = next.inputs.find((port) => port.normal)?.index;
    const output = next.outputs.find((port) => port.normal)?.index;
    if (input !== undefined && output !== undefined) await loadDeviceLibrary({ inputIndex: input, outputIndex: output });
  };

  return {
    header: { status, statusError, connected, busy, live, onSettings: () => setSettingsOpen(true), onRefresh: () => void refreshDevice() },
    library: {
      source: librarySource, view: libraryView, activeKey: activeLibraryKey, devicePatches, deviceLoading,
      localLibrary, busy, live, currentPatch, currentLocalSource, fileInput,
      onSource: setLibrarySource, onView: setLibraryView, onImport: (file: File) => void importTsl(file),
      onReadCurrent: () => void readCurrent(), onLoadDevice: loadDevicePatch, onLoadLocal: loadLocalPatch,
      onLocalMutation: (path: string, body: Record<string, unknown>, success?: string) => void mutateLocal(path, body, success),
      onReloadLocal: () => void loadLocalLibrary(), onToast: showToast
    },
    editor: {
      patch: currentPatch, status, nameDraft, labelMode: knobLabelMode, onNameChange: setNameDraft,
      onNameCommit: commitNameEdit, onEdit: editField, onEditMany: (edits: Edit[]) => void editFields(edits), onEditReverb: editReverb
    },
    actions: {
      inputs: normalInputs, outputs: normalOutputs, inputIndex, outputIndex, busy, live, liveOrigin, liveStatus,
      patch: currentPatch, storeSlot, nameDraft, onInput: setInputIndex, onOutput: setOutputIndex,
      onStopLive: () => void stopLive().then(() => addActivity("LIVE", "Live Sync stopped; no automatic MIDI traffic remains.")),
      onStartPedal: () => void startLiveFromPedal(), onStartEditor: () => void startLiveFromEditor(), onAudition: () => void audition(),
      onStoreSlot: setStoreSlot, onRequestStore: requestStore
    },
    confirmDialog: { open: confirmOpen, slot: storeSlot, text: confirmText, onText: setConfirmText, onClose: () => setConfirmOpen(false), onConfirm: () => void confirmStore() },
    settingsDialog: { open: settingsOpen, labelMode: knobLabelMode, activity, onLabelMode: setKnobLabelMode, onClear: clearActivity, onClose: () => setSettingsOpen(false) },
    toast
  };
}
