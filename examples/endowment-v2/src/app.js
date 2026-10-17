// app.js — 舞台装配 + 主时间轴（错峰入场 + 有意图机位）+ 无头导出钩子
// gsap 以 UMD 全局方式加载（见 index.html 的 <script>），此处取全局
const gsap = window.gsap;
import { PALETTE } from './palette.js';
import { SCENES, CUES, TOTAL_DURATION, sceneAt, cueAt } from './storyboard.js';
import { backgroundSVG } from './backgrounds.js';
import { SCENE_SVG } from './illustrations.js';
import { runChoreo, choreoScale, ILLU_ANIM } from './choreography.js';
import { applyCamera } from './camera.js';
import { ZONES, intersectArea } from './layout.js';

const W = 1280, H = 720;

// 字幕关键词强调（kinetic typography 两层系统，联网查证 2026-10-17）：
// 基础字幕保持稳定，只强调关键词/数字/对比短语（约 10-25% 的行），
// 教育类内容用平滑可预期的入场（fade+上浮，时间函数驱动，seek 绝对安全）
const EMPH_WORDS = [
  '禀赋效应', '两倍', '翻倍', '失去', '得到', '损失厌恶', '科斯定理', '失效',
  '九成', '一半一半', '七天无理由', '闲鱼', '两千多', '一百多', '不是命', '是生疏',
  '舍不得', '值得', '自检', '买入价', '卖出', '割肉', '拥有它', '冒充', '重新得到它',
  '两倍以上', '凭空多出一倍', '放手的代价', '贴着买家', '价差会消失', '磨薄',
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 命中强调词的字幕 → 拆成 普通前缀 + 琥珀加粗关键词 + 普通后缀 三段 tspan
function captionHTML(text) {
  for (const w of EMPH_WORDS) {
    const i = text.indexOf(w);
    if (i >= 0) {
      return esc(text.slice(0, i))
        + `<tspan fill="${PALETTE.accent}" font-weight="800">${esc(w)}</tspan>`
        + esc(text.slice(i + w.length));
    }
  }
  return esc(text);
}
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

// ---------- DOM 装配 ----------
const stage = document.getElementById('stage');
const bgLayer = document.getElementById('bgLayer');
const illuLayer = document.getElementById('illuLayer');
const cameraEl = document.getElementById('camera');
const captionEl = document.getElementById('caption');
const capBgEl = document.getElementById('capBg');
const progressEl = document.getElementById('progress');
const FONT = 'font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif"';

// 标题卡（每场景一套，写在各自 sceneLayer 内，随场景显隐）
function titleBlock(scene) {
  return `
  <text class="part titlePart" data-enter="up" x="640" y="132" ${FONT} font-size="22" font-weight="700"
        fill="${PALETTE.accent}" text-anchor="middle" letter-spacing="6">${scene.kicker}</text>
  <text class="part titlePart" data-enter="up" x="640" y="186" ${FONT} font-size="48" font-weight="800"
        fill="${PALETTE.ink}" text-anchor="middle">${scene.title}</text>`;
}

// 预建 9 个场景图层（全部在 DOM 中，靠 opacity 控制显隐，seek 安全）
const sceneEls = {};
SCENES.forEach((scene, i) => {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'sceneLayer');
  g.setAttribute('data-scene', String(i));
  g.innerHTML = (scene.title ? titleBlock(scene) : '') + SCENE_SVG[scene.illu]();
  // 质感：形状部件统一柔和投影（首子元素为文本的部件除外，避免文字重影）
  g.querySelectorAll('.part').forEach((p) => {
    const firstEl = p.querySelector('*');
    if (firstEl && firstEl.tagName.toLowerCase() !== 'text') p.setAttribute('filter', 'url(#softFx)');
  });
  g.style.opacity = '0';
  illuLayer.appendChild(g);
  sceneEls[i] = g;
  // 背景也按场景预建（只显示当前）
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  bg.setAttribute('class', 'bgScene');
  bg.setAttribute('data-scene', String(i));
  bg.innerHTML = backgroundSVG(scene.key);
  bg.style.opacity = (i === 0) ? '1' : '0';
  bgLayer.appendChild(bg);
});

// ---------- 主时间轴 ----------
const tl = gsap.timeline({ paused: true });

