// flow.js：流表与信用判定
export function streamOf(state, stream) {
  if (!state || !state.streams || !Object.prototype.hasOwnProperty.call(state.streams, stream)) {
    return null;
  }
  return state.streams[stream];
}

export function creditEnough(record, size) {
  if (!record || record.closed) {
    return false;
  }
  return record.credit >= size;
}
