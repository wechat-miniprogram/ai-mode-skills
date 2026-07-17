# 原子组件模板参考

> 组件用于原子接口的结果展示。每个原子接口返回的 `structuredContent` 会通过 `NotificationType.Result` 传递给组件。
>
> ⚠️ **本文件是骨架规范，不是照抄目标**。配色、字号、圆角、间距必须从源页面 `.wxss` 提取；字段名必须按源 API 实际返回结构做归一化映射，不要假设源数据会返回 `imageUrl`/`title` 等通用名。

## ⚠️ 重要限制

**原子组件仅支持 `tap` 点击事件**，不支持其它交互事件（如 `touch`）。

**支持的内置组件**：`view`（支持 `hover-class`）、`text`（不支持 `user-select`）、`image`（仅网络地址）、`map`、`button`（**不含 `open-type`**）、`canvas`、`scroll-view`（**仅横滚 `scroll-x`，禁 `scroll-y`**）。**不支持** `swiper` / `input` / `textarea` / `picker` / `checkbox` / `radio` / `form` / `slider` / `switch` / `editor` / `rich-text` / `navigator` / `web-view` / `movable-*` / `root-portal` 等其他内置组件。

**`button` 特殊约束**：不可使用 `open-type`。源代码里的 `<button open-type="share">` / `open-type="getPhoneNumber"` 等必须改为 `<button bindtap="...">` + 在 tap handler 中调用 `wx.shareAppMessage` / `wx.getPhoneNumber` 等对应 JSAPI。

**不支持网络请求和云开发接口**（组件侧不支持直接调用 `wx.request`，若需使用网络能力需声明 `permissions.scope.dynamic`）。

**渲染容器约束**：宽度随屏幕宽度变化，最小高度为宽高比 4:1，最大高度为宽高比 1:1，不超出范围时随内容自动撑高，**不支持纵向滚动，超出裁剪**（横向超长内容可用 `<scroll-view scroll-x="true">` 包裹，仅横向滚动）。**外层容器尺寸由宿主自动设置，组件根节点不要再写 `max-height` / `min-height` / `height`**——一旦组件自己设了高度，宿主的 `NotificationType.Overflow` 回调将无法触发，溢出无法被检测。**卡片比例必须从 `1:1 / 4:3 / 16:9 / 3:1 / 4:1` 五档中选一**（见 `ATOMIC_COMPONENT_DESIGN.md` 第一章）；实现层细节见 `ATOMIC_COMPONENT_CSS.md`。

**组件不可声明为虚拟组件**。

---

## 上行消息（发送给小程序 AI）

组件本身没有页面导航能力。**用户对组件内元素的任何点击/操作，都必须通过 `modelCtx.sendFollowUpMessage` 把"结构化 toolCall 事件"上行给小程序 AI**，由小程序 AI 拿到 `name` + `arguments` 直接路由到对应原子接口。组件不直接调用原子接口。

### 上行协议（硬性，不可改写）

```js
// 形态 1：单 text（无对应接口时）
wx.modelContext.getContext(this).sendFollowUpMessage({
  content: [{ type: 'text', text: '换一批推荐' }],
})

// 形态 2：text + api/call 组合（推荐，有对应接口时）
wx.modelContext.getContext(this).sendFollowUpMessage({
  content: [
    { type: 'text', text: '选择拿铁' },
    { type: 'api/call', data: { name: 'selectGoods', arguments: { goodsId: 123 } } },
  ],
})
```

**核心规则**：`content` 是数组；`api/call` 必须前面有 `text`（给小程序 AI 用户上下文），不能单独发；`text` 可以单独发；`name` 必须在 `mcp.json.apis[]` 中存在，`arguments` 与该接口 `inputSchema` 对齐。

### 硬性规则（生成组件时必须遵守）

