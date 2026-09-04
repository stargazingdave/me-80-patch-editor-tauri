import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { storeSlots, type ActivityEntry, type LabelMode, type LiveOrigin, type MidiPort, type PatchView } from "./model";

export function ActionPanel({ inputs, outputs, inputIndex, outputIndex, busy, live, liveOrigin, liveStatus, patch, storeSlot, nameDraft, onInput, onOutput, onStopLive, onStartPedal, onStartEditor, onAudition, onStoreSlot, onRequestStore }: {
  inputs: MidiPort[];
  outputs: MidiPort[];
  inputIndex?: number;
  outputIndex?: number;
  busy: boolean;
  live: boolean;
  liveOrigin: LiveOrigin | null;
  liveStatus: string;
  patch: PatchView | null;
  storeSlot: string;
  nameDraft: string;
  onInput: (index: number) => void;
  onOutput: (index: number) => void;
  onStopLive: () => void;
  onStartPedal: () => void;
  onStartEditor: () => void;
  onAudition: () => void;
  onStoreSlot: (slot: string) => void;
  onRequestStore: (name: string) => void;
}) {
  return (
    <aside className="action-panel panel">
      <div className="panel-heading"><div><span className="eyebrow">Hardware</span><h2>Send to pedal</h2></div></div>
      <div className="port-fields"><label>MIDI input<select value={inputIndex ?? ""} disabled={busy || live} onChange={(event) => onInput(Number(event.target.value))}>{inputs.map((port) => <option key={port.index} value={port.index}>[{port.index}] {port.name}</option>)}</select></label><label>MIDI output<select value={outputIndex ?? ""} disabled={busy || live} onChange={(event) => onOutput(Number(event.target.value))}>{outputs.map((port) => <option key={port.index} value={port.index}>[{port.index}] {port.name}</option>)}</select></label></div>
      <section className={`live-card${live ? " active" : ""}`}><div><span className="live-label">LIVE SYNC</span><strong>{liveStatus}</strong></div><label className="live-toggle"><input type="checkbox" checked={live} disabled={busy || !live} onChange={(event) => { if (!event.target.checked) onStopLive(); }} /><span /></label><p>{live ? liveOrigin === "pedal" ? "Started from the pedal's active patch. Changes now synchronize both ways and remain temporary." : "The editor patch was loaded into pedal temporary memory. Changes now synchronize both ways and remain temporary." : "Choose which patch should become the starting point. Live changes remain temporary until Store is explicitly used."}</p><div className="live-start-actions"><button disabled={busy || live} onClick={onStartPedal}><span>ME-80 → APP</span><strong>Use pedal patch</strong><small>Read without changing the pedal</small></button><button disabled={busy || live || !patch} onClick={onStartEditor}><span>APP → ME-80</span><strong>Send editor patch</strong><small>Load into temporary memory</small></button></div></section>
      {!live && <section className="action-card audition-card"><span className="action-number">01</span><h3>Temporary audition</h3><p>Loads the edited sound into temporary memory. It disappears when another stored patch is recalled.</p><button className="primary-button" disabled={busy || !patch} onClick={onAudition}>Audition patch</button></section>}
      <section className="action-card store-card"><span className="action-number">02</span><h3>Store permanently</h3><p>A fresh recovery capture is saved before one verified write to a user slot.</p><label className="slot-field">Destination<select value={storeSlot} onChange={(event) => onStoreSlot(event.target.value)}>{storeSlots.map((slot) => <option key={slot}>{slot}</option>)}</select></label><button className="danger-button" disabled={busy || !patch} onMouseDown={(event) => event.preventDefault()} onClick={() => onRequestStore(nameDraft)}>Store to selected slot</button></section>
    </aside>
  );
}

export function Modal({ open, className, labelledBy, children, onClose }: { open: boolean; className?: string; labelledBy?: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={className} aria-labelledby={labelledBy} onClose={onClose} onCancel={onClose}>{children}</dialog>;
}

export function ConfirmDialog({ open, slot, text, onText, onClose, onConfirm }: { open: boolean; slot: string; text: string; onText: (text: string) => void; onClose: () => void; onConfirm: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);
  return <Modal open={open} onClose={onClose}><span className="dialog-kicker">Permanent write</span><h2>Overwrite <strong>{slot}</strong>?</h2><p>The current destination will be read and saved first. Type the slot name to enable the one-shot write.</p><label>Type <strong>{slot}</strong><input ref={inputRef} autoComplete="off" value={text} onChange={(event) => onText(event.target.value)} /></label><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="danger-button" disabled={text !== slot} onClick={onConfirm}>Save recovery &amp; write</button></div></Modal>;
}

export function SettingsDialog({ open, labelMode, activity, onLabelMode, onClear, onClose }: { open: boolean; labelMode: LabelMode; activity: ActivityEntry[]; onLabelMode: (mode: LabelMode) => void; onClear: () => void; onClose: () => void }) {
  return <Modal open={open} className="settings-dialog" labelledBy="settings-title" onClose={onClose}><span className="dialog-kicker">Preferences</span><h2 id="settings-title">Settings</h2><p>Choose how the parameter labels above the effect knobs are displayed.</p><fieldset className="settings-options"><legend>Knob labels</legend><label className="settings-choice"><input type="radio" name="knob-label-mode" value="hardware" checked={labelMode === "hardware"} onChange={() => onLabelMode("hardware")} /><span><strong>Hardware labels</strong><small>Show the full panel legend and highlight the active function.</small></span></label><label className="settings-choice"><input type="radio" name="knob-label-mode" value="current" checked={labelMode === "current"} onChange={() => onLabelMode("current")} /><span><strong>Current function only</strong><small>Show only the parameter controlled by the selected effect type.</small></span></label></fieldset><details className="settings-diagnostics"><summary>Diagnostics</summary><p>Recent MIDI traffic and hardware operations for troubleshooting.</p><section className="activity"><div className="activity-heading"><h3>Activity log</h3><button type="button" onClick={onClear}>Clear</button></div><div className="activity-log">{activity.length ? activity.map((entry) => <div key={entry.id} className={`log-entry${entry.error ? " error" : ""}`}><strong>{entry.label}</strong><span>{entry.time}</span><code>{entry.detail}</code></div>) : <p className="muted">No operations yet.</p>}</div></section></details><div className="dialog-actions settings-actions"><button type="button" className="primary-button" onClick={onClose}>Done</button></div></Modal>;
}
