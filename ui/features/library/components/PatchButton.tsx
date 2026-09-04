import styles from "../Library.module.css";

export function PatchButton({ slot, name, active, onClick }: { slot: string; name: string; active: boolean; onClick: () => void }) {
  return <button className={`${styles.patchItem}${active ? ` ${styles.active}` : ""}`} title={`${slot} · ${name || "(unnamed)"}`} aria-label={`${slot} · ${name || "(unnamed)"}`} onClick={onClick}><span className={styles.slot} data-number={slot.includes("-") ? slot.split("-").at(-1) : slot}>{slot}</span><strong>{name || "(unnamed)"}</strong></button>;
}

export function LocalAction({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return <button type="button" title={title} onClick={(event) => { event.stopPropagation(); onClick(); }}>{label}</button>;
}