1. **每个可交互元素都绑 `bindtap` + `hover-class`**。列表 item / 按钮 / "查看全部"都不能是纯展示。
2. **tap handler 优先用形态 2**，无对应接口时才用形态 1。`arguments` 值从 `e.currentTarget.dataset` / `this.data` 取，不用占位值。
3. **`text` 是用户视角的简短中文**（≤ 12 字，如"选择拿铁"），从 dataset 可读字段拼出，不是 args 序列化。
4. **每次上行 `api/call` 前打一行 console.info**：`[ai-mode] {componentName} send api/call name=<name> args=<JSON>`。
5. **组件不直接调原子接口 / 业务 API**；不上行不存在的 `name`。
6. **主动调用 `sendFollowUpMessage` / `getDimensions` 必须现取 ctx**——在 `methods` / tap handler / 异步回调里，当场 `wx.modelContext.getContext(this).sendFollowUpMessage(...)`（或 `getViewContext(this)` 对应方法）。**禁止**通过 `this._modelCtx` / `this._viewCtx` 之类的实例缓存引用去调方法（小程序 AI 宿主可能复用组件实例承接多轮结果，旧 ctx 会被标记为过期）。`created` 里用临时局部变量绑 `on(...)` 之后是否把 `modelCtx` / `viewCtx` 再存一份到 `this` 不影响——因为 `on(...)` 的回调已由 SDK 内部持有。同理，按需调用的卡片过期 API（`wx.modelContext.expireAllCards()` / `getViewContext(this).expirePreviousCards()`，详见 `SKILL.md` D.4）也要在使用点现取 ctx，不要缓存。

### api/call 模板（按交互类型选 name + arguments）

按"当前组件在 API 依赖图中的下一跳"选择 `name`，`arguments` 按该接口 `inputSchema` 填：

| 交互类型 | 选哪个 `name`（示例） | `arguments` 要带什么 |
|---|---|---|
| 列表项 → 查看详情 | `searchItemDetail` / `searchOrderDetail` 这类详情接口 | 被点对象的 id（如 `{ itemId: 1528954 }` / `{ orderId: 12345 }`） |
| 列表项 → 继续下一步业务 | 依赖图下游接口（如选商家后 → `searchSchedule`） | 已选对象的 id + 当前组件上下文必需入参（如 `{ storeId, itemId, date, time }`） |
| "换一换" / "换一批" | 同当前展示能力的检索接口（如 `searchItems`） | 带上一轮 query + `{     refresh: true }`（仅当接口 inputSchema 有该字段）。**注意**："查看更多/全部"不走上行 `api/call`，走半屏 `viewCtx.openDetailPage()`（见 `ATOMIC_COMPONENT_DESIGN.md` §7.3） |
| 详情页主 CTA（购票 / 加购 / 预约 / 支付）| 触发业务动作的下一跳接口（如 `bookingItem` / `createOrder`）| 当前详情对象的关键标识（seqNo / orderId / sessionId / quantity / gradeId 等） |
| 多选/枚举型选择（座位、时段、规格）| 与"选择结果"挂钩的下一跳接口（如选完座 → `order`）| 所选实体集合（如 `{ seqNo, seats: [{ row, column }, ...] }`） |
| 状态结果页引导继续 | 紧邻的状态收束接口（如支付完成后看订单 → `listMyOrders`，若存在）| 过渡所需的最小入参，允许空对象 `{}` |

> **`name` 必须在 `mcp.json.apis[]` 内**。如果当前 skill 还没有对应下一跳接口（例如"支付成功后看订单"但没有 `listMyOrders`），就去掉那个按钮，而不是上行一个不存在的 `name`。
>
> `arguments` 字段名与该接口 `inputSchema.properties` 必须一致；值类型必须符合 schema（number 就是 number，不要传 `"123"` 字符串）。

### 代码样例（WXML + JS）

```xml
<!-- components/display-items/index.wxml 节选 -->
<view wx:for="{{items}}" wx:key="id"
      class="item-card"
      hover-class="item-card-hover"
      bindtap="onTapItem"
      data-id="{{item.id}}"
      data-name="{{item.name}}">
  <image src="{{item.image}}" class="item-image" mode="aspectFill" />
  <view class="item-name">{{item.name}}</view>
  <text class="item-price">¥{{item.price}}</text>
</view>

<view class="more-btn" hover-class="more-btn-hover" bindtap="onTapMore">换一批</view>
```