// 初始：所有场景层 opacity 0（标题卡也淡出用）
gsap.set('.sceneLayer', { opacity: 0 });
gsap.set('.bgScene', { opacity: (i, t) => (t.dataset.scene === '0' ? 1 : 0) });

const ENTER_FROM = {
  left:  { x: -90, opacity: 0 },
  right: { x: 90,  opacity: 0 },
  up:    { y: 70,  opacity: 0 },
  down:  { y: -70, opacity: 0 },
  scale: { scale: 0.6, opacity: 0 },
  fade:  { opacity: 0 },
};

SCENES.forEach((scene, i) => {
  const layer = sceneEls[i];
  const dur = scene.end - scene.start;

  // 入场：错峰（每个子元素不同方向 + 微交错）；data-at 包裹组 = 第二拍迟入场的新人
  const parts = layer.querySelectorAll('.part');
  parts.forEach((p) => {
    const kind = p.getAttribute('data-enter') || 'fade';
    const from = ENTER_FROM[kind] || ENTER_FROM.fade;
    gsap.set(p, from);
  });
  tl.to(layer, { opacity: 1, duration: 0.5, ease: 'power1.out' }, scene.start);
  const K = choreoScale(dur); // 短幕压缩节拍，保证动作在切幕前完成
  parts.forEach((p, pi) => {
    const wrap = p.closest('[data-at]');
    const late = wrap ? (parseFloat(wrap.getAttribute('data-at')) || 0) * K : 0;
    tl.to(p, {
      x: 0, y: 0, scale: 1, opacity: 1,
      duration: 0.8, ease: 'back.out(1.5)',
    }, scene.start + 0.15 + late + pi * 0.07);
  });

  // 标题卡在场景开始 ~3s 后淡出，只留插画
  const titleParts = layer.querySelectorAll('.titlePart');
  tl.to(titleParts, { opacity: 0, y: '-=18', duration: 0.8, ease: 'power1.in' }, scene.start + 3.0);

  // 场景内二次运动（天平倾斜 / 退货循环 / 股票描线 / 进度填充），按 anim 键注册
  const anim = scene.anim && ILLU_ANIM[scene.anim];
  if (anim) anim(tl, layer, scene.start + 0.5);

  // 编排层：入场后的幕内叙事运动（让位 / 交接 / 强调缩放 / 揭示 / 计数）
  runChoreo(scene.illu, tl, layer, scene.start, dur);

  // 机位语言
  applyCamera(tl, cameraEl, scene);

  // 长幕 idle 微动：编排收束后主焦点保持呼吸，避免长幕后段死屏（偶数次回位）
  if (dur > 9) {
    const main = layer.querySelector('[data-key="A"]');
    if (main) {
      const idleStart = 6 * K;
      const remain = dur - idleStart - 1.2;
      if (remain > 2.5) {
        const n = Math.max(1, 2 * Math.floor(remain / 3.2));
        tl.to(main, { y: '-=6', duration: 1.6, yoyo: true, repeat: n, ease: 'sine.inOut' }, scene.start + idleStart);
      }
    }
  }

  // 幕间转场·进侧：语义化（scene.trans）+ 速度匹配（进慢 0.55s 减速，
  // 速度峰值与上一幕的出侧在切点相接）。转场类型由叙事含义决定：
  // zoom=揭示/章节 whip=能量/对比 rise=承接 fade=开场收场
  if (i > 0) {
    const kind = scene.trans || 'rise';
    const ent = kind === 'whip' ? { x: 190 } : kind === 'zoom' ? { scale: 0.86 } : kind === 'fade' ? { opacity: 0 } : { y: 110 };
    const vars = kind === 'fade'
      ? { opacity: 1, duration: 0.55, ease: 'power2.out' }
      : { x: 0, y: 0, scale: 1, duration: 0.55, ease: 'power3.out', transformOrigin: '50% 50%' };
    if (kind === 'fade') tl.set(layer, { opacity: 0 }, scene.start - 0.3);
    tl.fromTo(layer, ent, vars, scene.start - 0.22);
  }

  // 幕间转场·出侧：加速离场（出快 0.3s；转场本身就是退场，不再单独退场）
  const outStart = (i < SCENES.length - 1) ? SCENES[i + 1].start - 0.6 : scene.end - 1.0;
  tl.to(`.bgScene[data-scene="${i}"]`, { opacity: 0, duration: 0.8, ease: 'power1.inOut' }, outStart);
  if (i < SCENES.length - 1) {
    const kind = SCENES[i + 1].trans || 'rise';
    if (kind === 'whip') tl.to(layer, { x: -150, opacity: 0, duration: 0.3, ease: 'power2.in' }, SCENES[i + 1].start - 0.3);
    else if (kind === 'zoom') tl.to(layer, { scale: 1.14, opacity: 0, duration: 0.28, ease: 'power3.in', transformOrigin: '50% 50%' }, SCENES[i + 1].start - 0.28);
    else if (kind === 'fade') tl.to(layer, { opacity: 0, duration: 0.5, ease: 'power1.inOut' }, SCENES[i + 1].start - 0.5);
    else tl.to(layer, { y: -110, opacity: 0, duration: 0.3, ease: 'power2.in' }, SCENES[i + 1].start - 0.3);
    tl.to(`.bgScene[data-scene="${i + 1}"]`, { opacity: 1, duration: 0.8, ease: 'power1.inOut' }, outStart);
  } else {
    tl.to(layer, { opacity: 0, duration: 0.6, ease: 'power1.inOut' }, outStart);
  }
});

