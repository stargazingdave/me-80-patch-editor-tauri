import type { DecodedPatch, EffectDefinition, ParameterEffectKey } from "../../domain/types";

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

export const ctlCode = (control: DecodedPatch["control"]) => ((control.targetBytes[0] & 0x0f) << 4) | (control.targetBytes[1] & 0x0f);
export const ctlTargetBytes = (code: number) => ({ high: (code >> 4) & 0x0f, low: code & 0x0f });
