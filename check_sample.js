import fs from "node:fs";
import { streamOf, creditEnough } from "./flow.js";
import { step, close } from "./muxrun.js";

// 验收断言：上面每条值收进 emit，最后与期望值逐项比对，不符就非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/frames.json", "utf8"));
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

emit("收尾后各流状态 =", JSON.stringify(ids.map(function (id) {
  const record = closed.state.streams[id];
  return [id, record.credit, record.delivered, !!record.closed];
})));
emit("首轮处理帧数 =", first.sent);
emit("二档处理帧数 =", wide.sent);
emit("两个预算档处理不同 =", first.sent !== wide.sent);
emit("首轮送达字节 =", first.delivered);
emit("收尾前待处理账 =", first.pending_before);
emit("压在账上的帧 =", JSON.stringify(first.pending_ids));
emit("收尾补齐帧数 =", closed.catchup);
emit("收尾后待处理账 =", closed.state.pending.length);
emit("拆两轮中间态不同 =", fingerprint(r2.state) !== fingerprint(first.state));
emit("拆两轮收尾态一致 =", fingerprint(closedTwo.state) === fingerprint(closed.state));
emit("重放新送达帧数 =", replay.delivered);
emit("工作计数未超上界 =", first.judged <= first.judged_bound);
emit("与全量对照差异 =", fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1);


// ---- 异常路径探针：真调用实现，看它报出什么码（不是从样例里抄）----
const __probes = {};
function __probe(label, expectedCode, run) {
  let fired = false;
  let code = "没有报错";
  try {
    run();
  } catch (error) {
    fired = true;
    code = error && error.code ? error.code : String(error.message);
  }
  __probes[label] = { fired: fired, code: code, expected: expectedCode };
  emit(label, code);
}
__probe("未开流报码", "E_UNKNOWN_STREAM", function () {
  step(Object.assign({}, { budget: 2, state: { streams: {}, pending: [], applied: [] },
    events: [{ id: 1, kind: "frame", stream: "s9", size: 1 }] }));
});
__probe("信用不足报码", "E_FLOW_CONTROL", function () {
  step(Object.assign({}, { budget: 2,
    state: { streams: { s1: { credit: 1, delivered: 0, closed: false } }, pending: [], applied: [] },
    events: [{ id: 1, kind: "frame", stream: "s1", size: 2 }] }));
});
__probe("重复开流报码", "E_STREAM_OPEN", function () {
  step(Object.assign({}, { budget: 2,
    state: { streams: { s1: { credit: 1, delivered: 0, closed: false } }, pending: [], applied: [] },
    events: [{ id: 1, kind: "open", stream: "s1", credit: 3 }] }));
});
__probe("事件不合法报码", "E_BAD_EVENT", function () {
  step(Object.assign({}, { budget: 2, state: { streams: {}, pending: [], applied: [] },
    events: [{ id: 1, kind: "peek", stream: "s1" }] }));
});

// ---- 七条机检断言：不达标立即记失败，最终非零退出 ----
const __machineChecks = [
  ["两档送出帧数不同", first.sent !== wide.sent],
  ["收尾前账大于零而收尾后归零", first.pending_before > 0 && closed.state.pending.length === 0],
  ["拆两轮中间态不同而收尾态一致",
    fingerprint(r2.state) !== fingerprint(first.state)
    && fingerprint(closedTwo.state) === fingerprint(closed.state)],
  ["重放不再新送达", replay.delivered === 0],
  ["工作计数不超事件条数", first.judged <= first.judged_bound && first.judged_bound === events.length],
  ["与全量对照为零", fingerprint(closed.state) === fingerprint(fullClosed.state)],
  ["状态异常探针真调", Object.keys(__probes).length === 4
    && Object.keys(__probes).every(function (label) {
      const probe = __probes[label];
      return probe.fired && probe.code === probe.expected;
    })]
];
let __assertBad = 0;
for (const [name, ok] of __machineChecks) {
  if (ok) { console.log("机检断言通过 " + name); }
  else { __assertBad += 1; console.log("机检断言失败 " + name); }
}

// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "收尾后各流状态": [
    [
      "s1",
      0,
      5,
      true
    ],
    [
      "s2",
      0,
      3,
      false
    ],
    [
      "s3",
      0,
      2,
      false
    ],
    [
      "s4",
      1,
      0,
      false
    ]
  ],
  "首轮处理帧数": 2,
  "二档处理帧数": 4,
  "两个预算档处理不同": true,
  "首轮送达字节": 5,
  "收尾前待处理账": 3,
  "压在账上的帧": [
    6,
    7,
    9
  ],
  "收尾补齐帧数": 3,
  "收尾后待处理账": 0,
  "拆两轮中间态不同": true,
  "拆两轮收尾态一致": true,
  "重放新送达帧数": 0,
  "工作计数未超上界": true,
  "与全量对照差异": 0,
  "未开流报码": "E_UNKNOWN_STREAM",
  "信用不足报码": "E_FLOW_CONTROL",
  "重复开流报码": "E_STREAM_OPEN",
  "事件不合法报码": "E_BAD_EVENT"
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
console.log("机检断言 " + (__machineChecks.length - __assertBad) + "/" + __machineChecks.length + " 通过");
process.exit(__bad === 0 && __assertBad === 0 ? 0 : 1);
