import { useRef, useState, type MutableRefObject } from "react";
import type { PatchView } from "../../domain/types";
import { api, errorMessage } from "../../services/tauriApi";

type UsePatchSessionOptions = {
  liveRef: MutableRefObject<boolean>;
  showToast: (message: string, error?: boolean) => void;
};

export function usePatchSession({ liveRef, showToast }: UsePatchSessionOptions) {
  const [currentPatch, setCurrentPatchState] = useState<PatchView | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const currentPatchRef = useRef<PatchView | null>(null);
  const pendingNameEdit = useRef<Promise<void> | null>(null);

  const setPatch = (patch: PatchView) => {
    currentPatchRef.current = patch;
    setCurrentPatchState(patch);
    setNameDraft(patch.decoded.name.text);
  };

  function commitNameEdit() {
    const patch = currentPatchRef.current;
    const name = nameDraft.trimEnd();
    if (!patch || name === patch.decoded.name.text) return;

    const operation = (async () => {
      try {
        const result = await api<{ patch: PatchView }>(
          `/api/session/${encodeURIComponent(patch.id)}/edit`,
          "POST",
          { name },
        );
        setPatch(result.patch);
        if (liveRef.current) showToast("Name staged. Store the patch to write it permanently.");
      } catch (error) {
        showToast(errorMessage(error), true);
        setNameDraft(currentPatchRef.current?.decoded.name.text ?? "");
      }
    })();

    pendingNameEdit.current = operation;
    void operation.finally(() => {
      if (pendingNameEdit.current === operation) pendingNameEdit.current = null;
    });
  }

  return {
    currentPatch,
    currentPatchRef,
    nameDraft,
    pendingNameEdit,
    setNameDraft,
    setPatch,
    commitNameEdit,
  };
}
