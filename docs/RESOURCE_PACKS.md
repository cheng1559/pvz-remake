# 资源包

```text
/pack
/pack install
/pack load hd
/pack list
/pack unload hd
/pack unload all
/pack uninstall hd
```

图片、字体、音频、展示 JSON 和文本共用资源包解析入口。包按加载顺序叠加，同类型、同 ID 后加载者优先；未声明的 ID 继续查前面的包，最后读取内置资源。已声明但文件缺失、JSON 无法解析或音频解码失败会直接报错，不回退到原资源。顺序和启用状态保存在本地（`pvz-remake:resource-packs`，不读取旧版启用列表），启动时清除安装文件已不存在的启用记录；已安装包损坏仍会报错。安装、更新或启用状态变化后提示重启，确认后立即重启整个游戏，运行中的关卡先保存，重新进入时可继续。重复启用或停用不会弹窗。

## 管理窗口

`/pack` 不带参数时打开资源包管理窗口，布局沿用用户选择框。列表显示全部已安装的包，顺序即优先级，越靠上越优先。点击复选框或名称切换启用状态，不移动条目；右侧上下箭头调整顺序，两者都只修改窗口内的草稿。Apply 把全部包的顺序和启用状态保存为同一份列表，未启用的包也保留位置。CLI 操作同一份列表：`/pack load` 和 `/pack install` 把包启用并移到最上方，`/pack unload` 只取消启用、位置不变，`/pack uninstall` 从列表中删除。Import 打开 ZIP 选择器，安装后自动勾选并放到最上方；每行右侧的 Uninstall 确认后立即删除。Apply 保存草稿，启用列表或运行中的包有变化时弹出重启确认，确认后先保存关卡再重启；取消重启时设置已经保存，下次启动生效。Cancel／Escape 放弃未应用的勾选和排序。

资源包只通过 ZIP 安装，无需手动解压。执行 `/pack install` 打开文件选择窗口，选择本机 ZIP；命令不接受路径或地址参数。网页使用浏览器文件选择器，macOS 使用系统文件窗口。包内必须恰好有一份 `pack.json`，可直接放在 ZIP 根目录，也可外包一层文件夹；清单声明的文件及字体图集必须齐全。`/pack load <ID>` 仅重新启用已安装包，不接受目录、JSON 地址或 ZIP 路径。

安装弹窗标题为 `Installing...`，校验资源清单与图片尺寸，通过后才保存并替换同 ID 包；重启前保留当前资源。网页保存在当前站点的 IndexedDB，Native 保存在应用可写目录的 `resource-packs/`。安装后可以删除原 ZIP，重启仍可用；`/pack unload <ID>` 只停用，之后用 `/pack load <ID>` 重新启用。`/pack uninstall <ID>` 删除已安装的包；卸载已启用的包同样提示重启，已停用的包直接删除。重新安装同 ID 的 ZIP 会更新内容；清除站点数据会删除网页中安装的包。

Native 的 `resource-pack-runtime/` 保存当前运行中的文件快照；更新或卸载不会提前破坏正在播放或之后还会使用的音频，下一次启动时清理。Web 音频的 Blob URL 同样保留到页面重启，支持循环、跳转和音效变调。Release 的全资源预加载包含启用包中的所有资源类型。

HD 包的制作素材位于 `art/resource-packs/hd/`，包含 UI 超分图、非像素字体和高清普通／紫卡背景，不参与 Cocos 资源导入和游戏打包。原 `/hdfont` 开关已移除；`/hdseed` 控制种子包、图鉴头像和落点预览的实时 Reanim 渲染，种子包也可用 `/seedstyle standard|rendered|tilted` 单独选择风格。

执行 `npm run build:hd-pack` 更新 HD 包清单，并生成 `dist/resource-packs/hd.zip`，通过 `/pack install` 安装。当前英文 HD 使用 Real HAT sharper 重制，贴图 2×、字体 4×；模型来源与重新生成步骤见 [HD 包说明](../art/resource-packs/hd/README.md)。资源包无需 Cocos 构建、Bundle 或 `.meta` 文件。

简体中文包位于 `dist/resource-packs/zh-cn.zip`，ID 为 `zh-cn`，包含原版汉化文本、位图字体和变化贴图，不含音频。来源与重新生成方式见 [中文包说明](../art/resource-packs/zh-cn/README.md)；`npm run build:zh-cn-pack` 重新生成。与 HD 包共用时，先启用 HD，再启用中文包，使中文字体和贴图优先。

全图片测试包位于 `dist/resource-packs/hd-2.zip`，ID 为 `hd-2`，覆盖本体全部图片（含植物僵尸动画、粒子及关卡缩略图）2×，沿用英文 HD 的 18 套 4× 字体，像素字体保持原样。可独立安装，不影响原 `hd` 包文件；生成与打包方式见 [全图片测试包说明](../art/resource-packs/hd-2/README.md)。

