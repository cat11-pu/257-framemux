// ui.js：操作面板与视图（原生 DOM，无弹窗）
import { render } from "./app.js";

export function mount(spec, parts) {
  parts.log.textContent = "事件 " + (spec.events || []).length + " 条，本轮帧预算 " + (spec.budget || 0) + " 帧。";

  function draw() {
    let view = null;
    try {
      view = render(spec);
    } catch (error) {
      parts.out.textContent = String(error && error.code ? error.code : error);
      parts.log.textContent = "跑不动：" + String(error && error.message ? error.message : error);
      return;
    }
    parts.out.textContent = JSON.stringify(view, null, 1);
    parts.stage.textContent = "";
    (view.streams || []).forEach(function (row) {
      const line = document.createElement("div");
      line.className = "row";
      const head = document.createElement("span");
      head.textContent = "流 " + row[0] + " 信用 " + row[1] + " 已送达 " + row[2];
      line.appendChild(head);
      const mark = document.createElement("span");
      mark.className = "chip" + (row[3] ? " bad" : row[1] === 0 ? " warn" : " ok");
      mark.textContent = row[3] ? "已关闭" : row[1] === 0 ? "信用用尽" : "还能发";
      line.appendChild(mark);
      parts.stage.appendChild(line);
    });
    (view.pending_ids || []).forEach(function (id) {
      const row = document.createElement("div");
      row.className = "row";
      const head = document.createElement("span");
      head.textContent = "帧 " + id + " 压在账上";
      row.appendChild(head);
      const chip = document.createElement("span");
      chip.className = "chip warn";
      chip.textContent = "等收尾";
      row.appendChild(chip);
      parts.stage.appendChild(row);
    });
    parts.legend.textContent = "首轮送达 " + view.delivered_first + " 字节，处理帧 "
      + view.sent_first + " 帧，二档 " + view.sent_wide + " 帧，收尾前账 " + view.pending_before
      + " 条，收尾补齐 " + view.catchup + " 帧，收尾后账 " + view.pending_after + " 条";
    parts.log.textContent = "工作计数 " + view.judged + " / 上界 " + view.judged_bound
      + "，重放新送达 " + view.replay_new + " 帧，与全量对照差异 " + view.full_diff;
  }

  const budgetInput = document.createElement("input");
  budgetInput.type = "number";
  budgetInput.value = "2";
  parts.controls.appendChild(budgetInput);

  const runButton = document.createElement("button");
  runButton.className = "primary";
  runButton.textContent = "跑一遍";
  runButton.addEventListener("click", draw);
  parts.controls.appendChild(runButton);

  const budgetButton = document.createElement("button");
  budgetButton.textContent = "把帧预算换成输入框的值";
  budgetButton.addEventListener("click", function () {
    const next = Number(budgetInput.value);
    spec.budget = Number.isFinite(next) ? Math.max(1, Math.round(next)) : 1;
    draw();
  });
  parts.controls.appendChild(budgetButton);

  const dropButton = document.createElement("button");
  dropButton.textContent = "删最后一条事件";
  dropButton.addEventListener("click", function () {
    spec.events = (spec.events || []).slice(0, Math.max(0, (spec.events || []).length - 1));
    draw();
  });
  parts.controls.appendChild(dropButton);

  draw();
}
