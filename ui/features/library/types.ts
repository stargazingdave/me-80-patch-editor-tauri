import type { RefObject } from "react";
import type { DevicePatch, LibrarySource, LibraryView, LiveSetPatch, LocalLibrary, LocalPatch, LocalSource, PatchView } from "../../domain/types";

export interface LibraryPanelProps {
  source: LibrarySource;
  view: LibraryView;
  activeKey: string | null;
  devicePatches: DevicePatch[];
  deviceLoading: boolean;
  localLibrary: LocalLibrary;
  busy: boolean;
  live: boolean;
  currentPatch: PatchView | null;
  currentLocalSource: LocalSource | null;
  fileInput: RefObject<HTMLInputElement | null>;
  onSource: (source: LibrarySource) => void;
  onView: (view: LibraryView) => void;
  onImport: (file: File) => void;
  onReadCurrent: () => void;
  onLoadDevice: (patch: DevicePatch) => void;
  onLoadLocal: (item: LocalPatch | LiveSetPatch, source: LocalSource) => void;
  onLocalMutation: (path: string, body: Record<string, unknown>, success?: string) => void;
  onReloadLocal: () => void;
  onToast: (message: string, error?: boolean) => void;
}

export interface TextRequest { title: string; label: string; value: string; maxLength?: number; submit: (value: string) => void }
export interface ConfirmRequest { title: string; message: string; actionLabel: string; confirm: () => void }
