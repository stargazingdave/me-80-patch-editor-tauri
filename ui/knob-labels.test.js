"use strict";

const assert = require("node:assert/strict");
const labels = require("./knob-labels.js");

assert.equal(labels.activeFunction("comp", 0, 0, "SUSTAIN / SENS / -1 OCT"), "SUSTAIN");
assert.equal(labels.activeFunction("comp", 6, 0, "SUSTAIN / SENS / -1 OCT"), "FREQ");
assert.equal(labels.activeFunction("mod", 10, 1, "DEPTH / HARMONY"), "LOWER");
assert.equal(labels.activeFunction("fx2", 3, 1, "MIDDLE / RATE / FB"), "FEEDBACK");
assert.equal(labels.activeFunction("fx2", 0, 0, "BASS / DRIVE / TIME"), null);

const single = labels.describe("amp", 4, 1, "BASS");
assert.deepEqual(single.segments, [{ text: "BASS", active: true }]);

const composite = labels.describe("mod", 6, 1, "DEPTH / HARMONY");
assert.deepEqual(composite.segments, [
  { text: "DEPTH", active: false },
  { text: "HARMONY", active: true }
]);

const currentOnly = labels.describe("comp", 6, 0, "SUSTAIN / SENS / -1 OCT", labels.LABEL_MODES.CURRENT);
assert.deepEqual(currentOnly.segments, [{ text: "FREQ", active: true }]);

const unused = labels.describe("fx2", 0, 0, "BASS / DRIVE / TIME", labels.LABEL_MODES.CURRENT);
assert.deepEqual(unused.segments, []);

console.log("knob-labels tests passed");
