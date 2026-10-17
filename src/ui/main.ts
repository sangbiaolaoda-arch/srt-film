// 主入口：SRT → 分拍 → 构图 → 选版式 → 门禁 → 舞台播放 / 导出 MP4。
// Phase 2：文件上传、输入校验（错误/警告分流）、生成状态步进、导出取消/互斥/重试、
// 可复现产物（MP4 + 工程 JSON + 运行日志）。

import { plan, type PlanResult } from "../core/plan";
import { validateSRT, decodeSrtBytes } from "../core/srt-validate";
import { toRenderPlan, parseRenderPlan, serializeRenderPlan } from "../core/render-plan";
import { buildStage, type Shot, type StageHandle } from "./stage";
import { exportMp4 } from "../export/mp4";
import { renderFrame } from "../render/frame";
import {
  DEFAULT_EXPORT,
  EXPORT_BITRATE_OPTIONS,
  EXPORT_FPS_OPTIONS,
  EXPORT_RESOLUTIONS,
  avcLevelLabel,
  resolveExport,
  type ExportSettings,
} from "../export/settings";
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
const selRes = $<HTMLSelectElement>("export-res");
const selFps = $<HTMLSelectElement>("export-fps");
const selBitrate = $<HTMLSelectElement>("export-bitrate");
const exportSummary = $<HTMLSpanElement>("export-summary");
const projectFile = $<HTMLInputElement>("project-file");

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