// ---------- 布局碰撞验收（终态姿态版：编排结束后实测） ----------
// 对每一幕 seek 到"编排完成"时刻（end-1.0s），逐个量场景层直接子级 g 的
// 视口包围盒（映射回 1280x720 舞台坐标，包含编排产生的 transform）：
//  - 组×组 交叠 > 300px² → 报告
//  - 侵入字幕带/标题卡/安全边 > 100px² → 报告
window.__layoutReport = function () {
  const zoneList = [['caption', ZONES.caption], ['title', ZONES.title], ['edgeL', ZONES.edgeL], ['edgeR', ZONES.edgeR]];
  const issues = [];
  const stageRect = stage.getBoundingClientRect();
  const scale = stageRect.width / W;
  const groupRect = (g) => {
    const r = g.getBoundingClientRect();
    return {
      x: (r.left - stageRect.left) / scale,
      y: (r.top - stageRect.top) / scale,
      w: r.width / scale,
      h: r.height / scale,
    };
  };
  SCENES.forEach((scene, i) => {
    const layer = sceneEls[i];
    tl.seek(scene.end - 1.0);
    // 机位（camera 组）是电影语言，不参与版式验收：seek 会重放机位 tween，
    // 故每次 seek 后先清掉相机变换再测量（下一次 seek 自动恢复）
    gsap.set(cameraEl, { clearProps: 'transform' });
    const groups = [...layer.children].filter((g) => !g.classList.contains('titlePart'));
    const boxes = groups.map(groupRect);
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        if (scene.key === 's21') continue; // 天平梁按设计旋转，AABB 必然盖住底座，非视觉重叠
        const area = intersectArea(boxes[a], boxes[b]);
        if (area > 300) issues.push({ scene: scene.key, kind: 'pair', area: Math.round(area),
          a: [Math.round(boxes[a].x), Math.round(boxes[a].y), Math.round(boxes[a].w), Math.round(boxes[a].h)],
          b: [Math.round(boxes[b].x), Math.round(boxes[b].y), Math.round(boxes[b].w), Math.round(boxes[b].h)] });
      }
    }
    for (let k = 0; k < boxes.length; k++) {
      for (const [zname, zone] of zoneList) {
        if (zname === 'title' && !scene.title) continue;
        const area = intersectArea(boxes[k], zone);
        if (area > 100) issues.push({ scene: scene.key, kind: 'zone:' + zname, area: Math.round(area),
          box: [Math.round(boxes[k].x), Math.round(boxes[k].y), Math.round(boxes[k].w), Math.round(boxes[k].h)] });
      }
    }
  });
  tl.seek(0);
  return issues;
};

