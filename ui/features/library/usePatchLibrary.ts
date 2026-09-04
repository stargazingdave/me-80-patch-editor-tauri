import { useRef, useState } from "react";
import type {
  DevicePatch,
  LibrarySource,
  LibraryView,
  LocalLibrary,
  LocalSource,
  MidiLog,
} from "../../domain/types";
import { useStoredPreference } from "../../hooks/useStoredPreference";
import { api, errorMessage } from "../../services/tauriApi";

const emptyLocalLibrary: LocalLibrary = { patches: [], liveSets: [], warnings: [] };
const LIBRARY_VIEW_KEY = "me80-patch-library-view";

type SelectedPorts = { inputIndex: number; outputIndex: number };

type UsePatchLibraryOptions = {
  selectedPorts: () => SelectedPorts;
  setBusy: (value: boolean) => void;
  showToast: (message: string, error?: boolean) => void;
  addActivity: (kind: string, message: string, error?: boolean) => void;
  addMidiLogs: (logs?: MidiLog[]) => void;
};

export function usePatchLibrary({
  selectedPorts,
  setBusy,
  showToast,
  addActivity,
  addMidiLogs,
}: UsePatchLibraryOptions) {
  const [devicePatches, setDevicePatches] = useState<DevicePatch[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [localLibrary, setLocalLibrary] = useState<LocalLibrary>(emptyLocalLibrary);
  const [source, setSourceState] = useState<LibrarySource>("device");
  const [view, setView] = useStoredPreference<LibraryView>(
    LIBRARY_VIEW_KEY,
    "list",
    (value): value is LibraryView => value === "list" || value === "banks",
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [currentLocalSource, setCurrentLocalSource] = useState<LocalSource | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadDeviceLibrary(portOverride?: SelectedPorts) {
    setDeviceLoading(true);
    try {
      setBusy(true);
      const result = await api<{ patches: DevicePatch[]; logs: MidiLog[] }>(
        "/api/library/device",
        "POST",
        portOverride ?? selectedPorts(),
      );
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
      if (library.warnings.length) {
        addActivity("LIBRARY", `${library.warnings.length} invalid file(s) ignored.`, true);
      }
    } catch (error) {
      showToast(errorMessage(error), true);
    }
  }

  async function mutateLocal(path: string, body: Record<string, unknown>, success?: string) {
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

  async function importTsl(file: File) {
    try {
      setBusy(true);
      const sourceText = await file.text();
      const imported = await api<{ name: string }>("/api/local/import-tsl", "POST", { source: sourceText });
      setSourceState("local");
      await loadLocalLibrary();
      showToast(`Imported “${imported.name}” into the local library.`);
    } catch (error) {
      showToast(errorMessage(error), true);
      addActivity("ERROR", errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  function setSource(nextSource: LibrarySource) {
    setSourceState(nextSource);
    if (nextSource === "local") void loadLocalLibrary();
  }

  return {
    source,
    view,
    activeKey,
    devicePatches,
    deviceLoading,
    localLibrary,
    currentLocalSource,
    fileInput,
    setView,
    setActiveKey,
    setCurrentLocalSource,
    setDevicePatches,
    setSource,
    loadDeviceLibrary,
    loadLocalLibrary,
    mutateLocal,
    importTsl,
  };
}
