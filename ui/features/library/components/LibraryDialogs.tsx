import { useEffect, useRef } from "react";
import Modal from "../../../components/dialogs/Modal";
import type { ConfirmRequest, TextRequest } from "../types";
import dialogStyles from "../../../components/dialogs/Dialog.module.css";
import shared from "../../../styles/shared.module.css";

export default function LibraryDialogs({ textRequest, confirmRequest, setTextRequest, setConfirmRequest }: {
  textRequest: TextRequest | null;
  confirmRequest: ConfirmRequest | null;
  setTextRequest: (request: TextRequest | null | ((current: TextRequest | null) => TextRequest | null)) => void;
  setConfirmRequest: (request: ConfirmRequest | null) => void;
}) {
  const textInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (textRequest) requestAnimationFrame(() => textInput.current?.focus()); }, [textRequest !== null]);
  const submitText = () => {
    const value = textRequest?.value.trim();
    if (!value || !textRequest) return;
    textRequest.submit(value);
    setTextRequest(null);
  };
  return <>
    <Modal open={textRequest !== null} labelledBy="local-text-dialog-title" onClose={() => setTextRequest(null)}><span className={dialogStyles.kicker}>Local library</span><h2 id="local-text-dialog-title">{textRequest?.title}</h2><label>{textRequest?.label}<input ref={textInput} value={textRequest?.value ?? ""} maxLength={textRequest?.maxLength} onChange={(event) => setTextRequest((request) => request ? { ...request, value: event.target.value } : request)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitText(); } }} /></label><div className={dialogStyles.actions}><button type="button" className={shared.secondaryButton} onClick={() => setTextRequest(null)}>Cancel</button><button type="button" className={shared.primaryButton} disabled={!textRequest?.value.trim()} onClick={submitText}>Save</button></div></Modal>
    <Modal open={confirmRequest !== null} labelledBy="local-confirm-dialog-title" onClose={() => setConfirmRequest(null)}><span className={dialogStyles.kicker}>Local library</span><h2 id="local-confirm-dialog-title">{confirmRequest?.title}</h2><p>{confirmRequest?.message}</p><div className={dialogStyles.actions}><button type="button" className={shared.secondaryButton} onClick={() => setConfirmRequest(null)}>Cancel</button><button type="button" className={shared.dangerButton} onClick={() => { confirmRequest?.confirm(); setConfirmRequest(null); }}>{confirmRequest?.actionLabel}</button></div></Modal>
  </>;
}
