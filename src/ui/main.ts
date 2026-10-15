// 主入口：SRT → 分拍 → 构图 → 选版式 → 门禁 → 舞台播放 / 导出 MP4。
// Phase 2：文件上传、输入校验（错误/警告分流）、生成状态步进、导出取消/互斥/重试、
// 可复现产物（MP4 + 工程 JSON + 运行日志）。

import { plan, type PlanResult } from "../core/plan";
import { validateSRT, decodeSrtBytes } from "../core/srt-validate";
import { toRenderPlan, serializeRenderPlan } from "../core/render-plan";
import { buildStage, type Shot, type StageHandle } from "./stage";
import { exportMp4 } from "../export/mp4";
import "../styles/main.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const srtInput = $<HTMLTextAreaElement>("srt-input");
const ovInput = $<HTMLTextAreaElement>("override-input");
const srtFile = $<HTMLInputElement>("srt-file");
const btnLoad = $<HTMLButtonElement>("btn-load");
const btnPlay = $<HTMLButtonElement>("btn-play");
const btnExport = $<HTMLButtonElement>("btn-export");
const btnCancel = $<HTMLButtonElement>("btn-cancel");
const btnSave = $<HTMLButtonElement>("btn-save");
const gateReport = $<HTMLUListElement>("gate-report");
const stageHost = $<HTMLDivElement>("stage");
const scrubber = $<HTMLInputElement>("scrubber");
const timecode = $<HTMLSpanElement>("timecode");
const beatList = $<HTMLOListElement>("beat-list");
const statusSteps = $<HTMLOListElement>("status-steps");
const statusLog = $<HTMLDivElement>("status-log");

type ReportKind = "ok" | "err" | "warn";
type ReportLine = { text: string; kind: ReportKind };

let stage: StageHandle | null = null;
let shots: Shot[] = [];
let lastPlan: PlanResult | null = null;
let raf = 0;
let playing = false;
let exporting = false;
let exportCtl: AbortController | null = null;

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function report(lines: ReportLine[]) {
  gateReport.hidden = lines.length === 0;
  gateReport.innerHTML = lines
    .map((l) => `<li class="${l.kind === "ok" ? "ok" : l.kind === "warn" ? "warn" : ""}">${l.text.replace(/</g, "&lt;")}</li>`)
    .join("");
}

function log(msg: string) {
  statusLog.hidden = false;
  const t = new Date().toLocaleTimeString();
  statusLog.innerHTML += `<div><span class="log-t">${t}</span> ${msg.replace(/</g, "&lt;")}</div>`;
  statusLog.scrollTop = statusLog.scrollHeight;
}

