import type { ToastState } from "../../domain/types";
import styles from "./Toast.module.css";

export default function Toast({ toast }: { toast: ToastState | null }) {
  const className = [styles.toast, toast && styles.show, toast?.error && styles.error].filter(Boolean).join(" ");
  return <div className={className} role="status">{toast?.message}</div>;
}