// ---------- 实时预览 / 渲染时的文案与进度（按时间求值，seek 安全） ----------
// 字幕入场是"时间的函数"（age→透明度/上浮量），不用 tween——逐帧 seek 下绝对可复现
const CAP_Y = 660, CAP_BG_Y = 624;
function updateOverlay(t) {
  const cue = cueAt(t);
  const text = cue ? cue.text : '';
  // 入场动效：0.28s 内 fade + 上浮 12px（easeOutCubic），强调词带琥珀色（两层系统）
  const age = cue ? (t - cue.start) : 99;
  const p = easeOutCubic(Math.min(1, age / 0.28));
  const lift = Math.round((1 - p) * 12);
  captionEl.innerHTML = text ? captionHTML(text) : '';
  captionEl.setAttribute('y', CAP_Y - lift);
  captionEl.style.opacity = text ? String(p) : '0';
  // 字幕底框宽度随文字
  const approxW = Math.max(120, text.length * 30 + 80);
  capBgEl.setAttribute('x', 640 - approxW / 2);
  capBgEl.setAttribute('width', approxW);
  capBgEl.setAttribute('y', CAP_BG_Y - lift);
  capBgEl.style.opacity = text ? String(0.82 * p) : '0';
  progressEl.setAttribute('width', (W * (t / TOTAL_DURATION)).toFixed(1));
}

// 实时预览：播放时间轴，并在 rAF 中刷新文案/进度
let playing = false;
function previewLoop() {
  if (!playing) return;
  updateOverlay(tl.time());
  requestAnimationFrame(previewLoop);
}
window.__play = () => { playing = true; tl.play(); previewLoop(); };
window.__pause = () => { playing = false; tl.pause(); };

// ---------- 无头导出 ----------
function serializeStage() {
  let xml = new XMLSerializer().serializeToString(stage);
  if (!/\bxmlns=/.test(xml)) xml = xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/\bwidth=/.test(xml)) xml = xml.replace('<svg', '<svg width="1280"');
  if (!/\bheight=/.test(xml)) xml = xml.replace('<svg', '<svg height="720"');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
}

function rasterize(svgStr) {
  return new Promise((resolve) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = (e) => { console.error('rasterize error', e); resolve({ img: null, url }); };
    img.src = url;
  });
}

// 导出入口：逐帧 seek → 序列化 → 光栅 → JPEG → POST 给本地接收端
window.__exportMp4Post = async function (opts) {
  const fps = opts.fps || 30;
  const fromMs = opts.fromMs || 0;
  const toMs = (opts.toMs != null) ? opts.toMs : TOTAL_DURATION * 1000;
  const quality = opts.quality || 0.92;
  const framesDir = opts.framesDir;
  const recv = opts.recv;
  const dt = 1000 / fps;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 轮询状态（driver 通过 agent-browser 读这些标量，不回拉字节）
  window.__exportDone = false;
  window.__exportErr = null;
  window.__exportProgress = null;
  window.__exportStatus = null;

  playing = false; tl.pause();
  let idx = 0;
  const total = Math.round((toMs - fromMs) / dt); // 左闭右开，分段导出时切点不重帧
  try {
    for (let ms = fromMs; ms < toMs; ms += dt) {
      const t = ms / 1000;
      tl.seek(t);
      updateOverlay(t);
      const svgStr = serializeStage();
      const { img, url } = await rasterize(svgStr);
      if (img) {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
        const buf = await blob.arrayBuffer();
        const name = 'frame-' + String(idx).padStart(6, '0') + '.jpg';
        const to = framesDir + '/' + name;
        await fetch(recv + '?to=' + encodeURIComponent(to), { method: 'POST', body: buf });
      }
      if (url) URL.revokeObjectURL(url);
      idx++;
      window.__exportProgress = { frame: idx, total };
      if (opts.onProgress) opts.onProgress(idx / total, idx, total);
    }
    window.__exportStatus = { total, framesDir };
    window.__exportDone = true;
  } catch (e) {
    window.__exportErr = (e && e.message) ? e.message : String(e);
    window.__exportDone = true;
  }
  if (opts.onDone) opts.onDone(window.__exportStatus, window.__exportErr);
  return window.__exportStatus;
};

// 暴露给外部
window.__stage = stage;
window.__tl = tl;
window.__ready = true;
window.__duration = TOTAL_DURATION;
window.__updateOverlay = updateOverlay; // 测试钩子：直接按时间刷新字幕层

// 启动预览
updateOverlay(0);
window.__play();
