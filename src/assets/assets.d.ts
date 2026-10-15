/// <reference types="vite/client" />

// 照片素材走 Vite 资产管线（import 后得到哈希化的同源 URL，dev 与 build 都可用）。
declare module "*.jpg" {
  const src: string;
  export default src;
}
