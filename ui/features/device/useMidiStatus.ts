import { useRef, useState } from "react";
import type { Status } from "../../domain/types";
import { api, errorMessage } from "../../services/tauriApi";

export function useMidiStatus(showToast: (message: string, error?: boolean) => void) {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState("");
  const [inputIndex, setInputIndexState] = useState<number | undefined>();
  const [outputIndex, setOutputIndexState] = useState<number | undefined>();
  const inputIndexRef = useRef<number | undefined>(undefined);
  const outputIndexRef = useRef<number | undefined>(undefined);

  const setInputIndex = (value: number | undefined) => { inputIndexRef.current = value; setInputIndexState(value); };
  const setOutputIndex = (value: number | undefined) => { outputIndexRef.current = value; setOutputIndexState(value); };
  const selectedPorts = () => {
    const input = inputIndexRef.current;
    const output = outputIndexRef.current;
    if (!Number.isInteger(input) || !Number.isInteger(output)) throw new Error("Select both normal ME-80 MIDI ports.");
    return { inputIndex: input as number, outputIndex: output as number };
  };
  const refreshStatus = async () => {
    try {
      setStatusError("");
      const next = await api<Status>("/api/status");
      setStatus(next);
      const inputs = next.inputs.filter((port) => port.normal);
      const outputs = next.outputs.filter((port) => port.normal);
      setInputIndex(inputs.some((port) => port.index === next.suggestedInput) ? next.suggestedInput : inputs[0]?.index);
      setOutputIndex(outputs.some((port) => port.index === next.suggestedOutput) ? next.suggestedOutput : outputs[0]?.index);
      return next;
    } catch (error) {
      const message = errorMessage(error);
      setStatusError(message);
      showToast(message, true);
      return null;
    }
  };

  return {
    status, statusError, inputIndex, outputIndex, setInputIndex, setOutputIndex, selectedPorts, refreshStatus,
    connected: status?.suggestedInput !== undefined && status?.suggestedOutput !== undefined,
    normalInputs: status?.inputs.filter((port) => port.normal) ?? [],
    normalOutputs: status?.outputs.filter((port) => port.normal) ?? []
  };
}
