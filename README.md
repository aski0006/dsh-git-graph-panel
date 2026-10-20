# dsh-git-graph-panel

给 **DSH Web** 的右侧栏启动页加一张 **Git Graph** 卡片：一眼看出当前项目是不是 Git
仓库；是的话，直接把提交图画出来（泳道、合并分叉、分支/标签胶囊、脏文件计数）。

`DSH >= 0.2.1-rc.2` · `React ^18.2` · 零运行时依赖 · 图是手写 SVG，不引入绘图库

## 界面

打开后是一张普通标签页，顶栏一行状态，下面是提交列表：

```
 Git Graph                    ● master   3 个改动未提交   12 个提交   ⟳
 ─────────────────────────────────────────────────────────────────────────
 ●            Merge branch 'feature'   master v1.0    23484c0 · Asaki · 1 分钟前
 ●─┐          feat: 分支上的提交        feature        a8b772e · Asaki · 3 分钟前
 │ ●          fix: 主线的提交                          8f21c0d · Asaki · 5 分钟前
 ●─┘
```

- 左栏是画出来的泳道：每个提交一个圆点，同一分支保持在同一列，合并提交向右支出新列，
  合并边按父提交序号从曲线接到子提交；父提交不在本次窗口里时画虚线连到行边。
- 每行右侧是"短 SHA · 作者 · 相对时间"，点 SHA 直接复制完整提交号。
- 分支/标签/`HEAD` 显示为胶囊，当前分支高亮；`HEAD` 与分支重合时合并成一个胶囊。
- 顶部状态条：当前分支、改动文件数、冲突数、提交数；超过上限时提示"仅显示最近 N 条"。
- 中英文随 DSH 的 locale 切换，颜色全部走 `--dsw-alias-*` 主题令牌，深浅色主题都不用另配。

## 安装

`dsh plugin` 只是把参数转给 profile 目录里的 pnpm，所以本地目录用 `link:` 装进去：

```bash
dsh plugin add --profile desktop "link:<本仓库绝对路径>"
```

也可以在 DSH 的插件管理界面里安装/启用本地包。插件本体就是一个 DSH bundle，
`cordis.patch.yml` 只做一件事——插一行：

```yaml
- insert:
    - id: git-graph-panel
      name: 'dsh-git-graph-panel'
```

**安装完要重启 DSH**（host 半端只在启动时加载），之后右侧栏启动页（Start）里就会出现
**Git Graph** 卡片。

## 使用

右侧栏 → 启动页 → 点 **Git Graph** 卡片，右栏开一个独立标签页。

标签页用**当前会话的项目目录**（`sessions` 快照里的 `cwd`）作为仓库起点；没有会话目录时
回落到第一个 workspace。目录不是仓库、没装 `git`、仓库还是空的、`HEAD` 未出生，都会给
出各自的空状态和一句怎么修。

## 工作原理

插件分两半，浏览器半端不碰 `git`，host 半端不碰 UI：

| 文件 | 运行位置 | 职责 |
| --- | --- | --- |
| `lib/index.js` | host（Node，ESM） | 注册路由；按目录跑 `git`；解析 `log` / `for-each-ref` / `status`；返回一份仓库视图 |
| `lib/client.js` | 浏览器 | 注册标签页类型、启动页卡片、正文与标题三个插槽；把提交数据排成泳道并画 SVG |

数据流：`GitGraphBody` 取 `sessionId → cwd` → `GET git-graph-panel/data?path=…` →
host 跑 `git`（`rev-parse` 四次、`log`、`for-each-ref`、`status`）→ 一份 JSON →
客户端排泳道、画图。

