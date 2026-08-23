# 开发说明

本文档记录 PvZ Remake 的本地环境、资源导入、开发流程和构建注意事项。

## 环境要求

- Cocos Creator `4.0.0-alpha.27`
- Node.js `22` 或更高版本
- Python `3.10` 或更高版本
- `ffmpeg` 可在 `PATH` 中访问
- Plants vs. Zombies 原版游戏文件
  - 推荐版本：Steam 年度版 `1.2.0.1096`
  - 其他版本不保证能与当前资源管线完全匹配。

## 导入原版资源

原版资源不会提交到本仓库。首次本地运行前需要自行导入：

1. 将 Plants vs. Zombies 安装目录中的 `main.pak` 复制到：

   ```text
   tools/main.pak
   ```

2. 在仓库根目录运行资源管线：

   ```bash
   python tools/process_pak.py
   ```

   在 macOS/Linux 上可能需要使用：

   ```bash
   python3 tools/process_pak.py
   ```

脚本会解包原版资源，转换动画、粒子、字体、文本、图片、音效和音乐，并将生成的运行时资源写入 Cocos 项目的资源目录。

## 使用 Cocos Creator 打开

1. 使用 Cocos Creator `4.0.0-alpha.27` 打开本仓库。
2. 进入 `项目` > `项目设置` > `脚本`。
3. 将 `Import Map` 设置为本仓库 `import-map.json` 的绝对路径。

   示例：

   ```text
   C:\path\to\pvz-remake\import-map.json
   ```

4. 打开主场景：

   ```text
   assets/scenes/scene
   ```

5. 使用浏览器预览或编辑器预览运行。

模拟器预览目前存在已知兼容问题。

## 开发说明

- 主要源码位于 `assets/scripts`。
- 由原版 PvZ 文件生成的运行时资源位于 `assets/resources`。
- Native bridge 代码位于 `native/engine`。
- 资源转换脚本位于 `tools`。
- `library`、`temp`、`build`、`tools/raw` 和原版资源输出目录均不应提交到 git。

常用调试入口：

- 桌面端：按 `/` 打开 Debug CLI。
- 移动端模式：双击屏幕右下角打开 Debug CLI。
- 使用 `/background true|false` 控制宽屏两侧背景显示。

使用以下命令运行不依赖 Cocos 的 strict TypeScript 检查：

```bash
npm install
npm run test:server
```

## 仓库结构

```text
assets/
  scenes/               Cocos 场景
  scripts/              TypeScript 游戏、UI、渲染和存档代码
  resources/            生成的运行时资源
native/
  engine/               Native bridge 和 Android 工程文件
tools/
  process_pak.py        一键原版资源导入管线
  *.py                  资源转换工具
```

## 构建

使用 Cocos Creator 的构建面板选择目标平台。

构建前建议：

1. 修改资源转换脚本后重新运行资源管线。
2. 先在浏览器预览中测试。
3. 如果目标是移动端，确认移动端模式和全屏行为。
4. 构建产物不要直接提交到 git，除非明确作为 release 附件发布。