```javascript
// components/display-items/index.js 的 methods 节选
methods: {
  // 小工具：统一打 [ai-mode] 日志 + 上行 [text, api/call] 组合（使用点现取 ctx，不用 this._modelCtx 等缓存引用）
  _sendUserAction(text, name, args) {
    console.info(`[ai-mode] display-items send api/call name=${name} args=${JSON.stringify(args)}`)
    wx.modelContext.getContext(this).sendFollowUpMessage({
      content: [
        { type: 'text', text },
        { type: 'api/call', data: { name, arguments: args } },
      ],
    })
  },
  onTapItem(e) {
    const { id, name } = e.currentTarget.dataset
    // 详情页依赖图下一跳：searchItemDetail(itemId)；text 用商品名，给用户视角的可读上下文
    this._sendUserAction(`查看 ${name}`, 'searchItemDetail', { itemId: Number(id) })
  },
  onTapMore() {
    // 同能力重检索 —— name 仍是 searchItems；arguments 按该接口 inputSchema 填
    this._sendUserAction('换一批', 'searchItems', { query: this.data.lastQuery || '热门推荐' })
  },
}
```

### 卡片过期（按需，非强制）

> 默认不生成。仅当业务上确实有"该卡片应作废、不应再被点"语义时使用。详见 `SKILL.md` D.4。前提是 `mcp.json.components[]` 对应记录已声明 `expirable: true` + 业务化 `expiredText`，否则调用为空操作。

```js
// 形态 A：写操作型动作完成后，让所有可过期卡片（含自身）一并失效——接口或组件均可
await wx.modelContext.expireAllCards()

// 形态 B：仅过期"此前已渲染的同类卡片"，自身不过期——仅原子组件可调用
await wx.modelContext.getViewContext(this).expirePreviousCards()

// 形态 C：精细过滤（A/B 两个 API 都支持）——只过期匹配特定 componentPath 的卡
await wx.modelContext.expireAllCards({
  componentPaths: ['packageA/weather-skill/components/weather-card/index'],  // 绝对路径，含分包前缀；多条取并集
})

// 形态 D：在 C 的基础上加 match: 'latest'，只过期最近一张匹配卡
await wx.modelContext.getViewContext(this).expirePreviousCards({
  componentPaths: ['packageA/weather-skill/components/weather-card/index'],
  match: 'latest',
})
```

A/B 二选一，不要同时调；调用前后建议各打一行 `[ai-mode] {componentName} expire... done|fail` 日志。

### 半屏页面跳转（溢出时必须生成，其他按需）

> 高度预估溢出且换档仍无法容纳 → 必须挂半屏。入口仅在组件 `methods` 内。完整 API 见 `references/HALF_SCREEN.md`。

```js
Component({
  methods: {
    showDetail(e) {
      const id = e.currentTarget.dataset.id
      const viewCtx = wx.modelContext.getViewContext(this)
      viewCtx.openDetailPage({ url: `/pages/detail/index?id=${id}` })  // 项目内已有的页面路径
    },
  },
})
```

### 溢出处理模板

#### 方式一：半屏展示（纵向内容默认）

**WXML**：

```xml
<!-- 列表项：仅渲染 visibleItems（top-N） -->
<view wx:for="{{visibleItems}}" wx:key="id"
      class="item-card" hover-class="item-card-hover"
      bindtap="onTapItem"
      data-id="{{item.id}}" data-name="{{item.name}}">
  <image src="{{item.image}}" class="item-image" mode="aspectFill" />
  <view class="item-name">{{item.name}}</view>
  <text class="item-price">¥{{item.price}}</text>
</view>

<!-- 溢出提示 + 查看全部按钮 -->
<view wx:if="{{omittedCount > 0}}"
      class="view-all-btn" hover-class="view-all-btn-hover"
      bindtap="onTapViewAll">
  查看全部（共 {{totalCount}} 条）
</view>
```