### 路由

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/git-graph-panel/data` | `GET` / `POST` | 仓库视图。目录从 `?path=` 查询串或 `{ path }` 请求体取，都没有就用第一个 workspace |
| `/git-graph-panel/reload` | `POST` | 从磁盘重读本包的浏览器 bundle 并刷新它的 revision（之后刷新窗口即可看到改动） |

两条路由都只接受回环地址的请求，其余一律 `403 { ok: false, error: "forbidden" }`；
读失败不会抛异常，而是 `{ ok: false, isRepo: false, reason, detail }`，`reason` 取
`not-repo` / `no-workspace` / `git-missing` / `git-error`。

### 数据形状

```jsonc
{
  "ok": true,
  "dir": "D:/test/test-git",
  "isRepo": true,
  "root": "D:/test/test-git",
  "branch": "master",
  "detached": false,
  "head": "23484c0",
  "empty": false,
  "dirty": 1,
  "conflicts": 0,
  "branches": [{ "name": "master", "current": true, "sha": "23484c0…" }],
  "commits": [
    { "sha": "23484c0…", "short": "23484c0", "subject": "Merge branch 'feature'",
      "author": "Asaki", "time": 1761000000, "parents": ["…", "…"],
      "refs": [{ "name": "master", "kind": "head" }, { "name": "v1.0", "kind": "tag" }] }
  ],
  "truncated": false,
  "limit": 120
}
```

`git log` 用 `\x1f` / `\x1e` 当字段与记录分隔符（控制字符不会被 commit message 干扰），
窗口上限 120 条、单条命令输出上限 1 MiB。

### 为什么自己画

`git log --graph` 的 ASCII 图在等宽字体里能用，但塞进面板会散架：列宽随字符走、
合并线只有 `|/\\` 三种笔画、颜色只有终端 16 色。手写 SVG 换来的是一屏固定的
14px 泳道、可以着色的分支线、能点能选的提交行，也不需要为一个只画直线的图去背一个
绘图库的体积。

## 目录结构

```
dsh-git-graph-panel/
├── lib/
│   ├── index.js        # host：git 读取 + 路由
│   └── client.js       # 浏览器：标签页 / 插槽 / 泳道 / SVG
├── cordis.patch.yml    # bundle 装配
├── icon.svg
└── test/
    ├── run.mjs         # 跑全部套件
    ├── test-parsers.mjs
    ├── test-graph.mjs
    ├── test-render.mjs
    ├── live-render.mjs
    ├── test-host.mjs
    └── log.txt / branches.txt / status.txt   # 真实 git 输出固定成夹具
```

## 开发

```bash
npm test                    # 全部套件
node test/live-render.mjs   # 只跑"真渲染"
```

- `test-parsers.mjs`：用固定夹具跑 `git log` / `for-each-ref` / `status` 解析器
  （含重叠 ref、合并提交双父、超过 120 条的截断）。
- `test-graph.mjs`：泳道算法——线性历史同列、合并行出列、父提交不在窗口内落到 -1。
- `test-render.mjs`：在最小 React 运行时里加载**真实 bundle**，断言注册了一个标签页类型、
  三个插槽、点卡片会 `openTab('git-graph', { replaceTab: true })`。
- `live-render.mjs`：更狠一层，用假 `fetch` 喂一份录好的真实 payload，把整棵组件树渲染成
  文本，断言 9 个圆点、8 段路径、分支/标签胶囊与提交标题都在。
- `test-host.mjs`：假 `webServer` + 假 `subprocess` 接缝，跑通整条 host 读路径，并覆盖
  POST 传目录、非回环地址 403、目录不存在、未知子路径 404、`/reload` 有/无 registry 两种情形。

客户端改动不必重启应用：`curl -X POST http://127.0.0.1:<port>/git-graph-panel/reload`，
再刷新窗口即可看到新 bundle；**host 改动仍需重启 DSH**（host 插件只在启动时加载）。

手工验证数据接口：

```bash
curl "http://127.0.0.1:<port>/git-graph-panel/data?path=D%3A%2Ftest%2Ftest-git"
```

> 开发坑：在 DSH 的 bash 沙箱里执行 `git merge` 会因 `cannot create standard output pipe
> for stash: Permission denied` 失败，造"带合并提交"的夹具仓库请用 plumbing：
> `git commit-tree <tree> -p <a> -p <b> -m "merge"` 再 `git update-ref`。

## 已知限制

- **只读**：不提供 checkout / stage / commit / push，任何写操作请用终端。
- 单仓库：只画当前项目目录所在的仓库，不处理子模块和多仓库工作区。
- 提交窗口 120 条；更长的历史只显示最近的一段（会有"仅显示最近 N 条"提示）。
- 泳道数没有上限，历史非常"开花"的项目左侧图形区会变宽，挤压提交标题。
- 只解析默认的 `git log` 输出，不跟随 reflog / stash。

## 许可

源码公开，但**不是开源项目**：本项目使用
[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)
（见 `LICENSE`）。

- 可以：个人使用、学习研究、 hobby 项目、慈善/教育/公共机构使用，以及在这些范围内的
  修改与分发（分发时要带上本许可证或它的链接）。
- 不可以：任何商业用途。公司内部使用、打包进商业产品、对外提供付费服务，都算商业用途。
- 商用授权请联系作者（GitHub [@aski0006](https://github.com/aski0006)）。

## English

A DSH web plugin that adds a **Git Graph** card to the right sidebar's Start tab.
It resolves the session's project directory, asks the host half whether that
directory is a Git repository, and — when it is — draws the commit graph (lanes,
merge edges, branch/tag chips, dirty and conflict counts) as hand-written SVG, so
the plugin ships with no drawing dependency.

Install with `dsh plugin add --profile <name> "link:<this directory>"` and restart DSH. The host half
exposes `GET|POST /git-graph-panel/data` (loopback only) and runs `git` through
the harness `subprocess` seam when it is available. `npm test` covers the parsers,
the lane layout, tab/seat registration, a full render pass and the host route.
