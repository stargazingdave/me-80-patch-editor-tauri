import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { DecodedPatch, EffectDefinition } from "../../../domain/types";
import * as controlMapping from "../../../lib/controlMapping";
import { angleFromPointer, clamp } from "../../../lib/math";
import KnobFace from "./KnobFace";
import styles from "../PatchEditor.module.css";

export function EffectHeader({ definition, decoded, enabled, onEdit }: { definition: EffectDefinition; decoded: DecodedPatch; enabled: boolean; onEdit: (field: string, value: number) => void }) {
  return <div className={styles.effectCardHead}><span className={styles.effectIndicator} /><div className={styles.effectCardTitle}><strong>{definition.label}</strong><small>{decoded.typeNames[definition.key] || `Type ${decoded.types[definition.key]}`}</small></div><label className={styles.effectSwitch} title={`${definition.label} on/off`}><input type="checkbox" checked={enabled} aria-label={`${definition.label} on/off`} onChange={(event) => onEdit(definition.switchField, event.target.checked ? 1 : 0)} /><span /></label></div>;
}

export function ReverbEffectCard({ definition, decoded, onEditReverb, onEdit }: { definition: EffectDefinition; decoded: DecodedPatch; onEditReverb: (type: number, level: number) => void; onEdit: (field: string, value: number) => void }) {
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
  return <section className={`${styles.effectCard}${enabled ? "" : ` ${styles.off}`}`} data-effect="rev"><EffectHeader definition={definition} decoded={decoded} enabled={enabled} onEdit={onEdit} /><div className={styles.reverbControl}><div className={styles.reverbStage} data-section={mapped.typeIndex}>
    {controlMapping.REVERB_TYPES.map((label, index) => <button key={label} type="button" className={`${styles.reverbSector} ${styles[`reverbSector${index}`]}`} aria-label={`Select ${label} reverb while preserving level`} onClick={() => onEditReverb(index, mapped.level)}>{label}</button>)}
    <KnobFace className={styles.reverbKnob} angle={controlMapping.valueToAngle(position, 0, controlMapping.REVERB_POSITION_MAX)} ariaLabel="Reverb type and level" value={position} minimum={0} maximum={controlMapping.REVERB_POSITION_MAX} valueText={`${mapped.type} ${mapped.level}`}
      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; choose(event); }} onPointerMove={(event) => { if (dragging.current) choose(event); }} onPointerUp={finish} onPointerCancel={finish} onKeyDown={keyDown} />
    <output className={styles.reverbReadout}>{mapped.level}</output>
  </div></div></section>;
}
