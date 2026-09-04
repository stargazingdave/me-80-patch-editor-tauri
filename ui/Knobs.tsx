import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { angleFromPointer, clamp, controlMapping, knobLabels, type DecodedPatch, type EffectDefinition, type LabelMode } from "./model";

interface KnobFaceProps {
  className: string;
  angle: number;
  ariaLabel: string;
  value: number;
  minimum: number;
  maximum: number;
  valueText?: string;
  onPointerDown: (event: PointerEvent<HTMLSpanElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLSpanElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLSpanElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLSpanElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLSpanElement>) => void;
}

function KnobFace({ className, angle, ariaLabel, value, minimum, maximum, valueText, ...events }: KnobFaceProps) {
  return (
    <span className={`knob-face ${className}`} tabIndex={0} role="slider" aria-label={ariaLabel} aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={value} aria-valuetext={valueText} style={{ "--knob-angle": `${angle}deg` } as CSSProperties} {...events}>
      <span className="knob-rotor"><span className="knob-indicator" /></span>
    </span>
  );
}

export function ContinuousKnob({ definition, parameterIndex, field, value, labelText, typeIndex, labelMode, onEdit }: {
  definition: EffectDefinition;
  parameterIndex: number;
  field: string;
  value: number;
  labelText: string;
  typeIndex: number;
  labelMode: LabelMode;
  onEdit: (field: string, value: number) => void;
}) {
  const [preview, setPreview] = useState(value);
  const previewRef = useRef(value);
  const dragging = useRef(false);
  useEffect(() => { setPreview(value); previewRef.current = value; }, [value]);
  const model = knobLabels.describe(definition.key, typeIndex, parameterIndex, labelText, labelMode);
  const show = (next: number) => { const safe = clamp(next, 0, 99); previewRef.current = safe; setPreview(safe); };
  const choose = (event: PointerEvent<HTMLSpanElement>) => show(controlMapping.angleToValue(angleFromPointer(event, event.currentTarget), 0, 99));
  const finish = (event: PointerEvent<HTMLSpanElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (previewRef.current !== value) onEdit(field, previewRef.current);
  };
  const keyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    const increments: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    let next = previewRef.current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 99;
    else if (increments[event.key] !== undefined) next += increments[event.key];
    else return;
    event.preventDefault();
    next = clamp(next, 0, 99);
    show(next);
    if (next !== value) onEdit(field, next);
  };
  return (
    <label className="continuous-knob-control" title={model.activeFunction ? `Current function: ${model.activeFunction}` : "Not used by the selected effect type"}>
      <span className={`knob-label${labelMode === "current" ? " current-only" : ""}${!model.activeFunction ? " unused" : ""}`}>
        {model.segments.length ? model.segments.map((segment, index) => (
          <span key={`${segment.text}-${index}`}>
            {index > 0 && <span className="knob-label-separator"> / </span>}
            <span className={`knob-label-part${segment.active ? " active" : ""}`}>{segment.text}</span>
          </span>
        )) : "—"}
      </span>
      <KnobFace className="continuous-knob" angle={controlMapping.valueToAngle(preview, 0, 99)} ariaLabel={`${definition.label} ${model.activeFunction || "Unused parameter"}`} value={preview} minimum={0} maximum={99}
        onPointerDown={(event) => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; choose(event); }}
        onPointerMove={(event) => { if (dragging.current) choose(event); }} onPointerUp={finish} onPointerCancel={finish} onKeyDown={keyDown} />
      <output>{preview}</output>
    </label>
  );
}

export function OptionKnob({ definition, labels, selected, onEdit }: { definition: EffectDefinition; labels: string[]; selected: number; onEdit: (field: string, value: number) => void }) {
  const angles = definition.angles ?? [];
  const [preview, setPreview] = useState(selected);
  const previewRef = useRef(selected);
  const dragging = useRef(false);
  useEffect(() => { setPreview(selected); previewRef.current = selected; }, [selected]);
  if (angles.length !== labels.length) throw new Error(`${definition.label} requires one explicit angle for every option.`);
  const show = (next: number) => { const safe = clamp(next, 0, labels.length - 1); previewRef.current = safe; setPreview(safe); };
  const choose = (event: PointerEvent<HTMLSpanElement>) => show(controlMapping.nearestOptionIndex(angleFromPointer(event, event.currentTarget), angles));
  const finish = (event: PointerEvent<HTMLSpanElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (previewRef.current !== selected) onEdit(definition.typeField, previewRef.current);
  };
  const keyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    let next = previewRef.current;
    if (["ArrowUp", "ArrowRight"].includes(event.key)) next += 1;
    else if (["ArrowDown", "ArrowLeft"].includes(event.key)) next -= 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = labels.length - 1;
    else return;
    event.preventDefault();
    next = clamp(next, 0, labels.length - 1);
    show(next);
    if (next !== selected) onEdit(definition.typeField, next);
  };
  return (
    <div className="option-knob-control"><div className="option-knob-stage">
      {labels.map((label, index) => {
        const radians = angles[index] * (Math.PI / 180);
        const style = { "--option-x": `${50 + (Math.sin(radians) * 45)}%`, "--option-y": `${50 - (Math.cos(radians) * 45)}%` } as CSSProperties;
        return <button key={label} type="button" className={`option-label${index === preview ? " selected" : ""}`} style={style} title={label} onClick={() => index !== selected && onEdit(definition.typeField, index)}>{label}</button>;
      })}
      <KnobFace className="option-knob" angle={angles[preview]} ariaLabel={`${definition.label} type`} value={preview} minimum={0} maximum={labels.length - 1} valueText={labels[preview]}
        onPointerDown={(event) => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; choose(event); }}
        onPointerMove={(event) => { if (dragging.current) choose(event); }} onPointerUp={finish} onPointerCancel={finish} onKeyDown={keyDown} />
    </div></div>
  );
}

