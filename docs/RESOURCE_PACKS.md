# 资源 Mod

资源包已经并入 Mod：统一使用根目录 `manifest.json`、`content.json`，通过 `/mod` 安装和管理，使用同一套 ZIP 校验、优先级、解码与缓存。

纯资源 Mod 无需脚本入口。资源格式、高清逻辑尺寸、字体密度、打包与安装方法见 [Mod 文档](MODS.md)。新 ZIP 位于 `dist/mods/`，旧 `pack.json` 格式需要重新打包。
