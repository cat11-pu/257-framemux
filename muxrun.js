// muxrun.js：按帧预算发放。预算用尽的帧连流号与长度压在 pending 账上，
// 下一轮（或收尾）按原顺序先发账里的帧；已处理事件记入 applied，重放不重复送达。
import { streamOf, creditEnough } from "./flow.js";

const CODES = {
  unknown: "E_UNKNOWN_STREAM",
  flow: "E_FLOW_CONTROL",
  open: "E_STREAM_OPEN",
  event: "E_BAD_EVENT"
};

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function cloneState(source) {
  const input = source || {};
  const streams = {};
  Object.keys(input.streams || {}).forEach(function (id) {
    const record = input.streams[id] || {};
    streams[id] = {
      credit: Number(record.credit) || 0,
      delivered: Number(record.delivered) || 0,
      closed: !!record.closed
    };
  });
  return {
    streams,
    pending: Array.isArray(input.pending) ? input.pending.map(function (frame) { return frame.slice(); }) : [],
    applied: Array.isArray(input.applied) ? input.applied.slice() : []
  };
}

function codeFor(spec, key) {
  const names = {
    unknown: "unknown_error_code",
    flow: "credit_error_code",
    open: "open_error_code",
    event: "event_error_code"
  };
  const value = spec && spec[names[key]];
  return typeof value === "string" && value ? value : CODES[key];
}

function budgetOf(spec) {
  const value = Number(spec && spec.budget);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// 从账头按原顺序发帧，账空、预算用尽或头帧发不出时停下。
function drainPending(state, remaining) {
  let sent = 0;
  let delivered = 0;
  while (state.pending.length > 0 && remaining > 0) {
    const frame = state.pending[0];
    const stream = frame[0];
    const size = Number(frame[1]);
    const record = streamOf(state, stream);
    if (!record || record.closed || !creditEnough(record, size)) break;
    state.pending.shift();
    record.credit -= size;
    record.delivered += size;
    remaining -= 1;
    sent += 1;
    delivered += size;
  }
  return { sent, delivered };
}

function isValidFrameEvent(event) {
  return event && typeof event === "object"
    && typeof event.stream === "string" && event.stream !== ""
    && Number.isFinite(Number(event.size));
}

export function step(spec) {
  const input = spec || {};
  const state = cloneState(input.state);
  const events = Array.isArray(input.events) ? input.events : [];
  let remaining = budgetOf(input);

  const head = drainPending(state, remaining);
  remaining -= head.sent;
  let sent = head.sent;
  let delivered = head.delivered;
  let judged = 0;

  for (const event of events) {
    judged += 1;
    if (!event || typeof event !== "object") {
      throw fail(codeFor(input, "event"));
    }
    if (event.id !== undefined && state.applied.indexOf(event.id) !== -1) {
      continue;
    }
    if (event.kind === "open") {
      if (typeof event.stream !== "string" || event.stream === ""
          || !Number.isFinite(Number(event.credit))) {
        throw fail(codeFor(input, "event"));
      }
      if (streamOf(state, event.stream)) {
        throw fail(codeFor(input, "open"));
      }
      state.streams[event.stream] = {
        credit: Number(event.credit),
        delivered: 0,
        closed: false
      };
      if (event.id !== undefined) state.applied.push(event.id);
    } else if (event.kind === "close") {
      if (typeof event.stream !== "string" || event.stream === "") {
        throw fail(codeFor(input, "event"));
      }
      const record = streamOf(state, event.stream);
      if (record) record.closed = true;
      if (event.id !== undefined) state.applied.push(event.id);
    } else if (event.kind === "frame") {
      if (!isValidFrameEvent(event)) {
        throw fail(codeFor(input, "event"));
      }
      const record = streamOf(state, event.stream);
      if (!record || record.closed) {
        throw fail(codeFor(input, "unknown"));
      }
      const size = Number(event.size);
      if (!creditEnough(record, size)) {
        throw fail(codeFor(input, "flow"));
      }
      if (remaining > 0) {
        record.credit -= size;
        record.delivered += size;
        remaining -= 1;
        sent += 1;
        delivered += size;
      } else {
        state.pending.push([event.stream, size, event.id]);
      }
      if (event.id !== undefined) state.applied.push(event.id);
    } else {
      throw fail(codeFor(input, "event"));
    }
  }

  return {
    state,
    sent,
    delivered,
    pending_before: state.pending.length,
    pending_ids: state.pending
      .map(function (frame) { return frame[2]; })
      .filter(function (id) { return id !== undefined; }),
    judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  const input = spec || {};
  const state = cloneState(input.state);
  // 收尾不限预算：账里的帧全部送出去。
  const done = drainPending(state, Number.POSITIVE_INFINITY);
  return { state, catchup: done.sent };
}
