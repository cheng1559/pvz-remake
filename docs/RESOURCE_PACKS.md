# 材质包

```text
/pack install
/pack load hd
/pack list
/pack unload hd
/pack unload all
/pack uninstall hd
```

包按加载顺序叠加，同 ID 后加载者优先。未声明的 ID 使用原资源；已声明但文件缺失或加载失败会直接报错，不回退到原图。启用列表保存在本地；安装、更新或启用状态变化后提示重启，确认后立即重启整个游戏，运行中的关卡先保存，重新进入时可继续。重复启用或停用不会弹窗。

资源包只通过 ZIP 安装，无需手动解压。执行 `/pack install` 打开文件选择窗口，选择本机 ZIP；命令不接受路径或地址参数。网页使用浏览器文件选择器，macOS 使用系统文件窗口。包内必须恰好有一份 `pack.json`，可直接放在 ZIP 根目录，也可外包一层文件夹；清单中的图片、字体 JSON 和字体图集必须齐全。`/pack load <ID>` 仅重新启用已安装包，不接受目录、JSON 地址或 ZIP 路径。

安装弹窗只显示 `Installing...`，校验资源清单与图片尺寸，通过后才保存并替换同 ID 包；重启前保留当前资源。网页保存在当前站点的 IndexedDB，Native 保存在应用可写目录的 `resource-packs/`。安装后可以删除原 ZIP，重启仍可用；`/pack unload <ID>` 只停用，之后用 `/pack load <ID>` 重新启用。`/pack uninstall <ID>` 删除已安装的包；卸载已启用的包同样提示重启，已停用的包直接删除。重新安装同 ID 的 ZIP 会更新内容；清除站点数据会删除网页中安装的包。

HD 包的制作素材位于 `art/resource-packs/hd/`，包含 UI 超分图、非像素字体和高清普通／紫卡背景，不参与 Cocos 资源导入和游戏打包。原 `/hdfont` 开关已移除；`/hdseed` 只控制种子包、图鉴头像和落点预览的实时 Reanim 渲染。

执行 `npm run build:hd-pack` 更新包清单，并生成 `dist/resource-packs/hd.zip`，通过 `/pack install` 安装。包内只需要 JSON 和图片，无需 Cocos 构建、Bundle 或 `.meta` 文件。

`pack.json` 的最小示例：

```json
{
  "id": "my-pack",
  "sprites": {
    "pvz:button_left": { "file": "sprites/button_left.png", "width": 41, "height": 46, "scale": 2 }
  },
  "fonts": { "pvz:houseofterror28": "fonts/houseofterror28.json" }
}
```

`width`、`height` 是原逻辑尺寸，实际图片尺寸为它们乘以 `scale`。裁剪图可补充 `rect: [x, y, width, height]`、`offset: [x, y]`、`borders: [left, top, right, bottom]`，均使用原坐标，保持布局和九宫格不变。与其他动画共用的 UI 部件通过 `animations: ["pvz:loadbar_zombiehead"]` 限定作用范围。

字体 JSON 沿用原位图字体配置，图集路径相对于字体 JSON；放大字图使用各层的 `textureScale`，字距、基线和布局尺寸保持原值。HD 包排除了 `Pico129`、`Pix118Bold`；challenge 关卡缩略图也保持原图。
