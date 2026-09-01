"use strict";

(function exposeControlMapping(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Me80ControlMapping = api;
})(typeof globalThis === "object" ? globalThis : undefined, () => {
  const REVERB_TYPES = Object.freeze(["ROOM", "HALL", "SPRING"]);
  const REVERB_SECTION_SIZE = 50;
  const REVERB_POSITION_MAX = (REVERB_TYPES.length * REVERB_SECTION_SIZE) - 1;

  function integerInRange(value, minimum, maximum, label) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
    }
    return value;
  }

  function reverbToPosition(typeIndex, level) {
    integerInRange(typeIndex, 0, REVERB_TYPES.length - 1, "Reverb type");
    integerInRange(level, 0, REVERB_SECTION_SIZE - 1, "Reverb level");
    return (typeIndex * REVERB_SECTION_SIZE) + level;
  }

  function positionToReverb(position) {
    integerInRange(position, 0, REVERB_POSITION_MAX, "Reverb knob position");
    const typeIndex = Math.floor(position / REVERB_SECTION_SIZE);
    const level = position % REVERB_SECTION_SIZE;
    return { typeIndex, type: REVERB_TYPES[typeIndex], level };
  }

  function valueToAngle(value, minimum, maximum, startAngle = -145, endAngle = 145) {
    integerInRange(value, minimum, maximum, "Knob value");
    if (maximum <= minimum) throw new Error("Knob maximum must be greater than its minimum.");
    return startAngle + ((value - minimum) / (maximum - minimum)) * (endAngle - startAngle);
  }

  function angleToValue(angle, minimum, maximum, startAngle = -145, endAngle = 145) {
    if (!Number.isFinite(angle)) throw new Error("Knob angle must be a finite number.");
    integerInRange(minimum, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, "Knob minimum");
    integerInRange(maximum, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, "Knob maximum");
    if (maximum <= minimum) throw new Error("Knob maximum must be greater than its minimum.");
    if (!(startAngle < endAngle) || startAngle < -180 || endAngle > 180) {
      throw new Error("Knob angles must describe an increasing sweep within -180 through 180 degrees.");
    }

    const normalized = normalizeAngle(angle);
    if (normalized < startAngle || normalized > endAngle) {
      return angularDistance(normalized, startAngle) <= angularDistance(normalized, endAngle) ? minimum : maximum;
    }
    const ratio = (normalized - startAngle) / (endAngle - startAngle);
    return Math.round(minimum + (ratio * (maximum - minimum)));
  }

  function normalizeAngle(angle) {
    let normalized = angle;
    while (normalized <= -180) normalized += 360;
    while (normalized > 180) normalized -= 360;
    return normalized;
  }

  function angularDistance(left, right) {
    return Math.abs(normalizeAngle(left - right));
  }

  function nearestOptionIndex(angle, optionAngles) {
    if (!Array.isArray(optionAngles) || optionAngles.length === 0 || optionAngles.some((item) => !Number.isFinite(item))) {
      throw new Error("Option angles must be a non-empty array of finite numbers.");
    }
    return optionAngles.reduce((nearest, candidate, index) => {
      return angularDistance(angle, candidate) < angularDistance(angle, optionAngles[nearest]) ? index : nearest;
    }, 0);
  }

  return Object.freeze({
    REVERB_TYPES,
    REVERB_SECTION_SIZE,
    REVERB_POSITION_MAX,
    reverbToPosition,
    positionToReverb,
    valueToAngle,
    angleToValue,
    normalizeAngle,
    nearestOptionIndex
  });
});
