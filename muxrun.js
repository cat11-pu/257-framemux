// muxrun.js：按帧预算发放并留账，收尾不限预算送完
import { streamOf, creditEnough } from "./flow.js";

const DEFAULT_CODES = {
  unknown: "E_UNKNOWN_STREAM",
  credit: "E_FLOW_CONTROL",
  open: "E_STREAM_OPEN",
  event: "E_BAD_EVENT"
};

function codesOf(spec) {
  return {
    unknown: spec.unknown_error_code || DEFAULT_CODES.unknown,
    credit: spec.credit_error_code || DEFAULT_CODES.credit,
    open: spec.open_error_code || DEFAULT_CODES.open,
    event: spec.event_error_code || DEFAULT_CODES.event
  };
}

function failure(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function isFiniteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function cloneState(state) {
  const source = state || {};
  const streams = {};
  Object.keys(source.streams || {}).forEach(function (id) {
    const record = source.streams[id] || {};
    streams[id] = {
      credit: record.credit,
      delivered: record.delivered || 0,
      closed: !!record.closed
    };
  });
  const pending = (source.pending || []).map(function (frame) {
    return [frame[0], frame[1], frame[2]];
  });
  const applied = (source.applied || []).slice();
  return { streams: streams, pending: pending, applied: applied };
}

function validateEvent(event, codes) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw failure(codes.event, "event must be an object");
  }
  if (typeof event.stream !== "string" || event.stream.length === 0) {
    throw failure(codes.event, "event.stream must be a non-empty string");
  }
  if (event.kind === "open") {
    if (!isFiniteNonNegative(event.credit)) {
      throw failure(codes.event, "open event needs a non-negative credit");
    }
  } else if (event.kind === "frame") {
    if (!isFiniteNonNegative(event.size)) {
      throw failure(codes.event, "frame event needs a non-negative size");
    }
  } else if (event.kind !== "close") {
    throw failure(codes.event, "unknown event kind: " + String(event.kind));
  }
}

// 真把一帧送出去：状态异常（流没开/已关）或缺信用都由状态推出报错。
function sendFrame(state, frame, codes) {
  const record = streamOf(state, frame[1]);
  if (!record || record.closed) {
    throw failure(codes.unknown, "frame on stream that is not open: " + frame[1]);
  }
  if (!creditEnough(record, frame[2])) {
    throw failure(codes.credit, "not enough credit on stream: " + frame[1]);
  }
  record.credit -= frame[2];
  record.delivered += frame[2];
}

export function step(spec) {
  const input = spec || {};
  const codes = codesOf(input);
  const state = cloneState(input.state);
  const events = Array.isArray(input.events) ? input.events : [];
  let budget = Number.isFinite(input.budget) ? Math.max(0, Math.trunc(input.budget)) : 0;

  // 下一轮先按原顺序把账里的帧送出去，账上帧同样受本轮帧预算约束。
  let cursor = 0;
  let sent = 0;
  let delivered = 0;
  while (cursor < state.pending.length) {
    if (budget <= 0) {
      break;
    }
    const frame = state.pending[cursor];
    sendFrame(state, frame, codes);
    state.pending.splice(cursor, 1);
    budget -= 1;
    sent += 1;
    delivered += frame[2];
  }

  let judged = 0;
  events.forEach(function (event) {
    validateEvent(event, codes);
    if (event.id !== undefined && state.applied.indexOf(event.id) !== -1) {
      return;
    }

    if (event.kind === "open") {
      const existing = streamOf(state, event.stream);
      if (existing) {
        throw failure(codes.open, "stream already opened: " + event.stream);
      }
      state.streams[event.stream] = { credit: event.credit, delivered: 0, closed: false };
      judged += 1;
      if (event.id !== undefined) {
        state.applied.push(event.id);
      }
      return;
    }

    if (event.kind === "close") {
      const record = streamOf(state, event.stream);
      if (!record || record.closed) {
        throw failure(codes.unknown, "close on stream that is not open: " + event.stream);
      }
      record.closed = true;
      judged += 1;
      if (event.id !== undefined) {
        state.applied.push(event.id);
      }
      return;
    }

    // frame：先由状态判合法性与信用，再决定送出还是压在账上带出下一轮。
    const frame = [event.id, event.stream, event.size];
    const record = streamOf(state, frame[1]);
    if (!record || record.closed) {
      throw failure(codes.unknown, "frame on stream that is not open: " + frame[1]);
    }
    if (!creditEnough(record, frame[2])) {
      throw failure(codes.credit, "not enough credit on stream: " + frame[1]);
    }
    if (budget <= 0) {
      state.pending.push(frame);
    } else {
      sendFrame(state, frame, codes);
      budget -= 1;
      sent += 1;
      delivered += frame[2];
    }
    judged += 1;
    if (event.id !== undefined) {
      state.applied.push(event.id);
    }
  });

  return {
    state: state,
    sent: sent,
    delivered: delivered,
    pending_before: state.pending.length,
    pending_ids: state.pending.map(function (frame) { return frame[0]; }),
    judged: judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  const input = spec || {};
  const codes = codesOf(input);
  const state = cloneState(input.state);

  // 收尾不限预算，按原顺序把账里的帧全部送出去。
  let catchup = 0;
  while (state.pending.length > 0) {
    const frame = state.pending.shift();
    sendFrame(state, frame, codes);
    catchup += 1;
  }

  return { state: state, catchup: catchup };
}
