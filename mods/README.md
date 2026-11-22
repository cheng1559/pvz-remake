# Mod Project Layout

The repository keeps only one sample, `example`, plus the common Mod development tools. Other `mods/` subdirectories are for local development and are ignored by Git by default; their sources and resources are not committed with the base game.

Resources, data and script extensions all use the same format; create only the directories you need.

```text
my-mod/
├── manifest.json             # ID, version and optional module entries
├── content.json              # Index of gameplay/presentation definitions and resource mappings
├── src/
│   ├── server/index.ts       # Optional server code
│   └── client/index.ts       # Optional client code
└── assets/
    ├── gameplay/            # Gameplay definition JSON, by category
    ├── presentation/        # Presentation definition JSON, by category
    ├── sprites/
    └── audio/
```

A resource-only Mod needs only the manifest, the content index and the resource files. Every path in `content.json` is relative to the project root. Static gameplay definitions, presentation definitions and new resources register automatically; code entries only handle custom behavior, views and method wrapping.

```sh
npm run mod:pack -- mods/example
npm run mod:test -- dist/mods/example
```

Compilation happens only when packing, which outputs `dist/mods/<name>/` and `<name>.zip`. `/mod` is the single management entry; see the [Mod guide](../docs/MODS.md) for installation, priority and the full configuration format.

- [example](example/README.md): a complete example of gameplay, resources, client views, commands, saves and lifecycle.
