# UI 贴图超分

使用现有 Real-ESRGAN `realesr-general-x4v3` 神经网络，推理至 4 倍后缩至 2 倍。
输出位于 `art/resource-packs/hd/sprites/`，不参与 Cocos 资源导入；原图继续保留在 `assets/resources/textures/`。
模型下载、推理和透明通道处理复用 `tools/upscale_fonts.py`，许可证见 `tools/licenses/font-upscale.txt`。

```sh
/opt/miniconda3/bin/python tools/upscale_ui.py --list
/opt/miniconda3/bin/python tools/upscale_ui.py
# 单独重做指定素材
/opt/miniconda3/bin/python tools/upscale_ui.py --only options_menuback button_left
```

选择范围由脚本中的 UI 名称、前缀及实际动画依赖决定，覆盖菜单、图鉴、商店、挑战、成就、花园与日间关卡背景、种子栏、通用控件和加载界面。
主界面与加载动画的素材会从基础资源包中 `selector_*`、`loadbar_*` 及草坪卷动画的轨道引用自动收集，包括花、叶片、云、手、嫩芽及共用的少量僵尸头部、石块。原资源目录不存在的动画素材读取基础资源包的预处理 RGBA 图片。
仅因动画依赖而收集的共用部件，会在 manifest 中记录对应动画 ID；超分替换只在这些 UI 动画中生效，关卡、图鉴等其他用途继续使用原图。
字体、已有高清种子包、完整的植物与僵尸动画和缓存预览图不在本轮范围内。
`challenge_thumbnails` 和 `survival_thumbnails` 关卡缩略图保留原图，生成时也会删除其旧超分输出及 manifest 条目；challenge 页面背景与按钮仍使用超分图。
成就图标、关卡数字和关卡进度条图集按格子单独推理，保留图集位置；透明图片通过黑白背景合成结果恢复 RGBA。

manifest 记录原始尺寸、输入和生成器哈希。重复执行会跳过未改变的素材，每张图完成后才更新 manifest，支持中断后续跑。
`*-comparison.png` 左侧为原图放大显示，右侧为实际超分结果。

运行 `npm run build:hd-pack` 生成 `dist/resource-packs/hd.zip`，游戏内通过 `/pack install` 选择 ZIP 安装。`/pack load hd` 仅重新启用已经安装的包。`SpriteLoader`、`SpriteRepository` 和字体加载器统一按 ID 优先读取材质包；其他包也可使用相同 ID 覆盖 Mod 资源，见[材质包说明](../../../docs/RESOURCE_PACKS.md)。
矩形、原始尺寸、裁剪偏移、九宫格边距继续使用原版坐标，仅 UV 按纹理密度归一化。
`getAtlasFrame` 和输入框切片也走同一套密度处理。HD 图禁止放进动态图集，避免按低分辨率矩形复制纹理。
Web 与高清字体一样使用解码 RGBA 上传，避免 HTML 图片上传后出现空纹理。
