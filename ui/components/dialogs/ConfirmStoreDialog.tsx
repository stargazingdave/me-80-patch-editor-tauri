import { useEffect, useRef } from "react";
import Modal from "./Modal";
import styles from "./Dialog.module.css";
import shared from "../../styles/shared.module.css";

export default function ConfirmStoreDialog({ open, slot, text, onText, onClose, onConfirm }: { open: boolean; slot: string; text: string; onText: (text: string) => void; onClose: () => void; onConfirm: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);
  return <Modal open={open} onClose={onClose}><span className={styles.kicker}>Permanent write</span><h2>Overwrite <strong>{slot}</strong>?</h2><p>The current destination will be read and saved first. Type the slot name to enable the one-shot write.</p><label>Type <strong>{slot}</strong><input ref={inputRef} autoComplete="off" value={text} onChange={(event) => onText(event.target.value)} /></label><div className={styles.actions}><button type="button" className={shared.secondaryButton} onClick={onClose}>Cancel</button><button type="button" className={shared.dangerButton} disabled={text !== slot} onClick={onConfirm}>Save recovery &amp; write</button></div></Modal>;
}
