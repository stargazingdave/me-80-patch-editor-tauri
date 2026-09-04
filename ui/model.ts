import * as controlMappingModule from "./control-mapping";
import * as effectChainModule from "./effect-chain";
import * as knobLabelsModule from "./knob-labels";

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

export const controlMapping = controlMappingModule;
export const effectChainMapping = effectChainModule;
export const knobLabels = knobLabelsModule;
export const KNOB_LABEL_MODE_KEY = "me80-knob-label-mode";
export const LIBRARY_VIEW_KEY = "me80-patch-library-view";

export const effectDefinitions: EffectDefinition[] = [
  { key: "amp", label: "PREAMP", switchField: "amp_sw", typeField: "amp_type", params: ["amp1", "amp2", "amp3", "amp4", "amp5"], parameterLabels: ["GAIN", "BASS", "MIDDLE", "TREBLE", "LEVEL"], angles: [-137, -103, -69, -35, 0, 35, 69, 103, 137] },
  { key: "fx2", label: "EQ / FX2", switchField: "fx2_sw", typeField: "fx2_type", params: ["fx2_1", "fx2_2", "fx2_3", "fx2_4"], parameterLabels: ["BASS / DRIVE / TIME", "MIDDLE / RATE / FB", "TREBLE / DEPTH", "LEVEL"], angles: [-132, -82, -28, 25, 80, 134] },
  { key: "rev", label: "REVERB", switchField: "rev_sw", typeField: "rev_type", params: [] },
  { key: "pdlfx", label: "PEDAL FX", switchField: "pdlfx_sw", typeField: "pdlfx_type", params: [], angles: [-138, -109, -79, -49, -19, 17, 49, 79, 109, 138] },
  { key: "comp", label: "COMP / FX1", switchField: "comp_sw", typeField: "comp_type", params: ["comp1", "comp2", "comp3"], parameterLabels: ["SUSTAIN / SENS / -1 OCT", "ATTACK / TONE / -2 OCT", "LEVEL / PEAK / DIRECT"], angles: [-139, -112, -84, -56, -28, 0, 28, 56, 84, 112, 139] },
  { key: "odds", label: "OD / DS", switchField: "odds_sw", typeField: "odds_type", params: ["odds1", "odds2", "odds3"], parameterLabels: ["DRIVE", "TONE", "LEVEL"], angles: [-139, -111, -83, -55, -27, 1, 29, 57, 85, 113, 139] },
  { key: "mod", label: "MOD", switchField: "mod_sw", typeField: "mod_type", params: ["mod1", "mod2", "mod3"], parameterLabels: ["RATE / KEY", "DEPTH / HARMONY", "E.LEVEL / RESONANCE"], angles: [-139, -113, -86, -58, -30, -2, 27, 56, 84, 112, 139] },
  { key: "dly", label: "DELAY", switchField: "dly_sw", typeField: "dly_type", params: ["dly1", "dly2", "dly3"], parameterLabels: ["TIME", "FEEDBACK", "E.LEVEL"], angles: [-139, -112, -85, -57, -29, -1, 27, 55, 83, 111, 139] }
];

export const ctlEffects = [
  { key: "comp", label: "COMP / FX1", bit: 0x01 }, { key: "odds", label: "OD / DS", bit: 0x02 },
  { key: "mod", label: "MOD", bit: 0x04 }, { key: "dly", label: "DELAY", bit: 0x08 },
  { key: "amp", label: "PREAMP", bit: 0x10 }, { key: "fx2", label: "EQ / FX2", bit: 0x20 },
  { key: "rev", label: "REVERB", bit: 0x40 }, { key: "pdlfx", label: "PEDAL FX", bit: 0x80 }
] as const;

export const ctlKnobTargets = [
  ["comp", "comp1", "COMP / FX1 · SUSTAIN / SENS / -1 OCT"], ["comp", "comp2", "COMP / FX1 · ATTACK / TONE / -2 OCT"], ["comp", "comp3", "COMP / FX1 · LEVEL / PEAK / DIRECT"],
  ["odds", "odds1", "OD / DS · DRIVE"], ["odds", "odds2", "OD / DS · TONE"], ["odds", "odds3", "OD / DS · LEVEL"],
  ["mod", "mod1", "MOD · RATE / KEY"], ["mod", "mod2", "MOD · DEPTH / HARMONY"], ["mod", "mod3", "MOD · E.LEVEL / RESONANCE"],
  ["dly", "dly1", "DELAY · TIME"], ["dly", "dly2", "DELAY · FEEDBACK"], ["dly", "dly3", "DELAY · E.LEVEL"],
  ["amp", "amp1", "PREAMP · GAIN"], ["amp", "amp2", "PREAMP · BASS"], ["amp", "amp3", "PREAMP · MIDDLE"], ["amp", "amp4", "PREAMP · TREBLE"], ["amp", "amp5", "PREAMP · LEVEL"],
  ["fx2", "fx2_1", "EQ / FX2 · BASS / DRIVE / TIME"], ["fx2", "fx2_2", "EQ / FX2 · MIDDLE / RATE / FB"], ["fx2", "fx2_3", "EQ / FX2 · TREBLE / DEPTH"], ["fx2", "fx2_4", "EQ / FX2 · LEVEL"]
].map(([effect, field, label], target) => ({ effect: effect as ParameterEffectKey, field, label, target }));

export const storeSlots = Array.from({ length: 36 }, (_, index) => `U${Math.floor(index / 4) + 1}-${(index % 4) + 1}`);
export const emptyLocalLibrary: LocalLibrary = { patches: [], liveSets: [], warnings: [] };
export const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
export const ctlCode = (control: DecodedPatch["control"]) => ((control.targetBytes[0] & 0x0f) << 4) | (control.targetBytes[1] & 0x0f);
export const ctlTargetBytes = (code: number) => ({ high: (code >> 4) & 0x0f, low: code & 0x0f });

export function angleFromPointer(event: { clientX: number; clientY: number }, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const x = event.clientX - (rect.left + (rect.width / 2));
  const y = event.clientY - (rect.top + (rect.height / 2));
  return controlMapping.normalizeAngle(Math.atan2(x, -y) * (180 / Math.PI));
}

export async function api<T>(path: string, method = "GET", body: Record<string, unknown> = {}): Promise<T> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("The native Tauri bridge is unavailable.");
  try {
    return await invoke<T>("api", { path, method, body });
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}
