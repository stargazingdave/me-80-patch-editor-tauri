"use strict";

(function exposeEffectChain(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Me80EffectChain = api;
})(typeof globalThis === "object" ? globalThis : undefined, () => {
  const EFFECT_TYPES = Object.freeze({
    comp: Object.freeze([
      "COMP", "T.WAH UP", "T.WAH DOWN", "OCTAVE", "SLOW GEAR", "DEFRETTER",
      "RING MOD", "AC SIM", "Single > Hum", "Hum > Single", "SOLO"
    ]),
    odds: Object.freeze([
      "BOOST", "OVERDRIVE", "T-SCREAM", "BLUES", "TURBO OD", "DISTORTION",
      "TURBO DS", "METAL DS", "CORE", "FUZZ", "OCT FUZZ"
    ]),
    mod: Object.freeze([
      "PHASER", "FLANGER", "TREMOLO", "CHORUS", "VIBRATO", "PITCH SHIFT",
      "HARMONIST", "ROTARY", "UNI-V", "DELAY", "OVERTONE"
    ]),
    dly: Object.freeze([
      "1-99 ms", "100-600 ms", "500-6000 ms", "ANALOG", "TAPE", "MODULATE",
      "REVERSE", "CHO + DELAY", "TEMPO", "TERA ECHO", "PHRASE LOOP"
    ]),
    amp: Object.freeze(["ACOUSTIC", "CLEAN", "TWEED", "CRUNCH", "COMBO", "LEAD", "DRIVE", "STACK", "METAL"]),
    fx2: Object.freeze(["PHASER", "TREMOLO", "BOOST", "DELAY", "CHORUS", "EQ"]),
    pdlfx: Object.freeze(["WAH", "VOICE", "+1 OCTAVE", "+2 OCTAVE", "-1 OCTAVE", "FREEZE", "OSC DELAY", "OD/DS", "MOD RATE", "DELAY LEV"]),
    rev: Object.freeze(["ROOM", "HALL", "SPRING"])
  });

  const BLOCKS = Object.freeze([
    Object.freeze({ key: "comp", label: "COMP / FX1" }),
    Object.freeze({ key: "odds", label: "OD / DS" }),
    Object.freeze({ key: "mod", label: "MODULATION" }),
    Object.freeze({ key: "dly", label: "DELAY" }),
    Object.freeze({ key: "amp", label: "PREAMP" }),
    Object.freeze({ key: "fx2", label: "EQ / FX2" }),
    Object.freeze({ key: "rev", label: "REVERB" }),
    Object.freeze({ key: "pdlfx", label: "PEDAL FX" })
  ]);

  function integerInRange(value, minimum, maximum, label) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
    }
    return value;
  }

  function typeIndex(patch, key) {
    if (!patch || typeof patch !== "object" || !patch.types || typeof patch.types !== "object") {
      throw new Error("Patch must contain decoded ME-80 types and switches.");
    }
    return integerInRange(patch.types[key], 0, EFFECT_TYPES[key].length - 1, `${BLOCKS.find((block) => block.key === key).label} type`);
  }

  function switchValue(patch, key) {
    if (!patch.switches || typeof patch.switches !== "object") {
      throw new Error("Patch must contain decoded ME-80 types and switches.");
    }
    return integerInRange(patch.switches[key], 0, 1, `${BLOCKS.find((block) => block.key === key).label} switch`);
  }

  function compSlot(type) {
    if ([5, 7, 8, 9, 3].includes(type)) return 0;
    if ([0, 1, 2, 10].includes(type)) return 4;
    return 15;
  }

  function modSlot(type) {
    if ([8, 10].includes(type)) return 2;
    if ([0, 2].includes(type)) return 8;
    return 16;
  }

  function fx2Slot(type) {
    if (type === 2) return 5;
    if ([0, 1].includes(type)) return 10;
    return 18;
  }

  function pedalFxSlot(type, enabled, dynamicSlots) {
    if (!enabled) return 14;
    if ([0, 2, 3, 4].includes(type)) return 1;
    if ([1, 5, 6].includes(type)) return 14;
    if (type === 7) return dynamicSlots.odds + 1;
    if (type === 8) return dynamicSlots.mod + 1;
    return dynamicSlots.dly + 1;
  }

  /**
   * Reproduces the block-slot algorithm in BOSS Tone Studio for ME-80.
   * The input is the decoded patch shape returned by this project's API.
   */
  function deriveEffectChain(patch) {
    const types = {};
    const switches = {};
    for (const block of BLOCKS) {
      types[block.key] = typeIndex(patch, block.key);
      switches[block.key] = switchValue(patch, block.key);
    }

    const slots = {
      comp: compSlot(types.comp),
      odds: 6,
      mod: modSlot(types.mod),
      dly: 19,
      amp: 11,
      fx2: fx2Slot(types.fx2),
      rev: 21
    };
    slots.pdlfx = pedalFxSlot(types.pdlfx, switches.pdlfx === 1, slots);

    const chain = BLOCKS.map((block) => Object.freeze({
      key: block.key,
      label: block.label,
      typeIndex: types[block.key],
      type: EFFECT_TYPES[block.key][types[block.key]],
      enabled: switches[block.key] === 1,
      slot: slots[block.key]
    })).sort((left, right) => left.slot - right.slot);

    for (let index = 1; index < chain.length; index += 1) {
      if (chain[index - 1].slot === chain[index].slot) {
        throw new Error(`Invalid ME-80 effect-chain collision at slot ${chain[index].slot}.`);
      }
    }
    return Object.freeze(chain);
  }

  return Object.freeze({ BLOCKS, EFFECT_TYPES, deriveEffectChain });
});
