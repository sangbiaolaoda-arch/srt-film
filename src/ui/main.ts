// 主入口：SRT → 分拍 → 构图 → 选版式 → 门禁 → 舞台播放 / 导出 MP4。

import { plan, type PlanResult } from "../core/plan";
import { buildStage, type Shot, type StageHandle } from "./stage";
import { exportMp4 } from "../export/mp4";
import "../styles/main.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const srtInput = $<HTMLTextAreaElement>("srt-input");
const ovInput = $<HTMLTextAreaElement>("override-input");
const btnLoad = $<HTMLButtonElement>("btn-load");
const btnPlay = $<HTMLButtonElement>("btn-play");
const btnExport = $<HTMLButtonElement>("btn-export");
const gateReport = $<HTMLUListElement>("gate-report");
const stageHost = $<HTMLDivElement>("stage");
const scrubber = $<HTMLInputElement>("scrubber");
const timecode = $<HTMLSpanElement>("timecode");
const beatList = $<HTMLOListElement>("beat-list");

let stage: StageHandle | null = null;
let shots: Shot[] = [];
let raf = 0;
let playing = false;

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function report(items: string[], ok: boolean) {
  gateReport.hidden = false;
  gateReport.innerHTML = items
    .map((t) => `<li class="${ok ? "ok" : ""}">${t.replace(/</g, "&lt;")}</li>`)
    .join("");
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
  scrubber.disabled = true;
  beatList.innerHTML = "";

  let result: PlanResult;
  try {
    result = plan(srtInput.value, ovInput.value);
  } catch (e) {
    report([(e as Error).message], false);
    return;
  }
  if (result.problems.length > 0) {
    report(result.problems, false);
    return;
  }

  shots = result.shots;
  const posterCount = shots.filter((s) => s.layout.style === "poster").length;
  report([
    `门禁通过：${shots.length} 拍，用到 ${new Set(shots.map((s) => s.layout.id)).size} 个版式，画面数字全部可溯源。`,
    `风格：编辑风 ${shots.length - posterCount} 拍 / 海报风 ${posterCount} 拍 —— ${result.styles.join("　")}`,
  ], true);

  renderBeatList();
  stage = buildStage(stageHost, shots);
  // 调试钩子：__stage 供逐帧验收拿时间轴；__exportMp4 供无头链路发起导出 ——
  // 生产构建里没有可 import 的 /src 路径，无头脚本只能走页面契约。
  (window as unknown as { __stage?: StageHandle; __exportMp4?: typeof exportMp4 }).__stage = stage;
  (window as unknown as { __exportMp4?: typeof exportMp4 }).__exportMp4 = exportMp4;
  stage.onComplete(() => { playing = false; btnPlay.textContent = "重播"; });

  scrubber.disabled = false;
  btnPlay.disabled = false;
  btnExport.disabled = false;
  btnPlay.textContent = "播放";
  scrubber.value = "0";
  timecode.textContent = fmt(0);
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

btnExport.addEventListener("click", async () => {
  if (!stage || shots.length === 0) return;
  btnExport.disabled = true;
  btnExport.textContent = "导出中…";
  try {
    const blob = await exportMp4(stage, stage.duration);
    (window as unknown as { __lastMp4?: Blob }).__lastMp4 = blob;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "srt-film.mp4";
    a.click();
    URL.revokeObjectURL(a.href);
    report([`MP4 已导出（${shots.length} 拍 / ${(blob.size / 1e6).toFixed(1)}MB）。`], true);
  } catch (e) {
    report([`导出失败：${(e as Error).message}`], false);
  } finally {
    btnExport.disabled = false;
    btnExport.textContent = "导出 MP4";
  }
});

function renderBeatList() {
  beatList.innerHTML = shots
    .map((s, i) => `<li data-beat="${i}">
      <span class="beat-no">${String(i + 1).padStart(2, "0")}</span>
      <span class="beat-layout">${s.layout.name}</span>
      <span class="beat-text">${s.content.headline.replace(/</g, "&lt;")}</span>
    </li>`)
    .join("");
  beatList.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      const idx = Number((li as HTMLElement).dataset.beat);
      const shot = shots[idx];
      if (shot && stage) {
        playing = false;
        btnPlay.textContent = "播放";
        // 时间轴时间 ≠ SRT 绝对时间（拍间有交叠），跳拍要用 tlStart
        stage.seek(shot.tlStart ?? shot.start);
      }
    });
  });
}
