import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { EffectDefinition, LabelMode } from "../../../domain/types";
import * as controlMapping from "../../../lib/controlMapping";
import * as knobLabels from "../../../lib/knobLabels";
import { angleFromPointer, clamp } from "../../../lib/math";
import KnobFace from "./KnobFace";
import styles from "../PatchEditor.module.css";

export default function ContinuousKnob({ definition, parameterIndex, field, value, labelText, typeIndex, labelMode, onEdit }: {
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
    <label className={styles.continuousKnobControl} title={model.activeFunction ? `Current function: ${model.activeFunction}` : "Not used by the selected effect type"}>
      <span className={[styles.knobLabel, labelMode === "current" && styles.currentOnly, !model.activeFunction && styles.unused].filter(Boolean).join(" ")}>
        {model.segments.length ? model.segments.map((segment, index) => <span key={`${segment.text}-${index}`}>{index > 0 && <span className={styles.knobLabelSeparator}> / </span>}<span className={`${styles.knobLabelPart}${segment.active ? ` ${styles.activeLabel}` : ""}`}>{segment.text}</span></span>) : "—"}
      </span>
      <KnobFace className={styles.continuousKnob} angle={controlMapping.valueToAngle(preview, 0, 99)} ariaLabel={`${definition.label} ${model.activeFunction || "Unused parameter"}`} value={preview} minimum={0} maximum={99}
        onPointerDown={(event) => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; choose(event); }} onPointerMove={(event) => { if (dragging.current) choose(event); }} onPointerUp={finish} onPointerCancel={finish} onKeyDown={keyDown} />
      <output>{preview}</output>
    </label>
  );
}
