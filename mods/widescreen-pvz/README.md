# PvZ 素材宽屏 Mod

独立 Mod：`local:widescreen-pvz`，使用工作区 `pvz`（`/Users/cheng/Downloads/pvz`）中的宽屏素材。与 Ultimate 素材版 `local:widescreen` 二选一，启用本 Mod 时停用另一个。

替换主界面左右背景、中央背景和天空，加载页，温室／蘑菇园／水族馆／智慧树背景，商店背景与开关门车辆，以及当前白天战场、单行／三行草坪和失败门口贴图。这十九张 PNG 使用工作区 `pvz` 素材；智慧树页另导入该项目的十四张树体、草地、树根、叶片和云层贴图。右侧草丛使用 Ultimate 的十二张叶片 PNG 和三段原动画，全部随 ZIP 安装。其余角色、按钮和玩法沿用游戏及已启用的资源包。

智慧树直接复用本体 `pvz:tree_grow50` 和 `pvz:tree_cloud1`～`tree_cloud6` 的分层与播放方式。树干和树根的 JPG 按配套 `_` 透明遮罩还原，所有十四张图片做 2× 超分；资源覆盖限定在上述智慧树动画内，共用云图不会替换主界面的同名素材。保留宽屏背景，并隐藏本体树动画中重复的 800px 旧背景层。`tree-conversion.json` 及最终 `conversion.json.tree` 记录原图、遮罩和动画依赖；不增加养树或喂食逻辑。

白天战场右侧草丛复用 Ultimate 的 `BUSHES3/4/5.REANIM` 原始 `anim_rustle` 轨道，通过本体 `ReanimPlayer` 播放叶片位移、旋转、缩放、透明度和飘落。每段保留全部 42 帧与原始 12fps 时间轴，按 Ultimate 的 `PlayReanim` 速率 10 播放，播放一次后停在末帧，未触发时停在初始姿态。五行的位置、变体选择和层级来自随应用附带的 `Board.InitCoverLayer`、`GameConstants.gCoverInfos`；坐标换算到本体原网格，沿用 `LevelEntityRenderer.collectLayerEntries` 的统一排序，绘制序为 `row*10+6`。原静态合成图和正弦平移逻辑已移除。

触发参考 Ultimate 的 `Board.AddZombieInRow`：收到 `zombieSpawned` 时重播对应行草丛，排除蹦极僵尸。同一行再次生成僵尸会从头重播；使用游戏时间，暂停时也暂停，读档不补播生成事件。草丛随场地镜头平移，不改变种植区域，Ultimate 素材版 Mod 不受影响。原资源及随包托管代码的证据范围见 [资源记录](../../art/reference/pvz-ultimate/README.md) 和 `ultimate-bushes-conversion.json`。

铺草时的卷草动画和沙土粒子排在草坪遮罩之上、草丛所在的实体层之下，草卷到右侧时从草丛后面经过。首次创建的所有草卷与后续生成、恢复的铺草粒子都应用相同顺序；草丛与战斗实体仍按行排序。

四十五张图片统一复用项目的 Real-ESRGAN `realesr-general-x4v3` 流程，4× 推理后以 Lanczos 缩至 2×。清单保留原逻辑宽高并声明 `scale: 2`，本体按资源 ID 或文件路径加载时均应用同一像素密度，显示尺寸、锚点、网格、镜头边界和动画坐标保持不变。透明图片沿用现有黑白背景合成还原方式；Ultimate 的预乘透明度先还原再超分，输出重新预乘，由本体统一处理边缘。三段草丛动画 JSON 不变。

中央背景仍按源项目的 JPG 与 `_` 透明遮罩合成，加载页 JPG 转换为 PNG；其他 PvZ 原图与 Ultimate 图集裁图作为超分输入。`conversion.json` 中的原图记录和 `upscale` 记录分别保留输入与输出哈希，另附 Ultimate 原始资源记录。`upscale.json` 用于增量跳过已完成图片，原图缓存位于 `temp/widescreen-pvz-upscale`，不会重复超分已经处理的图片。

视口支持 4:3～16:9；超出此范围时由视口统一留黑，超过 16:9 的屏幕在左右留黑边。界面逻辑尺寸仍为 1066×600，超分纹理为 2132×1200，保持原图比例，超出素材覆盖范围的区域会露出页面底色。主界面左图 609×680，比原素材向左增加 133px，通过锚点保持轨道、按钮和用户名的位置；右图 863×560，中央图 720×350。云、花和戴夫的宽屏运动沿用现有宽屏实现。

白天背景逻辑尺寸为 1666×600，超分纹理为 3332×1200，相比原 1400×600 向左右各增加 133px。保持背景中心、草坪网格和铺草时序，完整草坪采样起点从 232 调整到 365。镜头按当前视口和背景实际边缘限制左右起止点，保留原缓动曲线及战斗原点；开场、失败进门和窗口尺寸变化都应用同一边界。原图窄于视口时停止额外平移，但图片本身不足以覆盖的区域仍受原素材尺寸限制。视口上限为 16:9。沿用原矩形滚动遮罩和草坪层级，铺完后使用完整背景；单行／三行草坪和门口贴图使用原坐标。没有 Ultimate 版的 1.6 倍密度和场景偏移。

商店开门／关门车身直接使用源项目的完整 788×495 图片，后盖为 406×173。沿用本体车辆原点和翻页抖动，不重新合成车身。

```sh
# 重新从工作区原项目导入素材（需要 Pillow）
python mods/widescreen-pvz/import_assets.py /Users/cheng/Downloads/pvz

# 从本机 Ultimate 导入原草丛动画和叶片（需要 Pillow、zstandard、cryptography、dnfile）
python mods/widescreen-pvz/import_ultimate_bushes.py '/Applications/PvZ Ultimate.app'

# 导入智慧树素材并执行全包 2× 超分，已完成的其他图片复用缓存
python mods/widescreen-pvz/import_tree_assets.py /Users/cheng/Downloads/pvz

# 单独补跑 2× 超分，保持逻辑尺寸（需要 PyTorch、Pillow、NumPy，复用项目缓存模型）
python mods/widescreen-pvz/upscale_assets.py

# 打包
npm run mod:pack -- mods/widescreen-pvz
```

导入 `dist/mods/widescreen-pvz.zip`，在 `/mod` 中停用 Ultimate 宽屏版、启用本 Mod，Apply 后重启。需要支持统一 `content.json` 和透明度格式的当前游戏本体。
