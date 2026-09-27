// muxrun.js：按帧预算发放并留账（基线：一律给空表）
import { streamOf, creditEnough } from "./flow.js";

export function step(spec) {
  return { state: spec.state, sent: 0, delivered: 0, pending_before: 0,
           pending_ids: [], judged: 0, judged_bound: 0 };
}

export function close(spec) {
  return { state: spec.state, catchup: 0 };
}
