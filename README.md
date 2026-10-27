# Codex 配置与全部技能备份

按 `config.toml`、`AGENTS.md`、全部 skills 三个维度保存当前机器的快照，供跨设备迁移和后续分析。

## 内容索引

| 路径 | 内容 |
| --- | --- |
| `codex/config.toml` | 原始配置完整备份，未删减、未脱敏、未替换路径 |
| `codex/AGENTS.md` | 原始全局规则完整备份，未改写内容 |
| `codex/skills/` | 用户技能及 `.system` 系统技能的完整目录 |
| `plugin-skills/<市场>/<插件>/<版本>/skills/` | 本机已缓存插件中的全部技能目录，保留版本层级及配套资源 |
| `portable/config.toml`、`portable/AGENTS.md` | 上次整理的可迁移版本，保留供对照 |
| `backup-manifest.json` | 源路径、备份路径、大小、SHA-256、插件版本及技能目录联接关系 |

本次共 **45 个技能、527 个快照文件、约 28.89 MiB**；另外包含 README、忽略规则、Git 属性及清单文件。

## 完整配置与可迁移配置

`codex/config.toml` 包含原机器的用户名、项目路径、信任列表、worktree 路径、插件市场路径、程序版本目录、MCP 环境配置和命名管道。这些内容按要求原样保留，用于分析。恢复到另一台电脑时，先安装并登录 Codex，再逐项合并所需设置；不要直接用完整快照覆盖新电脑配置。

`codex/AGENTS.md` 中的绝对技能路径也按原样保留，恢复时需要按目标用户名或 `CODEX_HOME` 调整。`portable/` 保存此前已去掉本机运行时配置、调整过技能路径写法的版本，供比较参考。

## 技能覆盖范围

- 用户与系统技能：来自 `%USERPROFILE%\.codex\skills`，包括 `dhr-local-dock` 和 `.system`。
- 插件技能：来自 `%USERPROFILE%\.codex\plugins\cache` 中所有含 `SKILL.md` 的版本目录，包括内置插件、主运行时插件、远程插件及模板技能。
- `%USERPROFILE%\.agents\skills\dhr-local-dock` 是指向用户技能的目录联接，内容只备份一次；原始映射记录在清单中。
- 技能说明、脚本、参考文档、模板、图片及其他配套文件一并保存；仅排除生成的 Python 字节码缓存，具体文件列在清单中。

插件技能快照用于分析和保留资源，不等于插件完整安装包；调用插件工具、外部运行时或技能目录之外脚本的能力仍需在新电脑安装对应插件。系统技能建议使用新电脑所装版本，避免直接覆盖。

## 在另一台 Windows 使用

1. 克隆本仓库，先安装 Codex 并登录，然后退出应用。
2. 备份目标机器已有的 `%USERPROFILE%\.codex\config.toml` 和 `AGENTS.md`。
3. 比较 `codex/` 完整备份与 `portable/` 可迁移版本，将需要的配置和全局规则合并到目标目录。
4. 将需要的自定义技能目录复制到目标 `%USERPROFILE%\.codex\skills`。插件通过应用重新安装；需要分析时查阅 `plugin-skills/`。
5. 如需保持原机器的技能发现入口，在目标 `.agents/skills` 下重新建立指向自定义技能目录的 Junction，映射见清单。

DHR 技能默认依赖 `D:/Repository/gct/dhr-dev-tools` 下的 Local Dock，目标电脑需另外准备；路径不同时使用技能支持的 `--tool-dir` 参数。

## 边界与校验

本仓库不收集 `auth.json`、登录凭据、浏览器 Cookie、会话记录、数据库、桌面内部状态或应用运行时。完整配置在入库前检查了常见凭据格式；原始源配置与技能均未修改。

每个快照文件的 SHA-256 记录在 `backup-manifest.json`。`.gitattributes` 关闭文本换行转换，以保留原始文件字节；清单记录的是本次快照，不代表后续修改后的文件。
