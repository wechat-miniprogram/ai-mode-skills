# 半屏页面（溢出时必须生成，其他按需）

> 高度预估判定溢出且换档仍无法容纳时**必须**挂半屏（`ATOMIC_COMPONENT_DESIGN.md` §7.2）。卡片内展示摘要/前 N 项 + "查看全部/详情"按钮，点击 `viewCtx.openDetailPage()` 打开半屏。其他场景仅当业务确有"详情/补充信息"语义时挂上。

---

## 1. 调用入口

半屏页面**只能在原子组件内打开**（原子接口里没有 `this`，拿不到 viewCtx，**不可调**）：

```js
// 在原子组件 methods / tap handler 里
Component({
  methods: {
    showDetail() {
      const viewCtx = wx.modelContext.getViewContext(this)
      viewCtx.openDetailPage({
        url: '/packageA/pages/weather-detail?foo=bar'  // 项目内已有的小程序页面路径
      })
    },
  },
})
```

```xml
<!-- 组件 wxml -->
<view bind:tap="showDetail">查看未来 15 天的天气</view>
```

**承载页面来源**：可以复用项目内已有的小程序页面（不用新写一个页面专给半屏用）。半屏打开页面的场景值为 **1433** 或 **1434**，页面里可以根据场景值切换样式。

**关闭按钮位置适配**：通过 `wx.getDetailPageCloseButtonBoundingClientRect` 拿到左上角关闭按钮的位置，避免业务内容被遮挡。

---

## 2. 半屏页面里上行消息

半屏页面里的"下一步"操作应当**上行一段文本消息**到 Agent，**同时半屏会自动关闭**回到 Agent 对话界面。

### 2.1 原生页面（小程序 Page）

```js
Page({
  onTap() {
    const ctx = wx.modelContext.getContext()  // 注意：半屏页面里不传 this
    ctx.sendFollowUpMessage({
      content: [
        { type: 'text', text: '选择拿铁' },                 // 必传
        { type: 'api/call', data: { name: 'selectGoods', arguments: {} } },  // 可选，不传则由模型推理
      ],
    })
  },
})
```

### 2.2 web-view 加载的 H5 页面

```js
// 前置 wx.config()
wx.ready(function () {
  WeixinJSBridge.invoke('invokeMiniProgramAPI', {
    name: 'sendFollowUpMessage',
    arg: {
      content: [
        { type: 'text', text: '选择拿铁' },
        { type: 'api/call', data: { name: 'selectGoods', arguments: {} } },
      ],
    },
  }, function (res) {})
})
```

> 上行协议（`content` 形态、`name` 必须在 `mcp.json.apis[].name` 已声明、`arguments` 与 `inputSchema` 对齐）与原子组件 tap handler 完全一致——见 `SKILL.md §5.0.1` + `COMPONENT_TEMPLATES.md` 的"上行消息"节。

---

## 3. 半屏页面的接口/组件禁用清单

半屏页面执行环境与小程序页面一致，**但禁用以下任何"会让用户跳出半屏"的能力**。命中即视为不可迁移，按 SKILL.md C.6 处理（删除调用 / 用网络请求替代 / 触发阻断）。

### 3.1 跳出类（跳公众号/视频号/其他小程序/表情/问一问/地图 App）

```
wx.restartMiniProgram
wx.openOfficialAccountProfile
wx.openOfficialAccountChat
wx.openOfficialAccountArticle
wx.openInquiriesTopic
wx.openEmbeddedMiniProgram
wx.onEmbeddedMiniProgramHeightChange
wx.offEmbeddedMiniProgramHeightChange
wx.navigateToMiniProgram
wx.navigateBackMiniProgram
wx.exitMiniProgram
```

### 3.2 页面路由

```
wx.switchTab
wx.rewriteRoute
wx.reLaunch
wx.redirectTo
wx.navigateTo
wx.navigateBack
wx.router
router.addRouteBuilder
router.getRouteContext
router.removeRouteBuilder
```

### 3.3 聊天工具

```
wx.shareVideoToGroup
wx.shareImageToGroup
wx.shareFileToGroup
wx.shareEmojiToGroup
wx.shareAppMessageToGroup
wx.selectGroupMembers
wx.openChatTool
wx.notifyGroupMembers
wx.getChatToolInfo
wx.enterChatToolMode
```

### 3.4 地图

```
MapContext.openMapApp
```

### 3.5 视频号

```
wx.reserveChannelsLive
wx.openChannelsUserProfile
wx.openChannelsLiveNoticeInfo
wx.openChannelsLive
wx.openChannelsEvent
wx.openChannelsActivity
wx.getChannelsShareKey
wx.getChannelsLiveNoticeInfo
wx.getChannelsLiveInfo
```

### 3.6 微信客服 / 微信表情

```
wx.openCustomerServiceChat
wx.openStickerSetView
wx.openStickerIPView
wx.openSingleStickerView
```

### 3.7 广告（接口与组件）

接口：

```
wx.getShowSplashAdStatus
wx.createRewardedVideoAd
wx.createInterstitialAd
```

组件：

```
ad
ad-custom
```

### 3.8 导航组件

```
functional-page-navigator
navigator
```

---

## 4. 与原子组件/原子接口的关系

| 维度 | 原子接口 | 原子组件 | 半屏页面 |
|---|---|---|---|
| 运行时上下文 | service worker 端 | 渲染层（含 `this`） | 普通小程序页面 |
| 调起 `openDetailPage` | ❌ 不可（无 `this` / viewCtx） | ✅ 可（`getViewContext(this)`） | — |
| 调 `sendFollowUpMessage` | ❌ 不可 | ✅ `getContext(this)` | ✅ `getContext()` 不传 this |
| 默认是否生成 | ✅ 必生成 | 按需（有 UI 时生成） | **默认不生成**，仅业务强需要时按本指南挂上 |

---

## 5. 自检

- [ ] 溢出组件已生成半屏，卡片内有摘要 + "查看全部/详情"入口
- [ ] 仅在溢出或源业务确有"详情/补充信息"语义时才挂半屏
- [ ] `openDetailPage` 调用点在原子组件 `methods` 内，**不在原子接口里**
- [ ] 半屏页面 wxml/wxss 不依赖原子组件渲染容器约束（半屏页面尺寸是普通页面尺寸，不再受卡片宽高比限制）
- [ ] 半屏页面里**没有任何 §3 的禁用接口/组件**调用
- [ ] 半屏页面里"下一步"按钮的 tap handler 走 `wx.modelContext.getContext()`（**不传 `this`**）上行消息，半屏会自动关闭
- [ ] 若用 web-view 承载 h5，h5 里走 `WeixinJSBridge.invoke('invokeMiniProgramAPI', { name: 'sendFollowUpMessage', ... })`，并配 `wx.config()`/`wx.ready()`
- [ ] 左上角关闭按钮位置用 `wx.getDetailPageCloseButtonBoundingClientRect` 适配，避免遮挡业务内容
