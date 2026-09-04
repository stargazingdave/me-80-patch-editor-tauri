import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Modal } from "./Panels";
import type { DevicePatch, LibrarySource, LibraryView, LiveSetPatch, LocalLibrary, LocalPatch, LocalSource, PatchView } from "./model";

function PatchButton({ slot, name, active, onClick }: { slot: string; name: string; active: boolean; onClick: () => void }) {
  return <button className={`patch-item${active ? " active" : ""}`} title={`${slot} · ${name || "(unnamed)"}`} aria-label={`${slot} · ${name || "(unnamed)"}`} onClick={onClick}><span className="slot" data-number={slot.includes("-") ? slot.split("-").at(-1) : slot}>{slot}</span><strong>{name || "(unnamed)"}</strong></button>;
}

function LocalAction({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return <button type="button" title={title} onClick={(event) => { event.stopPropagation(); onClick(); }}>{label}</button>;
}

interface LibraryPanelProps {
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

export default function LibraryPanel(props: LibraryPanelProps) {
  const [textRequest, setTextRequest] = useState<{ title: string; label: string; value: string; maxLength?: number; submit: (value: string) => void } | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<{ title: string; message: string; actionLabel: string; confirm: () => void } | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (textRequest) requestAnimationFrame(() => textInput.current?.focus()); }, [textRequest !== null]);
  const bankedPatches = useMemo(() => {
    const banks = new Map<string, DevicePatch[]>();
    for (const patch of props.devicePatches) {
      const label = /^([UP]\d)-[1-4]$/u.exec(patch.slot)?.[1] ?? "Other";
      banks.set(label, [...(banks.get(label) ?? []), patch]);
    }
    return [...banks.entries()];
  }, [props.devicePatches]);

  const renameLocal = (kind: "patch" | "liveSet", id: string, currentName: string) => {
    setTextRequest({
      title: kind === "patch" ? "Rename patch" : "Rename Live Set",
      label: kind === "patch" ? "Patch name (1–16 characters)" : "Live Set name",
      value: currentName,
      maxLength: kind === "patch" ? 16 : undefined,
      submit: (name) => props.onLocalMutation("/api/local/rename", { kind, id, name }, kind === "patch" ? "Patch renamed." : "Live Set renamed.")
    });
  };
  const deleteLocal = (kind: "patch" | "liveSet", id: string, name: string) => {
    setConfirmRequest({
      title: kind === "patch" ? "Delete local patch?" : "Delete Live Set?",
      message: `“${name}” will be removed from the local library.`,
      actionLabel: "Delete",
      confirm: () => props.onLocalMutation("/api/local/delete", { kind, id }, kind === "patch" ? "Patch deleted." : "Live Set deleted.")
    });
  };
  const confirmRemove = (id: string, index: number, itemName: string, setName: string) => {
    setConfirmRequest({
      title: "Remove patch from Live Set?",
      message: `“${itemName}” will be removed from “${setName}”.`,
      actionLabel: "Remove",
      confirm: () => props.onLocalMutation("/api/local/remove-live-patch", { id, index }, "Patch removed from Live Set.")
    });
  };

  return (
    <><aside className="library-panel panel">
      <div className="panel-heading"><div><span className="eyebrow">Sources</span><h2>Patch library</h2></div><button className="small-button" onClick={() => props.fileInput.current?.click()}>Import .tsl</button><input ref={props.fileInput} type="file" accept=".tsl,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onImport(file); event.currentTarget.value = ""; }} /></div>

      {props.source === "device" && !props.live && <button className="live-patch-button" disabled={props.busy} onClick={props.onReadCurrent}><span className="live-icon">⌁</span><span><strong>Read current patch</strong><small>Load the pedal’s active buffer</small></span><span>→</span></button>}

      <div className="library-source-switch" role="tablist" aria-label="Patch source"><button role="tab" aria-selected={props.source === "device"} onClick={() => props.onSource("device")}>ME-80</button><button role="tab" aria-selected={props.source === "local"} onClick={() => props.onSource("local")}>Local library</button></div>

      {props.source === "local" && <div className="local-actions">
        <button title="Save the editor's current patch locally" onClick={() => {
          if (!props.currentPatch) return props.onToast("Open a patch first.", true);
          if (props.currentLocalSource?.kind === "liveSet") props.onLocalMutation("/api/local/save-live-patch", { setId: props.currentLocalSource.id, index: props.currentLocalSource.index, sessionId: props.currentPatch.id }, "Live Set patch saved.");
          else { const existing = props.currentLocalSource?.kind === "patch" ? props.currentLocalSource.id : undefined; props.onLocalMutation("/api/local/save-patch", { sessionId: props.currentPatch.id, id: existing, name: props.currentPatch.decoded.name.text }, existing ? "Local patch saved." : "Patch added to local library."); }
        }}>Save patch</button>
        <button onClick={() => setTextRequest({ title: "New Live Set", label: "Live Set name", value: "", submit: (name) => props.onLocalMutation("/api/local/create-set", { name }, "Live Set created.") })}>New set</button>
        <button title="Reload files from the library folder" onClick={props.onReloadLocal}>↻</button>
      </div>}

      <div className="library-meta"><span>{props.source === "device" ? "USER + PRESET" : "LOCAL LIBRARY"}</span><div className="library-meta-actions"><small>{props.source === "device" ? props.deviceLoading ? "Reading…" : `${props.devicePatches.length} PATCHES` : `${props.localLibrary.patches.length + props.localLibrary.liveSets.length} FILES`}</small>{props.source === "device" && <div className="view-switch" role="group" aria-label="Patch library view"><button type="button" aria-label="Show patch names" title="List view" aria-pressed={props.view === "list"} onClick={() => props.onView("list")}>☰</button><button type="button" aria-label="Show four-patch banks" title="Bank view" aria-pressed={props.view === "banks"} onClick={() => props.onView("banks")}>▦</button></div>}</div></div>

      {props.deviceLoading && props.source === "device" && <div className="library-loader" role="status" aria-live="polite"><span className="library-spinner" aria-hidden="true" /><strong>Reading patches from ME-80</strong><small>Scanning all 72 stored slots…</small></div>}

      <div className={`patch-list ${props.source === "device" ? `${props.view}-view banked` : "list-view unbanked"}`} aria-busy={props.deviceLoading || undefined}>
        {props.source === "device" ? bankedPatches.map(([label, patches]) => <section className="patch-bank" key={label}><div className="patch-bank-heading">{label}</div><div className="patch-bank-items">{patches.map((patch) => <PatchButton key={patch.slot} slot={patch.slot} name={patch.name} active={props.activeKey === patch.slot} onClick={() => props.onLoadDevice(patch)} />)}</div></section>) : <LocalContents {...props} renameLocal={renameLocal} deleteLocal={deleteLocal} confirmRemove={confirmRemove} />}
      </div>
    </aside>
      <Modal open={textRequest !== null} labelledBy="local-text-dialog-title" onClose={() => setTextRequest(null)}>
        <span className="dialog-kicker">Local library</span><h2 id="local-text-dialog-title">{textRequest?.title}</h2>
        <label>{textRequest?.label}<input ref={textInput} value={textRequest?.value ?? ""} maxLength={textRequest?.maxLength} onChange={(event) => setTextRequest((request) => request ? { ...request, value: event.target.value } : request)} onKeyDown={(event) => { if (event.key === "Enter" && textRequest?.value.trim()) { event.preventDefault(); textRequest.submit(textRequest.value.trim()); setTextRequest(null); } }} /></label>
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setTextRequest(null)}>Cancel</button><button type="button" className="primary-button" disabled={!textRequest?.value.trim()} onClick={() => { if (!textRequest?.value.trim()) return; textRequest.submit(textRequest.value.trim()); setTextRequest(null); }}>Save</button></div>
      </Modal>
      <Modal open={confirmRequest !== null} labelledBy="local-confirm-dialog-title" onClose={() => setConfirmRequest(null)}>
        <span className="dialog-kicker">Local library</span><h2 id="local-confirm-dialog-title">{confirmRequest?.title}</h2><p>{confirmRequest?.message}</p>
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setConfirmRequest(null)}>Cancel</button><button type="button" className="danger-button" onClick={() => { confirmRequest?.confirm(); setConfirmRequest(null); }}>{confirmRequest?.actionLabel}</button></div>
      </Modal>
    </>
  );
}

