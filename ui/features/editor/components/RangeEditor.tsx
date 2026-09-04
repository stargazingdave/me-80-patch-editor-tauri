import { useEffect, useState, type KeyboardEvent } from "react";

export default function RangeEditor({ id, value, minimum, maximum, onCommit }: { id?: string; value: number; minimum: number; maximum: number; onCommit: (value: number) => void }) {
  const [preview, setPreview] = useState(value);
  useEffect(() => setPreview(value), [value]);
  const commit = () => { if (preview !== value) onCommit(preview); };
  const keyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "PageUp", "PageDown", "Home", "End"].includes(event.key)) commit();
  };
  return <><input id={id} type="range" min={minimum} max={maximum} value={preview} onChange={(event) => setPreview(Number(event.target.value))} onPointerUp={commit} onPointerCancel={() => setPreview(value)} onKeyUp={keyUp} onBlur={commit} /><output htmlFor={id}>{preview}</output></>;
}