**JS**：

```javascript
Component({
  data: {
    visibleItems: [],
    omittedCount: 0,
    totalCount: 0,
    allItems: [],  // 保留全量数据供半屏使用
  },
  lifetimes: {
    created() {
      console.info('[ai-mode] {componentName} created')
      const { NotificationType } = wx.modelContext

      const viewCtx = wx.modelContext.getViewContext(this)
      const { minHeight, maxHeight, width } = viewCtx.getDimensions()
      console.info(`[ai-mode] {componentName} dimensions width=${width} minHeight=${minHeight} maxHeight=${maxHeight}`)

      // 记录容器尺寸，用于计算 maxVisibleItems
      this._maxCardHeight = maxHeight

      const modelCtx = wx.modelContext.getContext(this)
      modelCtx.on(NotificationType.Result, (data) => {
        const sc = data.result && data.result.structuredContent
        console.info('[ai-mode] {componentName} 收到 Result:', sc)
        if (!sc || !sc.items) return

        const allItems = (sc.items || []).map(item => ({
          // 字段归一化（按 STYLE_MIGRATION.md 步骤3 映射表）
          id: item.id || item._id,
          name: item.name || item.title || '',
          image: item.cover || item.pic || item.thumb || item.image || '',
          price: item.price || item.salePrice || 0,
        }))

        // 核心：按容器高度计算可容纳条数
        const ITEM_HEIGHT_PX = 60  // 与 wxss 中 item 高度对应，按实际设计调整
        const HEADER_PX = 25       // 标题区
        const FOOTER_PX = 48       // 操作区
        const PADDING_PX = 24      // 容器内边距 12*2
        const available = this._maxCardHeight - HEADER_PX - FOOTER_PX - PADDING_PX
        const maxVisible = Math.max(1, Math.floor(Math.max(0, available) / ITEM_HEIGHT_PX))

        const visibleItems = allItems.slice(0, maxVisible)
        const omittedCount = allItems.length - visibleItems.length

        this.setData({
          visibleItems,
          omittedCount,
          totalCount: allItems.length,
          allItems,  // 供半屏使用
        })
        console.info(`[ai-mode] {componentName} setData total=${allItems.length} visible=${visibleItems.length} omitted=${omittedCount}`)
      })

      // 必做：溢出监听
      viewCtx.on(NotificationType.Overflow, (data) => {
        const overflowed = !!(data && data.overflowHeight > 0)
        console.info(`[ai-mode] {componentName} overflow overflowed=${overflowed} data=${JSON.stringify(data)}`)
      })
      console.info('[ai-mode] {componentName} overflow monitor=on')
    }
  },
  methods: {
    _sendUserAction(text, name, args) {
      console.info(`[ai-mode] {componentName} send api/call name=${name} args=${JSON.stringify(args)}`)
      wx.modelContext.getContext(this).sendFollowUpMessage({
        content: [
          { type: 'text', text },
          { type: 'api/call', data: { name, arguments: args } },
        ],
      })
    },
    onTapItem(e) {
      const { id, name } = e.currentTarget.dataset
      this._sendUserAction(`查看 ${name}`, 'searchItemDetail', { itemId: Number(id) })
    },
    // 溢出时：查看全部 → 打开半屏
    onTapViewAll() {
      const viewCtx = wx.modelContext.getViewContext(this)
      // 复用项目内已有页面，把数据通过 storage 或 query 传递
      // storage key 格式：skills_{skillName}_{dataName}
      wx.setStorageSync('skills_{skillName}_allItems', this.data.allItems)
      viewCtx.openDetailPage({
        url: '/pages/{existingListPage}?fromAI=1'
      })
      console.info('[ai-mode] {componentName} openDetailPage url=/pages/{existingListPage}')
    },
  }
})
```

#### 方式二：横向滚动（横向排列型内容）

**WXML**：

