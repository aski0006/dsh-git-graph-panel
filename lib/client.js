/**
 * dsh-git-graph-panel — browser half.
 *
 * Contributes one tab type (`git-graph`) to the right sidebar: a Start-tab
 * guide card that opens it, a title, and a body that draws the current
 * project's commit graph.
 *
 * All git facts arrive from this package's host route
 * (`POST /git-graph-panel/data`); the browser never runs git. The
 * graph itself is drawn here — no charting dependency — as lanes of SVG
 * edges plus HTML rows.
 *
 * @module dsh-git-graph-panel/client
 */

window.__ModuleLoader__.load({
	id: "dsh-git-graph-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		/** Classic element factory: children stay variadic so lists need no key warnings. */
		const h = react.createElement;

		/** Dictionary namespace owned by this plugin. */
		const NS = "gitGraph";
		/** The tab kind registered with the sidebar. */
		const KIND = "git-graph";
		/** The tab type id (also the slot key). */
		const ID = "dsh-git-graph-panel";
		/**
		 * The host route that answers repository questions.
		 *
		 * Document-relative on purpose: the shell serves the GUI with `<base href="./">`,
		 * so a root-absolute path escapes a sub-path deployment and never reaches the
		 * host route (the same trap the shipped git-graph plugin documents).
		 */
		const ENDPOINT = "git-graph-panel/data";

		//#region copy
		/** Simplified Chinese copy. */
		const zh = {
			title: "Git Graph",
			new: "Git Graph",
			description: "查看当前项目的提交图",
			loading: "正在读取仓库…",
			refreshing: "刷新中…",
			refresh: "刷新",
			retry: "重试",
			notRepo: "当前项目不是 Git 仓库",
			notRepoHint: "在项目目录执行 git init 后即可看到提交图。",
			gitMissing: "未找到 git 可执行文件",
			gitMissingHint: "请先安装 Git，并确保它在 PATH 中。",
			gitError: "读取仓库失败",
			hostOffline: "插件主进程没有响应",
			hostOfflineHint: "Host 端没有注册数据接口，重启应用后重试。",
			noWorkspace: "没有可用的工作区目录",
			emptyRepo: "仓库还没有任何提交",
			emptyRepoHint: "提交一次后这里会显示提交图。",
			detached: "分离头指针",
			dirty: "{count} 个改动未提交",
			clean: "工作区干净",
			conflicts: "{count} 个冲突",
			commits: "{count} 个提交",
			truncated: "仅显示最近 {count} 个",
			branch: "分支",
			root: "仓库根目录",
			copySha: "复制提交号",
			copied: "已复制",
			noSession: "打开一个会话以确定项目目录",
			notLoadedParent: "父提交不在当前显示范围内"
		};
		/** English copy. */
		const en = {
			title: "Git Graph",
			new: "Git Graph",
			description: "Commit graph of the current project",
			loading: "Reading repository…",
			refreshing: "Refreshing…",
			refresh: "Refresh",
			retry: "Retry",
			notRepo: "This project is not a Git repository",
			notRepoHint: "Run git init in the project directory to see a commit graph.",
			gitMissing: "The git executable was not found",
			gitMissingHint: "Install Git and make sure it is on PATH.",
			gitError: "Could not read the repository",
			hostOffline: "The host half did not answer",
			hostOfflineHint: "The data route is not registered; restart the app and try again.",
			noWorkspace: "No workspace directory is available",
			emptyRepo: "This repository has no commits yet",
			emptyRepoHint: "The graph appears after the first commit.",
			detached: "Detached HEAD",
			dirty: "{count} uncommitted changes",
			clean: "Working tree clean",
			conflicts: "{count} conflicts",
			commits: "{count} commits",
			truncated: "Showing the latest {count}",
			branch: "Branch",
			root: "Repository root",
			copySha: "Copy commit id",
			copied: "Copied",
			noSession: "Open a session to pick the project directory",
			notLoadedParent: "Parent commit outside the shown range"
		};
		//#endregion

		//#region styles
		/** Namespaced classes shared by the card, title and body. */
		const css = [
			".gg-entry{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));border-radius:12px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:14px 18px;position:relative;overflow:hidden;text-align:left;color:inherit;font:inherit;cursor:pointer}",
			".gg-entry:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12))}",
			".gg-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4e9af1);outline-offset:-2px}",
			".gg-entry-icon{width:26px;height:26px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,currentColor);opacity:.85}",
			".gg-entry-text{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}",
			".gg-entry-title{color:var(--dsw-alias-label-primary,inherit);font-size:14px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".gg-entry-desc{color:var(--dsw-alias-label-tertiary,currentColor);opacity:.7;font-size:11px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".gg-title{display:flex;align-items:center;gap:6px;min-width:0}",
			".gg-title-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".gg-root{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden}",
			".gg-body{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;color:var(--dsw-alias-label-primary,inherit);font-size:12px}",
			".gg-toolbar{flex:none;display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));min-height:34px}",
			".gg-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:1px 8px;font-size:11px;line-height:18px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.3));white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}",
			".gg-chip-branch{color:var(--dsw-alias-brand-primary,#4e9af1);border-color:currentColor;background:color-mix(in srgb,currentColor 12%,transparent)}",
			".gg-chip-dirty{color:#d98324;border-color:currentColor;background:color-mix(in srgb,currentColor 12%,transparent)}",
			".gg-chip-conflict{color:#e05252;border-color:currentColor;background:color-mix(in srgb,currentColor 12%,transparent)}",
			".gg-chip-clean{color:var(--dsw-alias-label-tertiary,currentColor);opacity:.75}",
			".gg-grow{flex:1;min-width:0}",
			".gg-muted{color:var(--dsw-alias-label-tertiary,currentColor);opacity:.72}",
			".gg-path{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}",
			".gg-button{appearance:none;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.3));background:transparent;color:inherit;font:inherit;font-size:11px;border-radius:6px;padding:3px 8px;cursor:pointer;flex:none}",
			".gg-button:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14))}",
			".gg-scroll{flex:1;min-height:0;overflow:auto;padding-bottom:8px}",
			".gg-canvas{display:flex;align-items:flex-start;min-height:100%}",
			".gg-gutter{position:relative;flex:none}",
			".gg-rows{flex:1;min-width:0;display:flex;flex-direction:column}",
			".gg-row{display:flex;align-items:center;gap:8px;padding:0 10px;box-sizing:border-box;overflow:hidden}",
			".gg-row:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1))}",
			".gg-row-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
			".gg-subject-row{display:flex;align-items:center;gap:6px;min-width:0}",
			".gg-subject{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}",
			".gg-meta{display:flex;align-items:center;gap:6px;min-width:0;font-size:10.5px}",
			".gg-sha{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:10.5px;opacity:.72;border:0;background:transparent;color:inherit;padding:0;cursor:pointer;flex:none}",
			".gg-sha:hover{opacity:1;text-decoration:underline}",
			".gg-ref{display:inline-flex;align-items:center;border-radius:5px;padding:0 5px;font-size:10px;line-height:16px;flex:none;border:.5px solid transparent}",
			".gg-ref-head{background:color-mix(in srgb,#4e9af1 22%,transparent);border-color:#4e9af1;color:#4e9af1}",
			".gg-ref-branch{background:color-mix(in srgb,#27ae60 20%,transparent);border-color:#27ae60;color:#1f8f4f}",
			".gg-ref-remote{background:transparent;border-color:var(--dsw-alias-border-l3,rgba(128,128,128,.4));opacity:.8}",
			".gg-ref-tag{background:color-mix(in srgb,#f2c94c 24%,transparent);border-color:#c9a227;color:#a5841b}",
			".gg-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:32px 24px;text-align:center;height:100%;box-sizing:border-box}",
			".gg-empty-icon{width:40px;height:40px;opacity:.5}",
			".gg-empty-title{font-size:13px}",
			".gg-empty-hint{font-size:11px;max-width:280px;line-height:1.6}",
			".gg-toast{position:absolute;right:10px;bottom:10px;font-size:11px;border-radius:6px;padding:3px 8px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.16));pointer-events:none;transition:opacity .2s;opacity:.9}"
		].join("\n");
		if (typeof document !== "undefined") {
			const tag = document.querySelector('style[data-plugin-css="dsh-git-graph-panel"]');
			if (tag === null) {
				const style = document.createElement("style");
				style.dataset.plugin = "dsh-git-graph-panel";
				style.dataset.pluginCss = "dsh-git-graph-panel";
				style.textContent = css;
				document.head.appendChild(style);
			}
		}
		//#endregion

		//#region geometry
		/** Height of one commit row. */
		const ROW_H = 44;
		/** Horizontal distance between two lanes. */
		const LANE_W = 14;
		/** Left inset of the first lane. */
		const PAD = 12;
		/** Lane colours, cycled by lane index. */
		const PALETTE = [
			"#4e9af1",
			"#f2994a",
			"#27ae60",
			"#bb6bd9",
			"#eb5757",
			"#56ccf2",
			"#f2c94c",
			"#9b51e0"
		];

		/**
		 * Lane colour for one lane index.
		 * @param lane - zero-based lane index.
		 * @returns a stable colour.
		 */
		function colorOf(lane) {
			return PALETTE[((lane % PALETTE.length) + PALETTE.length) % PALETTE.length];
		}

		/**
		 * Assign lanes to a newest-first commit list and derive the edges.
		 *
		 * The algorithm walks the log once: a commit takes the lane already
		 * reserved by a child, or the first free lane; its first parent keeps
		 * that lane and extra merge parents take further free lanes. Edges are
		 * resolved in a second pass from the sha-to-row map, so a parent outside
		 * the loaded window keeps a lane but draws as a dangling edge.
		 * @param commits - newest-first commits with `{ sha, parents }`.
		 * @returns rows, edges, lane count and total height.
		 */
		function computeGraph(commits) {
			/** lane index -> sha still expected in that lane (undefined when free) */
			const lanes = [];
			/** sha -> row index */
			const rowOf = new Map();
			/** per row: { lane, parents: [{ sha, lane }] } */
			const placed = [];

			for (let row = 0; row < commits.length; row += 1) {
				const commit = commits[row];
				let lane = lanes.indexOf(commit.sha);
				if (lane === -1) {
					lane = lanes.indexOf(undefined);
					if (lane === -1) lane = lanes.length;
					lanes[lane] = commit.sha;
				}
				rowOf.set(commit.sha, row);
				const parents = [];
				placed.push({ lane, parents });
				lanes[lane] = undefined;
				for (let index = 0; index < commit.parents.length; index += 1) {
					const sha = commit.parents[index];
					let parentLane = lanes.indexOf(sha);
					if (parentLane === -1) {
						if (index === 0) {
							lanes[lane] = sha;
							parentLane = lane;
						} else {
							let free = lanes.indexOf(undefined);
							if (free === -1 || free === lane) free = lanes.length;
							lanes[free] = sha;
							parentLane = free;
						}
					}
					parents.push({ sha, lane: parentLane });
				}
			}

			const edges = [];
			let laneCount = 0;
			for (let row = 0; row < placed.length; row += 1) {
				const source = placed[row];
				laneCount = Math.max(laneCount, source.lane + 1);
				for (const parent of source.parents) {
					laneCount = Math.max(laneCount, parent.lane + 1);
					const target = rowOf.get(parent.sha);
					edges.push({
						row,
						lane: source.lane,
						toRow: target === undefined ? -1 : target,
						toLane: parent.lane
					});
				}
			}

			return {
				rows: placed.map((entry) => entry.lane),
				edges,
				laneCount: Math.max(laneCount, 1),
				height: Math.max(commits.length, 1) * ROW_H
			};
		}

		/**
		 * Pixel column of one lane.
		 * @param lane - lane index.
		 * @returns the centre x.
		 */
		function laneX(lane) {
			return PAD + lane * LANE_W;
		}

		/**
		 * Pixel row centre of one commit row.
		 * @param row - row index.
		 * @returns the centre y.
		 */
		function rowY(row) {
			return row * ROW_H + ROW_H / 2;
		}

		/**
		 * One SVG path for an edge.
		 * @param edge - a computed edge.
		 * @param height - graph height (for dangling edges).
		 * @returns the `d` attribute.
		 */
		function edgePath(edge, height) {
			const x1 = laneX(edge.lane);
			const y1 = rowY(edge.row);
			if (edge.toRow < 0) {
				return "M" + x1 + " " + y1 + "L" + x1 + " " + (height - 2);
			}
			const x2 = laneX(edge.toLane);
			const y2 = rowY(edge.toRow);
			if (x1 === x2) return "M" + x1 + " " + y1 + "L" + x2 + " " + y2;
			const dy = y2 - y1;
			const upper = y1 + dy * 0.45;
			const lower = y2 - dy * 0.45;
			return (
				"M" + x1 + " " + y1 +
				"C" + x1 + " " + upper + " " + x2 + " " + lower + " " + x2 + " " + y2
			);
		}

		/**
		 * Draw the whole lane canvas for one commit list.
		 * @param props - commits and the graph geometry.
		 * @returns the gutter element holding the SVG.
		 */
		function GraphGutter({ graph, width }) {
			const parts = [];
			for (let index = 0; index < graph.edges.length; index += 1) {
				const edge = graph.edges[index];
				const dangling = edge.toRow < 0;
				parts.push(
					h("path", {
						key: "e" + index,
						d: edgePath(edge, graph.height),
						fill: "none",
						stroke: colorOf(edge.lane),
						strokeWidth: 1.6,
						strokeLinecap: "round",
						strokeDasharray: dangling ? "3 3" : undefined,
						opacity: dangling ? 0.45 : 0.9
					})
				);
			}
			for (let row = 0; row < graph.rows.length; row += 1) {
				const lane = graph.rows[row];
				const x = laneX(lane);
				const y = rowY(row);
				parts.push(
					h("circle", {
						key: "n" + row,
						cx: x,
						cy: y,
						r: 3.6,
						fill: colorOf(lane),
						stroke: "var(--dsw-alias-bg-base,#fff)",
						strokeWidth: 1.4
					})
				);
			}
			return h(
				"div",
				{ className: "gg-gutter", style: { width: width + "px" } },
				h(
					"svg",
					{
						width: width,
						height: graph.height,
						viewBox: "0 0 " + width + " " + graph.height,
						"aria-hidden": "true",
						style: { display: "block" }
					},
					parts
				)
			);
		}

		/**
		 * One ref chip.
		 *
		 * The prop is `entry`, not `ref`: React reserves `ref` for element handles and
		 * drops it from the props object, so a chip fed through `ref` receives nothing.
		 * @param props - the ref entry.
		 * @returns the chip element.
		 */
		function RefChip({ entry }) {
			const cls =
				entry.kind === "head"
					? "gg-ref gg-ref-head"
					: entry.kind === "tag"
						? "gg-ref gg-ref-tag"
						: entry.kind === "remote"
							? "gg-ref gg-ref-remote"
							: "gg-ref gg-ref-branch";
			return h("span", { className: cls, title: entry.name }, entry.name);
		}

		/**
		 * Format an absolute timestamp as a short relative time.
		 * @param at - epoch seconds.
		 * @param when - git's relative text (fallback).
		 * @returns the label.
		 */
		function relativeTime(at, when) {
			if (!at) return when;
			const seconds = Math.round(Date.now() / 1000 - at);
			if (seconds < 60) return "just now";
			const table = [
				[60, "minute", 60],
				[3600, "hour", 3600],
				[86400, "day", 86400],
				[86400 * 30, "month", 86400 * 30],
				[86400 * 365, "year", 86400 * 365]
			];
			let unit = "year";
			let size = 86400 * 365;
			for (let index = 0; index < table.length; index += 1) {
				if (seconds < table[index][0] || index === 0) {
					unit = table[index][1];
					size = table[index][2];
					break;
				}
				unit = table[index][1];
				size = table[index][2];
			}
			const value = Math.max(1, Math.round(seconds / size));
			return value + " " + unit + (value === 1 ? "" : "s") + " ago";
		}
		//#endregion

		//#region data
		/**
		 * Ask the host for one directory's repository view.
		 * @param dir - absolute directory, or undefined for the host default.
		 * @param signal - abort signal.
		 * @returns the parsed view.
		 */
		async function fetchRepo(dir, signal) {
			// GET with the directory in the query string, not POST with a JSON body:
			// the desktop shell forwards the GUI's subresources to the host through a
			// read-only carrier, where a request body is not guaranteed to arrive.
			const query = dir === undefined || dir === "" ? "" : "?path=" + encodeURIComponent(dir);
			const response = await fetch(ENDPOINT + query, { method: "GET", signal });
			if (!response.ok) throw new Error("HTTP " + response.status);
			const payload = await response.json();
			if (payload === null || typeof payload !== "object") throw new Error("malformed response");
			return payload;
		}
		//#endregion

		/**
		 * Resolve the pane copy function.
		 *
		 * The locale seat normally injects `t`; when it does not (an older shell, or a
		 * seat resolved without props) the pane must still print words instead of an
		 * empty box, so fall back to the built-in Simplified Chinese dictionary.
		 * @param t - the injected copy function, if any.
		 * @returns a copy function.
		 */
		function copyOf(t) {
			if (typeof t === "function") return t;
			return (key, params) => {
				const template = zh[key] ?? en[key] ?? key;
				if (params === undefined) return template;
				return template.replace(/{(w+)}/g, (match, name) => params[name] === undefined ? match : String(params[name]));
			};
		}

		//#region components
		/**
		 * The git-branch glyph used by the card, the title and the empty state.
		 * @param props - optional size.
		 * @returns a decorative SVG.
		 */
		function GitGraphIcon({ size }) {
			const dimension = size === undefined ? 16 : size;
			return h(
				"svg",
				{
					width: dimension,
					height: dimension,
					viewBox: "0 0 16 16",
					fill: "none",
					"aria-hidden": "true"
				},
				h("circle", { cx: 4, cy: 3.2, r: 1.7, stroke: "currentColor", strokeWidth: 1.2 }),
				h("circle", { cx: 4, cy: 12.8, r: 1.7, stroke: "currentColor", strokeWidth: 1.2 }),
				h("circle", { cx: 12, cy: 6, r: 1.7, stroke: "currentColor", strokeWidth: 1.2 }),
				h("path", { d: "M4 4.9v6.2", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round" }),
				h("path", {
					d: "M4 7.4c0-1.7 1.4-3 3.2-3H10.3",
					stroke: "currentColor",
					strokeWidth: 1.2,
					strokeLinecap: "round"
				})
			);
		}

		/**
		 * The Start-tab card that opens the graph.
		 * @param props - guide copy, tab actions and the localized `t`.
		 * @returns the clickable card.
		 */
		function GitGraphGuide({ title, description, useTabInfo, t }) {
			const info = typeof useTabInfo === "function" ? useTabInfo() : undefined;
			const open = () => {
				const tab = info === undefined ? undefined : info.tab;
				if (tab !== undefined && tab.actions !== undefined) {
					tab.actions.openTab(KIND, { replaceTab: true });
				}
			};
			return h(
				"button",
				{
					type: "button",
					className: "gg-entry",
					"data-sidebar-right-guide-entry": KIND,
					"aria-label": title === undefined ? t("title") : title,
					onClick: open
				},
				h("span", { className: "gg-entry-icon" }, h(GitGraphIcon, { size: 22 })),
				h(
					"span",
					{ className: "gg-entry-text" },
					h("span", { className: "gg-entry-title" }, title === undefined ? t("title") : title),
					h(
						"span",
						{ className: "gg-entry-desc" },
						description === undefined ? t("description") : description
					)
				)
			);
		}

		/**
		 * The tab title.
		 * @param props - the localized `t`.
		 * @returns icon plus name.
		 */
		function GitGraphTitle({ t }) {
			return h(
				"span",
				{ className: "gg-title" },
				h(GitGraphIcon, { size: 14 }),
				h("span", { className: "gg-title-name" }, t("title"))
			);
		}

		/**
		 * Center stage used by every non-graph state.
		 * @param props - icon, title, hint and optional action.
		 * @returns the empty-state block.
		 */
		function EmptyState({ title, hint, action }) {
			return h(
				"div",
				{ className: "gg-empty" },
				h("span", { className: "gg-empty-icon" }, h(GitGraphIcon, { size: 40 })),
				h("span", { className: "gg-empty-title" }, title),
				hint === undefined ? null : h("span", { className: "gg-empty-hint gg-muted" }, hint),
				action === undefined ? null : action
			);
		}

		/**
		 * The drawn graph plus its toolbar.
		 * @param props - repository view, copy and refresh handler.
		 * @returns the graph pane.
		 */
		function RepoView({ data, t, onRefresh, refreshing }) {
			const graph = react.useMemo(() => computeGraph(data.commits), [data]);
			const width = PAD * 2 + Math.max(graph.laneCount - 1, 0) * LANE_W;
			const [toast, setToast] = react.useState("");
			const timer = react.useRef(undefined);
			react.useEffect(() => () => {
				if (timer.current !== undefined) clearTimeout(timer.current);
			}, []);
			const copy = (sha) => {
				const done = () => {
					setToast(t("copied"));
					if (timer.current !== undefined) clearTimeout(timer.current);
					timer.current = setTimeout(() => setToast(""), 1200);
				};
				if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
					navigator.clipboard.writeText(sha).then(done, done);
				}
			};

			const branchLabel = data.detached === true ? t("detached") : data.branch;
			const chips = [
				h("span", { key: "branch", className: "gg-chip gg-chip-branch", title: data.branch },
					h(GitGraphIcon, { size: 11 }),
					branchLabel === "" ? t("detached") : branchLabel
				)
			];
			if (data.conflicts > 0) {
				chips.push(h("span", { key: "conflict", className: "gg-chip gg-chip-conflict" }, t("conflicts", { count: data.conflicts })));
			} else if (data.dirty > 0) {
				chips.push(h("span", { key: "dirty", className: "gg-chip gg-chip-dirty" }, t("dirty", { count: data.dirty })));
			} else {
				chips.push(h("span", { key: "clean", className: "gg-chip gg-chip-clean" }, t("clean")));
			}

			const rows = data.commits.map((commit, index) =>
				h(
					"div",
					{ key: commit.sha, className: "gg-row", style: { height: ROW_H + "px" } },
					h(
						"div",
						{ className: "gg-row-main" },
						h(
							"div",
							{ className: "gg-subject-row" },
							h("span", { className: "gg-subject", title: commit.subject }, commit.subject),
							commit.refs.map((entry) => h(RefChip, { key: entry.kind + entry.name, entry }))
						),
						h(
							"div",
							{ className: "gg-meta gg-muted" },
							h("span", { className: "gg-sha", title: commit.sha, onClick: () => copy(commit.sha) }, commit.short),
							h("span", null, "·"),
							h("span", null, commit.author),
							h("span", null, "·"),
							h("span", null, relativeTime(commit.at, commit.when))
						)
					)
				)
			);

			return h(
				"div",
				{ className: "gg-body" },
				h(
					"div",
					{ className: "gg-toolbar" },
					chips,
					h("span", { className: "gg-grow" }),
					h(
						"span",
						{ className: "gg-muted", title: data.root },
						data.truncated === true ? t("truncated", { count: data.commits.length }) : t("commits", { count: data.commits.length })
					),
					h(
						"button",
						{
							type: "button",
							className: "gg-button",
							onClick: onRefresh,
							disabled: refreshing === true,
							title: t("refresh")
						},
						refreshing === true ? t("refreshing") : t("refresh")
					)
				),
				h(
					"div",
					{ className: "gg-scroll" },
					h(
						"div",
						{ className: "gg-canvas" },
						h(GraphGutter, { graph, width }),
						h("div", { className: "gg-rows" }, rows)
					)
				),
				toast === "" ? null : h("span", { className: "gg-toast" }, toast)
			);
		}

		/**
		 * The tab body: resolve the directory, read it, draw it.
		 * @param props - injected directory resolver, localized `t` and session id.
		 * @returns the graph pane or one of its states.
		 */
		function GitGraphBody(props) {
			// The boundary keeps a render fault inside this pane and prints it, instead of
			// handing an exception to the shell (which would blank the tab silently).
			const t = copyOf(props.t);
			return h("div", { className: "gg-root" }, h(PanelBoundary, { t }, h(GitGraphContent, { ...props, t })));
		}

		/**
		 * Catches render faults from the graph body and shows the message in place.
		 * @param props - locale copy plus children.
		 * @returns the children, or a readable failure card.
		 */
		class PanelBoundary extends react.Component {
			constructor(props) {
				super(props);
				this.state = { error: undefined };
			}

			static getDerivedStateFromError(error) {
				return { error };
			}

			componentDidCatch(error, info) {
				console.error("[git-graph-panel]", error, info);
			}

			render() {
				const error = this.state.error;
				if (error === undefined) return this.props.children;
				const message = error instanceof Error ? error.stack ?? error.message : String(error);
				return h(
					"div",
					{ style: { padding: "12px", overflow: "auto", fontFamily: "ui-monospace,monospace", fontSize: "11px", lineHeight: "1.5", whiteSpace: "pre-wrap" } },
					h("div", { style: { marginBottom: "6px", color: "#e05252" } }, "Git Graph 渲染失败 / render failed"),
					h("div", null, message)
				);
			}
		}

		/**
		 * The pane content: resolves the working directory, asks the host, draws the graph.
		 * @param props - locale copy, session id, directory resolver.
		 * @returns the pane.
		 */
		function GitGraphContent(props) {
			const t = copyOf(props.t);
			const [state, setState] = react.useState({ phase: "loading", data: undefined });
			const [nonce, setNonce] = react.useState(0);
			const resolver = react.useRef(props.resolveDir);
			resolver.current = props.resolveDir;

			react.useEffect(() => {
				const controller = new AbortController();
				let alive = true;
				setState((previous) => ({ phase: "loading", data: previous.data }));
				let dir;
				try {
					dir = typeof resolver.current === "function" ? resolver.current() : undefined;
				} catch {
					dir = undefined;
				}
				fetchRepo(dir, controller.signal).then(
					(data) => {
						if (!alive) return;
						setState({ phase: "ready", data });
					},
					(error) => {
						if (!alive || controller.signal.aborted) return;
						const message = error instanceof Error ? error.message : String(error);
						setState({ phase: "error", data: undefined, message });
					}
				);
				return () => {
					alive = false;
					controller.abort();
				};
			}, [nonce, props.sessionId]);

			const refresh = () => setNonce((value) => value + 1);
			const retry = h(
				"button",
				{ type: "button", className: "gg-button", onClick: refresh },
				t("retry")
			);

			if (state.phase === "error") {
				// A 404/405 from the shell means the host half never registered its
				// route (a plugin that failed to activate), not a repository problem.
				const offline = /HTTP (?:404|405)/.test(state.message);
				return h(EmptyState, {
					title: offline ? t("hostOffline") : t("gitError"),
					hint: offline ? t("hostOfflineHint") : state.message,
					action: retry
				});
			}

			if (state.phase === "loading" && state.data === undefined) {
				return h(EmptyState, { title: t("loading") });
			}

			const data = state.data;
			if (data === undefined) {
				return h(EmptyState, { title: t("loading") });
			}

			const refreshing = state.phase === "loading";

			if (data.isRepo !== true) {
				const reason = data.reason;
				if (reason === "git-missing") {
					return h(EmptyState, {
						title: t("gitMissing"),
						hint: t("gitMissingHint"),
						action: retry
					});
				}
				if (reason === "no-workspace") {
					return h(EmptyState, { title: t("noWorkspace") });
				}
				if (reason === "not-repo") {
					return h(EmptyState, {
						title: t("notRepo"),
						hint: t("notRepoHint"),
						action: h(
							"div",
							{ style: { display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" } },
							h("span", { className: "gg-path gg-muted", title: data.dir }, data.dir),
							retry
						)
					});
				}
				return h(EmptyState, {
					title: t("gitError"),
					hint: data.detail === undefined || data.detail === "" ? data.reason : data.detail,
					action: retry
				});
			}

			if (data.empty === true) {
				return h("div", { className: "gg-body" }, h("div", { className: "gg-toolbar" },
					h("span", { className: "gg-chip gg-chip-branch" }, data.branch === "" ? t("detached") : data.branch),
					h("span", { className: "gg-grow" })
				), h(EmptyState, {
					title: t("emptyRepo"),
					hint: t("emptyRepoHint"),
					action: retry
				}));
			}

			return h(RepoView, { data, t, onRefresh: refresh, refreshing });
		}
		//#endregion

		//#region plugin
		/** Services this browser half needs. */
		const inject = ["slots", "sessions", "locale", "sidebarRightTabs"];

		/**
		 * Register the tab type, its two seats and the copy beside the card.
		 * @param ctx - the client context.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			const sessions = ctx.get("sessions");

			/** Resolve a session's project directory from the sessions baseline. */
			const resolvePath = (sessionId) => {
				if (sessionId === undefined || sessions === undefined) return undefined;
				try {
					const snapshot = sessions.list.getSnapshot();
					const entry = snapshot === undefined || snapshot === null ? undefined : snapshot.byId[sessionId];
					return entry === undefined || entry === null ? undefined : entry.cwd;
				} catch {
					return undefined;
				}
			};

			ctx.effect(
				() => ctx.locale.register(NS, { zh, en }),
				"dsh-git-graph-panel: copy"
			);

			ctx.effect(
				() =>
					ctx.sidebarRightTabs.register({
						id: ID,
						kind: KIND,
						priority: "extension",
						title: () => t("title"),
						guide: [
							{
								id: "open",
								order: 15,
								title: () => t("new"),
								description: () => t("description"),
								icon: GitGraphIcon
							}
						]
					}),
				"dsh-git-graph-panel: type"
			);

			const injectFace = (sessionId) => ({
				sessionId,
				resolveDir: () => resolvePath(sessionId)
			});

			ctx.effect(
				() =>
					ctx.slots.inject("sidebar.right.tab.guide.entry", () =>
						ctx.slots.register(
							{ name: "sidebar.right.tab.guide.entry", key: ID, locale: NS, inject: injectFace },
							GitGraphGuide
						)
					),
				"dsh-git-graph-panel: guide"
			);

			ctx.effect(
				() =>
					ctx.slots.inject("sidebar.right.pane.tab", () =>
						ctx.slots.register(
							{ name: "sidebar.right.pane.tab", key: ID, locale: NS, inject: injectFace },
							GitGraphBody
						)
					),
				"dsh-git-graph-panel: body"
			);

			ctx.effect(
				() =>
					ctx.slots.inject("sidebar.right.pane.tab.title", () =>
						ctx.slots.register(
							{ name: "sidebar.right.pane.tab.title", key: ID, locale: NS, inject: injectFace },
							GitGraphTitle
						)
					),
				"dsh-git-graph-panel: title"
			);
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		exports.GitGraphBody = GitGraphBody;
		exports.GitGraphGuide = GitGraphGuide;
		exports.computeGraph = computeGraph;
		return module.exports;
	}
});
