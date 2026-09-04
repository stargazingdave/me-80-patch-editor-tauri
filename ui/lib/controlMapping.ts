export const REVERB_TYPES = Object.freeze(["ROOM", "HALL", "SPRING"]);
export const REVERB_SECTION_SIZE = 50;
export const REVERB_POSITION_MAX = (REVERB_TYPES.length * REVERB_SECTION_SIZE) - 1;

function integerInRange(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  return value;
}

export function reverbToPosition(typeIndex: number, level: number) {
  integerInRange(typeIndex, 0, REVERB_TYPES.length - 1, "Reverb type");
  integerInRange(level, 0, REVERB_SECTION_SIZE - 1, "Reverb level");
  return (typeIndex * REVERB_SECTION_SIZE) + level;
}

export function positionToReverb(position: number) {
  integerInRange(position, 0, REVERB_POSITION_MAX, "Reverb knob position");
  const typeIndex = Math.floor(position / REVERB_SECTION_SIZE);
  return { typeIndex, type: REVERB_TYPES[typeIndex], level: position % REVERB_SECTION_SIZE };
}

export function valueToAngle(value: number, minimum: number, maximum: number, startAngle = -145, endAngle = 145) {
  integerInRange(value, minimum, maximum, "Knob value");
  if (maximum <= minimum) throw new Error("Knob maximum must be greater than its minimum.");
  return startAngle + ((value - minimum) / (maximum - minimum)) * (endAngle - startAngle);
}

export function angleToValue(angle: number, minimum: number, maximum: number, startAngle = -145, endAngle = 145) {
  if (!Number.isFinite(angle)) throw new Error("Knob angle must be a finite number.");
  integerInRange(minimum, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, "Knob minimum");
  integerInRange(maximum, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, "Knob maximum");
  if (maximum <= minimum) throw new Error("Knob maximum must be greater than its minimum.");
  if (!(startAngle < endAngle) || startAngle < -180 || endAngle > 180) throw new Error("Knob angles must describe an increasing sweep within -180 through 180 degrees.");
  const normalized = normalizeAngle(angle);
  if (normalized < startAngle || normalized > endAngle) return angularDistance(normalized, startAngle) <= angularDistance(normalized, endAngle) ? minimum : maximum;
  return Math.round(minimum + (((normalized - startAngle) / (endAngle - startAngle)) * (maximum - minimum)));
}

export function normalizeAngle(angle: number) {
  let normalized = angle;
  while (normalized <= -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
}

function angularDistance(left: number, right: number) {
  return Math.abs(normalizeAngle(left - right));
}

export function nearestOptionIndex(angle: number, optionAngles: readonly number[]) {
  if (!optionAngles.length || optionAngles.some((item) => !Number.isFinite(item))) throw new Error("Option angles must be a non-empty array of finite numbers.");
  return optionAngles.reduce((nearest, candidate, index) => angularDistance(angle, candidate) < angularDistance(angle, optionAngles[nearest]) ? index : nearest, 0);
}
