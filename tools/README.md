# 开发脚本

按用途分目录，根目录只保留说明和 Node 模块配置：

```text
tools/
├── mod/                    # Mod 初始化、打包、验证和配置读取
│   ├── cli.ts
│   ├── content.ts
│   └── test.ts
├── pvz/                    # 原版 PAK 导入、转换和 anim_defs.json
├── resources/              # 音频压缩、字体和图片超分辨率
│   └── licenses/           # 资源处理工具的第三方许可
├── kernel/build.ts         # C++ 内核编译为 Wasm
├── profile/ios.ts          # iOS JS 性能采样
└── local/                  # Git 忽略的本地资源包生成器及其打包接口 package_resources.py
```

常用入口：

| 用途 | 命令 |
| --- | --- |
| 从原版 PAK 导入基础资源并发布 ZIP | `npm run build:content -- --pak /path/to/main.pak` |
| 初始化、打包、验证 Mod | `npm run mod:init`、`npm run mod:pack`、`npm run mod:test` |
| 编译共享 C++ 内核的 Wasm | `npm run build:kernel` |
| 字体、图片超分辨率 | `python3 -m tools.resources.upscale_fonts`、`python3 -m tools.resources.upscale_ui` |
| iOS JS 性能采样 | `npx tsx tools/profile/ios.ts ...` |

Python 命令在项目根目录执行。`npm run build:content` 调用 `python3 -m tools.pvz`；转换实现集中在 `pvz/`：

```text
pvz/
├── __main__.py             # PAK 导入命令入口
├── anim_defs.json          # 原版动画转换规则
├── importer.py              # 导入流程和资源清单
├── pak.py                   # PAK 解包、文件名规范化、临时目录
├── images.py                # 图片及透明通道合并
├── reanim.py                # Reanim 轨道、片段与动画标记
├── compiled_reanim.py       # 原版编译动画解码
├── particles.py             # 粒子 XML 转换
├── compiled_particles.py    # 原版编译粒子解码
├── fonts.py                 # 位图字体
├── strings.py               # 原版文本
├── audio.py                 # 音效转换
├── music/                   # 音乐转换及 libopenmpt 绑定
├── cache/                   # 种子包、图鉴和小推车图集
└── almanac.py               # 图鉴部件配置
```

原版资源转换规则在 `tools/pvz/anim_defs.json`：

- 省略 `animations` 时自动读取 Reanim 的 `anim_*` 标记；显式列表用于选取部分片段。没有标记时使用完整的 `default` 动画。
- `slots` 配置部件挂点；`hiddenTrackPrefixes` 过滤不需要的装备轨道。
- `exports` 将原版片段映射到游戏使用的资源 ID；Python 中不再维护另一份导出列表。

`local/` 保存不纳入 Git 的本地资源包生成器，源码已保留，需要各自的素材输入。

Node 工具统一使用 TypeScript，通过项目已有的 `tsx` 执行；Python 用于原版资源解码与转换。

`mod/content.ts` 供 Mod 打包和无引擎测试读取作者配置；`mod/test.ts` 是 `mod:test` 的验证实现。本地资源生成器登记资源后，通过同在 `local/` 的 `package_resources.py` 调用通用 Mod 打包器。

PAK 只解包到临时目录，转换结果直接写入 `mods/pvz-base/assets/`。日常编辑现有资源后，只需：

```bash
npm run mod:pack -- pvz-base --publish assets/resources/base.zip
```