```xml
<scroll-view scroll-x="true" class="scroll-container">
  <view class="scroll-content">
    <view wx:for="{{items}}" wx:key="id"
          class="scroll-item" hover-class="scroll-item-hover"
          bindtap="onTapItem"
          data-id="{{item.id}}" data-name="{{item.name}}">
      <image src="{{item.image}}" class="item-image" mode="aspectFill" />
      <view class="item-name">{{item.name}}</view>
    </view>
  </view>
</scroll-view>
```

**WXSS**：

```css
.scroll-container {
  width: 100%;
  white-space: nowrap;
}
.scroll-content {
  display: flex;
  flex-direction: row;
  gap: 2.13vw;  /* 8px */
}
.scroll-item {
  flex-shrink: 0;
  width: 26.67vw;  /* 100px，按实际设计调整 */
  /* 其他样式按设计规范 */
}
```

### 质量自检

生成完组件后对照以下清单勾选；任一不满足须补齐：

- [ ] **符合 `ATOMIC_COMPONENT_DESIGN.md`**：尺寸档位（5 档之一，`index.wxss` 顶部注释）、圆角 4px、整 skill 一套主题变量（**浅色 + 暗黑两套，颜色按 §2.1 流程从主包 `app.json`/`app.wxss` 等位置提取，且 wxss 顶部注释写出"色源 = …"链路**，通过 `@media (prefers-color-scheme: dark)` 切换）、12px 内边距、17/15/12 字号 + 同一基色 0.9/0.45/0.3 透明度分层、操作区 ≤3 且主动作 ≤1、按钮文案动宾结构
- [ ] **高度预估与溢出**：已按 §7 预估；溢出时优先换档，换档仍溢出已自动生成半屏或横向滚动
- [ ] 每个可交互元素都有 `bindtap` + 配对的 `hover-class`
- [ ] 优先使用形态 2（`text` + `api/call` 组合）；只有无法映射到原子接口时才用形态 1（单 `text`）
- [ ] 若 `content` 里有 `api/call`，前面必须有至少一项 `type: 'text'`；禁止单独发 `api/call`
- [ ] `text` 是用户视角的简短中文（≤ 12 字）、从 dataset 可读字段拼出，不是 args 的 JSON 序列化
- [ ] 所有 `data.name` 都在当前 skill 的 `mcp.json.apis[].name` 中存在
- [ ] 所有 `data.arguments` 字段名与目标接口 `inputSchema.properties` 完全对齐，必填项齐全、无多余字段，值类型匹配
- [ ] `arguments` 里的值取自 `e.currentTarget.dataset` 或 `this.data`，不是占位值
- [ ] 每次上行 `api/call` 前都打了一行 `[ai-mode] {componentName} send api/call name=... args=...` console.info
- [ ] 没有组件层面的直接业务 API 调用（组件不 `wx.request` 业务接口；网络调用必须在原子接口里完成）
- [ ] 点击路径覆盖了 `mcp.json.apis[].description` 中描述的全部下一跳（避免"按钮可见但没绑 api/call"或"按钮映射到不存在的 name"）
- [ ] `created` 中已绑定 `NotificationType.Overflow` 监听，且在绑定后同步打出基线日志 `[ai-mode] {componentName} overflow monitor=on`；事件触发时再打 `[ai-mode] {componentName} overflow overflowed=<true|false> data=<JSON>`（校验侧据此判断是否有裁剪，不依赖截图）

---

## 组件 JS 骨架（所有组件通用）

每个组件的 `index.js` 必须通过 `wx.modelContext.getContext(this)` 监听 `NotificationType.Result`，在收到结果后做字段归一化并 `setData`。关键节点必须打 `[ai-mode]` 前缀日志。

**必做：卡片溢出日志**（`wxa-skills-validate` 的 render 核对会直接读取这条日志判断卡片是否被裁剪）

