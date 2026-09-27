import assert from "node:assert";
import { streamOf, creditEnough } from "../flow.js";
import { step, close } from "../muxrun.js";
import { render } from "../app.js";

const base = {
  budget: 2,
  state: { streams: {}, pending: [], applied: [] },
  events: [],
  unknown_error_code: "E_UNKNOWN_STREAM", credit_error_code: "E_FLOW_CONTROL",
  open_error_code: "E_STREAM_OPEN", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("streamOf gives a record or null", () => {
  assert.strictEqual(streamOf(base.state, "s1"), null);
});

check("creditEnough returns a flag", () => {
  assert.strictEqual(typeof creditEnough(null, 1), "boolean");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
