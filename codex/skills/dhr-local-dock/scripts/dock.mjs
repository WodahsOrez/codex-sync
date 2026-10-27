import { execFileSync } from "node:child_process";
import { readFile, realpath, access } from "node:fs/promises";
import { basename, join, resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const targetRemote = "git.gct-china.com/paas/frontend/gct-dhr-kit";
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
export function remoteKey(value) {
  try {
    const url = new URL(
      value.includes("://")
        ? value
        : "ssh://" + value.replace(/^([^@]+@)?([^:]+):/, "$1$2/"),
    );
    return (
      url.hostname.toLowerCase() +
      url.pathname.replace(/\/$/, "").replace(/\.git$/, "")
    );
  } catch {
    return "";
  }
}
export async function pathKey(path) {
  const canonical = await realpath(path);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}
export async function workspace(cwd) {
  const git = (args) =>
    execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const root = await realpath(git(["rev-parse", "--show-toplevel"]));
  const remotes = git(["remote"]).split(/\r?\n/).filter(Boolean);
  if (
    !remotes.some(
      (name) => remoteKey(git(["remote", "get-url", name])) === targetRemote,
    )
  )
    fail(
      "wrong_repository",
      "当前 Git 根目录不是目标 gct-dhr-kit 仓库，不登记或启动。",
    );
  return root;
}
function managerUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    fail("invalid_manager", "管理入口仅支持本机 HTTP origin。");
  return url.origin;
}
export function client(origin) {
  origin = managerUrl(origin);
  let token;
  async function request(path, body, revision) {
    let response;
    try {
      response = await fetch(origin + path, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        headers:
          body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                Origin: origin,
                "X-Dev-Session": token,
                ...(revision ? { "If-Match": revision } : {}),
              },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(body === undefined ? 5000 : 45000),
      });
    } catch (error) {
      const codes = [];
      function collect(value) {
        if (!value) return;
        if (value.code) codes.push(value.code);
        collect(value.cause);
        for (const child of value.errors || []) collect(child);
      }
      collect(error);
      if (
        codes.some((code) =>
          ["EACCES", "EPERM", "ERR_NETWORK_ACCESS_DENIED"].includes(code),
        )
      )
        fail(
          "execution_permission_blocked",
          "执行环境阻止访问管理接口；按环境权限重试，不启动第二个软件实例。",
        );
      if (body !== undefined)
        fail(
          "operation_result_unknown",
          "操作响应未取得；先 inspect 确认状态，不盲目重试。",
        );
      fail(
        codes.includes("ECONNREFUSED")
          ? "manager_unavailable"
          : "manager_unreachable",
        codes.includes("ECONNREFUSED")
          ? "管理端口拒绝连接；检查软件是否运行。"
          : "管理接口连接或响应异常；先检查权限、端口和活动实例，不重复启动。",
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      fail("invalid_manager", "管理接口返回的不是 JSON；不启动第二个实例。");
    }
    if (!response.ok) {
      const error = new Error(
        data.error || "管理接口请求失败：" + response.status,
      );
      error.code =
        /配置已被其他页面修改/.test(error.message) ||
        [409, 412].includes(response.status)
          ? "config_conflict"
          : "management_error";
      throw error;
    }
    return data;
  }
  return {
    origin,
    async state() {
      const state = await request("/api/state");
      if (
        !state?.config ||
        !Array.isArray(state.config.repositories) ||
        !Array.isArray(state.config.environments) ||
        !Array.isArray(state.services) ||
        !Array.isArray(state.proxies) ||
        typeof state.revision !== "string"
      )
        fail("invalid_manager", "管理状态结构不匹配 Local Dock。");
      if (state.bootError) fail("configuration_error", state.bootError);
      return state;
    },
    async post(path, body, revision) {
      token ??= (await request("/api/session")).token;
      if (!token) fail("management_error", "未取得管理会话。");
      return request(path, body, revision);
    },
  };
}
async function findRepository(state, root) {
  const key = await pathKey(root),
    matches = [];
  for (const repo of state.config.repositories) {
    try {
      if ((await pathKey(repo.path)) === key) matches.push(repo);
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
    }
  }
  if (matches.length > 1)
    fail(
      "ambiguous_repository",
      "多个配置指向同一实际目录；先消除歧义，不自动选择。",
    );
  return matches[0];
}
function environment(state, repo, requested) {
  const names = repo
    ? repo.environments
    : state.config.environments.map((e) => e.name);
  const name = requested || (names.includes("dev") ? "dev" : names[0]);
  const env = state.config.environments.find((e) => e.name === name);
  if (!env || !names.includes(name))
    fail("environment_unavailable", "当前仓库未启用请求环境：" + name);
  return env;
}
function serviceConfig(repo, names) {
  return names.map((name) => {
    const service = repo.services.find((s) => s.id === name);
    if (!service) fail("service_missing", "仓库未配置服务：" + name);
    return service;
  });
}
function summary(state, repo, root, env, names, actions) {
  const services = repo
    ? names.map((service) => {
        const current = state.services.find(
          (s) => s.repo === repo.id && s.service === service,
        );
        return {
          service,
          status: current?.status || "stopped",
          port: repo.services.find((s) => s.id === service)?.port,
          error: current?.error || "",
        };
      })
    : [];
  const proxy = repo ? state.proxies.find((p) => p.id === repo.id) : undefined;
  return {
    workspace: root,
    repository: repo ? { id: repo.id, path: repo.path, name: repo.name } : null,
    registered: !!repo,
    environment: env.name,
    requestedServices: services,
    proxy: proxy || null,
    ready: !!proxy && services.every((s) => s.status === "running"),
    actions,
    entries: repo
      ? state.config.environments
          .filter((e) => repo.environments.includes(e.name))
          .map((e) => ({
            environment: e.name,
            origin: `http://${e.name}.localhost:${repo.proxyPort}`,
            url: `http://${e.name}.localhost:${repo.proxyPort}${e.entry}`,
          }))
      : [],
    revision: state.revision,
  };
}
export async function operate({
  cwd = process.cwd(),
  origin,
  ensure = false,
  services = ["web"],
  env,
  checkDependencies = true,
}) {
  const root = await workspace(cwd),
    api = client(origin),
    actions = [];
  let state = await api.state(),
    repo = await findRepository(state, root);
  environment(state, repo, env);
  if (ensure && !repo) {
    for (let attempt = 0; attempt < 3; attempt++) {
      state = await api.state();
      repo = await findRepository(state, root);
      if (repo) break;
      const id =
        "dock-" +
        createHash("sha256")
          .update(await pathKey(root))
          .digest("hex")
          .slice(0, 12);
      if (state.config.repositories.some((r) => r.id === id))
        fail("id_conflict", "目标 ID 已被另一目录使用。");
      try {
        const { repository: draft } = await api.post(
          "/api/templates",
          { preset: "edhr", path: root, id },
          state.revision,
        );
        draft.name = basename(root);
        draft.path = root;
        draft.environments = state.config.environments.map((e) => e.name);
        serviceConfig(draft, services);
        draft.proxyPort = 0;
        draft.services.forEach((s) => (s.port = 0));
        const next = structuredClone(state.config);
        next.repositories.push(draft);
        state = await api.post("/api/config", { config: next }, state.revision);
        repo = await findRepository(state, root);
        actions.push("registered");
        break;
      } catch (error) {
        if (error.code !== "config_conflict" || attempt === 2) throw error;
      }
    }
  }
  const selectedEnv = environment(state, repo, env);
  if (repo) serviceConfig(repo, services);
  if (ensure) {
    if (!repo) fail("registration_failed", "目录登记未完成。");
    for (const service of serviceConfig(repo, services)) {
      const dir = await realpath(resolve(root, service.cwd));
      const rel = relative(await realpath(root), dir);
      if (
        rel === ".." ||
        rel.startsWith(".." + (process.platform === "win32" ? "\\" : "/")) ||
        isAbsolute(rel)
      )
        fail(
          "service_directory_mismatch",
          "服务工作目录不在当前 checkout 内，不能用于独立验收：" + service.id,
        );
      let current = state.services.find(
        (s) => s.repo === repo.id && s.service === service.id,
      );
      const deadline = Date.now() + 45000;
      while (
        ["starting", "stopping"].includes(current?.status) &&
        Date.now() < deadline
      ) {
        await wait(250);
        state = await api.state();
        current = state.services.find(
          (s) => s.repo === repo.id && s.service === service.id,
        );
      }
      if (["starting", "stopping"].includes(current?.status))
        fail("service_busy", "服务仍在启停中，不重复发起操作：" + service.id);
      if (
        current?.status === "running" &&
        state.proxies.some((p) => p.id === repo.id)
      ) {
        actions.push("reused:" + service.id);
        continue;
      }
      if (checkDependencies && current?.status !== "running") {
        await access(join(root, "package.json"));
        await access(dir);
        if (service.kind === "vite") {
          try {
            createRequire(join(dir, "package.json")).resolve("vite");
          } catch {
            fail(
              "dependencies_missing",
              "当前工作目录的服务无法解析 Vite，先准备该目录依赖：" +
                service.id,
            );
          }
        }
      }
      state = await api.post(
        `/api/repositories/${repo.id}/start`,
        { service: service.id },
        state.revision,
      );
      current = state.services.find(
        (s) => s.repo === repo.id && s.service === service.id,
      );
      if (current?.status !== "running")
        fail("service_not_ready", "服务启动后尚未就绪：" + service.id);
      actions.push("started:" + service.id);
    }
    state = await api.state();
    repo = await findRepository(state, root);
  }
  return summary(state, repo, root, selectedEnv, services, actions);
}
async function main() {
  const [mode = "inspect", ...args] = process.argv.slice(2);
  if (!["inspect", "ensure"].includes(mode))
    fail(
      "usage",
      "用法：dock.mjs inspect|ensure [--cwd DIR] [--services web,design] [--env NAME] [--tool-dir DIR] [--manager ORIGIN]",
    );
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (
      !["--cwd", "--services", "--env", "--tool-dir", "--manager"].includes(
        key,
      ) ||
      !args[i + 1]
    )
      fail("usage", "未知参数或缺少值：" + key);
    options[key.slice(2)] = args[i + 1];
  }
  const toolDir = resolve(
    options["tool-dir"] || "D:/Repository/gct/dhr-dev-tools",
  );
  let origin = options.manager;
  if (!origin) {
    let config;
    try {
      config = JSON.parse(
        await readFile(join(toolDir, "config/dev-proxy.json"), "utf8"),
      );
    } catch {
      fail(
        "tool_configuration_error",
        "无法读取软件配置，先检查文件；不要覆盖现有文件。",
      );
    }
    if (
      !Number.isInteger(config.appPort) ||
      config.appPort < 1024 ||
      config.appPort > 65535
    )
      fail("tool_configuration_error", "管理端口无效。");
    origin = "http://localhost:" + config.appPort;
  }
  const services = [
    ...new Set((options.services || "web").split(",").filter(Boolean)),
  ];
  if (
    !services.length ||
    services.some((s) => !["web", "design", "print-ssr"].includes(s))
  )
    fail("usage", "服务应为 web、design、print-ssr 的逗号列表。");
  const result = await operate({
    cwd: options.cwd || process.cwd(),
    origin,
    ensure: mode === "ensure",
    services,
    env: options.env,
  });
  console.log(
    JSON.stringify(
      { ...result, managerOrigin: managerUrl(origin), toolDir },
      null,
      2,
    ),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(
      JSON.stringify({
        error: error.code || "operation_failed",
        message: error.message,
      }),
    );
    process.exitCode = 1;
  });
