# Tidewater 迭代优化计划

> 基于 2026-09 对全部 8.1 万行代码的深读（四个模块级研究报告），按优先级分四阶段。每项含动机（代码证据）与验收标准。
> 原则：先还债再盖楼——P0 未清完不开 P2。

---

## P0 债务清理（✅ 已完成 2026-09-30，见 tag v1.1-debt-clear）

> 实际执行记录：删除 Clouds.js（-1621 行死代码）+ `?oldClouds` 开关；fresnel 复用 waterFresnelModule；`f()` 助手从全库 23 份副本合并为 `src/util/wgsl.js` 单点（toPrecision/toFixed 语义变体保留）；级联浅水衰减改为消费 WaterSurface.attenuationModule；PostFX `_timers` 死代码/重复赋值/`'TAAU '` 标签清理；Frame.setFrameCamera 零分配改造（per-block 私有 scratch）。catmullRom 两处为签名不同的孪生实现，按交叉引用注释处理（硬合并有回归风险）。净 -1750 行。验收：无头 ocean-surface/spray 逐像素一致 + 泡沫沉淀数 2701 逐位一致；浏览器 beach 改前/改后差异 0.021% 低于同代码噪声底 0.028%；game-logic 37 项全过。测试适配：sky-env/sky-perf/sky-textures/post-chain 迁移到 SkyProClouds，sky-clouds.mjs 删除，headless.mjs 增加 public/ fetch 垫片。

| # | 任务 | 证据 | 验收 |
|---|---|---|---|
| 1 | 删除旧体积云实现 `Clouds.js`（~1621 行死代码，默认走 `SkyProClouds.js`），保留 `?oldClouds` 开关则连同移除 | `src/sky/Clouds.js` 全文；`App.js:120` 只在 oldClouds 参数时用旧版 | `?oldClouds` 参数删除；sky 系列截图与删除前 golden image 一致（云除外） |
| 2 | WGSL 片段去重：`catmullRomWGSL` ×3（Clouds.js:213 / SkyProClouds.js:682 / TemporalUpscale.js:262）、`fresnelDielectric` ×2（Breakers.js:47 / WaterMaterial.js:17）、float 字面量助手 `f()` ×4（Breakers/WakeSim/SurfFoam/ShoreWaves） | 见左 | 全库仅一处定义（放 `engine/render/wgsl/common.js` 或 `ocean/util.js`）；全部 harness 截图无回归 |
| 3 | FFT 级联浅水衰减单点化：Breakers.js:225-235 内联硬编码了一份与 `WaterSurface.attenuationModule`（WaterSurface.js:56-77）相同逻辑 | 见左 | Breakers 改为消费 WaterSurface 导出的 ShaderModule；`?noSim` 等开关行为不变 |
| 4 | 死代码清理：`PostFX.js:649,686` 的 `_timers` 残段；`PostFX.js:126,132` 重复赋值；`'TAAU '` 标签尾随空格（PostFX.js:710） | 见左 | 全库 grep 无 `_timers`；profiler 输出标签正确 |
| 5 | `Frame.setFrameCamera` 每帧 clone ~10 个矩阵/向量（engine/render/Frame.js:120-141） | 见左 | 帧循环该路径零分配（用分配 profiling 验证）；27 fps → 无回归 |

## P1 工程化（✅ 完成 2026-09-30，实测修订见下）

> 执行记录：#7 draw buffer 满改为丢弃尾部 + `stats.dropped` 计数（每容量档警告一次）；#8 `Texture.view` 单条目描述符备忘（命中时零字符串分配，`_views.clear()` 处同步失效）；#9 水材质 13 路调试视图按 `?wdbg` 构造期编译（生产 shader 无调试分支，运行时切换不再支持）；#10 GTAO sin-hash 换共享 PCG hash；#11 nightly-render.yml（game-logic + engine-smoke 为门禁，视觉 harness 出 PNG artifact）；#12 弃用的 GitHub Pages workflow 已删（Vercel Git 集成需在控制台关联仓库）；#13 对象扩展字段契约表写入 AGENTS.md。
> **#6 修订（实测否决）**：读 SceneRenderer 后发现 6 次 collect 的 layerMask/相机各不相同，"collect 只做一次"的缓存前提不成立；实测 `scene.updateMatrixWorld()` 每帧 6 次共 ~0.09-0.16ms（ocean 场景 + 300 动态对象），低于值得冒险的阈值——帧中修改矩阵的语义风险大于收益，不做。

| # | 任务 | 证据/动机 | 验收 |
|---|---|---|---|
| 6 | `MeshRenderer.collect` 跨 pass 缓存：现每 pass 全场景遍历+排序（3 级联+opaque+late 最多 5 次），`pass.items` 参数存在但无人用 | `MeshRenderer.js:400-427, 492` | 静止相机时 collect 只做一次；Profiler 中 CPU 帧时间可测下降 |
| 7 | draw buffer 满时优雅降级：现直接 throw 且扩容只对下帧生效 | `MeshRenderer.js:73-78, 97` | 容量超限时丢弃最远 draw 并 console.warn 一次，不崩帧 |
| 8 | `Texture.view()` 每次 JSON.stringify 的热路径 key 改为缓存（view 参数不可变时） | `Texture.js:125` | 每帧该路径零字符串分配 |
| 9 | 调试视图编译期裁剪：WaterMaterial 13 路调试分支移到 `#ifdef WATER_DEBUG` | `WaterMaterial.js:590-626` | 生产构建 shader 无调试分支；开发用 `?wdbg` 仍可用 |
| 10 | GTAO 噪声统一 PCG hash（现为 sin-hash，与 common.js 的 PCG 质量不一致） | `GTAO.js:139-143` vs `wgsl/common.js:57-61` | golden image 更新一次（预期像素级微变），记录对比 |
| 11 | CI 接入渲染 harness：nightly 跑 ocean-full/sky-perf/post-chain（Dawn 二进制用 ghfast 镜像下载），失败时上传 PNG artifact | `test/*.mjs` 已就绪，只差工作流 | GitHub Actions nightly 绿；PNG 可下载对比 |
| 12 | Vercel Git 集成：控制台关联 CrazyRock114/fisherman，push 即部署；`.github/workflows/deploy.yml` 彻底移除 | 当前 CLI 直推 | push main 后 Vercel 自动构建 |
| 13 | Monkey patch 契约集中化：`obj.__draw`/`staticVelocity`/`resetVelocity` 等散落的私有字段集中到一个文档/常量表 | CameraVelocity.js、MeshRenderer.js:94 等 | AGENTS.md 增补"对象扩展字段契约"表 |

