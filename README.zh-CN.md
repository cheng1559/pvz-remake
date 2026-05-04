# PvZ Remake

这是一个使用 Cocos Creator 3.8.8 和 TypeScript 制作的 Plants vs. Zombies 1 重制项目。

[English README](README.md)

## 运行环境

- Python 3.10 或更高版本
- Cocos Creator 3.8.8
- Plants vs. Zombies 原版游戏文件
  - 推荐版本：Steam 年度版 1.2.0.1096
  - 其他版本不保证能与当前资源处理流程完全适配。

## 导入原版游戏资源

1. 将原版 Plants vs. Zombies 游戏根目录下的 `main.pak` 拷贝到本项目的 `tools` 文件夹中。

   目标路径：

   ```text
   tools/main.pak
   ```

2. 在项目根目录执行：

   ```bash
   python3 tools/process_pak.py
   ```

   脚本会自动解包 `main.pak`，转换所需资源，并将资源导入到 Cocos 项目的资源目录中。

## 打开项目

1. 使用 Cocos Creator 3.8.8 打开本项目。
2. 在 Cocos Creator 中进入 `项目` > `项目设置` > `脚本`。
3. 将 `Import Map` 路径改为本项目中 `import-map.json` 的绝对路径。

   示例：

   ```text
   C:\path\to\pvz-remake\import-map.json
   ```

## 运行

1. 在 Cocos Creator 的资源管理器中打开：

   ```text
   assets/scenes/scene
   ```

2. 切换到浏览器预览或编辑器预览。

   模拟器预览暂时存在适配问题。

3. 点击运行按钮即可开始。