中文 HD 完整包位于 `dist/resource-packs/zh-cn-hd.zip`，ID 为 `zh-cn-hd`，复用英文 HD 的 175 张公共图片，仅重制 111 张中文差异图片至 2×，中文 20 套字体全部做 4×，不排除英文同名的像素字体。模型与新版英文 HD 一致，使用 HAT sharper；不含音频，可独立安装。大字库分图集存储，每张不超过 4096×4096，完整字图会占用较多解码内存。生成参数及模型来源详见 [中文 HD 说明](../art/resource-packs/zh-cn-hd/README.md)。

江南 PVZ2PAK 转换试用包位于 `dist/resource-packs/jiangnan-pvz2.zip`，ID 为 `jiangnan-pvz2`，包含 UI、植物僵尸动画、粒子、字体、文本及重新生成的静态预览，不含音频和原项目的 EXE 改动。来源、适配范围及构建方式见 [PVZ2PAK 包说明](../art/resource-packs/jiangnan-pvz2/README.md)，使用 `npm run build:jiangnan-pack` 重新生成。

`pack.json` 示例；`sprites`、`fonts`、`audio`、`json`、`text` 均可省略，因此可以制作只有音乐或文本的包：

```json
{
  "id": "my-pack",
  "sprites": {
    "pvz:button_left": { "file": "sprites/button_left.png", "width": 41, "height": 46, "scale": 2 }
  },
  "fonts": { "pvz:houseofterror28": "fonts/houseofterror28.json" },
  "audio": {
    "pvz:day_grasswalk_main": "audio/day_main.mp3",
    "pvz:chomp": "audio/chomp.mp3"
  },
  "json": {
    "pvz:selector_open": "animations/selector_open.json",
    "pvz:particles/seedpacketflash": "particles/seedpacketflash.json",
    "pvz:audio/music/music_manifest": "music/music_manifest.json",
    "pvz:properties/lawnstrings": "text/lawnstrings.json",
    "pvz:gameplay/strings": "text/level_strings.json"
  },
  "text": { "pvz:properties/credits": "text/credits.txt" }
}
```

资源 ID 的选取：

| 资源 | 清单字段 | ID 来源 |
| --- | --- | --- |
| 图片、字体 | `sprites`、`fonts` | 原有稳定 ID，例如 `pvz:button_left` |
| 音乐音轨、音效 | `audio` | 内置文件名，不含扩展名，例如 `pvz:day_grasswalk_main`、`pvz:chomp`；Mod 使用自己的命名空间 |
| 注册的 Reanim、粒子、音乐定义 | `json` | 内容清单中的对应 ID，见 `assets/bundles/pvz-base/manifest.json` |
| 内置 JSON、文本 | `json`、`text` | `pvz:` 加载入路径，不含扩展名，例如 `pvz:properties/lawnstrings`、`pvz:particles/seedpacketflash` |

JSON 按整个资源替换，沿用被替换文件的结构，不按字段合并。Reanim 的 ID 要与清单条目匹配，现有 UI、挂件使用的轨道名也需保留；其引用的新贴图可在 `sprites` 中提供。两种粒子格式分别沿用内容清单中的 ID 和内置 `particles/` 路径，JSON 结构也分别保持原格式。`gameplay/strings` 只覆盖客户端显示的文案；关卡定义、植物数值和存档等服务端数据不由资源包替换。

Menu 的原版文案读取 `pvz:properties/lawnstrings`；本项目新增的平台提示和 GitHub 按钮文案位于 `assets/resources/ui/strings.json`，通过 `json` 字段的 `pvz:ui/strings` 覆盖。UI 加载这两张文本表，同名键以 LawnStrings 为准，因此也可在汉化包的 LawnStrings 中补充新增键。

音频使用各端通用的 MP3 或 WAV。动态音乐可分别替换 `main`、`drums`、`hihats`，各轨需保持相同时间轴、时长和前导静音；改变节拍或循环位置时同时提供 `pvz:audio/music/music_manifest`。播放、音量与动态鼓点仍使用现有 `MusicSystem`。普通文本使用 UTF-8；界面及关卡文案使用上例中的 JSON 文本表。

`width`、`height` 是原逻辑尺寸，实际图片尺寸为它们乘以 `scale`。裁剪图可补充 `rect: [x, y, width, height]`、`offset: [x, y]`、`borders: [left, top, right, bottom]`，均使用原坐标，保持布局和九宫格不变。与其他动画共用的 UI 部件通过 `animations: ["pvz:loadbar_zombiehead"]` 限定作用范围。

字体 JSON 沿用原位图字体配置，图集路径相对于字体 JSON；放大字图使用各层的 `textureScale`，字距、基线和布局尺寸保持原值。HD 包排除了 `Pico129`、`Pix118Bold`；challenge 关卡缩略图也保持原图。
