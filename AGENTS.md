# AGENTS.md — Tidewater 工作区指南

面向在本工作区工作的 AI 编码代理与人类协作者。上游：https://github.com/dgreenheck/tidewater（MIT）。

## 常用命令

```sh
# Node 在 nvm 里（非交互 shell 需先加 PATH）
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"

npm run dev        # http://127.0.0.1:5189（vite，--host 127.0.0.1）
npm run build      # 静态构建到 dist/
node test/game-logic.mjs   # 纯逻辑测试，无需 GPU，37 项断言

# 部署（Vercel 项目已链接为 fisherman，生产别名 fisherman-delta.vercel.app）
vercel --prod --yes
# 推送 GitHub（代理已写入 git config，无需手动 export）
git push
```

## 环境注意事项

- **依赖安装用 `npm install --ignore-scripts`**：`webgpu`（Dawn Node 封装）的 postinstall 要从 GitHub 下大二进制，直连极慢。跳过只影响 Node 无头渲染测试（`import './headless.mjs'` 的那些），浏览器运行与 vite 完全不受影响。网络好时可 `npm rebuild webgpu` 恢复。
- **git**：Xcode 许可已于 2026-09-30 接受，`/usr/bin/git` 可直接用；若再遇许可报错，临时 `export DEVELOPER_DIR=/Library/Developer/CommandLineTools`。
- **网络**：GitHub 直连不稳，git 已配 `http.https://github.com/.proxy=127.0.0.1:7897`；其他工具（curl/gh）需要时手动 `export https_proxy=http://127.0.0.1:7897`。
- **端口纪律**：dev server 用 5189；不要占用 5188。
- **浏览器验收**：首次加载编译数百 shader 需 2-5 分钟，轮询加载进度百分比，别提前判失败；内嵌浏览器约 11fps 属正常（viewport 小 + 软渲染路径），最终验收用本地 Chrome。
- **URL 调试开关**：`?fly&noAudio&noClouds&noHaze&noCaustics&noVeg&noSim&bench&shots=...`，见 README「URL options」与 `src/core/Bench.js`。

## 架构速览（8.1 万行，零运行时依赖）

| 目录 | 内容 | 规模 |
|---|---|---|
| `src/engine/` | 自研 WebGPU 引擎：手写数学库（three 兼容 API）、场景图、ShaderModule 组合系统、材质/阴影 | 10.7k |
| `src/core/` | Bench（时间戳基准+golden image）、Profiler、CDLOD、DebugViews（28 个评审相机） | 1k |
| `src/ocean/` | FFT 海洋（每帧 2 dispatch）、浅水 swash、破碎波、尾迹、焦散、折射 | 6.7k |
| `src/sky/` | Hillaire 2020 大气 LUT、两代体积云（现行 SkyProClouds.js） | 3.8k |
| `src/post/` | 后处理链：GTAO→AO/水下合成→TAAU→bloom→final（RCAS/曝光/ACES） | 3.8k |
| `src/world/` | 地形/村庄/植被/鱼群/鲸/船/礁 | 39k |
| `src/game/` | 玩法：竿、咬钩、搏鱼、经济、HUD——纯逻辑层，headless 可测 | 5.5k |
| `src/player/` | 走/游/甲板/掌舵四模式 | 1.7k |
| `src/materials/` | 共享 WGSL 光照：PCSS、bounce、local lights、LOD fade | 0.7k |
| `test/` | 49 个文件：game-logic（进 CI）+ 各流 harness（ocean-*/sky-*/world-*/life-*） | — |

**必读文档**：`docs/PORTING.md`——ShaderModule 命名前缀表、WGSL 陷阱清单、绑定点约定。改 shader 相关代码前先读它。

## 代码约定（向原项目看齐）

1. 每个魔法数字旁边写出处（论文/实测），格式如 `// 8x costs +0.5ms @1440p; 4x is enough`。
2. 每个 fallback/防御分支注明它防的伪影或失败案例。
3. 玩法逻辑不 import 渲染对象；HUD 缺失时优雅降级（headless 模式参考 `src/game/Game.js:146`）。
4. 跨系统共享的 WGSL 函数走 ShaderModule 单点定义（前缀表见 PORTING.md），禁止复制粘贴两份。
5. 改时序/滤波算法前先跑基线：`?bench&shots=<view>` 出参考图对比，测试基建见 `test/taa-pier.mjs`。
6. 随机性一律用可注入 rng（`Bites.js` 风格），保证测试确定性。

## 对象扩展字段契约（跨文件的隐式协议，改动前先查这张表）

引擎在 Object3D/Mesh 实例上挂的私有字段——所有读写方都列在这里，新增读写方必须更新本表：

| 字段 | 写入方 | 读取方 | 语义 |
|---|---|---|---|
| `obj.__draw` | `MeshRenderer._slot` | 仅 MeshRenderer | 每对象 draw 槽位缓存 `{ frame, slot, cur, prev, has }`；slot = -1 表示该帧因 draw buffer 满被丢弃 |
| `obj.staticVelocity` | `CameraVelocity.useStaticVelocity(root)`、各静态系统（Terrain/Rocks/Debris/Breakers mesh 等） | `MeshRenderer._slot`、`WaterMaterial`、`CameraVelocity` | true = 该对象不在世界移动（只相机动）：运动向量用上一帧相机重投影，跳过 prev 矩阵跟踪 |
| `obj.resetVelocity` | 任何传送/瞬移对象的系统（置 true）；`MeshRenderer._slot` 消费后置 false | 仅 MeshRenderer | true = 下一帧运动向量置零（prev = 当前），防止传送拖影 |
| `obj.drawParams` | 各系统（每对象材质参数） | `MeshRenderer._slot` | 写进 draw uniform 的逐对象参数（id + 最多 7 float） |
| `frame.prevViewProjNoJitter` 等 Frame 字段 | `setFrameCamera` / `PostFX.beginFrame` | WGSL 全体 + CPU 侧（**读取后必须立即 copy**，字段对象跨帧复用） | 见 `engine/render/Frame.js` 的 `_scratch` 注释 |

## 迭代方向

优先级与验收标准见 `docs/ITERATION_PLAN.md`（P0 债务清理 → P1 工程化 → P2 性能体验 → P3 玩法内容）。动手前先看该文档，避免与计划冲突。

## 部署拓扑

- GitHub：CrazyRock114/fisherman（main 分支）
- Vercel：项目 fisherman，生产 https://fisherman-delta.vercel.app ，CLI 直推（`vercel --prod`）；如需 push 自动部署，去 Vercel 控制台 Settings → Git 关联仓库
- 原 deploy.yml（GitHub Pages）已禁用，别重新启用（本仓库没配 Pages 会红叉）
