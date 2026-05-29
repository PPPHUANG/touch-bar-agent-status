# Codex Touch Bar Buddy

一个给 Touch Bar 用的 Codex 工作搭子状态灯。

## Files

- `codex-touchbar-hook.mjs`: Codex lifecycle hook 写入器。
- `codex-touchbar-read.mjs`: BetterTouchTool Script Widget 读取器。
- `install-codex-hooks.mjs`: 把 hooks 安装到 `~/.codex/config.toml`。
- `scripts/extract-codex-pet-assets.mjs`: 从 Codex App 包里抽取官方宠物 spritesheet。
- `scripts/generate-touchbar-pet-frames.py`: 把官方宠物 spritesheet 裁成 Touch Bar 小帧。
- `assets/pet/frames/*.png`: Touch Bar 使用的小宠物帧。
- `.state/codex-touchbar-status.json`: 运行时状态文件，自动生成。

状态文件只保存事件、工作目录、模型、工具名和时间戳；不会保存用户 prompt 或 assistant 正文。

## Status Preview

这是一组最新的真实 Touch Bar 截图。主槽位负责表达 Codex 当前状态，副槽位显示耗时、工具、文件增删行数和当前文件。

思考时，会显示蓝色主状态、耗时和 `Think`：

![Thinking status](assets/readme/status-thinking.png)

需要授权时，会切到紫色审批态：

![Permission status](assets/readme/status-permission.png)

跑命令时，会显示终端图标、命令工具和运行时间：

![Command status](assets/readme/status-command.png)

改文件时，会显示当前文件、Patch、绿色新增行和红色删除行：

![Edit status](assets/readme/status-edit.png)

浏览/检查页面时，会显示 `Browser` 或 `inspect`：

![Browser status](assets/readme/status-browser.png)

![Inspect done status](assets/readme/status-inspect-done.png)

任务结束后，会短暂显示完成态：

![Done status](assets/readme/status-done.png)

![Command done status](assets/readme/status-command-done.png)

空闲时，它会进入一种非常合理的工作状态：摸鱼中。旁边还有一个 Codex 小宠物，在 Touch Bar 上慢慢走路。

![Idle status](assets/readme/status-idle.png)

## Quick Start

如果你是第一次从 GitHub 拉下这个项目，推荐按下面顺序配置：

1. 准备环境：
   安装 `Codex.app` 和 `BetterTouchTool`，并确认 `Codex.app` 在 `/Applications/Codex.app`。

2. 安装 hooks：

```sh
"/Applications/Codex.app/Contents/Resources/node" "/你的项目路径/install-codex-hooks.mjs"
```

3. 在 Codex 里 trust hooks：
   打开 Codex，进入 `Settings -> Hooks`，把这组 hooks 标记为 trusted。

4. 先添加一个主状态小组件：
   在 BTT 里新建 `AppleScript / JavaScript 小组件`，`Source Type` 选 `Apple Script`，脚本填：

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/你的项目路径/codex-touchbar-read.mjs") & " --slot main")
```

5. 刷新间隔设为 `1` 或 `2` 秒。

6. 验证是否成功：

```sh
"/Applications/Codex.app/Contents/Resources/node" "/你的项目路径/codex-touchbar-read.mjs" --text
```

如果能看到 `摸鱼中...` 之类的输出，说明读取脚本是正常的。随后在 Codex 里跑一次简单命令，比如 `date`，Touch Bar 应该会切到思考、命令、完成这些状态。

`/你的项目路径/` 需要替换成你自己 clone 下来的实际目录，例如：

```sh
/Users/yourname/Documents/touch-bar-agent-status
```

## BetterTouchTool Widget

新建一个全局 Touch Bar Shell Script Widget，刷新间隔设为 `1` 或 `2` 秒，脚本填：

```sh
"/Applications/Codex.app/Contents/Resources/node" "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs"
```

脚本默认返回 BTT 可识别的 JSON，包括 `text`、`background_color`、`font_color`、`font_size`。

如果你添加的是 **AppleScript / JavaScript 小组件**，并且右侧 `Source Type` 是 `Apple Script`，不要直接粘贴 shell 命令，改填：

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs"))
```

这个 AppleScript 会调用 Node 脚本，并把脚本输出的 BTT JSON 交回给小组件。

如果只想先确认文字，可以运行：

```sh
"/Applications/Codex.app/Contents/Resources/node" "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs" --text
```