- 通过 `wx.modelContext.getViewContext(this)` 拿到视图上下文，监听 `NotificationType.Overflow`
- 绑定监听成功后，**立即同步打一行基线日志** `[ai-mode] {componentName} overflow monitor=on`，用于告知校验侧"监听已到位"
- 每次 Overflow 事件触发，再打一行 `[ai-mode] {componentName} overflow overflowed=<true|false> data=<JSON>`（JSON 序列化完整 `data`，至少含 `contentHeight` / `overflowHeight` / `maxHeight`）
- 该日志是校验侧判"是否有内容被裁剪"的**主要依据**；截图仅作为辅助

```javascript
Component({
  data: { /* 按实际渲染字段定义 */ },
  lifetimes: {
    created() {
      console.info('[ai-mode] {componentName} created')
      const { NotificationType } = wx.modelContext

      // 仅在 created 里用临时局部变量绑定监听；on(...) 注册后回调由 SDK 持有，无需挂到 this
      const modelCtx = wx.modelContext.getContext(this)
      modelCtx.on(NotificationType.Result, (data) => {
        const sc = data.result && data.result.structuredContent
        console.info('[ai-mode] {componentName} 收到 Result:', sc)
        if (!sc) return
        // 在此按源 API 实际返回字段做归一化，然后 setData
        this.setData({ /* 归一化后的字段 */ })
      })

      // 获取视图上下文：容器尺寸 + 溢出监听
      const viewCtx = wx.modelContext.getViewContext(this)
      const { minHeight, maxHeight, width } = viewCtx.getDimensions()
      console.info(`[ai-mode] {componentName} dimensions width=${width} minHeight=${minHeight} maxHeight=${maxHeight}`)

      // ⚠️ 必做：监听卡片是否溢出裁剪
      // data 字段：contentHeight=内容总高、overflowHeight=溢出高度、maxHeight=容器硬阈值
      // overflowHeight > 0 即表示内容被裁剪
      viewCtx.on(NotificationType.Overflow, (data) => {
        const overflowed = !!(data && data.overflowHeight > 0)
        console.info(
          `[ai-mode] {componentName} overflow overflowed=${overflowed} ` +
          `data=${JSON.stringify(data)}`
        )
      })
      // 基线日志：监听已绑定；即使 SDK 未派发 Overflow 事件，也能据此判定为"未裁剪"
      console.info('[ai-mode] {componentName} overflow monitor=on')

      // 注：是否把 modelCtx / viewCtx 挂到 this 不重要，on(...) 注册后回调已由 SDK 持有；
      // 真正的规矩在"使用点"：任何在 methods / tap handler / 异步回调里主动调用
      // sendFollowUpMessage / getDimensions 时，必须重新 wx.modelContext.getContext(this)
      // （或 getViewContext(this)）现取；禁止使用 this._modelCtx 之类的缓存引用去调方法。
    }
  }
})
```

> **校验侧判定规则**：
> - `consoleMessages.snapshotCard` 中必须能搜到 `[ai-mode] <component> overflow monitor=on` 基线日志；否则视为未接入监听，render 核对不通过。
> - 如果还能搜到 `[ai-mode] <component> overflow overflowed=true ...`（或 `data.overflowHeight > 0`）→ 判定为**裁剪，不通过**。
> - 如果只有 `monitor=on` 基线日志、没有任何 `overflowed=true`（或根本没有 `overflowed=...` 行）→ 判定为**未裁剪，通过**。

---

## 组件类型选用

| 返回值类型 | 推荐组件形态 |
|-----------|-------------|
| 列表、搜索结果、推荐商品等可迭代数据 | 列表型：`wx:for` 遍历 items，每项展示图文+操作按钮 |
| 详情、用户卡片、单商品信息等单对象 | 详情型：大图+字段行+操作按钮 |
| 购物车、收藏夹等带数量/总价的列表 | 购物车型：列表+底部合计+结算按钮 |
| 下单成功、支付结果、操作确认等状态 | 状态型：图标+标题+摘要+引导按钮 |

> 组件 `index.json` 固定为 `{ "component": true, "usingComponents": {} }`。
>
> 组件 `index.wxss` 首行必须含"样式参考"注释块，说明对齐的源页面路径与迁移的视觉 token；若源不可读，也须写明兜底原因。
