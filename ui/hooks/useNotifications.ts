import { useEffect, useRef, useState } from "react";
import type { ActivityEntry, MidiLog, ToastState } from "../domain/types";

export function useNotifications() {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | null>(null);
  const activityId = useRef(0);

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
  }, []);

  const showToast = (message: string, error = false) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    const next = { id: Date.now(), message, error };
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast((value) => value?.id === next.id ? null : value), 3200);
  };
  const addActivity = (label: string, detail: string, error = false) => setActivity((items) => [{ id: ++activityId.current, label, detail, error, time: new Date().toLocaleTimeString() }, ...items]);
  const addMidiLogs = (logs?: MidiLog[]) => { for (const log of logs ?? []) addActivity(log.direction, log.hex); };

  return { activity, toast, showToast, addActivity, addMidiLogs, clearActivity: () => setActivity([]) };
}