/** 毫秒 → 「约 40 秒」/「约 2 分 05 秒」（导出 ETA 用；不足 1 秒不显示，避免闪「剩余约 0 秒」）。 */
function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 1) return "";
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, "0")} 秒`;
}

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

const STEP_ORDER = ["read", "analyze", "plan", "preview", "export", "verify"];function setStep(name: string, state: "active" | "done" | "fail") {
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

// —— 导出设置面板（Phase 8）——
// 档位列表只有一份定义（export/settings.ts），这里只做 DOM 填充与读回。
// 码率下拉里多一项「自动（按分辨率）」：换分辨率时不改码率是最容易犯的错
//（1440p 配 4Mbps 会明显发糊），自动档直接用 defaultBitrate 派生。
const BITRATE_AUTO = "auto";

function fillExportPanel(): void {
  selRes.innerHTML = EXPORT_RESOLUTIONS.map(
    (r) => `<option value="${r.width}x${r.height}">${r.label}</option>`,
  ).join("");
  selRes.value = `${DEFAULT_EXPORT.width}x${DEFAULT_EXPORT.height}`;
  selFps.innerHTML = EXPORT_FPS_OPTIONS.map((f) => `<option value="${f}">${f} fps</option>`).join("");
  selFps.value = String(DEFAULT_EXPORT.fps);
  const autoLabel = `自动（按分辨率）`;
  selBitrate.innerHTML =
    `<option value="${BITRATE_AUTO}">${autoLabel}</option>` +
    EXPORT_BITRATE_OPTIONS.map((b) => `<option value="${b}000000">${b} Mbps</option>`).join("");
  selBitrate.value = BITRATE_AUTO;
  [selRes, selFps, selBitrate].forEach((el) => el.addEventListener("change", refreshExportSummary));
  refreshExportSummary();
}

/** 读回面板 → 完整档位。码率选「自动」时留 undefined，交给 resolveExport 按像素数派生。 */
function currentExport(): ExportSettings {
  const [w, h] = selRes.value.split("x").map(Number);
  const bitrateRaw = selBitrate.value;
  return resolveExport({
    width: w,
    height: h,
    fps: Number(selFps.value),
    bitrate: bitrateRaw === BITRATE_AUTO ? undefined : Number(bitrateRaw),
  });
}

/** 摘要行把「实际会用到的参数」摊开：H.264 level 是派生结果，不摊开用户无从判断
 *  1440p 是不是真能编（超 level 会直接失败，不是降质）。 */
function refreshExportSummary(): void {
  try {
    const cfg = currentExport();
    exportSummary.textContent = `${cfg.width}×${cfg.height} · ${cfg.fps}fps · ${(cfg.bitrate / 1e6).toFixed(0)}Mbps · H.264 Level ${avcLevelLabel(cfg.width, cfg.height, cfg.fps)}`;
  } catch (e) {
    exportSummary.textContent = (e as Error).message;
  }
}

fillExportPanel();

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
    ...compareWithProject(),
  ]));
  log(`规划完成：${shots.length} 拍（${styleReport}）`);

  renderBeatList();
  stage = buildStage(stageHost, shots);
  (window as unknown as { __stage?: StageHandle; __exportMp4?: typeof exportMp4 }).__stage = stage;
  (window as unknown as { __exportMp4?: typeof exportMp4 }).__exportMp4 = exportMp4;
  // 导出直推钩子：exportMp4 产出的 Blob 不再经 agent-browser 的 base64 桥（25MB+ 会在回传时
  // 撑爆桥接或让无头 tab 失联），改为由页面用 fetch 流式 POST 给本机接收端（e2e 工具自起），
  // 接收端直接落盘。startTime 透传给 exportMp4 以支持分段导出。返回 HTTP 状态码（200=成功）。
  (window as unknown as { __exportMp4Post?: (stage: StageHandle, url: string, dur: number, opts?: Record<string, unknown>) => Promise<number> }).__exportMp4Post =
    async (st, url, dur, opts) => {
      const blob = await exportMp4(st, dur, opts as never);
      const r = await fetch(url, { method: "POST", body: blob, headers: { "content-type": "video/mp4" } });
      return r.status;
    };
  // 导出错误透出堆栈（分段导出偶发 WebCodecs 报错时便于定位，不影响正常路径）。
  (window as unknown as { __exportMp4Err?: (e: unknown) => string }).__exportMp4Err = (e) =>
    String((e && (e as { stack?: string }).stack) || e);
  // QA 钩子：逐帧取样必须走与导出同一条 renderFrame 路径。
  // seek() 只推时间轴并置脏，实际重画由 setAutoRender 控制的 rAF 循环负责；
  // 自动化脚本要关掉那个循环（否则与自身抢时间轴），就失去了画面来源。
  (window as unknown as { __renderFrame?: typeof renderFrame }).__renderFrame = renderFrame;
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
  const cfg = currentExport();
  exporting = true;
  exportCtl = new AbortController();
  btnExport.disabled = true;
  btnExport.textContent = "导出中…";
  btnCancel.hidden = false;
  btnCancel.disabled = false;
  setStep("export", "active");
  log(`开始导出 ${shots.length} 拍 → ${cfg.width}×${cfg.height}@${cfg.fps}fps / ${(cfg.bitrate / 1e6).toFixed(0)}Mbps…`);

  try {
    // 进度只在按钮文案里滚动更新，不逐帧写日志（74s 的片子会刷出几百行把面板淹掉）。
    // 导出每 8 帧让出一次主线程，这里正好是唯一能安全改 DOM 的时机。
    const blob = await exportMp4(stage, stage.duration, {
      signal: exportCtl.signal,
      ...cfg,
      onProgress: (p) => {
        const pct = Math.round((p.frame / p.total) * 100);
        const eta = p.etaMs === undefined ? "" : ` · 剩余约 ${fmtDur(p.etaMs)}`;
        btnExport.textContent = `导出中 ${pct}%${eta}`;
      },
    });
    downloadBlob(blob, `srt-film-${cfg.width}x${cfg.height}-${cfg.fps}fps.mp4`);
    setStep("export", "done");
    setStep("verify", "done");
    log(`导出完成：${(blob.size / 1e6).toFixed(1)}MB（${cfg.width}×${cfg.height}@${cfg.fps}fps）`);
    report([{ text: `MP4 已导出：${cfg.width}×${cfg.height}@${cfg.fps}fps，${shots.length} 拍，${(blob.size / 1e6).toFixed(1)}MB。可点「保存工程 JSON」留存可复现产物。`, kind: "ok" }]);
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
// 导出档位从面板读，让工程 JSON 与实际 MP4 是同一份参数。
btnSave.addEventListener("click", () => {
  if (!lastPlan || shots.length === 0) return;
  const rp = toRenderPlan(lastPlan, { srt: srtInput.value, export: currentExport() });
  downloadBlob(
    new Blob([serializeRenderPlan(rp)], { type: "application/json" }),
    "srt-film-render-plan.json",
  );
  log(`已保存 RenderPlan v${rp.version}（${rp.scenes.length} 拍，${rp.canvas.width}×${rp.canvas.height}@${rp.canvas.fps}，schema=${rp.schema}）`);
});

// 载入工程 JSON：把「可复现产物」的闭环补上 —— 之前 parseRenderPlan/validateRenderPlan
// 已实现并有测试，但 UI 上只能存不能读，闭环是断的。
//
// 回读做什么：回填 SRT 原文 + 导出档位（分辨率/帧率/码率），再走一次「载入并规划」。
// 不直接渲染存档里的 scenes —— 规划是纯函数（同 SRT + 同覆写 → 同 shots），重规划
// 等价于还原，而且顺手把门禁与风格规划一起跑了一遍。存档 scenes 只用于比对：
// 若与重规划结果不同，说明工程是在规划逻辑改版之前存的，如实告诉用户而不是静默。
let pendingProject: { scenes: { layoutId: string; headline: string }[] } | null = null;

function applyExportSettingsFrom(rp: ReturnType<typeof toRenderPlan>): boolean {
  const { width, height, fps } = rp.canvas;
  const known = EXPORT_RESOLUTIONS.find((r) => r.width === width && r.height === height);
  if (!known) {
    log(`⚠ 工程里的分辨率 ${width}×${height} 不在面板档位内，保留当前选择`);
    return false;
  }
  selRes.value = `${width}x${height}`;
  selFps.value = String(fps);
  const bitrate = rp.export.bitrate;
  // 码率可能是「按分辨率自动派生」的结果值；正好等于某个下拉项就选中它，否则留在自动档。
  const asOption = [...selBitrate.options].some((o) => Number(o.value) === bitrate);
  selBitrate.value = bitrate !== undefined && asOption ? String(bitrate) : BITRATE_AUTO;
  refreshExportSummary();
  return true;
}

projectFile.addEventListener("change", () => {
  const file = projectFile.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let rp: ReturnType<typeof toRenderPlan>;
    try {
      rp = parseRenderPlan(String(reader.result));
    } catch (e) {
      // 校验失败时 parseRenderPlan 会把全部问题拼在一条消息里 —— 全摊给用户，
      // 别只说「格式错误」。
      report([{ text: `工程 JSON 校验失败：${(e as Error).message}`, kind: "err" }]);
      log(`载入失败：${(e as Error).message}`);
      projectFile.value = "";
      return;
    }
    srtInput.value = rp.sourceSrt;
    const applied = applyExportSettingsFrom(rp);
    pendingProject = { scenes: rp.scenes };
    log(`已载入工程 v${rp.version}（${rp.scenes.length} 拍${applied ? "" : "，导出档位部分保留当前值"}），重新规划中…`);
    projectFile.value = "";
    btnLoad.click();
  };
  reader.onerror = () => {
    report([{ text: "工程 JSON 读取失败，请重试或更换文件", kind: "err" }]);
    log("工程 JSON 读取失败");
    projectFile.value = "";
  };
  reader.readAsText(file);
});

/** 工程回读后，比对存档 scenes 与重规划结果。不一致说明工程是在规划逻辑改版之前存的
 *  （或中途手改过 SRT 覆盖）—— 如实报出来，不静默接受。比对完即清空，只比一次。 */
function compareWithProject(): ReportLine[] {
  if (!pendingProject) return [];
  const saved = pendingProject.scenes;
  pendingProject = null;
  const now = shots.map((s) => ({ layoutId: s.layout.id, headline: s.content.headline }));
  const same =
    saved.length === now.length &&
    saved.every((s, i) => s.layoutId === now[i]!.layoutId && s.headline === now[i]!.headline);
  return same
    ? [{ text: `与载入的工程一致：${saved.length} 拍的版式与标题逐拍吻合（同 SRT 复现成功）。`, kind: "ok" }]
    : [{
        text: `与载入的工程有出入：存档 ${saved.length} 拍、复现 ${now.length} 拍（首个差异在第 ${
          Math.max(1, saved.findIndex((s, i) => s.layoutId !== now[i]?.layoutId || s.headline !== now[i]?.headline) + 1)
        } 拍）—— 工程是在规划逻辑改版之前存的，画面以本次复现为准。`,
        kind: "warn",
      }];
}

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
