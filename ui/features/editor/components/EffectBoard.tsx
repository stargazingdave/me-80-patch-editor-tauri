import type { LabelMode, ParameterEffectKey, PatchView, Status } from "../../../domain/types";
import { effectDefinitions } from "../effectDefinitions";
import ContinuousKnob from "./ContinuousKnob";
import { EffectHeader, ReverbEffectCard } from "./EffectCard";
import OptionKnob from "./OptionKnob";
import styles from "../PatchEditor.module.css";

export default function EffectBoard({ patch, status, labelMode, onEdit, onEditReverb }: { patch: PatchView; status: Status; labelMode: LabelMode; onEdit: (field: string, value: number) => void; onEditReverb: (type: number, level: number) => void }) {
  const decoded = patch.decoded;
  return <div className={styles.pedalSurface}><div className={styles.surfaceLabel}><span>BOSS ME-80 SIGNAL CONTROLS</span><small>Direct hardware layout</small></div><div className={styles.effectChain}>{effectDefinitions.map((definition) => definition.key === "rev" ? (
    <ReverbEffectCard key={definition.key} definition={definition} decoded={decoded} onEditReverb={onEditReverb} onEdit={onEdit} />
  ) : (
    <section key={definition.key} className={`${styles.effectCard}${decoded.switches[definition.key] === 1 ? "" : ` ${styles.off}`}`} data-effect={definition.key}>
      <EffectHeader definition={definition} decoded={decoded} enabled={decoded.switches[definition.key] === 1} onEdit={onEdit} />
      <OptionKnob definition={definition} labels={status.effectTypes[definition.key]} selected={decoded.types[definition.key]} onEdit={onEdit} />
      {definition.params.length > 0 && <div className={styles.parameterGrid}>{definition.params.map((field, index) => <ContinuousKnob key={field} definition={definition} parameterIndex={index} field={field} value={decoded.parameters[definition.key as ParameterEffectKey][index]} labelText={definition.parameterLabels?.[index] ?? field} typeIndex={decoded.types[definition.key]} labelMode={labelMode} onEdit={onEdit} />)}</div>}
    </section>
  ))}</div></div>;
}
