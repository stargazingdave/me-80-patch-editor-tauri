import type { Edit, LabelMode, PatchView, Status } from "../../domain/types";
import CtlPanel from "./components/CtlPanel";
import EffectBoard from "./components/EffectBoard";
import RangeEditor from "./components/RangeEditor";
import SignalChain from "./components/SignalChain";
import shared from "../../styles/shared.module.css";
import styles from "./PatchEditor.module.css";

interface PatchEditorProps {
  patch: PatchView | null;
  status: Status | null;
  nameDraft: string;
  labelMode: LabelMode;
  onNameChange: (name: string) => void;
  onNameCommit: () => void;
  onEdit: (field: string, value: number) => void;
  onEditMany: (edits: Edit[]) => void;
  onEditReverb: (type: number, level: number) => void;
}

export default function PatchEditor({ patch, status, nameDraft, labelMode, onNameChange, onNameCommit, onEdit, onEditMany, onEditReverb }: PatchEditorProps) {
  if (!patch || !status) return <section className={`${shared.panel} ${styles.editorPanel}`}><div className={styles.emptyState}><div className={styles.emptyGlyph}>80</div><h2>Select a patch to begin</h2><p>Open a stored patch, import a Tone Studio liveset, or read directly from the connected ME-80.</p></div></section>;
  const decoded = patch.decoded;
  return <section className={`${shared.panel} ${styles.editorPanel}`}><div>
    <div className={styles.editorHeader}><div><span className={shared.eyebrow}>{patch.sourceLabel}</span><input className={styles.patchName} maxLength={16} aria-label="Patch name" value={nameDraft} onChange={(event) => onNameChange(event.target.value)} onBlur={onNameCommit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div><div className={styles.changeCounter}><strong>{patch.changes.length}</strong><span>changes</span></div></div>
    <SignalChain patch={decoded} />
    <EffectBoard patch={patch} status={status} labelMode={labelMode} onEdit={onEdit} onEditReverb={onEditReverb} />
    <section className={styles.noiseStrip}><div><strong>NS</strong><small>Noise Suppressor</small></div><label htmlFor="ns-thresh">Threshold</label><RangeEditor id="ns-thresh" value={decoded.noiseSuppressorThreshold} minimum={0} maximum={50} onCommit={(value) => onEdit("ns_thresh", value)} /></section>
    <CtlPanel decoded={decoded} onEdit={onEdit} onEditMany={onEditMany} />
    <details className={styles.rawInspector}><summary>Raw 71-byte patch data</summary><code>{patch.dataHex}</code></details>
  </div></section>;
}
