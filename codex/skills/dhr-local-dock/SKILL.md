---
name: dhr-local-dock
description: "修改、启动、调试或浏览器验收 gct-dhr-kit / eDHR 业务仓库（如 dhr-dev、dhr-test）及其分叉 worktree 时，通过 Local Dock 按当前目录复用已有服务或启动隔离服务。适用于来自 git.gct-china.com/paas/frontend/gct-dhr-kit 的 checkout；不用于 Local Dock 软件本身或纯文档任务。"
---

# DHR 本地代理调试

这是用户的个人启动偏好：运行 DHR 业务页面时使用独立软件 Local Dock，替代业务仓库文档里的 nginx:run、nginx:run:multi、直接 pnpm dev 和固定 9090。保留业务仓库的类型检查、lint、构建约定。本技能仅改变本地启动和浏览器调试方式；用户本次明确指定另一方式时遵循用户。

## 识别工作目录

- 当前任务需要运行、复现或浏览器验收时使用；纯文档、解释及可静态完成的修改不自动起服务。
- 取**当前聊天实际 cwd 的 Git 根目录**，检查 Git remote 确认为目标仓库。HTTPS/SSH 与 .git 后缀不同也可识别；不要仅看目录名称。
- worktree 的 .git 可以是文件。不要用 git common-dir、主 checkout 或同名分支代替当前目录，也不要切换分支来复用服务。
- 对目录 realpath 规范化后精确匹配 Local Dock 的 repository.path；Windows 比较忽略大小写。相同 remote 或分支不能证明服务使用的是当前目录。

## 复用或启动

脚本路径相对**本 SKILL.md 所在目录**，不是业务 cwd：

```text
node <技能目录>/scripts/dock.mjs inspect --cwd <当前工作目录>
node <技能目录>/scripts/dock.mjs ensure --cwd <当前工作目录> --services web --env dev
```

inspect 只读；ensure 在管理软件中追加未登记的当前目录，启动所需的缺失服务，并复用 running 服务。脚本不提供 stop/restart/reallocate。

1. 按修改范围选择服务：运行时/共享业务模块通常 web；设计器通常 design；打印用 print-ssr，必要时加 web。用 --services web,design 等逗号列表，不无条件启动全部服务。
2. 环境优先用户指定，其次既有业务 URL；没有指定时由当前配置选择 dev 或第一个启用环境。后台环境与 checkout 分支独立。软件位置默认 D:/Repository/gct/dhr-dev-tools，可传 --tool-dir；管理端口从其 config/dev-proxy.json 读取。--manager 可指定已确认的其他回环 HTTP origin。
3. inspect 找到当前目录已就绪时复用；缺服务时 ensure。新 worktree 使用 eDHR 模板、新 ID、自己的自动端口和 Vite 缓存。登记当前目录是用户在此技能中选择的默认流程；不能改其他仓库、后台地址或已有规则。
4. manager_unavailable 时按 [管理软件未运行](references/workflow.md#管理软件未运行) 在软件目录启动 Node 执行层，确认健康后重试。execution_permission_blocked 时按执行环境要求申请权限后重试；manager_unreachable、其他 API/配置错误不能当成“未运行”而重复起软件，更不能退回业务 Nginx。
5. Local Dock 启动优先使用配置端口，管理、代理及待启动服务端口占用时会自动随机避让并保存；重新读取结果中的实际端口和 entries，不沿用旧 URL，也不额外调用 reallocate 改动整仓端口。管理软件启动后重新读取 appPort，不能一直探测旧的 17890。依赖缺失、持续端口冲突或服务失败时查看目标日志；不杀占用进程、不在主 checkout 安装依赖来冒充 worktree 可用。配置版本冲突重新读取并仅追加当前目录，最多三次；启动响应不明先 inspect，不能盲目重试。
6. 输出 repository.path 必须对应当前 cwd，requestedServices 应全部 running，proxy 应活动。ready 仅表示进程/代理就绪，不代表业务验收完成。从 entries 取真实环境域名和仓库代理端口；禁止用主 checkout 的入口验收 worktree 修改。

## 浏览器验证

- 用任务专用 Chrome 窗口和可用 CDP/浏览器工具，遵守全局浏览器约定；不操作用户原有标签页。检查 Console、Network、DOM 与需求相关的真实交互。
- 有业务 URL 时，仅替换 origin 为当前仓库对应环境入口，保留路径、分号参数、查询和 fragment；不转换 prod/test 参数或业务 ID。不能打开远端后台来证明本地源码正确，也不能把管理页当业务页。缺必要的业务入口时继续静态核对，再请求 URL。
- 用户在可见页面自行登录/输入验证码。不同端口可分别登录，worktree 不复制主仓库认证存储。不执行未经授权的真实业务保存、审批、签名等状态变更。
- 检查插件 loader 命中本地重写，资源来自当前目录，并结合本次实际修改观察更新及相关 HMR WebSocket。模板排除名称含 test 的**套件** loader，与 test.localhost 环境不是一回事。
- 普通窗口旧内容、无痕正常时检查强制刷新、Network 缓存、Service Worker 及宿主模块缓存，不清空用户登录数据；见 [加载链路与排错](references/workflow.md#加载链路与排错)。HTTP 200 不能代替行为验收。

## 保护已有状态

- 通过管理 API 和 If-Match 追加当前目录，保留最新配置其他值，不直接覆写用户配置/备份。不要改业务 package.json、Vite 或 env 文件来适配代理。
- 不停止/重启管理软件，不操作其他仓库或批量结束 node/nginx。复用的服务任务结束后保留；本次启动的服务也默认保留，告知入口。如需停止只操作确有权限的目标服务，不因聊天结束自动停止整个仓库。
- 用户未来归档/删除 worktree 时提醒先处理该目录服务；没有该请求不清理 worktree、配置条目或目录。
- 报告当前根目录、复用/新启动的服务、真实入口、浏览器结果及缺口。权限或工具阻塞时仍可继续静态工作，不谎称行为验收完成。

API 或启动排错时再读 [references/workflow.md](references/workflow.md)。
