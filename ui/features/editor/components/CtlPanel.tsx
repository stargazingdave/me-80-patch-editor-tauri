import type { DecodedPatch, Edit } from "../../../domain/types";
import { ctlCode, ctlEffects, ctlKnobTargets, ctlTargetBytes } from "../effectDefinitions";
import RangeEditor from "./RangeEditor";
import shared from "../../../styles/shared.module.css";
import styles from "../PatchEditor.module.css";

export default function CtlPanel({ decoded, onEdit, onEditMany }: { decoded: DecodedPatch; onEdit: (field: string, value: number) => void; onEditMany: (edits: Edit[]) => void }) {
  const code = ctlCode(decoded.control);
  const effectsMode = decoded.control.assignmentType === "effects";
  const safeTarget = code <= 0x14 ? code : 0;
  const currentKnobValue = (target: number) => {
    const definition = ctlKnobTargets[target];
    if (!definition) return 0;
    const sectionTargets = ctlKnobTargets.filter((item) => item.effect === definition.effect);
    return decoded.parameters[definition.effect][sectionTargets.findIndex((item) => item.target === target)];
  };
  const ctlValue = effectsMode ? currentKnobValue(safeTarget) : decoded.control.knobValue;
  const modeName = decoded.control.mode === 1 ? "Toggle" : "Momentary";
  const selectedEffects = ctlEffects.filter((effect) => (code & effect.bit) !== 0).map((effect) => effect.label);
  const summary = effectsMode ? `${modeName} · ${selectedEffects.length ? selectedEffects.join(" + ") : "No effects"}` : `${modeName} · ${ctlKnobTargets[safeTarget].label} → ${decoded.control.knobValue}`;

  const setKind = (kind: "effects" | "knob") => {
    if (kind === decoded.control.assignmentType) return;
    if (kind === "effects") {
      const current = ctlKnobTargets[Math.min(code, 0x14)] || ctlKnobTargets[0];
      const mask = ctlEffects.find((effect) => effect.key === current.effect)?.bit || 0x01;
      const target = ctlTargetBytes(mask);
      onEditMany([{ field: "ctrl_knob_value", value: 100 }, { field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }]);
      return;
    }
    const firstSelected = ctlEffects.find((effect) => (code & effect.bit) !== 0 && ctlKnobTargets.some((target) => target.effect === effect.key));
    const targetDefinition = ctlKnobTargets.find((target) => target.effect === firstSelected?.key) || ctlKnobTargets[0];
    const target = ctlTargetBytes(targetDefinition.target);
    onEditMany([{ field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }, { field: "ctrl_knob_value", value: currentKnobValue(targetDefinition.target) }]);
  };
  const toggleEffect = (bit: number, checked: boolean) => {
    const target = ctlTargetBytes(checked ? code | bit : code & ~bit);
    onEditMany([{ field: "ctrl_knob_value", value: 100 }, { field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }]);
  };

  return <section className={styles.ctlPanel} aria-labelledby="ctl-title"><div className={styles.ctlHeading}><div><span className={shared.eyebrow}>Foot control</span><strong id="ctl-title">CTL assignment</strong></div><span>{summary}</span></div><div className={styles.ctlLayout}><fieldset className={styles.ctlKind}><legend>Action</legend><label><input type="radio" name="ctl-kind" value="effects" checked={effectsMode} onChange={() => setKind("effects")} /><span>Switch effects</span></label><label><input type="radio" name="ctl-kind" value="knob" checked={!effectsMode} onChange={() => setKind("knob")} /><span>Recall knob value</span></label></fieldset><label className={styles.ctlMode}>Behavior<select value={decoded.control.mode} onChange={(event) => onEdit("ctl_mode", Number(event.target.value))}><option value="1">Toggle</option><option value="0">Momentary</option></select></label></div>
    {effectsMode ? <div className={styles.ctlEffects} aria-label="Effects controlled by CTL">{ctlEffects.map((effect) => <label key={effect.key}><input type="checkbox" checked={(code & effect.bit) !== 0} onChange={(event) => toggleEffect(effect.bit, event.target.checked)} /><span>{effect.label}</span></label>)}</div> : <div className={styles.ctlKnob}><label>Target knob<select value={safeTarget} onChange={(event) => { const target = ctlTargetBytes(Number(event.target.value)); onEditMany([{ field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }, { field: "ctrl_knob_value", value: decoded.control.knobValue }]); }}>{ctlKnobTargets.map((target) => <option key={target.target} value={target.target}>{target.label}</option>)}</select></label><label>Assigned value<RangeEditor value={ctlValue} minimum={0} maximum={99} onCommit={(value) => onEdit("ctrl_knob_value", value)} /></label></div>}
    <p className={styles.ctlHelp}>Stored per patch. Live Sync changes remain temporary until Store is used.</p>
  </section>;
}
