# Codex 个人配置与技能备份

用于在 Windows 设备之间迁移个人偏好、全局规则和自定义技能。

## 备份内容

```text
codex/
├─ AGENTS.md
├─ config.toml
└─ skills/
   └─ dhr-local-dock/
      ├─ SKILL.md
      ├─ agents/openai.yaml
      ├─ references/workflow.md
      └─ scripts/dock.mjs
```

- `codex/AGENTS.md`：专用 Chrome 窗口、CDP 调试、登录与业务操作边界，以及 DHR Local Dock 约定。技能位置使用当前用户目录的写法。
- `codex/config.toml`：默认模型、思考强度、回答详细度、桌面显示与交互偏好、默认编辑器、插件启用偏好和现有 Windows 沙箱设置。
- `codex/skills/dhr-local-dock/`：完整备份自定义技能，内容保持与源技能一致。

不包含登录凭据、API 密钥、Cookie、聊天记录、记忆数据库、桌面内部状态、远程连接、自动化运行状态、项目路径与信任列表、worktree、应用运行时、插件缓存或系统自带技能。

`config.toml` 已排除 `notify`、本机 MCP 运行时、插件市场本地路径、worktree 根目录和按路径保存的编辑器偏好。插件启用配置只表达偏好，不能替代安装插件、登录或授权。

## 在另一台 Windows 恢复

1. 安装 Codex，启动并登录一次，然后完全退出 Codex。
2. 克隆本仓库。在仓库根目录执行下方 PowerShell，备份目标配置并复制全局规则与技能。
3. 将本仓库 `codex/config.toml` 中的设置逐项合并到目标配置。已有同名 TOML 表或键时修改原有值，不要在文件末尾重复追加，也不要整份覆盖新电脑的运行时配置。
4. 重新打开 Codex，确认模型、主题、全局规则和技能。缺少的插件在新电脑重新安装并登录；项目目录在新电脑重新添加和确认。

```powershell
# 在本仓库根目录执行。支持自定义 CODEX_HOME。
$codexTarget = if ($env:CODEX_HOME) {
    $env:CODEX_HOME
} else {
    Join-Path $env:USERPROFILE '.codex'
}
$backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
New-Item -ItemType Directory -Path $codexTarget -Force | Out-Null

foreach ($fileName in @('AGENTS.md', 'config.toml')) {
    $existingFile = Join-Path $codexTarget $fileName
    if (Test-Path -LiteralPath $existingFile) {
        Copy-Item -LiteralPath $existingFile -Destination "$existingFile.backup-$backupStamp"
    }
}

Copy-Item -LiteralPath '.\codex\AGENTS.md' -Destination (Join-Path $codexTarget 'AGENTS.md')
$skillDestination = Join-Path $codexTarget 'skills\dhr-local-dock'
if (Test-Path -LiteralPath $skillDestination) {
    throw "技能目录已存在：$skillDestination。请先备份并比较，再手动合并技能文件。"
}
New-Item -ItemType Directory -Path (Join-Path $codexTarget 'skills') -Force | Out-Null
Copy-Item -LiteralPath '.\codex\skills\dhr-local-dock' `
    -Destination $skillDestination -Recurse

# 原机器还通过 .agents/skills 暴露同一技能；在目标机器重建目录联接。
$agentsSkills = Join-Path $env:USERPROFILE '.agents\skills'
New-Item -ItemType Directory -Path $agentsSkills -Force | Out-Null
$skillLink = Join-Path $agentsSkills 'dhr-local-dock'
if (Test-Path -LiteralPath $skillLink) {
    Write-Warning "技能发现入口已存在，请检查它是否指向 $skillDestination；本命令不会覆盖它。"
} else {
    New-Item -ItemType Junction -Path $skillLink -Target $skillDestination | Out-Null
}
```

如果目标机器已有自己的全局规则，复制前先比较并合并 `AGENTS.md`。如果存在 `AGENTS.override.md`，它会优先于 `AGENTS.md`，需要自行检查其内容。

## DHR 技能依赖

技能默认使用 `D:/Repository/gct/dhr-dev-tools` 下的 Local Dock。目标电脑需要另外准备该软件及其依赖；路径不同时，使用技能支持的 `--tool-dir` 参数指定。技能内的业务仓库地址和默认工具路径属于工作流配置，未包含任何业务登录凭据。

## 后续更新

修改个人规则或技能后，将对应文件更新到本仓库，再提交和推送。更新 `config.toml` 时只迁移个人偏好，不复制本机路径、认证信息和运行时内容。两台设备各自维护安装、登录、项目路径和内部数据库。

官方参考：[配置文件](https://learn.chatgpt.com/docs/config-file/config-basic)、[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)。
