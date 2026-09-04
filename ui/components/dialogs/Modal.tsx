import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./Dialog.module.css";

export default function Modal({ open, className, labelledBy, children, onClose }: { open: boolean; className?: string; labelledBy?: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={[styles.dialog, className].filter(Boolean).join(" ")} aria-labelledby={labelledBy} onClose={onClose} onCancel={onClose}>{children}</dialog>;
}
