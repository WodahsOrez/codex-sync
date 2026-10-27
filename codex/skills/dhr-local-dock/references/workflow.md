# Local Dock 运行细节

## 管理软件未运行

软件默认 D:/Repository/gct/dhr-dev-tools，可 --tool-dir 指定。先读其 AGENTS.md、package.json、config/dev-proxy.json，仅从配置读取 appPort，不输出完整个人配置或环境变量。

- 无法连接时才考虑启动。未知响应结构、401/403、损坏配置等不是端口空闲的证据。
- 确认软件及依赖存在；.runtime/instance.json 只提示可能有活动实例，不能据旧 PID 杀进程或删除运行目录。已有软件在运行就复用。
- 在**软件目录**用 exec_command 执行 `node server/main.mjs --dev` 或 npm run dev，短 yield_time_ms 保留后台会话并收集日志；不能运行阻塞长命令导致后续无法访问 API。
- 配置确实不存在时，才以 COPYFILE_EXCL 从软件 dev-proxy.example.json 复制；损坏或已有文件不覆盖。缺依赖时解决软件安装，不重装正在运行的软件。
- 最多等 30 秒，重新从配置读取实际 appPort 后访问 /api/state；管理端口占用时软件会自动换到随机可用端口并保存，不固定探测旧 17890。结构正确且无 bootError 才继续。失败查看日志，不循环起多个管理实例。
- 本技能不跨主机执行：远程工作区需要同主机的 Local Dock 和目录；不把本机目录传到远程，不暴露接口到公网。

## 接口与版本

GET /api/state 返回 config、revision、services、proxies、bootError。GET /api/session 返回 token；只在进程内使用，不输出/持久化。POST 需要同 origin 的 Origin、X-Dev-Session 和 If-Match。

| 接口                        | 请求体与作用                                               |
| --------------------------- | ---------------------------------------------------------- |
| /api/templates              | {preset:"edhr",path:当前根目录,id:新ID}，只返回草稿        |
| /api/config                 | {config:最新配置追加草稿}，保存并分配 0 值端口             |
| /api/repositories/:id/start | {service:"web"}，启动目标服务及其仓库代理                  |
| /api/repositories/:id/stop  | {service:"web"}，只停目标服务；{} 会停止整个目标仓库及代理 |

当前版本冲突为 400 + “配置已被其他页面修改”，未来也可能 409/412。重新读最新配置，精确按目录匹配；其他聊天已经登记时复用，不用旧快照覆盖。最多三次配置尝试，其他错误停止。启动响应不明先查询当前状态，不重复发起。

## 加载链路与排错

- 一个 checkout/worktree 一个仓库代理端口；环境.localhost 选后台。本地服务内部端口不能作为宿主业务入口。
- 启动优先配置端口；遇到占用由管理软件自动随机避让并保存。启动后使用响应中的实际入口，保留其他运行中仓库的端口，不额外调用整仓 reallocate；代理端口变更需要改用新入口。
- web loader 通常 /plugin-kit/套件/web/loader.esm.min.js → /plugin-render-web/src/index.ts；design → /plugin-design/src/index.ts。本地服务未 running 或规则不匹配可回退远端。
- 套件名含 test 的 loader 被模板排除。检查真实请求，不为方便自动取消用户规则。
- Vite 受控模式加载当前仓库自己的 Vite 配置，覆盖端口、strictPort、HMR，并不是运行 package.json dev/predev。若必须额外准备步骤，辨明要求后处理，不能偷偷起第二套服务绕过管理。
- 新代理禁用 HTTP 缓存，但旧浏览器缓存、Service Worker、已加载模块和宿主内存仍需检查；不为此自动重启管理软件或清空认证存储。
- worktree 需具备可运行依赖，不自动指向主 checkout 的源码/缓存。可在该 worktree 按任务授权及其安装约定准备依赖，网络操作仍服从执行环境权限。
- helper inspect 为只读；技能本身的验收应使用隔离实例、模拟仓库与临时配置，不用真实个人配置“暂改再恢复”。
