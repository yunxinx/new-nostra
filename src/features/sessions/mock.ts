// Frontend-only display data for the pre-session-domain UI build. Never
// persisted and never sent across IPC; the session domain task replaces the
// consumers' data source without touching the components.

export interface MockMessage {
  content: string;
  id: string;
  role: "assistant" | "user";
}

export interface MockSession {
  group: MockSessionGroup;
  id: string;
  messages: MockMessage[];
  starred: boolean;
  title: string;
}

export type MockSessionGroup = "thisWeek" | "today" | "yesterday";

export const MOCK_SESSIONS: readonly MockSession[] = [
  {
    group: "today",
    id: "session-drag-region",
    messages: [
      {
        content:
          "Tauri 2 里怎么做沉浸式标题栏？红绿灯要保留，但内容要延伸到标题栏区域。",
        id: "session-drag-region-m1",
        role: "user",
      },
      {
        content: `Tauri 2 的官方做法是 \`titleBarStyle: "Overlay"\` 加拖拽区域属性，不需要整窗透明：

\`\`\`ts
const mainWindow = new WebviewWindow("main", {
  titleBarStyle: "Overlay",
  width: 1180,
  height: 760,
});
\`\`\`

关键点有三个：

1. webview 内容会延伸到标题栏区域，macOS 红绿灯仍由系统渲染并悬浮在内容之上；
2. 布局里放一条全宽的 34px 标题行，根元素带 \`data-tauri-drag-region\`；
3. 按钮天然阻断拖拽，所以行内控件不需要额外处理。

双击标题行在 macOS 上会自动触发最大化，和系统语义一致，不需要自己写双击逻辑。`,
        id: "session-drag-region-m2",
        role: "assistant",
      },
      {
        content: "那 Windows 和 Linux 呢？",
        id: "session-drag-region-m3",
        role: "user",
      },
      {
        content: `Windows 和 Linux 保持 \`decorations: true\` 走原生标题栏，平台差异在 CSS 里分支处理：

- macOS：标题行左 padding 80px，避开红绿灯的 x=9..77 区域；
- 其它平台：左 padding 12px 即可。

\`decorations: false\` 在 macOS 上会损失窗口贴边、对齐等系统功能，官方文档明确不推荐。`,
        id: "session-drag-region-m4",
        role: "assistant",
      },
    ],
    starred: false,
    title: "Tauri 2 沉浸式标题栏",
  },
  {
    group: "today",
    id: "session-zustand-stream",
    messages: [
      {
        content: "流式输出为什么不能直接写进 TanStack Query 缓存？",
        id: "session-zustand-stream-m1",
        role: "user",
      },
      {
        content: `因为 delta 帧每秒有几十帧，而 Query 缓存的消费者是整个消息列表——高频写缓存等于让全列表逐帧重渲染。正确的三层分工是：

1. **Channel delta 帧**写入 Zustand 的流式缓冲，只有流式中的那条消息订阅这个切片；
2. **流结束**（落库后）再 \`invalidateQueries\`；
3. **Query 从 DB 读回**权威数据渲染历史消息。

\`\`\`ts
onEvent.onmessage = (e) => {
  if (e.event === "delta") {
    appendDelta(e.data.requestId, e.data.text);
  }
};
\`\`\`

渲染层对历史消息做 memo，仅流式中的那条订阅 store 切片，其余组件不因 delta 帧重渲染。`,
        id: "session-zustand-stream-m2",
        role: "assistant",
      },
    ],
    starred: true,
    title: "Zustand 流式缓冲切片设计",
  },
  {
    group: "yesterday",
    id: "session-scroll-anchor",
    messages: [
      {
        content: "分页加载历史消息时，怎么保证滚动位置不跳？",
        id: "session-scroll-anchor-m1",
        role: "user",
      },
      {
        content: `prepend 前记录锚点（视口顶部消息的元素与其偏移），prepend 后把该元素滚回原来的偏移量：

\`\`\`python
def anchor_after_prepend(container, anchor_el, anchor_offset):
    new_top = anchor_el.offsetTop
    container.scrollTop = new_top + anchor_offset
\`\`\`

配合页级淘汰：已挂载消息超过 500 条时淘汰视口上方整页，滚回顶部时再重载，避免长会话的布局开销。`,
        id: "session-scroll-anchor-m2",
        role: "assistant",
      },
    ],
    starred: false,
    title:
      "会话分页加载时滚动位置锚定补偿在快速滚动场景下的边界情况与整页淘汰窗口调优",
  },
  {
    group: "yesterday",
    id: "session-sqlite-migration",
    messages: [
      {
        content: "SQLite 的迁移时间线为什么不写反向迁移？",
        id: "session-sqlite-migration-m1",
        role: "user",
      },
      {
        content: `迁移时间线只向前：功能移除时代码层完全删除，schema 层用一个前向的退役迁移（drop，或停用后延后 drop）表达撤销。git 历史与迁移链保留全部过程，当前可观察状态则等价于该功能从未出现过。

- 回退版本号会让已执行的库回到未知状态；
- 前向退役迁移在所有已部署库上可重放；
- 「只增不改」与撤销不冲突——撤销的定义就是追加执行逆操作。`,
        id: "session-sqlite-migration-m2",
        role: "assistant",
      },
    ],
    starred: false,
    title: "SQLite 前向迁移时间线",
  },
  {
    group: "thisWeek",
    id: "session-theme-tokens",
    messages: [
      {
        content: "主题令牌写死和运行时对比度推导，各自的问题是什么？",
        id: "session-theme-tokens-m1",
        role: "user",
      },
      {
        content: `运行时推导（旧项目的做法）能保证每个衍生面色与底面保持最低对比度，但推导链复杂、结果不可预测，调试时看不到「为什么是这个色」。写死终值的做法把这套约束变成 review 时可核对的一张表：

| 方案 | 优点 | 代价 |
| --- | --- | --- |
| 写死终值 | 可核对、可验收 | 调色板改动要人工重核 |
| 运行时推导 | 约束自动满足 | 推导链不可见 |

本项目只有深浅两套主题，写死的维护成本最低。`,
        id: "session-theme-tokens-m2",
        role: "assistant",
      },
    ],
    starred: false,
    title: "主题令牌写死 vs 运行时推导",
  },
  {
    group: "thisWeek",
    id: "session-shiki-engine",
    messages: [
      {
        content: "Shiki 怎么避开 oniguruma WASM？",
        id: "session-shiki-engine-m1",
        role: "user",
      },
      {
        content: `用 \`shiki/core\` 的 \`createHighlighterCore\` 配 JavaScript 正则引擎：

\`\`\`ts
const highlighter = await createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  themes: [githubDarkDimmed, githubLight],
  langs: [ts, tsx, javascript, json, python, rust, bash],
});
\`\`\`

细粒度引入语言与主题（\`shiki/langs/*.mjs\`、\`shiki/themes/*.mjs\`），避免整包打进 bundle。JS 引擎免 WASM 加载，语法覆盖面略窄但对常用语言足够。`,
        id: "session-shiki-engine-m2",
        role: "assistant",
      },
    ],
    starred: false,
    title: "Shiki 免 WASM 引擎接入",
  },
];
