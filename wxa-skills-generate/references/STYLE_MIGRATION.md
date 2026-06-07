# 原子组件样式迁移指南

> 第五阶段使用。写原子组件 WXML/WXSS 之前**必须**先走一遍本指南，否则生成的卡片会与原小程序风格割裂。

## 核心原则

本指南负责**从源项目迁移**：品牌主色、图片/字段名、视觉语义。
**尺寸档位 / 圆角 / 字号 / 边距 / 主题 / 操作区**由 `ATOMIC_COMPONENT_DESIGN.md` 统一规定——**两者冲突时以设计规范为准**（例如源用 16px 字号、8px 圆角，迁移后仍须用 17/15/12 字号档位 + 4px 圆角）。

`references/COMPONENT_TEMPLATES.md` 中的 WXML/WXSS 只是**结构骨架**。模板里的配色（`#ff4d4f`/`#07c160`）、字号（4vw/3.47vw）、圆角（1.07vw）、图片尺寸、字段名（`imageUrl`/`title`/`price`）均为占位示例，**不得原样复制**。组件根节点禁止写 `max-height` / `min-height` / `height`，否则 `NotificationType.Overflow` 回调会失效。

**自检触发**：若生成的组件 wxss 主色是 `#07c160` 或 `#ff4d4f` 且源页面并未使用这两色、或组件 wxml 里出现 `item.imageUrl` 但源 API 返回字段是 `cover`/`pic`/`thumb`/`image` 之类 — 视为"照抄模板"，必须回本指南重做。

---

## 执行清单（每个原子组件走一遍）

```
- [ ] 步骤 1：定位源页面
- [ ] 步骤 2：读取源代码（wxml / wxss / 公共样式）
- [ ] 步骤 3：建立字段映射表（列表/详情类必做）
- [ ] 步骤 4：提取视觉 token
- [ ] 步骤 5：对齐结构（删除不支持的交互/组件，保留图片等展示节点）
- [ ] 步骤 6：选模板做底（COMPONENT_TEMPLATES.md）
- [ ] 步骤 7：补写样式差异说明
```

---

## 步骤 1：定位源页面

从第二/三阶段产出物中找到该原子接口对应的源页面路径（如 `pages/goods/list`）。一个原子接口对应多个页面时，取**最典型的展示页面**：

- 列表类 → 列表页
- 详情类 → 详情页
- 状态类（支付成功/下单成功）→ 对应的结果页

## 步骤 2：读取源代码

- 源页面 `.wxml`：了解视觉结构（卡片层次、图文排版、字段展示顺序）。**特别留意图片节点（`<image>`）、标签/徽章、评分、副标题等容易被模板漏掉的元素**。
- 源页面 `.wxss`：提取视觉 token（见步骤 4）。
- 源页面引用的公共样式（`app.wxss` 或 `styles/*.wxss`）：补齐继承变量。
- **`app.json`**：抽 `window` / `tabBar` / `darkmode` / `themeLocation` 字段，作为主题色提取的第一来源（见 `ATOMIC_COMPONENT_DESIGN.md` §2.1 的提取流程表）。

## 步骤 3：建立字段映射表（列表/详情类必做）

对照源 API 返回数据（来自第三阶段的接口响应结构）与源页面 `.wxml` 的 `{{}}` 绑定，列出 **源字段 → 组件渲染用字段** 的映射。

**规则**：凡源数据里存在且源页面有渲染的图片、标题、描述、价格、标签、评分等，组件 wxml 不得遗漏。

示例（商品列表）：

| 组件渲染字段 | 源 API 字段（取其一，用 `\|\|` 兜底） | 用途 |
|------------|-----------------------------------|-----|
| `imageUrl` | `item.cover \|\| item.pic \|\| item.thumb \|\| item.image` | 列表图片 |
| `title` | `item.name \|\| item.title \|\| item.goodsName` | 主标题 |
| `price` | `item.price \|\| item.salePrice \|\| item.amount` | 价格 |
| `tags` | `item.tags \|\| item.labels \|\| []` | 标签 |

映射在**组件 `index.js` 的 `NotificationType.Result` 分支**里完成（`setData` 前做一次 `items.map` 归一化），而不是期望 API 天然返回 `imageUrl` 这种通用名：

```javascript
// 在 NotificationType.Result 分支中
const normalizedItems = (rawItems || []).map(item => ({
  imageUrl: item.cover || item.pic || item.thumb || item.image || '',
  title: item.name || item.title || item.goodsName || '',
  price: item.price || item.salePrice || item.amount || 0,
  tags: item.tags || item.labels || [],
  rawId: item.id || item._id, // 保留原始 id 供后续操作
}));
this.setData({ items: normalizedItems });
```

## 步骤 4：提取视觉 token

从源 `.wxss` 中抽出以下字段，记录为 style-reference。**注意迁移策略已按设计规范收敛**：

