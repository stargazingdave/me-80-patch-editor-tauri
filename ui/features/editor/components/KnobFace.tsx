import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import styles from "../PatchEditor.module.css";

export interface KnobFaceProps {
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

export default function KnobFace({ className, angle, ariaLabel, value, minimum, maximum, valueText, ...events }: KnobFaceProps) {
  return (
    <span className={`${styles.knobFace} ${className}`} tabIndex={0} role="slider" aria-label={ariaLabel} aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={value} aria-valuetext={valueText} style={{ "--knob-angle": `${angle}deg` } as CSSProperties} {...events}>
      <span className={styles.knobRotor}><span className={styles.knobIndicator} /></span>
    </span>
  );
}
