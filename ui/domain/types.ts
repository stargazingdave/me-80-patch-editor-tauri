export type EffectKey = "comp" | "odds" | "mod" | "dly" | "amp" | "fx2" | "rev" | "pdlfx";
export type ParameterEffectKey = Exclude<EffectKey, "rev" | "pdlfx">;
export type LabelMode = "hardware" | "current";
export type LibrarySource = "device" | "local";
export type LibraryView = "list" | "banks";
export type LiveOrigin = "pedal" | "editor";

export interface MidiPort { index: number; name: string; normal: boolean }
export interface Status {
  inputs: MidiPort[];
  outputs: MidiPort[];
  suggestedInput?: number;
  suggestedOutput?: number;
  effectTypes: Record<EffectKey, string[]>;
}
export interface DecodedPatch {
  name: { text: string };
  switches: Record<EffectKey, number>;
  types: Record<EffectKey, number>;
  typeNames: Record<EffectKey, string | null>;
  parameters: Record<ParameterEffectKey, number[]>;
  control: { targetBytes: [number, number]; knobValue: number; mode: number; assignmentType: "effects" | "knob" };
  noiseSuppressorThreshold: number;
  reverbLevel: number;
}
export interface PatchView { id: string; sourceLabel: string; decoded: DecodedPatch; dataHex: string; changes: unknown[] }
export interface DevicePatch { slot: string; name: string }
export interface LocalPatch { id: string; name: string }
export interface LiveSetPatch { index: number; name: string }
export interface LiveSet { id: string; name: string; patches: LiveSetPatch[] }
export interface LocalLibrary { patches: LocalPatch[]; liveSets: LiveSet[]; warnings: string[] }
export type LocalSource = { kind: "patch"; id: string } | { kind: "liveSet"; id: string; index: number };
export interface MidiLog { direction: string; hex: string }
export interface ActivityEntry { id: number; label: string; detail: string; error: boolean; time: string }
export interface ToastState { id: number; message: string; error: boolean }
export interface StoreDraft { sessionId: string; name: string }
export interface Edit { field: string; value: number }
export interface EffectDefinition {
  key: EffectKey;
  label: string;
  switchField: string;
  typeField: string;
  params: string[];
  parameterLabels?: string[];
  angles?: number[];
}
