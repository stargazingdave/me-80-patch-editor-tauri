"use strict";

(function exposeKnobLabels(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Me80KnobLabels = api;
})(typeof globalThis === "object" ? globalThis : undefined, () => {
  const LABEL_MODES = Object.freeze({ HARDWARE: "hardware", CURRENT: "current" });

  const repeat = (labels, count) => Array.from({ length: count }, () => Object.freeze([...labels]));
  const PARAMETER_FUNCTIONS = Object.freeze({
    amp: Object.freeze(repeat(["GAIN", "BASS", "MIDDLE", "TREBLE", "LEVEL"], 9)),
    odds: Object.freeze(repeat(["DRIVE", "TONE", "LEVEL"], 11)),
    dly: Object.freeze(repeat(["TIME", "FEEDBACK", "E. LEVEL"], 11)),
    fx2: Object.freeze([
      Object.freeze([null, "RATE", "DEPTH", "LEVEL"]),
      Object.freeze([null, "RATE", "DEPTH", "LEVEL"]),
      Object.freeze(["DRIVE", "TONE", null, "LEVEL"]),
      Object.freeze(["TIME", "FEEDBACK", null, "LEVEL"]),
      Object.freeze([null, "RATE", "DEPTH", "LEVEL"]),
      Object.freeze(["BASS", "MIDDLE", "TREBLE", "LEVEL"])
    ]),
    comp: Object.freeze([
      Object.freeze(["SUSTAIN", "ATTACK", "LEVEL"]),
      Object.freeze(["SENS", "TONE", "PEAK"]),
      Object.freeze(["SENS", "TONE", "PEAK"]),
      Object.freeze(["-1 OCT", "-2 OCT", "DIRECT"]),
      Object.freeze(["SENS", "ATTACK", "LEVEL"]),
      Object.freeze(["SENS", "TONE", "E. LEVEL"]),
      Object.freeze(["FREQ", "D. LEVEL", "E. LEVEL"]),
      Object.freeze(["LOW", "HIGH", "LEVEL"]),
      Object.freeze([null, null, "LEVEL"]),
      Object.freeze([null, null, "LEVEL"]),
      Object.freeze([null, null, "LEVEL"])
    ]),
    mod: Object.freeze([
      Object.freeze(["RATE", "DEPTH", "RESONANCE"]),
      Object.freeze(["RATE", "DEPTH", "RESONANCE"]),
      Object.freeze(["RATE", "DEPTH", "E. LEVEL"]),
      Object.freeze(["RATE", "DEPTH", "E. LEVEL"]),
      Object.freeze(["RATE", "DEPTH", "E. LEVEL"]),
      Object.freeze(["PITCH", "D. LEVEL", "E. LEVEL"]),
      Object.freeze(["KEY", "HARMONY", "E. LEVEL"]),
      Object.freeze(["RATE", "DEPTH", "E. LEVEL"]),
      Object.freeze(["RATE", "DEPTH", "E. LEVEL"]),
      Object.freeze(["TIME", "FEEDBACK", "E. LEVEL"]),
      Object.freeze(["UPPER", "LOWER", "D. LEVEL"])
    ])
  });

  function normalizeLabel(label) {
    const normalized = String(label || "").toUpperCase().replace(/\s+/g, " ").trim();
    if (normalized === "FB") return "FEEDBACK";
    if (normalized === "E.LEVEL" || normalized === "E. LEVEL") return "LEVEL";
    if (normalized === "D.LEVEL" || normalized === "D. LEVEL") return "DIRECT";
    return normalized;
  }

  function activeFunction(effect, typeIndex, parameterIndex, hardwareLabel) {
    const types = PARAMETER_FUNCTIONS[effect];
    return types?.[typeIndex]?.[parameterIndex] ?? (hardwareLabel.includes(" / ") ? null : hardwareLabel);
  }

  function describe(effect, typeIndex, parameterIndex, hardwareLabel, mode = LABEL_MODES.HARDWARE) {
    const current = activeFunction(effect, typeIndex, parameterIndex, hardwareLabel);
    if (mode === LABEL_MODES.CURRENT) {
      return Object.freeze({
        activeFunction: current,
        segments: Object.freeze(current ? [Object.freeze({ text: current, active: true })] : [])
      });
    }

    const normalizedCurrent = normalizeLabel(current);
    const parts = hardwareLabel.split(" / ");
    return Object.freeze({
      activeFunction: current,
      segments: Object.freeze(parts.map((text) => Object.freeze({
        text,
        active: Boolean(current) && (parts.length === 1 || normalizeLabel(text) === normalizedCurrent)
      })))
    });
  }

  return Object.freeze({ LABEL_MODES, PARAMETER_FUNCTIONS, activeFunction, describe });
});
