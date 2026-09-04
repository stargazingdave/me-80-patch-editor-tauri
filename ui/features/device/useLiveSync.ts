import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { LiveOrigin, MidiLog, PatchView } from "../../domain/types";
import { api, errorMessage } from "../../services/tauriApi";

type SelectedPorts = { inputIndex: number; outputIndex: number };

type UseLiveSyncOptions = {
  liveRef: MutableRefObject<boolean>;
  busyRef: MutableRefObject<boolean>;
  currentPatchRef: MutableRefObject<PatchView | null>;
  selectedPorts: () => SelectedPorts;
  setPatch: (patch: PatchView) => void;
  showToast: (message: string, error?: boolean) => void;
  addActivity: (kind: string, message: string, error?: boolean) => void;
  addMidiLogs: (logs?: MidiLog[]) => void;
};

export function useLiveSync({
  liveRef,
  busyRef,
  currentPatchRef,
  selectedPorts,
  setPatch,
  showToast,
  addActivity,
  addMidiLogs,
}: UseLiveSyncOptions) {
  const [live, setLiveState] = useState(false);
  const [origin, setOriginState] = useState<LiveOrigin | null>(null);
  const [status, setStatus] = useState("Off");
  const originRef = useRef<LiveOrigin | null>(null);
  const timer = useRef<number | null>(null);
  const polling = useRef(false);
  const failures = useRef(0);
  const closing = useRef<Promise<void> | null>(null);

  const setLive = (value: boolean) => {
    liveRef.current = value;
    setLiveState(value);
  };

  const setOrigin = (value: LiveOrigin | null) => {
    originRef.current = value;
    setOriginState(value);
  };

  const normalStatus = () => originRef.current === "pedal" ? "On · pedal patch" : "On · editor patch";

  async function stop(statusText = "Off") {
    let pendingClose = closing.current ?? Promise.resolve();
    if (liveRef.current) {
      pendingClose = api<unknown>("/api/device/live-stop", "POST")
        .then(() => undefined)
        .catch((error) => { addActivity("MIDI CLOSE", errorMessage(error), true); });
      closing.current = pendingClose;
    }
    setLive(false);
    setOrigin(null);
    polling.current = false;
    failures.current = 0;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setStatus(statusText);
    await pendingClose.finally(() => {
      if (closing.current === pendingClose) closing.current = null;
    });
  }

  function handleFailure(error: unknown, context: string) {
    failures.current += 1;
    addActivity("SYNC ISSUE", `${context}: ${errorMessage(error)}`, true);
    if (failures.current >= 3) {
      void stop("Stopped after 3 errors");
      showToast("Live Sync stopped after three consecutive errors.", true);
      return;
    }
    setStatus(`Connection issue · retrying ${failures.current}/3`);
    showToast(`${context}; Live Sync will retry.`, true);
  }

  async function poll() {
    const patch = currentPatchRef.current;
    if (!liveRef.current || polling.current || busyRef.current || !patch) return;
    polling.current = true;
    try {
      const result = await api<{ patch: PatchView; changed: boolean; logs: MidiLog[] }>(
        "/api/device/live-poll",
        "POST",
        { ...selectedPorts(), sessionId: patch.id, confirm: "LIVE_SYNC" },
      );
      failures.current = 0;
      setStatus(normalStatus());
      if (result.changed) {
        setPatch(result.patch);
        addMidiLogs(result.logs);
      }
    } catch (error) {
      handleFailure(error, "Pedal read was interrupted");
    } finally {
      polling.current = false;
    }
  }

  function activate(nextOrigin: LiveOrigin) {
    setLive(true);
    setOrigin(nextOrigin);
    failures.current = 0;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => { void poll(); }, 50);
    setStatus(nextOrigin === "pedal" ? "On · pedal patch" : "On · editor patch");
  }

  useEffect(() => () => {
    if (timer.current !== null) window.clearInterval(timer.current);
  }, []);

  return {
    live,
    origin,
    status,
    failures,
    setOrigin,
    setStatus,
    normalStatus,
    stop,
    activate,
    handleFailure,
  };
}
