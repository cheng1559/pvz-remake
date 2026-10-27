# 宽屏版背景音乐

独立纯资源 Mod，使用工作区 `pvz` 宽屏版的原始 MP3。可单独启用，也可与任一宽屏画面 Mod 搭配。

按宽屏版 `bass.dll` 的 MO3 段落替换表核对曲目，覆盖本体现有的 8 首 BGM：

| 场景 | 曲目 ID | 宽屏版文件 |
| --- | --- | --- |
| 白天战斗 | `day_grasswalk` | `lawnbgm(1).mp3` |
| 选卡 | `choose_seeds` | `lawnbgm(6).mp3` |
| 标题／主菜单 | `title_theme` | `lawnbgm(8).mp3` |
| 禅境花园 | `zen_garden` | `lawnbgm(14).mp3` |
| 解谜 | `puzzle` | `lawnbgm(11).mp3` |
| 小游戏 | `minigame` | `lawnbgm(10).mp3` |
| 传送带 | `conveyer` | `lawnbgm(13).mp3` |
| 最终 Boss | `final_boss` | `lawnbgm(9).mp3` |

通过原资源 ID `pvz:audio/music/music_manifest` 覆盖音乐索引，复用本体的播放、循环、暂停、淡出和音量设置。音频逐字节复制，每首按整曲循环。白天曲使用完整混音，不再叠加本体的鼓点／踩镲分轨和动态爆发逻辑。当前本体未接入的夜晚、泳池等曲目暂不打包。

在 `/mod` 导入 `dist/mods/widescreen-bgm.zip`，启用后重启游戏生效；若其他 Mod 也覆盖音乐索引，将此 Mod 排在其后。

重新导入、打包与检查（导入需要 `ffprobe`）：

```sh
python3 mods/widescreen-bgm/import_assets.py /Users/cheng/Downloads/pvz
npm run mod:pack -- mods/widescreen-bgm
npm run mod:test -- dist/mods/widescreen-bgm
```

`conversion.json` 记录原文件名、MO3 段落、时长及 SHA-256，便于核对来源。
