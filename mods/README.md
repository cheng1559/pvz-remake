# Mod 项目结构

仓库只保留 `example` 一个示例，以及通用 Mod 开发工具。其他 `mods/` 子目录用于本地开发，默认由 Git 忽略，源码和资源不随本体提交。

资源、数据和脚本扩展统一使用同一格式；只创建需要的目录。

```text
my-mod/
├── manifest.json             # ID、版本、依赖和可选模块入口
├── content.json              # 游戏/表现配置索引及资源映射
├── src/
│   ├── server/index.ts       # 可选的服务端代码
│   └── client/index.ts       # 可选的客户端代码
└── assets/
    ├── gameplay/            # 游戏定义分类 JSON
    ├── presentation/        # 表现定义分类 JSON
    ├── sprites/
    └── audio/
```

纯资源 Mod 只需清单、内容索引和资源文件。`content.json` 中所有路径相对于项目根目录。静态游戏定义、表现定义和新增资源自动注册；代码入口只负责自定义行为、视图和方法包装。

```sh
npm run mod:pack -- mods/example
npm run mod:test -- dist/mods/example
```

只有打包时编译，输出 `dist/mods/<name>/` 和 `<name>.zip`。管理入口统一为 `/mod`；安装、优先级和完整配置格式见 [Mod 文档](../docs/MODS.md)。

- [example](example/README.md)：玩法、资源、客户端视图、命令、存档与生命周期的完整示例。
