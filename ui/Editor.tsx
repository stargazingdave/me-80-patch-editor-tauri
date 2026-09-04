import { ContinuousKnob, EffectHeader, OptionKnob, ReverbCard } from "./Knobs";
import { useEffect, useState, type KeyboardEvent } from "react";
import { ctlCode, ctlEffects, ctlKnobTargets, ctlTargetBytes, effectChainMapping, effectDefinitions, type DecodedPatch, type Edit, type LabelMode, type ParameterEffectKey, type PatchView, type Status } from "./model";

export default function Editor({ patch, status, nameDraft, labelMode, onNameChange, onNameCommit, onEdit, onEditMany, onEditReverb }: {
  patch: PatchView | null;
  status: Status | null;
  nameDraft: string;
  labelMode: LabelMode;
  onNameChange: (name: string) => void;
  onNameCommit: () => void;
  onEdit: (field: string, value: number) => void;
  onEditMany: (edits: Edit[]) => void;
  onEditReverb: (type: number, level: number) => void;
}) {
  if (!patch || !status) {
    return <section className="editor-panel panel"><div className="empty-state"><div className="empty-glyph">80</div><h2>Select a patch to begin</h2><p>Open a stored patch, import a Tone Studio liveset, or read directly from the connected ME-80.</p></div></section>;
  }

  const decoded = patch.decoded;
  const chain = effectChainMapping.deriveEffectChain(decoded);
  const code = ctlCode(decoded.control);
  const effectsMode = decoded.control.assignmentType === "effects";
  const safeTarget = code <= 0x14 ? code : 0;
  const ctlKnobCurrentValue = (target: number) => {
    const definition = ctlKnobTargets[target];
    if (!definition) return 0;
    const sectionTargets = ctlKnobTargets.filter((item) => item.effect === definition.effect);
    const index = sectionTargets.findIndex((item) => item.target === target);
    return decoded.parameters[definition.effect][index];
  };
  const ctlValue = effectsMode ? ctlKnobCurrentValue(safeTarget) : decoded.control.knobValue;
  const modeName = decoded.control.mode === 1 ? "Toggle" : "Momentary";
  const selectedEffects = ctlEffects.filter((effect) => (code & effect.bit) !== 0).map((effect) => effect.label);
  const ctlSummary = effectsMode ? `${modeName} · ${selectedEffects.length ? selectedEffects.join(" + ") : "No effects"}` : `${modeName} · ${ctlKnobTargets[safeTarget].label} → ${decoded.control.knobValue}`;

  const setCtlKind = (kind: "effects" | "knob") => {
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
    onEditMany([{ field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }, { field: "ctrl_knob_value", value: ctlKnobCurrentValue(targetDefinition.target) }]);
  };

  const toggleCtlEffect = (bit: number, checked: boolean) => {
    const mask = checked ? code | bit : code & ~bit;
    const target = ctlTargetBytes(mask);
    onEditMany([{ field: "ctrl_knob_value", value: 100 }, { field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }]);
  };

  return (
    <section className="editor-panel panel"><div className="editor">
      <div className="editor-header">
        <div><span className="eyebrow">{patch.sourceLabel}</span><input className="patch-name" maxLength={16} aria-label="Patch name" value={nameDraft} onChange={(event) => onNameChange(event.target.value)} onBlur={onNameCommit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>
        <div className="change-counter"><strong>{patch.changes.length}</strong><span>changes</span></div>
      </div>

      <section className="signal-chain-panel" aria-labelledby="signal-chain-title">
        <div className="signal-chain-heading"><div><span className="eyebrow">Routing</span><strong id="signal-chain-title">Signal flow</strong></div><small>Derived from effect types</small></div>
        <div className="signal-chain-scroll"><div className="signal-chain-flow" aria-label="Current ME-80 signal flow"><span className="signal-chain-endpoint">IN</span>{chain.map((block) => <span key={block.key} className={`signal-chain-node${block.enabled ? "" : " off"}`} data-effect={block.key} title={`${block.label}: ${block.type} · ${block.enabled ? "On" : "Off"} · routing slot ${block.slot}`}><span className="signal-chain-lamp" /><strong>{block.label}</strong><small>{block.type}</small></span>)}<span className="signal-chain-endpoint">OUT</span></div></div>
      </section>

      <div className="pedal-surface">
        <div className="surface-label"><span>BOSS ME-80 SIGNAL CONTROLS</span><small>Direct hardware layout</small></div>
        <div className="effect-chain">{effectDefinitions.map((definition) => definition.key === "rev" ? (
          <ReverbCard key={definition.key} definition={definition} decoded={decoded} onEditReverb={onEditReverb} onEdit={onEdit} />
        ) : (
          <section key={definition.key} className={`effect-card${decoded.switches[definition.key] === 1 ? "" : " off"}`} data-effect={definition.key}>
            <EffectHeader definition={definition} decoded={decoded} enabled={decoded.switches[definition.key] === 1} onEdit={onEdit} />
            <OptionKnob definition={definition} labels={status.effectTypes[definition.key]} selected={decoded.types[definition.key]} onEdit={onEdit} />
            {definition.params.length > 0 && <div className="parameter-grid">{definition.params.map((field, index) => <ContinuousKnob key={field} definition={definition} parameterIndex={index} field={field} value={decoded.parameters[definition.key as ParameterEffectKey][index]} labelText={definition.parameterLabels?.[index] ?? field} typeIndex={decoded.types[definition.key]} labelMode={labelMode} onEdit={onEdit} />)}</div>}
          </section>
        ))}</div>
      </div>

      <section className="noise-strip"><div><strong>NS</strong><small>Noise Suppressor</small></div><label htmlFor="ns-thresh">Threshold</label><RangeEditor id="ns-thresh" value={decoded.noiseSuppressorThreshold} minimum={0} maximum={50} onCommit={(value) => onEdit("ns_thresh", value)} /></section>

      <CtlPanel decoded={decoded} code={code} effectsMode={effectsMode} safeTarget={safeTarget} ctlValue={ctlValue} summary={ctlSummary} onEdit={onEdit} onEditMany={onEditMany} setKind={setCtlKind} toggleEffect={toggleCtlEffect} />
      <details className="raw-inspector"><summary>Raw 71-byte patch data</summary><code>{patch.dataHex}</code></details>
    </div></section>
  );
}

function CtlPanel({ decoded, code, effectsMode, safeTarget, ctlValue, summary, onEdit, onEditMany, setKind, toggleEffect }: {
  decoded: DecodedPatch;
  code: number;
  effectsMode: boolean;
  safeTarget: number;
  ctlValue: number;
  summary: string;
  onEdit: (field: string, value: number) => void;
  onEditMany: (edits: Edit[]) => void;
  setKind: (kind: "effects" | "knob") => void;
  toggleEffect: (bit: number, checked: boolean) => void;
}) {
  return (
    <section className="ctl-panel" aria-labelledby="ctl-title">
      <div className="ctl-heading"><div><span className="eyebrow">Foot control</span><strong id="ctl-title">CTL assignment</strong></div><span>{summary}</span></div>
      <div className="ctl-layout"><fieldset className="ctl-kind"><legend>Action</legend><label><input type="radio" name="ctl-kind" value="effects" checked={effectsMode} onChange={() => setKind("effects")} /><span>Switch effects</span></label><label><input type="radio" name="ctl-kind" value="knob" checked={!effectsMode} onChange={() => setKind("knob")} /><span>Recall knob value</span></label></fieldset><label className="ctl-mode">Behavior<select value={decoded.control.mode} onChange={(event) => onEdit("ctl_mode", Number(event.target.value))}><option value="1">Toggle</option><option value="0">Momentary</option></select></label></div>
      {effectsMode ? (
        <div className="ctl-effects" aria-label="Effects controlled by CTL">{ctlEffects.map((effect) => <label key={effect.key}><input type="checkbox" checked={(code & effect.bit) !== 0} onChange={(event) => toggleEffect(effect.bit, event.target.checked)} /><span>{effect.label}</span></label>)}</div>
      ) : (
        <div className="ctl-knob"><label>Target knob<select value={safeTarget} onChange={(event) => { const targetCode = Number(event.target.value); const target = ctlTargetBytes(targetCode); onEditMany([{ field: "ctl_target_h", value: target.high }, { field: "ctl_target_l", value: target.low }, { field: "ctrl_knob_value", value: decoded.control.knobValue }]); }}>{ctlKnobTargets.map((target) => <option key={target.target} value={target.target}>{target.label}</option>)}</select></label><label>Assigned value<RangeEditor value={ctlValue} minimum={0} maximum={99} onCommit={(value) => onEdit("ctrl_knob_value", value)} /></label></div>
      )}
      <p className="ctl-help">Stored per patch. Live Sync changes remain temporary until Store is used.</p>
    </section>
  );
}

function RangeEditor({ id, value, minimum, maximum, onCommit }: { id?: string; value: number; minimum: number; maximum: number; onCommit: (value: number) => void }) {
  const [preview, setPreview] = useState(value);
  useEffect(() => setPreview(value), [value]);
  const commit = () => { if (preview !== value) onCommit(preview); };
  const keyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "PageUp", "PageDown", "Home", "End"].includes(event.key)) commit();
  };
  return <><input id={id} type="range" min={minimum} max={maximum} value={preview} onChange={(event) => setPreview(Number(event.target.value))} onPointerUp={commit} onPointerCancel={() => setPreview(value)} onKeyUp={keyUp} onBlur={commit} /><output htmlFor={id}>{preview}</output></>;
}
