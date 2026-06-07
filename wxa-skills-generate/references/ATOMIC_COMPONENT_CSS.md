# 原子组件 CSS 样式规范

> 第五阶段使用（组件样式撰写时）。原子组件的 CSS 支持范围有限，编写样式时需注意以下约束。
>
> **本文件只管"CSS 能力/单位/溢出/选择器白名单"等实现层约束**。卡片的**尺寸档位 / 圆角 / 字号档位 / 边距 / 主题 / 操作区结构**等设计层规范以 `ATOMIC_COMPONENT_DESIGN.md` 为准；本文件示例若与该规范冲突，以 `ATOMIC_COMPONENT_DESIGN.md` 为准。

## 目录

- [〇、渲染容器与单位约束（最高优先级）](#〇渲染容器与单位约束最高优先级)
  - [渲染容器尺寸](#渲染容器尺寸宿主强制组件不可突破)
  - [长度单位：推荐使用 `vw`](#长度单位推荐使用-vw)
  - [环境变量 env() 与安全区](#环境变量-env-与安全区)
- [一、选择器支持](#一选择器支持)
- [二、媒体查询](#二媒体查询)
- [三、CSS 属性支持范围](#三css-属性支持范围)
- [四、动画限制](#四动画限制)
- [五、推荐写法](#五推荐写法)

---

## 〇、渲染容器与单位约束（最高优先级）

### 渲染容器尺寸（宿主强制，组件不可突破）

| 属性 | 值 | 说明 |
|------|-----|------|
| 最大宽度 | `100vw` | 根容器宽度上限 |
| 最小高度 | `25vw` | 即使内容少，宿主也会保留至少此高度 |
| 最大高度 | `100vw` | **超出即被裁剪，容器不支持纵向滚动**（横向超长内容可用 `<scroll-view scroll-x="true">` 包裹，仅横向滚动） |

⚠️ **以上尺寸由宿主自动施加在外层容器上，组件根节点不要再写 `max-height` / `min-height` / `height`**。一旦组件自行设置高度，宿主的 `NotificationType.Overflow` 回调将无法触发，溢出检测会全部失效。

⚠️ **超出 `100vw` 高度的内容会被直接裁掉且不可滚动查看**。因此生成组件时必须：
1. 估算内容撑开后的总高度（含 padding / margin / 所有 item 的总高）。
2. 若估算结果可能超过 `100vw`，**主动减少单项高度、精简字段、或用文本省略/多行截断**，而非依赖滚动。
3. 常见超限场景与对策：
   - 单个 item 内容过丰富 → 精简字段、把长文本改为单行省略
   - 多行文本 → 用 `-webkit-line-clamp` 限制 1~2 行
   - 数据条数较多 → 在 `index.js` 计算 `visibleItems` + `omittedCount`，WXML 渲染"还有 N 条未展示"，由宿主的 `100vw` 边界自然兜底裁剪

### 长度单位：推荐使用 `vw`

| 项 | 规定 |
|----|------|
| ✅ 推荐 | **`vw`**（便于按宿主 `100vw` 容器精确控制尺寸，溢出判断更直观） |
| ✅ 允许 | `rpx`、`px`、`em`、`rem`、`%` —— 只要最终渲染高度不超出 `100vw` 即可 |
| ❌ 禁用 | `vh`、`vmin`、`vmax`、`pt` 等不在小程序 WXSS 规范内的单位 |

**vw 换算参考**（375 px 设备宽）：

| 需求 | 参考值 |
|------|-------|
| 基础行间距 / 小 padding | `2vw` ≈ 7.5px |
| 注释字号（设计规范档位） | `font-size: 3.2vw` ≈ 12px |
| 正文字号（设计规范档位） | `font-size: 4vw` ≈ 15px |
| 标题字号（设计规范档位） | `font-size: 4.53vw` ≈ 17px |
| 卡片/按钮圆角（设计规范固定值） | `1.07vw` ≈ 4px |
| 卡片内边距（设计规范固定值） | `3.2vw` ≈ 12px |
| 列表项图片（对齐 150rpx） | `20vw` |
| 列表项图片（对齐 160rpx） | `21.3vw` |
| 按钮高度（设计规范固定值） | `10.67vw` ≈ 40px |

> 换算关系：`1vw ≈ 3.75px ≈ 7.5rpx`（即 `Nrpx ÷ 7.5 = Nvw`）。混用单位时，务必以"最终渲染是否超出 `100vw` 高度"为判断标准。

**em / rem 注意事项**：

- `rem` 相对于根节点字体尺寸，但目前**无法指定根节点字体尺寸**，取值不稳定，尽量避免使用
- `em` 相对于当前节点字体尺寸；若 `em` 值从父节点继承，不同 lib 版本行为不同（lib v5.x 相对当前节点，lib v6.x 相对父节点）——**避免继承式 em**

### 环境变量 env() 与安全区

表达长度时可用 `env()` 读取宿主环境变量（iOS 安全区等）：

```css
.my-class {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

| 环境变量 | 类型 | 说明 |
|---------|------|------|
| `safe-area-inset-left` | 长度 | 安全区左侧距离 |
| `safe-area-inset-top` | 长度 | 安全区顶部距离 |
| `safe-area-inset-right` | 长度 | 安全区右侧距离 |
| `safe-area-inset-bottom` | 长度 | 安全区底部距离 |

> 原子组件容器已由宿主约束最大高度 `100vw`，通常无需再处理安全区；仅当组件显式对齐系统 UI 层（如状态栏、Home Indicator）时才需要。

---

## 一、选择器支持

出于性能考虑，**仅支持以下选择器**：
- 类选择器：`.my-class {}`
- ID 选择器：`#my-id {}`
- 标签名选择器：`view {}`
- 后代选择器（空格分隔）

✅ **推荐使用类选择器**，具有独特的性能优化。

```css
/* ✅ 支持 */
.my-class {}
#my-id {}
view {}
view#my-id.my-class .another-class {}
.my-class, #my-id { display: block; }

/* ❌ 不支持 */
.parent > .child {}      /* 子选择器 */
.item + .item {}         /* 相邻兄弟选择器 */
.item ~ .item {}         /* 通用兄弟选择器 */
[type="text"] {}         /* 属性选择器 */
:hover {}                /* 伪类选择器 */
::before, ::after {}     /* 伪元素选择器 */
```

---

## 二、媒体查询

支持 CSS Media Queries，可按容器尺寸 / 主题做自适应：

```css
@media (max-width: 360px) {
  .my-class { display: block; }
}

@media (prefers-color-scheme: dark) {
  .card { background-color: #1c1c1e; color: #f5f5f7; }
}
```

**支持的判断条件**：

| 条件 | 值类型 | 说明 |
|------|-------|------|
| `orientation` | string | `landscape` 宽大于高；`portrait` 宽不大于高 |
| `width` / `min-width` / `max-width` | number | 宽度精确值 / 下限 / 上限 |
| `height` / `min-height` / `max-height` | number | 高度精确值 / 下限 / 上限 |
| `prefers-color-scheme` | string | 当前环境主题，通常是 `light` 或 `dark` |

支持 `not` / `and` 关键字；基本媒体类型仅 `all` / `screen` 两种，通常无需写明。

---

## 三、CSS 属性支持范围

### ✅ 支持的属性

| 分类 | 属性 |
|------|------|
| 定位 | `display`(none/inline/inline-block/block/flex)、`position`(relative/absolute)、`box-sizing`、`overflow-x`、`overflow-y` |
| 颜色 | `color`、`opacity`、`visibility` |
| Flex | `flex-direction`、`flex-wrap`、`align-items`、`align-self`、`align-content`、`justify-content`、`flex-grow`、`flex-shrink`、`flex-basis`、`aspect-ratio` |
| 背景 | `background-color`、`background-image`、`background-size`、`background-repeat`、`background-origin`、`background-clip`、`background-position` |
| 尺寸 | `width`、`height`、`min-width`、`min-height`、`max-width`、`max-height`、`left`、`right`、`top`、`bottom` |
| 边距 | `padding-*`、`margin-*` |
| 边线 | `border-*-width`、`border-*-style`(none/solid)、`border-*-color` |
| 圆角 | `border-*-radius` |
| 阴影 | `box-shadow`、`text-shadow` |
| 文本 | `font-size`、`line-height`、`text-align`、`font-weight`、`word-break`、`white-space`、`text-overflow`、`text-indent`、`vertical-align`、`letter-spacing`、`word-spacing`、`font-family`、`font-style` |
| 变换 | `transform`、`transform-origin`、`filter`(仅blur) |
| 动画 | `transition-*`(仅opacity/transform)、`animation-*` |

### ❌ 不支持的属性（常见）

| 属性 | 说明 |
|------|------|
| `position: fixed/sticky` | 仅支持 `relative` 和 `absolute` |
| `display: grid/table/inline-flex` | 仅支持 `none/inline/inline-block/block/flex` |
| `z-index` | 不支持 |
| `float`、`clear` | 不支持浮动布局 |
| `cursor` | 不支持 |
| `text-decoration` | 不支持 |
| `border-style` 其他值 | 仅支持 `none` 和 `solid` |
| `filter` 其他函数 | 仅支持 `blur()` |
| CSS 变量 (`--*`) | 不支持 |

---

## 四、动画限制

`transition` 和 `animation` **仅支持以下属性**：
- `opacity`（透明度）
- `transform`（2D/3D 变换）

```css
/* ✅ 支持 */
.fade { transition: opacity 0.3s ease; }
.slide { transition: transform 0.3s ease; }

/* ❌ 不支持 */
.wrong { transition: background-color 0.3s ease; }
```

---

## 五、推荐写法

### 容器与溢出处理（必须遵循）

组件根节点**不要写 `max-height` / `min-height` / `height`**——外层尺寸由宿主自动施加，手写高度会让 `NotificationType.Overflow` 回调失效。根节点只需要 `overflow: hidden` + 内部布局；溢出由宿主边界自然裁剪，并通过宿主回调上报。任何可能超出的文本或区域必须通过 CSS 省略样式显式提示"内容已省略"：

```css
/* ✅ 组件根容器：不写 max-height / min-height / height，宿主自动施加 */
.card-container {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 3.2vw;     /* 12px，与 ATOMIC_COMPONENT_DESIGN.md 的"卡片内边距"对齐 */
  overflow: hidden;   /* 兜底：超出部分被裁剪 */
}

/* ✅ 内容区域自适应 */
.card-body {
  flex: 1;
  overflow: hidden;
}

/* ✅ 单行文本溢出省略（推荐所有潜在长文本都加） */
.text-ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ✅ 多行文本截断（2 行示例，常用于标题/描述） */
.text-clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
```

**关键要点：**
- **根节点禁写 `max-height` / `min-height` / `height`**；尺寸由宿主自动施加，组件自行设置会破坏 `NotificationType.Overflow` 回调
- 根节点保留 `overflow: hidden` 做兜底
- 凡**可能超长**的单行文本都加 `text-overflow: ellipsis` 三件套（`overflow:hidden; white-space:nowrap; text-overflow:ellipsis`）
- 多行文本使用 `-webkit-line-clamp` 截断到合适行数（通常 1~2 行）
- 生成代码前先估算实际内容总高，若超过 `100vw` 通过减小 item 尺寸或精简字段控制，而非依赖滚动

### 通用样式示例

> 背景配色、字号/透明度档位、主按钮样式见 `ATOMIC_COMPONENT_DESIGN.md`。以下仅示范规范落到 CSS 的最小形态（具体底色与文字色应改为源项目 token）：

```css
.card {
  display: flex;
  flex-direction: column;
  padding: 3.2vw;              /* 12px 内边距 */
  background-color: #f5f5f5;   /* 实色·浅色 */
  border-radius: 1.07vw;       /* 4px 圆角 */
  overflow: hidden;
  box-sizing: border-box;
}

.card-title { font-size: 4.53vw; font-weight: 600; color: rgba(0,0,0,0.9); }   /* 17px 主文 */
.card-desc  { font-size: 4vw;    color: rgba(0,0,0,0.45); }                    /* 15px 次要 */
.card-hint  { font-size: 3.2vw;  color: rgba(0,0,0,0.3);  }                    /* 12px 辅助 */
```
