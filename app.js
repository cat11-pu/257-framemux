// app.js：渲染结果
import { streamOf, creditEnough } from "./flow.js";
import { step, close } from "./muxrun.js";

export function render(spec) {
  const events = spec.events || [];
  const half = Math.ceil(events.length / 2);
  const first = step(spec);
  const closed = close(Object.assign({}, spec, { state: first.state }));
  const r1 = step(Object.assign({}, spec, { events: events.slice(0, half) }));
  const r2 = step(Object.assign({}, spec, { state: r1.state, events: events.slice(half) }));
  const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
  const replay = step(Object.assign({}, spec, { state: closed.state }));
  const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
  const full = step(Object.assign({}, spec, { budget: events.length + 2 }));
  const fullClosed = close(Object.assign({}, spec, { state: full.state }));
  const streamIds = function (state) { return Object.keys(state.streams).sort(); };
  const fingerprint = function (state) {
    return JSON.stringify({
      streams: streamIds(state).map(function (id) {
        const record = state.streams[id];
        return [id, record.credit, record.delivered, !!record.closed];
      }),
      pending: state.pending.map(function (frame) { return frame.join(":"); }),
      applied: state.applied.length
    });
  };
  const ids = streamIds(closed.state);
  const rows = ids.map(function (id) {
    const record = closed.state.streams[id];
    return [id, record.credit, record.delivered, !!record.closed];
  });
  const total = function (state) {
    return streamIds(state).reduce(function (sum, id) { return sum + state.streams[id].delivered; }, 0);
  };
  return { streams: rows, stream_count: ids.length, delivered_total: total(closed.state),
           sent_first: first.sent, sent_wide: wide.sent,
           pair_differs: first.sent !== wide.sent, delivered_first: first.delivered,
           pending_before: first.pending_before, pending_ids: first.pending_ids,
           catchup: closed.catchup, pending_after: closed.state.pending.length,
           mid_differs: fingerprint(r2.state) !== fingerprint(first.state),
           closed_equal: fingerprint(closedTwo.state) === fingerprint(closed.state),
           replay_new: replay.delivered, judged: first.judged, judged_bound: first.judged_bound,
           full_diff: fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1,
           count: events.length, tail: creditEnough(streamOf(closed.state, ids[0] || ""), 0) ? 1 : 0 };
}