function LocalContents(props: LibraryPanelProps & { renameLocal: (kind: "patch" | "liveSet", id: string, name: string) => void; deleteLocal: (kind: "patch" | "liveSet", id: string, name: string) => void; confirmRemove: (id: string, index: number, itemName: string, setName: string) => void }) {
  return <>
    {props.localLibrary.patches.map((patch) => {
      const source: LocalSource = { kind: "patch", id: patch.id };
      const key = `local-patch-${patch.id}-one`;
      return <div className="local-patch-row" key={patch.id}><PatchButton slot="PATCH" name={patch.name} active={props.activeKey === key} onClick={() => props.onLoadLocal(patch, source)} /><div className="local-row-actions"><LocalAction label="⧉" title="Duplicate patch" onClick={() => props.onLocalMutation("/api/local/duplicate", { kind: "patch", id: patch.id }, "Patch duplicated.")} /><LocalAction label="✎" title="Rename patch" onClick={() => props.renameLocal("patch", patch.id, patch.name)} /><LocalAction label="×" title="Delete patch" onClick={() => props.deleteLocal("patch", patch.id, patch.name)} /></div></div>;
    })}
    {props.localLibrary.liveSets.map((liveSet) => <section className="local-set" key={liveSet.id}>
      <div className="local-set-heading"><strong>{liveSet.name} · {liveSet.patches.length}</strong><div className="local-set-actions"><LocalAction label="+" title="Add the patch currently open in the editor" onClick={() => { if (!props.currentPatch) return props.onToast("Open a patch first.", true); props.onLocalMutation("/api/local/add-to-set", { setId: liveSet.id, sessionId: props.currentPatch.id }, "Patch added to Live Set."); }} /><LocalAction label="✎" title="Rename Live Set" onClick={() => props.renameLocal("liveSet", liveSet.id, liveSet.name)} /><LocalAction label="⧉" title="Duplicate Live Set" onClick={() => props.onLocalMutation("/api/local/duplicate", { kind: "liveSet", id: liveSet.id }, "Live Set duplicated.")} /><LocalAction label="×" title="Delete Live Set" onClick={() => props.deleteLocal("liveSet", liveSet.id, liveSet.name)} /></div></div>
      {liveSet.patches.map((item) => {
        const source: LocalSource = { kind: "liveSet", id: liveSet.id, index: item.index };
        const key = `local-liveSet-${liveSet.id}-${item.index}`;
        return <div className="local-patch-row" key={item.index}><PatchButton slot={String(item.index + 1).padStart(2, "0")} name={item.name} active={props.activeKey === key} onClick={() => props.onLoadLocal(item, source)} /><div className="local-row-actions"><LocalAction label="↑" title="Move up" onClick={() => { if (item.index > 0) props.onLocalMutation("/api/local/move-live-patch", { id: liveSet.id, from: item.index, to: item.index - 1 }); }} /><LocalAction label="↓" title="Move down" onClick={() => { if (item.index + 1 < liveSet.patches.length) props.onLocalMutation("/api/local/move-live-patch", { id: liveSet.id, from: item.index, to: item.index + 1 }); }} /><LocalAction label="×" title="Remove from Live Set" onClick={() => props.confirmRemove(liveSet.id, item.index, item.name, liveSet.name)} /></div></div>;
      })}
    </section>)}
    {!props.localLibrary.patches.length && !props.localLibrary.liveSets.length && <p className="local-empty">No local patches or Live Sets yet. Save the open patch, create a set, or import a .tsl file.</p>}
  </>;
}