| Token | 源字段示例 | 迁移策略 |
|-------|-----------|---------|
| 主色 / 强调色 | `color: #ff4d4f` / `background: #07c160` | **原样迁移**到主按钮底色、关键强调字段（价格/状态标签）；**禁止**把品牌色用于次要/辅助文字 |
| 字号层级 | `font-size: 32rpx/28rpx/24rpx` | **不要原样迁移**。统一归档到设计规范的 17/15/12 三档：标题档位 → 17px（4.53vw）、正文档位 → 15px（4vw）、注释档位 → 12px（3.2vw） |
| 圆角 | `border-radius: 8rpx/16rpx` | **不要原样迁移**。所有卡片/按钮/图片圆角统一 4px（1.07vw） |
| 间距 / padding | `padding: 20rpx 30rpx` | **不要原样迁移**。卡片内边距统一 12px（3.2vw）；元素间距仅用 8px 或 16px |
| 分割线 | `border-bottom: 1rpx solid #f0f0f0` | 线条颜色可参考；粗细统一 1rpx≈0.27vw；暗黑模式下需加亮 |
| 背景色 | `background: #f9f9f9` | **必须按 `ATOMIC_COMPONENT_DESIGN.md` §2.1 流程从主包抽取**（`app.json` window/tabBar/darkmode → `app.wxss` 全局类 → 高频页面 wxss 卡片类）；浅色 + 暗黑各取一组，整 skill 共用。**前 6 步任意一步抽到值就禁止套兜底**；全部抽不到时才允许走 §2.3 末位降级（且必须在 wxss 注释声明降级原因） |
| 图片宽高比 | `width: 200rpx; height: 200rpx` | 换算为 `vw`，保持比例；若整体超出所选档位则换档（5 档之一），不要压缩图片到不可读 |

**字号档位换算（来自设计规范，固定值）**：
- 标题 17px → `4.53vw`（正文标题 / 卡片主标题）
- 正文 15px → `4vw`（描述、字段值、按钮文案）
- 注释 12px → `3.2vw`（时间、辅助说明、标签）

**单位换算速查**：
- `1vw ≈ 7.5rpx` （基于 iPhone 6 默认宽度 750rpx = 100vw）
- `1rpx ≈ 0.1333vw`
- `32rpx → 4.27vw`、`28rpx → 3.73vw`、`24rpx → 3.2vw`、`20rpx → 2.67vw`
- 源字号与规范档位不一致时：**向规范档位就近归并**（如源 16px 归并到 17px，源 14px 归并到 15px）

## 步骤 5：对齐结构

组件 WXML 的节点层次（图-标题-描述-价格等）**尽量复刻**源页面 item 的结构，但删除源页面里无法渲染的部分：

| 源页面元素 | 处理方式 |
|-----------|---------|
| 交互事件（`touch*`、`longpress`） | 删除，只保留必要的 `tap` |
| 滚动容器（`scroll-view`） | 仅当源页面是横滚（`scroll-x` / `scrollX`）时保留为 `<scroll-view scroll-x="true">`；纵向滚动（`scroll-y`）改为减少展示条数 + 上行"查看更多"`api/call`（容器不支持纵向滚动） |
| `swiper` / `picker` | 用 `<view>` 列表平铺 |
| `navigator` 跳转 | 删除或改为纯文字展示 |
| `button` | 改为 `<view>` 带 `bindtap` |
| `<image>` | **保留**。模板里的 `wx:if="{{item.imageUrl}}"` 兜底判断可以保留，但前提是已按步骤 3 的字段映射表做了 `imageUrl` 归一化 |

## 步骤 6：选模板做底

样式 token 提取完成后，按第四阶段"返回值类型 → 组件模板"选表，挑一个 `references/COMPONENT_TEMPLATES.md` 里的模板作为骨架，再把提取到的视觉 token 覆盖到模板的 wxss 上，把模板里的占位字段名按步骤 3 的字段映射表在 `index.js` 里归一化。

**不能先写样式再对照源，必须先对照源再写样式。**

## 步骤 7：补写样式差异说明

若源样式因为白名单（`z-index`、`position:fixed`、伪类、CSS 变量）或容器约束（`100vw` 高度上限）无法复刻，在组件 `index.wxss` 顶部注释写明：

```css
/* 样式参考：pages/goods/list/index.wxss
 * 主色 #ff4d4f；字号 32/28/24rpx → 4.27/3.73/3.2vw
 * 源样式差异：
 *   - 源图片 300rpx 正方形，缩小为 20vw（受 100vw 高度约束）
 *   - 源使用 position:fixed 底栏，改为 flex 布局（白名单限制）
 */
```

---

## 源样式无法获取时的兜底

| 情况 | 处理 |
|------|------|
| 源项目是压缩代码，`.wxss` 类名/字段无法识别 | 仍要按 `ATOMIC_COMPONENT_DESIGN.md` §2.1 跑一遍主包提取（`app.json` / 全局 wxss 即使在压缩代码里通常仍可读到色值），抽到的颜色作为 token；只有**全部 6 步都查不到**才允许走 §2.3 末位降级，并在组件 wxss 顶部注释声明降级原因 |
| 源页面使用 CSS-in-JS 或主题变量 | 读取 `app.wxss` 或 `theme.wxss` / `theme-dark.wxss` 里的最终色值后再迁移；浅色 + 暗黑两套都要抽 |
| 找不到对应源页面 | **不等于"找不到主题色"**——即便没有对应业务页面，主包 `app.json` / `app.wxss` 的主题色、品牌色仍然适用，按 §2.1 抽完后再选第四阶段返回值类型对应的结构骨架；wxss 顶部注释写明"无对应业务页，结构按返回值类型选骨架，主题色取自主包 app.wxss" |