export function EffectHeader({ definition, decoded, enabled, onEdit }: { definition: EffectDefinition; decoded: DecodedPatch; enabled: boolean; onEdit: (field: string, value: number) => void }) {
  return <div className="effect-card-head"><span className="effect-indicator" /><div className="effect-card-title"><strong>{definition.label}</strong><small>{decoded.typeNames[definition.key] || `Type ${decoded.types[definition.key]}`}</small></div><label className="effect-switch" title={`${definition.label} on/off`}><input type="checkbox" checked={enabled} aria-label={`${definition.label} on/off`} onChange={(event) => onEdit(definition.switchField, event.target.checked ? 1 : 0)} /><span /></label></div>;
}

export function ReverbCard({ definition, decoded, onEditReverb, onEdit }: { definition: EffectDefinition; decoded: DecodedPatch; onEditReverb: (type: number, level: number) => void; onEdit: (field: string, value: number) => void }) {
  const enabled = decoded.switches.rev === 1;
  const current = controlMapping.reverbToPosition(clamp(decoded.types.rev, 0, controlMapping.REVERB_TYPES.length - 1), clamp(decoded.reverbLevel, 0, controlMapping.REVERB_SECTION_SIZE - 1));
  const [position, setPosition] = useState(current);
  const positionRef = useRef(current);
  const dragging = useRef(false);
  useEffect(() => { setPosition(current); positionRef.current = current; }, [current]);
  const show = (next: number) => { const safe = clamp(next, 0, controlMapping.REVERB_POSITION_MAX); positionRef.current = safe; setPosition(safe); };
  const commit = () => { const mapped = controlMapping.positionToReverb(positionRef.current); onEditReverb(mapped.typeIndex, mapped.level); };
  const mapped = controlMapping.positionToReverb(position);
  const choose = (event: PointerEvent<HTMLSpanElement>) => show(controlMapping.angleToValue(angleFromPointer(event, event.currentTarget), 0, controlMapping.REVERB_POSITION_MAX));
  const finish = (event: PointerEvent<HTMLSpanElement>) => { if (!dragging.current) return; dragging.current = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); commit(); };
  const keyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    let next = positionRef.current;
    if (["ArrowUp", "ArrowRight"].includes(event.key)) next += 1;
    else if (["ArrowDown", "ArrowLeft"].includes(event.key)) next -= 1;
    else if (event.key === "PageUp") next += 5;
    else if (event.key === "PageDown") next -= 5;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = controlMapping.REVERB_POSITION_MAX;
    else return;
    event.preventDefault();
    const safe = clamp(next, 0, controlMapping.REVERB_POSITION_MAX);
    show(safe);
    const value = controlMapping.positionToReverb(safe);
    onEditReverb(value.typeIndex, value.level);
  };
  return (
    <section className={`effect-card reverb-card${enabled ? "" : " off"}`} data-effect="rev">
      <EffectHeader definition={definition} decoded={decoded} enabled={enabled} onEdit={onEdit} />
      <div className="reverb-control"><div className="reverb-stage" data-section={mapped.typeIndex}>
        {controlMapping.REVERB_TYPES.map((label, index) => <button key={label} type="button" className={`reverb-sector reverb-sector-${index}`} aria-label={`Select ${label} reverb while preserving level`} onClick={() => onEditReverb(index, mapped.level)}>{label}</button>)}
        <KnobFace className="reverb-knob" angle={controlMapping.valueToAngle(position, 0, controlMapping.REVERB_POSITION_MAX)} ariaLabel="Reverb type and level" value={position} minimum={0} maximum={controlMapping.REVERB_POSITION_MAX} valueText={`${mapped.type} ${mapped.level}`}
          onPointerDown={(event) => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; choose(event); }}
          onPointerMove={(event) => { if (dragging.current) choose(event); }} onPointerUp={finish} onPointerCancel={finish} onKeyDown={keyDown} />
        <output className="reverb-readout">{mapped.level}</output>
      </div></div>
    </section>
  );
}
