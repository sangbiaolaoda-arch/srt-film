// 缺陷 6：真照片管线 —— 语义选图、资格门禁、与选版的接线。
// 原则只有一条硬的：标签没命中就不配图。配错图比没图更伤可信度。
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PHOTOS, PHOTO_BY_ID, pickPhoto } from "../src/assets/photos";
import { LAYOUTS } from "../src/layouts/catalog";
import { eligible, pickLayout } from "../src/layouts/pick";
import { plan } from "../src/core/plan";
import type { RenderContent } from "../src/layouts/types";

const root = resolve(import.meta.dirname, "..");

const PHOTO_LAYOUTS = LAYOUTS.filter((l) => l.slots.some((s) => s.k === "photo"));

function content(headline: string, beat = 1): RenderContent {
  return { headline, subhead: "", caption: "", bullets: [], numbers: [], numberTokens: [], bignum: undefined, unit: "", beat };
}

describe("照片素材表", () => {
  it("8 张、id 唯一、文件名与 id 对应", () => {
    expect(PHOTOS).toHaveLength(8);
    expect(new Set(PHOTOS.map((p) => p.id)).size).toBe(8);
    for (const p of PHOTOS) expect(p.file).toContain(p.id);
  });

  it("所有标签 ≥ 2 个汉字（单字标签会在旁白里误命中）", () => {
    for (const p of PHOTOS) {
      for (const t of p.tags) {
        expect(t.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, "").length, `${p.id} 的标签「${t}」`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("pickPhoto：字面匹配、确定性、宁缺毋滥", () => {
  it("没命中就 undefined —— 不硬凑氛围图", () => {
    expect(pickPhoto("今天天气不错我们出门走走", 1)).toBeUndefined();
  });

  it("命中返回条目；同输入同输出（确定性）", () => {
    const a = pickPhoto("服务器机房里的网络传输", 3);
    const b = pickPhoto("服务器机房里的网络传输", 3);
    expect(a).toBeDefined();
    expect(a?.id).toBe(b?.id);
  });

  it("拍号轮转：同文本不同拍可能换图（不至于连着几拍同一张）", () => {
    const text = "数据 网络 城市 时间 生长 人群 键盘 笔记 大脑 等待 种子 用户";
    const ids = new Set([1, 2, 3, 4, 5].map((beat) => pickPhoto(text, beat)?.id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it("与上一拍不重复（有得换的时候）", () => {
    const text = "机房里的服务器 数据网络 与 城市街道 灯光";
    const first = pickPhoto(text, 1);
    const second = pickPhoto(text, 2, first?.id);
    expect(second?.id).not.toBe(first?.id);
  });

  it("8 张图都能被自己的标签命中（表没写错别字）", () => {
    for (const p of PHOTOS) {
      expect(pickPhoto(p.tags.join(" "), 1)?.id, p.id).toBeDefined();
    }
  });
});

describe("资格门禁：photo 版式没有匹配照片就不合格", () => {
  it("新增的 4 个 photo 版式都在 image 组", () => {
    expect(PHOTO_LAYOUTS.map((l) => l.id).sort()).toEqual(
      ["im-photo-bleed", "im-photo-duo", "im-photo-note", "im-photo-split"].sort(),
    );
    for (const l of PHOTO_LAYOUTS) expect(l.group).toBe("image");
  });

  it("没照片 → photo 版式不合格；有照片 → 合格", () => {
    const layout = PHOTO_LAYOUTS.find((l) => l.id === "im-photo-split")!;
    expect(eligible(layout, content("这是一句正常长度的标题"), undefined)).toBe(false);
    expect(eligible(layout, content("这是一句正常长度的标题"), "typing")).toBe(true);
  });

  it("同图双框用裁切对照而不是钉死照片 —— 所以它同样依赖本拍选图", () => {
    const layout = PHOTO_LAYOUTS.find((l) => l.id === "im-photo-duo")!;
    expect(layout.slots.filter((s) => s.k === "photo").every((s) => s.photo)).toBe(false);
    expect(layout.slots.filter((s) => s.k === "photo").every((s) => Array.isArray(s.crop))).toBe(true);
    expect(eligible(layout, content("这是一句正常长度的标题"), undefined)).toBe(false);
  });

  it("pickLayout 在没照片时绝不会挑出需要照片的版式", () => {
    for (let beat = 1; beat <= 24; beat++) {
      const layout = pickLayout(content(`普通标题 ${beat}`, beat), "editorial", undefined, undefined, undefined);
      expect(layout.slots.some((s) => s.k === "photo" && !s.photo)).toBe(false);
    }
  });

  it("pickLayout 在有照片时 image 组排在尾部兜底之前", () => {
    const layout = pickLayout(content("机房里的服务器与网络", 2), "editorial", undefined, undefined, "server");
    expect(layout.group).toBe("image");
  });
});

describe("全语料：photo 版式被选中时必定挂了照片；没被选中时管线静默", () => {
  const files = readdirSync(resolve(root, "examples")).filter((f) => f.endsWith(".srt")).sort();

  it("6 条语料门禁保持全绿（新门禁不误杀）", () => {
    const used: { file: string; beat: number; layout: string; photo?: string }[] = [];
    for (const f of files) {
      let ov = "";
      try { ov = readFileSync(resolve(root, "examples", f.replace(/\.srt$/, ".json")), "utf-8"); } catch { /* 无覆写 */ }
      const { shots, problems } = plan(readFileSync(resolve(root, "examples", f), "utf-8"), ov);
      expect(problems, `${f}`).toEqual([]);
      for (const s of shots) {
        if (!s.layout.slots.some((sl) => sl.k === "photo")) continue;
        expect(s.photo, `${f} 拍${s.content.beat} 用了 photo 版式却没挂照片`).toBeDefined();
        used.push({ file: f, beat: s.content.beat, layout: s.layout.id, photo: s.photo });
      }
    }
    expect(files.length).toBeGreaterThanOrEqual(6);
    console.log(`photo 版式命中：${JSON.stringify(used)}`);
  });

  it("语义选图在真实旁白上至少命中一条语料（否则这套素材就是摆设）", () => {
    let hits = 0;
    for (const f of files) {
      let ov = "";
      try { ov = readFileSync(resolve(root, "examples", f.replace(/\.srt$/, ".json")), "utf-8"); } catch { /* 无覆写 */ }
      const { shots } = plan(readFileSync(resolve(root, "examples", f), "utf-8"), ov);
      hits += shots.filter((s) => s.photo !== undefined).length;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("PHOTO_BY_ID 全表可查", () => {
    for (const p of PHOTOS) expect(PHOTO_BY_ID.get(p.id)?.file).toBe(p.file);
  });
});
