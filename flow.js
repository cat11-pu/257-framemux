// flow.js：流表查询与流控信用判定
export function streamOf(state, stream) {
  if (!state || typeof state !== "object" || !state.streams) return null;
  return Object.prototype.hasOwnProperty.call(state.streams, stream)
    ? state.streams[stream]
    : null;
}

export function creditEnough(record, size) {
  if (!record) return false;
  return Number(record.credit) - Number(size) >= 0;
}
