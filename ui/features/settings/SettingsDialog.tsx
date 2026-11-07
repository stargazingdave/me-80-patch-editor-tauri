import { useState } from "react";
import type { ActivityEntry, DeviceSettings, LabelMode } from "../../domain/types";
import Modal from "../../components/dialogs/Modal";
import dialogStyles from "../../components/dialogs/Dialog.module.css";
import shared from "../../styles/shared.module.css";
import styles from "./SettingsDialog.module.css";

function parseQuad(value: string) {
  const tokens = value.trim().split(/\s+/);
  if (tokens.some((token) => !/^[0-7][0-9a-f]$/i.test(token))) throw new Error("Enter exactly four 7-bit hexadecimal bytes.");
  const bytes = tokens.map((token) => Number.parseInt(token, 16));
  if (bytes.length !== 4 || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0x7f)) {
    throw new Error("Enter exactly four 7-bit hexadecimal bytes.");
  }
  return bytes;
}

interface SettingsDialogProps {
  open: boolean;
  labelMode: LabelMode;
  activity: ActivityEntry[];
  connected: boolean;
  busy: boolean;
  deviceSettings: DeviceSettings | null;
  deviceSettingsError: string;
  onLabelMode: (mode: LabelMode) => void;
  onReadDeviceSettings: () => Promise<void>;
  onSetKnobOperation: (value: DeviceSettings["knobOperation"]) => Promise<void>;
  onProbeSystem: (address: number[], size: number[]) => Promise<void>;
  onListenForSystemEvents: () => Promise<void>;
  onClear: () => void;
  onClose: () => void;
}

export default function SettingsDialog({
  open, labelMode, activity, connected, busy, deviceSettings, deviceSettingsError,
  onLabelMode, onReadDeviceSettings, onSetKnobOperation, onProbeSystem,
  onListenForSystemEvents, onClear, onClose,
}: SettingsDialogProps) {
  const [probeAddress, setProbeAddress] = useState("00 00 00 00");
  const [probeSize, setProbeSize] = useState("00 00 00 10");
  const [probeError, setProbeError] = useState("");

  const probe = () => {
    try {
      const address = parseQuad(probeAddress);
      const size = parseQuad(probeSize);
      setProbeError("");
      void onProbeSystem(address, size);
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : String(error));
    }
  };

  return <Modal open={open} className={styles.settingsDialog} labelledBy="settings-title" onClose={onClose}>
    <span className={dialogStyles.kicker}>Preferences</span>
    <h2 id="settings-title">Settings</h2>

    <section className={styles.deviceSettings}>
      <div className={styles.deviceHeading}>
        <div><span>ME-80 device settings</span><h3>Knob behavior</h3></div>
        <button type="button" disabled={!connected || busy} onClick={() => void onReadDeviceSettings()}>Refresh</button>
      </div>
      {deviceSettings ? <>
        <div className={styles.deviceChoices}>
          <button type="button" className={deviceSettings.knobOperation === "direct" ? styles.activeDeviceChoice : ""} disabled={!connected || busy} onClick={() => void onSetKnobOperation("direct")}>Direct · n0</button>
          <button type="button" className={deviceSettings.knobOperation === "catch" ? styles.activeDeviceChoice : ""} disabled={!connected || busy} onClick={() => void onSetKnobOperation("catch")}>Catch · n1</button>
        </div>
        <div className={styles.deviceValue}>
          <small>{deviceSettings.knobOperation === "direct" ? "Values change immediately as knobs turn." : "A knob takes control after crossing the stored value."}</small>
          <em>Changes apply immediately. Press WRITE on the ME-80 to keep the setting after power-off.</em>
        </div>
      </> : <p>{deviceSettingsError || (connected ? "Reading from the pedal…" : "Connect the ME-80 to read this setting.")}</p>}
    </section>

    <p>Choose how the parameter labels above the effect knobs are displayed.</p>
    <fieldset className={styles.options}>
      <legend>Knob labels</legend>
      <label className={styles.choice}><input type="radio" name="knob-label-mode" value="hardware" checked={labelMode === "hardware"} onChange={() => onLabelMode("hardware")} /><span><strong>Hardware labels</strong><small>Show the full panel legend and highlight the active function.</small></span></label>
      <label className={styles.choice}><input type="radio" name="knob-label-mode" value="current" checked={labelMode === "current"} onChange={() => onLabelMode("current")} /><span><strong>Current function only</strong><small>Show only the parameter controlled by the selected effect type.</small></span></label>
    </fieldset>

    <details className={styles.diagnostics}>
      <summary>Diagnostics</summary>
      <p>Recent MIDI traffic and hardware operations for troubleshooting.</p>
      <section className={styles.discovery}>
        <h3>Device discovery</h3>
        <p>Read-only tools for identifying ME-80 system parameters.</p>
        <button type="button" disabled={!connected || busy} onClick={() => void onListenForSystemEvents()}>Listen passively for 12 seconds</button>
        <div className={styles.probeFields}>
          <label>RQ1 address<input value={probeAddress} spellCheck={false} onChange={(event) => setProbeAddress(event.target.value)} /></label>
          <label>Size<input value={probeSize} spellCheck={false} onChange={(event) => setProbeSize(event.target.value)} /></label>
          <button type="button" disabled={!connected || busy} onClick={probe}>Probe read-only</button>
        </div>
        {probeError && <p className={styles.validation}>{probeError}</p>}
      </section>
      <section className={styles.activity}>
        <div className={styles.activityHeading}><h3>Activity log</h3><button type="button" onClick={onClear}>Clear</button></div>
        <div className={styles.activityLog}>{activity.length ? activity.map((entry) => <div key={entry.id} className={`${styles.logEntry}${entry.error ? ` ${styles.error}` : ""}`}><strong>{entry.label}</strong><span>{entry.time}</span><code>{entry.detail}</code></div>) : <p className={shared.muted}>No operations yet.</p>}</div>
      </section>
    </details>
    <div className={`${dialogStyles.actions} ${styles.settingsActions}`}><button type="button" className={shared.primaryButton} onClick={onClose}>Done</button></div>
  </Modal>;
}