## P2 性能与体验（✅ 完成 2026-09-30，#16/#17 有决策记录）

> 执行记录：#14 预编译分两相——加载屏只等出生视野用到的管线（一个预热帧发起请求 + pipelinesReady），全量 every-mesh 预编译挪到 start() 后在开始界面期间后台跑（`precompile(false | true)`，失败有 catch 兜底，漏编译的管线由 syncPipelines=false 路径首用补编）；#15 Performance 标签新增 Quality 预设（Low/Medium/High：renderScale、AA 倍数、阴影、SSR、GTAO 采样数、云 resolutionScale），localStorage 独立持久化（`tidewater-quality`，与游戏存档分离——设置属于设备，存档可携带）；#18 存档导出/导入（GameState.exportSave/importSave + 设置面板 Save data 文件夹，剪贴板导出、粘贴导入，game-logic 新增 4 条断言含 junk 拒绝与 onChange 通知）。
> **#16 决策记录**：远级联（400m 档）提频到每 2 帧实测 +0.4~0.7ms（约 5% 帧成本，两轮 A/B），感知收益未证实——**维持每 4 帧**；若实测可感，改 `Shadows.js` 的 `periods` 一行即可，成本已量化。
> **#17 延后**：LocalLights 阴影近似是独立图形特性（深度图短阴影），工作量超出本轮，留待 P3 后评估。

| # | 任务 | 动机 | 验收 |
|---|---|---|---|
| 14 | 首载 shader 编译提速：加载屏分优先级预编译（先玩家视野内管线），用 `?bench` 数据排序编译顺序 | README 自述首载需 1-2 分钟 | 首载可交互时间（M 系列）降 30%+，以 bench 数据为准 |
| 15 | 画质预设（低/中/高）：暴露动态分辨率目标、云质量档、折射半分辨率开关、GTAO 采样数；低配设备自动降档 | 现只有全开+动态分辨率 | 12 集成显卡可玩（≥24fps）；预设写入存档 |
| 16 | 远级联 4 帧延迟评估：快速横摇时远阴影跳变是否可感，可感则远级联提频到 2 帧 | `Shadows.js:31,135` 注释自认取舍 | bench 场景 A/B 截图 + 帧成本对比后决策并记录 |
| 17 | LocalLights 阴影近似：至少对灯笼加深度图短阴影或高度场遮挡 | `LocalLights.js:14` 自认无阴影穿帮 | 夜间村庄场景截图对比，穿帮灯消失 |
| 18 | 存档导出/导入：localStorage JSON 一键复制/粘贴 | 现只有浏览器本地存档 | 换设备可迁移；round-trip 测试 |

## P3 玩法与内容（持续）

| # | 任务 | 说明 |
|---|---|---|
| 19 | **中文本地化**（对中文用户价值最高）：UI 字符串抽离成表（ui/GameHUD/Guide/FishStand 等），`?lang=zh` 或设置面板切换；鱼种俗名+学名双语 | Tidewater UI 文案量中等，抽表 1-2 天；字体已含中文 fallback 需验证 |
| 20 | 手柄支持：走/开船/钓鱼映射（Input.js 已抽象输入层） | 扩大可玩人群 |
| 21 | PWA 离线：service worker 缓存资产；加"安装到桌面" | 钓鱼是碎片场景，离线价值高 |
| 22 | 图鉴扩展：鱼种页配 FishPortrait 手绘卡 + 生境/时间/纪录统计 | 复用现有 FishTable/FishPortrait |
| 23 | 季节/天气事件：利用现有 SeaDetail 阵风与云天气图，加"赤潮/鱼汛"周期事件提升 long-term loop | 全部数据管道已存在，只差玩法层 |

---

## 执行纪律（对应 vibe coding 六步循环）

1. 每项动手前跑对应基线：视觉项 `?bench&shots=<view>&tag=baseline`，性能项 `?bench` 存中位数。
2. P0 全部做完后打 tag（如 `v1.1-debt-clear`），golden image 全量更新一次并归档。
3. P2/P3 每项独立分支 + 小步部署到 Vercel preview，验收后进 main。
4. 每完成一项，若产生新约定/新坑，当天更新 AGENTS.md。

## 已知不建议动的

- `Breakers.js` 的 crest 探测与渲染共用解析场的设计——改动风险远大于收益。
- `WakeSim` 的自伴算子与环形窗口——物理正确性已验证，别"优化"。
- 顶点着色器钓竿动画（aux.w 通道方案）——看似 hack 实为最优解。
- 反转 Z + 无穷远平面的相机约定——全库一致贯穿，牵一发动全身。
