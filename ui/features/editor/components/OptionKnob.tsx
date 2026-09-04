import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { EffectDefinition } from "../../../domain/types";
import * as controlMapping from "../../../lib/controlMapping";
import { angleFromPointer, clamp } from "../../../lib/math";
import KnobFace from "./KnobFace";
import styles from "../PatchEditor.module.css";

export default function OptionKnob({ definition, labels, selected, onEdit }: { definition: EffectDefinition; labels: string[]; selected: number; onEdit: (field: string, value: number) => void }) {
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
  return <div className={styles.optionKnobControl}><div className={styles.optionKnobStage}>
    {labels.map((label, index) => { const radians = angles[index] * (Math.PI / 180); const style = { "--option-x": `${50 + (Math.sin(radians) * 45)}%`, "--option-y": `${50 - (Math.cos(radians) * 45)}%` } as CSSProperties; return <button key={label} type="button" className={`${styles.optionLabel}${index === preview ? ` ${styles.selected}` : ""}`} style={style} title={label} onClick={() => index !== selected && onEdit(definition.typeField, index)}>{label}</button>; })}
    <KnobFace className={styles.optionKnob} angle={angles[preview]} ariaLabel={`${definition.label} type`} value={preview} minimum={0} maximum={labels.length - 1} valueText={labels[preview]}
      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; choose(event); }} onPointerMove={(event) => { if (dragging.current) choose(event); }} onPointerUp={finish} onPointerCancel={finish} onKeyDown={keyDown} />
  </div></div>;
}
