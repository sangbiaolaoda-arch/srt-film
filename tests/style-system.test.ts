// Phase 5 风格系统验收：三系（editorial / flat-vector / chart-motion）是真的换风格，
// 不是换色皮。断言 token 契约、色源同源、后期分流与判定映射，全在 node 下可跑。

import { describe, it, expect } from "vitest";
import {
  STYLE_PROFILES,
  PROFILE_ORDER,
  resolveProfile,
  profileLabel,
} from "../src/styles/style-system";
import { decideStyle } from "../src/layouts/pick";
import { colorsOf } from "../src/layouts/render";
import { SEM_COLORS } from "../src/layouts/emphasis";
import { postForStyle, POST_EDITORIAL, POST_FLATVECTOR, POST_CHARTMOTION } from "../src/render/post";
import type { RenderContent } from "../src/layouts/types";

describe("风格档 token 契约（Phase 5）", () => {
  it("三个风格档按序存在", () => {
    expect(PROFILE_ORDER).toEqual(["editorial", "flat-vector", "chart-motion"]);
  });

  it("每个风格档字段完整（具名色 / 字体 / tone / sem）", () => {
    const named = [
      "paper", "ink", "accent", "aux", "dark", "cream",
      "ember", "steel", "blush", "sand", "clay",
    ] as const;
    for (const id of PROFILE_ORDER) {
      const p = STYLE_PROFILES[id];
      expect(p.id, id).toBe(id);
      expect(p.name.length, `${id}.name`).toBeGreaterThan(0);
      for (const k of named) expect(p[k], `${id}.${k}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      for (const k of ["ink", "dim", "accent", "paper", "hairline"] as const) {
        expect(typeof p.tone[k], `${id}.tone.${k}`).toBe("string");
      }
      for (const t of ["danger", "cost", "safe", "warm"] as const) {
        expect(p.sem[t], `${id}.sem.${t}`).toMatch(/^#/);
      }
      for (const f of ["fontDisplay", "fontText", "fontNum"] as const) {
        expect(p[f].length, `${id}.${f}`).toBeGreaterThan(0);
      }
    }
  });

  it("resolveProfile 对非法 / 缺省回退编辑风", () => {
    expect(resolveProfile("editorial").id).toBe("editorial");
    expect(resolveProfile("nonsense").id).toBe("editorial");
    expect(resolveProfile("").id).toBe("editorial");
    expect(resolveProfile(undefined).id).toBe("editorial");
    expect(resolveProfile(null).id).toBe("editorial");
  });

  it("profileLabel 与档内 name 一致", () => {
    for (const id of PROFILE_ORDER) {
      expect(profileLabel(id)).toBe(STYLE_PROFILES[id].name);
    }
  });

  it("三系 paper/ink 互不相同 —— 是真换风格不是换色皮", () => {
    const papers = PROFILE_ORDER.map((id) => STYLE_PROFILES[id].paper);
    const inks = PROFILE_ORDER.map((id) => STYLE_PROFILES[id].ink);
    expect(new Set(papers).size, `papers=${papers.join(",")}`).toBe(3);
    expect(new Set(inks).size, `inks=${inks.join(",")}`).toBe(3);
  });

  it("图形语法 token 三系有可见差异", () => {
    const ed = STYLE_PROFILES.editorial;
    const fv = STYLE_PROFILES["flat-vector"];
    const cm = STYLE_PROFILES["chart-motion"];
    // 圆角：编辑直角、扁平大圆角、图表微圆角
    expect(ed.radius).toBe(0);
    expect(fv.radius).toBeGreaterThan(10);
    expect(cm.radius).toBeGreaterThan(0);
    expect(cm.radius).toBeLessThan(fv.radius);
    // 纸纹：仅编辑风
    expect(ed.paperTexture).toBe(true);
    expect(fv.paperTexture).toBe(false);
    expect(cm.paperTexture).toBe(false);
    // 数据网格 + 等宽数字：仅图表风
    expect(cm.grid).toBe(true);
    expect(ed.grid).toBe(false);
    expect(fv.grid).toBe(false);
    expect(cm.monoNum).toBe(true);
    expect(ed.monoNum).toBe(false);
    expect(fv.monoNum).toBe(false);
    // 运动节奏：扁平更明快（>1），图表更舒缓（<1）
    expect(fv.motionPace).toBeGreaterThan(1);
    expect(cm.motionPace).toBeLessThan(1);
    // 转场倾向：三系两两不同
    const biases = new Set(PROFILE_ORDER.map((id) => STYLE_PROFILES[id].transitionBias));
    expect(biases.size).toBe(3);
  });

  it("colorsOf 与 profile tone 同源（唯一色源）", () => {
    for (const id of PROFILE_ORDER) {
      expect(colorsOf(id)).toEqual(STYLE_PROFILES[id].tone);
    }
    expect(colorsOf(undefined)).toEqual(STYLE_PROFILES.editorial.tone);
  });

  it("postForStyle 三系分流到不同后期配置，图表风最干净", () => {
    expect(postForStyle("editorial")).toBe(POST_EDITORIAL);
    expect(postForStyle("flat-vector")).toBe(POST_FLATVECTOR);
    expect(postForStyle("chart-motion")).toBe(POST_CHARTMOTION);
    // 图表风颗粒低于编辑风（保持「屏幕截图」般的干净）
    expect(postForStyle("chart-motion").grain).toBeLessThan(postForStyle("editorial").grain);
    // 三个后期配置互不相同
    expect(new Set(PROFILE_ORDER.map((id) => postForStyle(id))).size).toBe(3);
  });
});

describe("风格判定映射到三系（Phase 5）", () => {
  const heavy: RenderContent = { headline: "三项核心指标同时抬升", bullets: [], numbers: [3, 5, 8], beat: 4 };
  const punch: RenderContent = { headline: "就这样吧", bullets: [], numbers: [], beat: 5 };
  const plain: RenderContent = {
    headline: "这是一个比较长的陈述句里面没有任何特殊情绪信号就是平平淡淡地把一件事叙述完",
    bullets: [],
    numbers: [],
    beat: 5,
  };

  it("数据密集（≥2 度量值）→ chart-motion", () => {
    expect(decideStyle(heavy, 3, 10).style).toBe("chart-motion");
  });

  it("信号够（短句无数据）→ flat-vector", () => {
    expect(decideStyle(punch, 3, 10).style).toBe("flat-vector");
  });

  it("长句无信号 → editorial 兜底", () => {
    expect(decideStyle(plain, 3, 10).style).toBe("editorial");
  });

  it("导演覆写优先于自动判定", () => {
    for (const id of PROFILE_ORDER) {
      expect(decideStyle(heavy, 0, 10, id).style).toBe(id);
    }
  });
});

/* ── 强调色可读性：压纸白必须过 WCAG AA 大字 3.0 ─────────────────────────
   强调色的全部意义是「在纸面上跳出来」。压不住 3.0 的强调色看着只是一块脏橙，
   观众分不出它是强调还是没印好 —— 这条断言钉住的是「不许再调淡回去」。 */

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const l1 = relLuminance(a);
  const l2 = relLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("强调色压浅底的对比度（WCAG AA 大字 ≥3.0）", () => {
  // 强调字只落在浅底上：纸白 paper，以及近白 cream（暗底版式里 cream 当浅底用）。
  // 彩底 / 深底（aux / steel / clay / dark / ember / blush / sand）不承载强调字，
  // 故不在门禁范围；完整矩阵见 docs/project/sem-contrast-report.md（其中 sub-3.0 的格子
  // 全是「sem 压彩底/深底」的装饰组合，产品里强调字从不出现在那些底上）。
  it("三系的 sem 四色压 paper / cream 都过 3.0", () => {
    for (const id of PROFILE_ORDER) {
      const p = STYLE_PROFILES[id];
      for (const [k, v] of Object.entries(p.sem)) {
        expect(contrast(v, p.paper), `${id}.sem.${k}=${v} on paper`).toBeGreaterThanOrEqual(3);
        expect(contrast(v, p.cream), `${id}.sem.${k}=${v} on cream`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("三系的 tone.accent / tone.dim 压纸白过 3.0", () => {
    for (const id of PROFILE_ORDER) {
      const p = STYLE_PROFILES[id];
      expect(contrast(p.tone.accent, p.paper), `${id}.tone.accent=${p.tone.accent}`).toBeGreaterThanOrEqual(3);
      expect(contrast(p.tone.dim, p.paper), `${id}.tone.dim=${p.tone.dim}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("强调色只定义一次：style-system.accent = sem.warm = emphasis 的 warm", () => {
    for (const id of PROFILE_ORDER) {
      const p = STYLE_PROFILES[id];
      expect(p.sem.warm, `${id}.sem.warm`).toBe(p.accent);
      expect(SEM_COLORS[id].warm, `${id} emphasis.warm`).toBe(p.accent);
    }
  });
});
