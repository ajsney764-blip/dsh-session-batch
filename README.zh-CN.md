# dsh-session-batch

[English](README.md) | 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(DSH)用的插件:侧栏多选,**一次删除多个对话的聊天记录**,并可**同时删除这些对话产出的文件**;同时把会话状态说清楚 —— **运行中**(此刻真的在干活)与**内存中**(只是被打开过、宿主还留着它)分开显示。

> 删除是永久的,不进回收站。

## 为什么需要它

Harness 只提供"归档",没有删除:持久化接缝刻意不提供删除 API,所以会话日志会一直堆在 `$DSH_HOME/sessions` 下。它的侧栏也说不清"使用中"是什么意思 —— 一个对话只要被打开过一次,宿主进程就会一直留着它的 Session 对象,刷新页面永远清不掉。

而"哪些工作区文件是这个对话产出的"是另一个更难的问题,[`dsh-session-artifacts`](https://github.com/ShirohaChan/dsh-session-artifacts) 已经做得很好(只认它创建的文件、按每条命令的时间窗、跨会话唯一性、DSH home 与插件包围栏)。**本插件不重复实现这些规则**:装了它,本插件就直接调用它导出的函数。

## 功能

- **批量删除聊天记录** —— 一个面板里勾选多个对话,一次请求删掉:会话日志、子代理记录、工作区归属、置顶与归档标记。
- **可选地一起删产物** —— 确认框里一个复选框,连这些对话(含其子代理)产出的文件一起删;删之前先给出清单与总大小。
- **诚实的状态徽标** —— `运行中`(回合、任务、子代理、定时提醒在跑,读的是官方 `workspace/session-activity`)与 `内存中`(宿主还留着 Session 对象,刷新无效、重启才清)。
- **值得信任的删除** —— 日志目录删完在磁盘上复核;在跑的会话停不下来就**整体拒绝、零副作用**;已删 id 打墓碑,面板不会再冒出来;删不掉的项排队到下次启动继续。

## 依赖

- DSH `0.2.x`,且具备 `connection`、`sessionQuery`、`workspaceRegistry` 三个服务(官方 web 组合都有)。
- 可选:[`dsh-session-artifacts`](https://github.com/ShirohaChan/dsh-session-artifacts) `>= 0.7.0`,用于删产物。没装时产物勾选项不出现,只删聊天记录。

## 安装

```sh
dsh plugin --profile <profile> add dsh-session-batch
# 或从本地目录
dsh plugin --profile <profile> add <本仓库绝对路径>
```

装完**完全重启 DSH**(宿主代码只在启动时加载)。

### Windows 桌面版

Desktop 的 profile 由应用独占管理,`dsh plugin` 会被拒绝。用仓库里的脚本在**应用关闭时**完成替换并校验:

```powershell
# 先完全退出 DeepSeek Harness
pwsh -ExecutionPolicy Bypass -File scripts/install-when-closed.ps1 -WaitForExit
```

它会改 profile 清单、跑自带 pnpm、**强制同步运行时文件并逐个比对 SHA-256**(pnpm 对 `file:` 依赖可能只刷新清单、留下旧代码),最后重启应用。回滚用 `scripts/rollback-when-closed.ps1`。

## 使用

1. 侧栏打开 **批量清理**;
2. 点 **多选**,勾选对话(或全选),点 **删除选中的 N 个聊天记录**;
3. 确认框里:
   - 默认 **只删聊天记录**;
   - 勾上 **同时删除这些对话产出的文件(N 个 · 大小)** 则连产物一起删,文件清单会先列出来;
4. 确认。不进入多选也可以单条删除。

## 删除顺序

```
停止工作 ─► 摘工作区归属 ─► 删产物 ─► 删日志 ─► 清缓存 ─► 打墓碑
(官方接缝)                  (委托 plugins)  (带复核)
```

- 先用 `workspace/session-activity` 判断是否在跑;在跑就发 `workspace/session-stop`,最多等 8 秒。还不停止 → 拒绝,什么都不动。
- 产物在日志删除**之前**处理(那时还有归因依据),根会话与每个子代理分别归因,按路径去重。
- 删日志后在磁盘上复核,被重建则重试 4 次;仍失败则写进 `$DSH_HOME/session-batch/pending.json`,下次启动按**路径**重试(那时日志已删,无法再归因)。
- 已删 id 写入 `removed.json` 墓碑,宿主真的忘记后才自动清除;仍被宿主列出时,面板会提示"重启后才会从侧栏消失"。

## 永远不删的东西

- 只被"交付"(`present`)而没被创建的文件;
- 只是被 `update` / `edit` 改过的文件;
- 同时落在别的会话命令时间窗里的文件(歧义 → 两边都不认领);
- `$DSH_HOME` 下的任何东西。

这些是 `dsh-session-artifacts` 的规则,本插件只是调用方;它们都是刻意的安全设计。

## 已知限制

- 已打开的会话无法被宿主释放:删掉后本面板会隐藏该行,但**宿主侧栏**要等重启才消失(磁盘记录当次已删)。
- 事后重试只能凭路径 —— 日志一旦删除,无法再重新归因。
- 单次批量上限 200 个对话。
- 另一个标签页仍打开该对话时删除,那个页面可能把日志写回来,请先关闭。

## 开发

```sh
npm test            # 两套测试,零依赖
npm run test:host   # 宿主路由 + stub 服务
npm run test:client # 渲染路径 + 极简 React
```

设计说明见 [`docs/architecture.md`](docs/architecture.md),0.2.1 的自检缺陷清单见 [`docs/self-review.md`](docs/self-review.md)。

## 许可

[MIT](LICENSE)
