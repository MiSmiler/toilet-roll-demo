# 厕纸抽卡 · M1

一卷厕纸，按住画面往下拖，纸带跟着出来，每过一段算一格。这一版只做交互层，
没有撕裂、没有角色卡、没有镜头演出。

## 跑起来

```sh
npm install
npm run dev
```

`npm run build` 会先跑 `tsc --noEmit` 再打包。`npm run shot` 用来截某一帧，参数见
`tools/screenshots.mjs` 开头的注释。

## 目录

- `src/params.ts` — 所有可调参数：手感参数与道具的固定尺寸。
- `src/paper/feed.ts` — 手感的核心：拖动距离怎么变成纸带长度，松手之后发生什么。
- `src/input/drag.ts` — pointer 事件折成「纸带该到的进度」，从纸带当前位置起算。
- `src/scene/` — Three.js 场景、纸张贴图、卷纸与纸带几何。
- `src/ui/lab.ts` — 左下角面板：状态读数、手感参数、显示开关。
- `src/debug/probe.ts` — `window.debug`，脚本读写场景的入口。