如果想查看当前状态对应的 SF Symbol 名称，可以运行：

```sh
"/Applications/Codex.app/Contents/Resources/node" "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs" --meta-json
```

BTT 的 Script Widget 对动态 SF Symbol 的支持会随版本变化；这个 MVP 默认可靠输出文字和背景色，`--meta-json` 里的 `sfSymbol` 可用于你在 BTT 里配置静态图标、正则外观，或后续做更深的 BTT 自动化。

授权态默认最多保留 `90` 秒。如果用户拒绝、取消或 Codex 没有继续发出后续 hook，Touch Bar 会自动回到空闲态，避免一直卡在 `等你点头`。如需调整，可以给 BTT 脚本设置环境变量 `CODEX_TOUCHBAR_WAIT_STALE_MS`。

当 Codex 通过 `apply_patch` 修改文件时，状态灯会优先显示本次补丁的行数跳动：

- 单文件：`read.mjs +3 -0`
- 多文件：`3文件 +24 -6`

这里的增删统计来自 hook 收到的 patch 文本，不读取文件正文。

## Multi-Widget Touch Bar

如果想利用更长的 Touch Bar，可以创建多个 BTT 小组件。每个小组件都调用同一个读取脚本，只是传不同的 `--slot`：

- `--slot main`: 主状态，例如 `我想想...`、`跑个命令`；空闲时显示 `摸鱼中...` 和走动的小宠物
- `--slot timer`: 当前回合耗时，例如 `00:18`
- `--slot tool`: 当前工具，例如 `Bash`、`Patch`、`Browser`
- `--slot diff`: 当前补丁行数，例如 `+12 -3`
- `--slot diff-add`: 新增行数，例如绿色 `+12`
- `--slot diff-remove`: 删除行数，例如红色 `-3`
- `--slot file`: 当前文件，例如 `read.mjs`
- `--slot pet`: 单独的小宠物槽位，只显示宠物图标
- `--slot walk --index N --count M`: 空闲时横向走动用的宠物槽位

`main` 槽位和旧的单槽位模式会显示 Codex 小宠物帧；空闲时显示 `摸鱼中...` 并循环走路帧。`pet` 槽位可以单独放一个宠物。其他槽位在没有实际内容时会返回透明空白，例如空闲时不会再显示 `00:00`、`idle`、`+0 -0` 或工作区名。

BTT 的 Script Widget 只能给整个槽位设置一个 `font_color`，所以如果想让新增和删除分别显示绿色/红色，请用 `diff-add` 和 `diff-remove` 两个槽位替代单个 `diff` 槽位。

`timer`、`file` 和命令态的 `tool` 槽位会分别带本地 PNG 图标：时间、文本/文档、终端。

AppleScript / JavaScript 小组件可以分别填：

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs") & " --slot main")
```

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs") & " --slot timer")
```

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs") & " --slot tool")
```

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs") & " --slot diff")
```

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs") & " --slot diff-add")
```

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs") & " --slot diff-remove")
```

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs") & " --slot file")
```

如果想单独放一个宠物槽位：

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs") & " --slot pet")
```

如果想让小宠物在 Touch Bar 上横向走动，可以加多个很窄的 walk 槽位，`--count` 写总数，`--index` 从 0 开始递增。例如 6 个槽位分别填：

```applescript
return do shell script ((quoted form of "/Applications/Codex.app/Contents/Resources/node") & " " & (quoted form of "/Users/ppphuang/Documents/agent-status/codex-touchbar-read.mjs") & " --slot walk --index 0 --count 6")
```

把 `--index 0` 依次改成 `1`、`2`、`3`、`4`、`5`。空闲时这些槽位会轮流显示宠物；Codex 开始工作后它们会自动变成透明空白。

注意横向走动的槽位都要用 `--slot walk`。`--slot main` 和 `--slot pet` 在空闲时会一直显示宠物，适合原地走路，不适合参与横向移动队列。

## Touch Actions

建议在 BTT 里给这个 widget 配两个动作：

- Tap: 打开 Codex App，命令是 `/usr/bin/open -a Codex`。
- Long Press: 打开状态文件，命令是 `/usr/bin/open "/Users/ppphuang/Documents/agent-status/.state/codex-touchbar-status.json"`。

## Hook Trust

安装或修改 hook 后，打开 Codex，进入 `Settings -> Hooks`，review/trust 这组 hook。Codex 会按 hook hash 记录信任状态，所以脚本更新后重新 trust 是正常的。
