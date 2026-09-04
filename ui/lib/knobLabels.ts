export const LABEL_MODES = Object.freeze({ HARDWARE: "hardware", CURRENT: "current" } as const);
type LabelMode = typeof LABEL_MODES[keyof typeof LABEL_MODES];
type ParameterLabel = string | null;

const repeat = (labels: string[], count: number): readonly (readonly ParameterLabel[])[] => Array.from({ length: count }, () => Object.freeze([...labels]));
export const PARAMETER_FUNCTIONS: Readonly<Record<string, readonly (readonly ParameterLabel[])[]>> = Object.freeze({
  amp: Object.freeze(repeat(["GAIN", "BASS", "MIDDLE", "TREBLE", "LEVEL"], 9)),
  odds: Object.freeze(repeat(["DRIVE", "TONE", "LEVEL"], 11)),
  dly: Object.freeze(repeat(["TIME", "FEEDBACK", "E. LEVEL"], 11)),
  fx2: Object.freeze([
    Object.freeze([null, "RATE", "DEPTH", "LEVEL"]), Object.freeze([null, "RATE", "DEPTH", "LEVEL"]),
    Object.freeze(["DRIVE", "TONE", null, "LEVEL"]), Object.freeze(["TIME", "FEEDBACK", null, "LEVEL"]),
    Object.freeze([null, "RATE", "DEPTH", "LEVEL"]), Object.freeze(["BASS", "MIDDLE", "TREBLE", "LEVEL"])
  ]),
  comp: Object.freeze([
    Object.freeze(["SUSTAIN", "ATTACK", "LEVEL"]), Object.freeze(["SENS", "TONE", "PEAK"]),
    Object.freeze(["SENS", "TONE", "PEAK"]), Object.freeze(["-1 OCT", "-2 OCT", "DIRECT"]),
    Object.freeze(["SENS", "ATTACK", "LEVEL"]), Object.freeze(["SENS", "TONE", "E. LEVEL"]),
    Object.freeze(["FREQ", "D. LEVEL", "E. LEVEL"]), Object.freeze(["LOW", "HIGH", "LEVEL"]),
    Object.freeze([null, null, "LEVEL"]), Object.freeze([null, null, "LEVEL"]), Object.freeze([null, null, "LEVEL"])
  ]),
  mod: Object.freeze([
    Object.freeze(["RATE", "DEPTH", "RESONANCE"]), Object.freeze(["RATE", "DEPTH", "RESONANCE"]),
    Object.freeze(["RATE", "DEPTH", "E. LEVEL"]), Object.freeze(["RATE", "DEPTH", "E. LEVEL"]),
    Object.freeze(["RATE", "DEPTH", "E. LEVEL"]), Object.freeze(["PITCH", "D. LEVEL", "E. LEVEL"]),
    Object.freeze(["KEY", "HARMONY", "E. LEVEL"]), Object.freeze(["RATE", "DEPTH", "E. LEVEL"]),
    Object.freeze(["RATE", "DEPTH", "E. LEVEL"]), Object.freeze(["TIME", "FEEDBACK", "E. LEVEL"]),
    Object.freeze(["UPPER", "LOWER", "D. LEVEL"])
  ])
});

function normalizeLabel(label: string | null) {
  const normalized = String(label || "").toUpperCase().replace(/\s+/g, " ").trim();
  if (normalized === "FB") return "FEEDBACK";
  if (normalized === "E.LEVEL" || normalized === "E. LEVEL") return "LEVEL";
  if (normalized === "D.LEVEL" || normalized === "D. LEVEL") return "DIRECT";
  return normalized;
}

export function activeFunction(effect: string, typeIndex: number, parameterIndex: number, hardwareLabel: string) {
  return PARAMETER_FUNCTIONS[effect]?.[typeIndex]?.[parameterIndex] ?? (hardwareLabel.includes(" / ") ? null : hardwareLabel);
}

export function describe(effect: string, typeIndex: number, parameterIndex: number, hardwareLabel: string, mode: LabelMode = LABEL_MODES.HARDWARE) {
  const current = activeFunction(effect, typeIndex, parameterIndex, hardwareLabel);
  if (mode === LABEL_MODES.CURRENT) return Object.freeze({ activeFunction: current, segments: Object.freeze(current ? [Object.freeze({ text: current, active: true })] : []) });
  const normalizedCurrent = normalizeLabel(current);
  const parts = hardwareLabel.split(" / ");
  return Object.freeze({
    activeFunction: current,
    segments: Object.freeze(parts.map((text) => Object.freeze({ text, active: Boolean(current) && (parts.length === 1 || normalizeLabel(text) === normalizedCurrent) })))
  });
}
