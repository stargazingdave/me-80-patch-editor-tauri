import type { Status } from "../../domain/types";
import styles from "./Header.module.css";

interface HeaderProps {
  status: Status | null;
  statusError: string;
  connected: boolean;
  busy: boolean;
  live: boolean;
  onSettings: () => void;
  onRefresh: () => void;
}

export default function Header({ status, statusError, connected, busy, live, onSettings, onRefresh }: HeaderProps) {
  const label = statusError ? "MIDI check failed" : connected ? "ME-80 connected" : status ? "ME-80 not found" : "Checking device…";
  const detail = statusError || (connected ? `Input ${status?.suggestedInput} · Output ${status?.suggestedOutput}` : status ? "Reconnect USB and refresh" : "Windows MIDI");

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}><div className={styles.brandMark}><span>ME</span><strong>80</strong></div><div><h1>me-80-patch-editor</h1><p>Hardware-style editor · local only</p></div></div>
      <div className={styles.topbarActions}>
        <button className={styles.settingsButton} type="button" aria-haspopup="dialog" title="Open settings" onClick={onSettings}><span aria-hidden="true">⚙</span><strong>Settings</strong></button>
        <div className={styles.connection}><span className={`${styles.statusDot}${connected ? ` ${styles.online}` : ""}`} /><div><strong>{label}</strong><small>{detail}</small></div><button className={styles.iconButton} title="Refresh MIDI ports" disabled={busy || live} onClick={onRefresh}>↻</button></div>
      </div>
    </header>
  );
}