const STEP_ORDER = ["read", "analyze", "plan", "preview", "export", "verify"];
function setStep(name: string, state: "active" | "done" | "fail") {
  const idx = STEP_ORDER.indexOf(name);
  if (idx < 0) return;
  statusSteps.querySelectorAll("li").forEach((li, i) => {
    li.classList.remove("active", "done", "fail");
    if (i < idx) li.classList.add("done");
    else if (i === idx) li.classList.add(state);
  });
}
function resetSteps() {
  statusSteps.querySelectorAll("li").forEach((li) => li.classList.remove("active", "done", "fail"));
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function startTicker() {
  cancelAnimationFrame(raf);
  const loop = () => {
    if (stage) {
      const t = stage.time();
      scrubber.value = String(Math.round((t / (stage.duration || 1)) * Number(scrubber.max)));
      timecode.textContent = fmt(t);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

btnLoad.addEventListener("click", () => {
  cancelAnimationFrame(raf);
  playing = false;
  stage?.destroy();
  stage = null;
  btnPlay.disabled = true;
  btnExport.disabled = true;
  btnSave.disabled = true;
  scrubber.disabled = true;
  beatList.innerHTML = "";
  resetSteps();

  const source = srtInput.value;

  // 阶段 1-2：读取 + 分析（输入卫生）
  setStep("read", "done");
  setStep("analyze", "active");
  const v = validateSRT(source);
  const lines: ReportLine[] = v.errors.map((t) => ({ text: t, kind: "err" as const }));
  for (const w of v.warnings) lines.push({ text: `⚠ ${w}`, kind: "warn" });
  if (!v.ok) {
    report(lines);
    setStep("analyze", "fail");
    log("SRT 校验未通过，已阻止规划");
    return;
  }
  if (v.warnings.length) log(`SRT 校验通过（${v.warnings.length} 条提示）`);

  // 阶段 3：规划
  setStep("analyze", "done");
  setStep("plan", "active");
  let result: PlanResult;
  try {
    result = plan(source, ovInput.value);
  } catch (e) {
    report([{ text: (e as Error).message, kind: "err" }]);
    setStep("plan", "fail");
    return;
  }
  if (result.problems.length > 0) {
    report(lines.concat(result.problems.map((t) => ({ text: t, kind: "err" as const }))));
    setStep("plan", "fail");
    log("规划门禁未通过，已阻止预览");
    return;
  }
  shots = result.shots;
  lastPlan = result;

  // 阶段 4：预览
  setStep("plan", "done");
  setStep("preview", "active");
  const styleCounts: Record<string, number> = { editorial: 0, "flat-vector": 0, "chart-motion": 0 };
  for (const s of shots) {
    const st = s.layout.style ?? "editorial";
    styleCounts[st] = (styleCounts[st] ?? 0) + 1;
  }
  const styleLabel: Record<string, string> = { editorial: "编辑", "flat-vector": "扁平矢量", "chart-motion": "图表动态" };
  const styleReport = (["editorial", "flat-vector", "chart-motion"] as const)
    .filter((st) => styleCounts[st]! > 0)
    .map((st) => `${styleLabel[st]}风 ${styleCounts[st]} 拍`)
    .join(" / ");
  report(lines.concat([
    { text: `门禁通过：${shots.length} 拍，用到 ${new Set(shots.map((s) => s.layout.id)).size} 个版式，画面数字全部可溯源。`, kind: "ok" },
    { text: `风格：${styleReport} —— ${result.styles.join("　")}`, kind: "ok" },
    ...(result.warnings?.length
      ? [{ text: `布局告警 ${result.warnings.length} 条（不拦截播放）：${result.warnings.slice(0, 3).join("；")}${result.warnings.length > 3 ? "…" : ""}`, kind: "warn" as const }]
      : []),
  ]));
  log(`规划完成：${shots.length} 拍（${styleReport}）`);

  renderBeatList();
  stage = buildStage(stageHost, shots);
  (window as unknown as { __stage?: StageHandle; __exportMp4?: typeof exportMp4 }).__stage = stage;
  (window as unknown as { __exportMp4?: typeof exportMp4 }).__exportMp4 = exportMp4;
  stage.onComplete(() => { playing = false; btnPlay.textContent = "重播"; });

  scrubber.disabled = false;
  btnPlay.disabled = false;
  btnExport.disabled = false;
  btnSave.disabled = false;
  btnPlay.textContent = "播放";
  scrubber.value = "0";
  timecode.textContent = fmt(0);
  setStep("preview", "done");
  startTicker();

  scrubber.oninput = () => {
    if (!stage) return;
    playing = false;
    btnPlay.textContent = "播放";
    stage.seek((Number(scrubber.value) / Number(scrubber.max)) * stage.duration);
  };

  btnPlay.onclick = () => {
    if (!stage) return;
    if (playing) {
      stage.pause();
      playing = false;
      btnPlay.textContent = "播放";
    } else {
      if (stage.time() >= stage.duration) stage.seek(0);
      stage.play();
      playing = true;
      btnPlay.textContent = "暂停";
    }
  };
});

// 文件上传：字节流先做 BOM/编码解码，再灌进文本框并自动规划。
srtFile.addEventListener("change", () => {
  const file = srtFile.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      srtInput.value = decodeSrtBytes(bytes);
      srtFile.value = "";
      log(`已读取文件 ${file.name}（${file.size} 字节）`);
      btnLoad.click();
    } catch (e) {
      report([{ text: (e as Error).message, kind: "err" }]);
      log(`文件读取失败：${(e as Error).message}`);
    }
  };
  reader.onerror = () => {
    report([{ text: "文件读取失败，请重试或更换文件", kind: "err" }]);
    log("文件读取失败");
  };
  reader.readAsArrayBuffer(file);
});

// 导出：互斥（exporting 锁）+ 可取消（AbortController）+ 失败可重试（按钮复位）。
btnExport.addEventListener("click", async () => {
  if (exporting || !stage || shots.length === 0) return;
  exporting = true;
  exportCtl = new AbortController();
  btnExport.disabled = true;
  btnExport.textContent = "导出中…";
  btnCancel.hidden = false;
  btnCancel.disabled = false;
  setStep("export", "active");
  log(`开始导出 ${shots.length} 拍…`);

  try {
    const blob = await exportMp4(stage, stage.duration, { signal: exportCtl.signal });
    downloadBlob(blob, "srt-film.mp4");
    setStep("export", "done");
    setStep("verify", "done");
    log(`导出完成：${(blob.size / 1e6).toFixed(1)}MB`);
    report([{ text: `MP4 已导出（${shots.length} 拍 / ${(blob.size / 1e6).toFixed(1)}MB）。可点「保存工程 JSON」留存可复现产物。`, kind: "ok" }]);
  } catch (e) {
    const msg = (e as Error).message;
    setStep("export", "fail");
    if (msg.includes("取消")) {
      log("导出已取消");
      report([{ text: "导出已取消，可重新点击「导出 MP4」。", kind: "warn" }]);
    } else {
      log(`导出失败：${msg}`);
      report([{ text: `导出失败：${msg}（可重试）`, kind: "err" }]);
    }
  } finally {
    exporting = false;
    exportCtl = null;
    btnExport.disabled = false;
    btnExport.textContent = "导出 MP4";
    btnCancel.hidden = true;
    btnCancel.disabled = true;
  }
});

btnCancel.addEventListener("click", () => exportCtl?.abort());

// 可复现产物：导出 schema 背书的 RenderPlan（SRT + 镜头计划 + 画布 + 导出配置）。
btnSave.addEventListener("click", () => {
  if (!lastPlan || shots.length === 0) return;
  const rp = toRenderPlan(lastPlan, { srt: srtInput.value });
  downloadBlob(
    new Blob([serializeRenderPlan(rp)], { type: "application/json" }),
    "srt-film-render-plan.json",
  );
  log(`已保存 RenderPlan v${rp.version}（${rp.scenes.length} 拍，schema=${rp.schema}）`);
});

function renderBeatList() {
  beatList.innerHTML = shots
    .map((s, i) => {
      const n = s.narrative;
      const roleTag = n ? `<span class="beat-role">${n.role}</span>` : "";
      const purpose = n ? `<span class="beat-purpose">${n.purpose.replace(/</g, "&lt;")}</span>` : "";
      return `<li data-beat="${i}">
      <span class="beat-no">${String(i + 1).padStart(2, "0")}</span>
      <span class="beat-layout">${s.layout.name}</span>
      <span class="beat-text">${s.content.headline.replace(/</g, "&lt;")}</span>
      ${roleTag}${purpose}
    </li>`;
    })
    .join("");
  beatList.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      const idx = Number((li as HTMLElement).dataset.beat);
      const shot = shots[idx];
      if (shot && stage) {
        playing = false;
        btnPlay.textContent = "播放";
        stage.seek(shot.tlStart ?? shot.start);
      }
    });
  });
}
