# wx JSAPI 白名单（权威清单）

> **本文件是 `SKILL.md §C` 白名单的权威详表**。SKILL.md 主文档只列高频部分，做完整对照（阶段 1 鉴权扫描 / 阶段 3 JSAPI 提取 / 阶段 5 代码生成）时按需读取本文件。
>
> 三大表：
>
> 1. **接口侧白名单** —— §1 完整列表
> 2. **组件侧白名单** —— §2 完整列表
> 3. **不可迁移 JSAPI** —— §3 完整列表（替代策略）
>
> Taro 项目同样适用本清单（与源框架无关，源码里以 `Taro.xxx` 出现的同名 API 一并比对，生成 `skills/**` 时统一改写为 `wx.xxx`）。

---

## 1. 接口侧白名单（接口侧代码可用）

> 适用范围：通过 `wx.modelContext.registerAPI()` 注册的处理函数及其依赖的纯 JS 模块；不限定目录名。

| 分类 | 接口 |
|------|------|
| Agent | `wx.modelContext.registerAPI('name', handler)`、`wx.modelContext.createSkill(skillPath)`（创建 skill 实例，返回 `{ use, registerAPI }`）、`wx.modelContext.expireAllCards({ componentPaths?, match? })`（标记所有 `expirable: true` 的组件卡片为过期；可按 `componentPath` 绝对路径过滤，`match: 'latest'` 只过期最近一张） |
| 登录 | `wx.login`、`wx.checkSession` |
| 网络 | `wx.request`、`wx.onNetworkWeakChange` / `onNetworkStatusChange` / `offNetworkWeakChange` / `offNetworkStatusChange` / `getNetworkType` / `getLocalIPAddress` |
| 云开发 | `wx.cloud.init`、`wx.cloud.callFunction`、`wx.cloud.database` |
| 位置 | `wx.getLocation`、`wx.getFuzzyLocation`、`wx.openLocation`、`wx.chooseLocation` |
| 加密 | `wx.getUserCryptoManager` |
| 系统 | `wx.getDeviceInfo`、`wx.getAppBaseInfo` |
| 数据缓存 | `wx.getStorage` / `setStorage` / `batchGetStorage` / `batchSetStorage` / `getStorageInfo` / `removeStorage` / `clearStorage` / `setStorageSync` / `getStorageSync` |
| 分享 | `wx.shareAppMessage` |
| 手机号 | `wx.getPhoneNumber`、`wx.getRealtimePhoneNumber` |
| 图片视频 | `wx.chooseMedia`、`wx.chooseMessageFile` |
| 上传下载 | `wx.uploadFile`、`wx.downloadFile` |
| 文件 | `wx.openDocument`（接口与组件均可调） |
| 图片 | `wx.saveImageToPhotosAlbum`、`wx.getImageInfo` |
| 人脸核身 | `wx.startFacialRecognitionVerify`、`wx.startFacialRecognitionVerifyAndUploadVideo` |
| 微信支付 | `wx.requestPayment`、`wx.requestVirtualPayment`、`wx.verifyPaymentPassword`、`wx.requestJointPayment`、`wx.openPublicServicePayment`、`wx.openBusinessView`（`businessType=openPublicServicePayment` / `trafficInvestList` / `wxpayPapayIndex`） |
| 微信支付分 | `wx.openBusinessView`（`businessType=wxpayScoreUse` / `wxpayScoreEnable`） |
| 城市服务 | `wx.openBusinessView`（`businessType=wxCityWxpayAuth`） |
| 订阅消息 | `wx.requestSubscribeMessage` |
| 授权 | `wx.authorize` |
| 设备 | `wx.makePhoneCall`、`wx.scanCode` |
| 地址 | `wx.chooseAddress` |
| 发票 | `wx.chooseInvoice`、`wx.chooseInvoiceTitle` |
| 微信运动 | `wx.getWeRunData` |
| 账号信息 | `wx.getAccountInfoSync`（接口与组件均可调） |
| 设置 | `wx.openSetting`、`wx.getSetting` |
| WiFi | `wx.startWifi` / `stopWifi` / `setWifiList` / `getWifiList` / `getConnectedWifi` / `connectWifi`、`wx.onWifiConnected` / `onWifiConnectedWithPartialInfo` / `onGetWifiList`（含对应 `off*`） |
| 蓝牙（通用） | `wx.openBluetoothAdapter` / `closeBluetoothAdapter` / `getBluetoothAdapterState`、`wx.startBluetoothDevicesDiscovery` / `stopBluetoothDevicesDiscovery`、`wx.getBluetoothDevices` / `getConnectedBluetoothDevices`、`wx.makeBluetoothPair` / `isBluetoothDevicePaired`、`wx.onBluetoothDeviceFound` / `onBluetoothAdapterStateChange`（含对应 `off*`） |
| 蓝牙（BLE 中心） | `wx.createBLEConnection` / `closeBLEConnection`、`wx.getBLEDeviceServices` / `getBLEDeviceCharacteristics` / `getBLEDeviceRSSI`、`wx.readBLECharacteristicValue` / `writeBLECharacteristicValue` / `notifyBLECharacteristicValueChange`、`wx.getBLEMTU` / `setBLEMTU`、`wx.onBLEMTUChange` / `onBLEConnectionStateChange` / `onBLECharacteristicValueChange`（含对应 `off*`） |
| 蓝牙（BLE 外围） | `wx.createBLEPeripheralServer`、`wx.onBLEPeripheralConnectionStateChanged`（含对应 `off*`）、`BLEPeripheralServer.*`（`addService` / `removeService` / `startAdvertising` / `stopAdvertising` / `writeCharacteristicValue` / `close` 及 `on/offCharacteristicReadRequest` / `Subscribed` / `Unsubscribed` / `WriteRequest`） |
| WebSocket | `wx.connectSocket` / `closeSocket` / `sendSocketMessage`、`wx.onSocketOpen` / `onSocketMessage` / `onSocketError` / `onSocketClose`、`SocketTask.*`（`send` / `close` / `on{Open,Message,Error,Close}`） |
| mDNS | `wx.startLocalServiceDiscovery` / `stopLocalServiceDiscovery`、`wx.onLocalServiceFound` / `onLocalServiceLost` / `onLocalServiceResolveFail` / `onLocalServiceDiscoveryStop`（含对应 `off*`） |
| 传感器 | `wx.startAccelerometer` / `stopAccelerometer` + `on/offAccelerometerChange`、`wx.startCompass` / `stopCompass` + `on/offCompassChange`、`wx.startDeviceMotionListening` / `stopDeviceMotionListening` + `on/offDeviceMotionChange`、`wx.startGyroscope` / `stopGyroscope` + `on/offGyroscopeChange` |
| TCP | `wx.createTCPSocket`、`TCPSocket.*`（`connect` / `write` / `close` / `bindWifi` / `on{Connect,Message,Error,Close,BindWifi}` 及对应 `off*`） |
| UDP | `wx.createUDPSocket`、`UDPSocket.*`（`bind` / `connect` / `send` / `write` / `close` / `setTTL` / `on{Listening,Message,Error,Close}` 及对应 `off*`） |

---

## 2. 组件侧白名单（组件侧代码可用）

> 适用范围：原子组件 `Component({})` 内的代码及其引用的纯 JS 模块。组件目录结构是强约束（`components/<name>/index.{js,json,wxml,wxss}`），但其引用的工具模块目录名不限。

| 分类 | 接口 |
|------|------|
| Agent（模型上下文） | `wx.modelContext.getContext(this)` → `ctx.on(NotificationType.Input, cb)`（监听原子接口入参）、`ctx.on(NotificationType.Result, cb)`（监听原子接口返回）、`ctx.sendFollowUpMessage({ content })`（上行文本/`api/call`） |
| Agent（视图上下文） | `wx.modelContext.getViewContext(this)` → `viewCtx.getDimensions()`（获取卡片尺寸）、`viewCtx.on(NotificationType.Overflow, cb)`（监听溢出裁剪）、`viewCtx.setRelatedPage({ query })`（动态设关联页 query）、`viewCtx.expirePreviousCards({ componentPaths?, match? })`（标记**当前组件之前**已渲染、且 `expirable: true` 的卡片为过期；自身不受影响）、`viewCtx.openDetailPage({ url })`（打开半屏页面，详见 `references/HALF_SCREEN.md`） |
| Agent（卡片过期，全量） | `wx.modelContext.expireAllCards({ componentPaths?, match? })`（标记所有 `expirable: true` 的卡片为过期，**包括自身**；接口与组件均可调用）。`componentPaths` 用绝对路径（含分包前缀），多条取并集；`match: 'latest'` 只过期最近一张匹配卡 |
| 界面 | `wx.previewMedia` |
| 网络请求 | `wx.request`（需在 `mcp.json` 声明 `network` 能力，见 `SKILL.md §C.3`） |
| 系统 | `wx.getDeviceInfo`、`wx.getAppBaseInfo` |
| 数据缓存 | `wx.getStorage` / `setStorage` / `batchGetStorage` / `batchSetStorage` / `getStorageInfo` / `removeStorage` / `clearStorage` / `setStorageSync` / `getStorageSync` |
| 文件 | `wx.openDocument` |
| 账号信息 | `wx.getAccountInfoSync` |
| 地图 | `this.createSelectorQuery().select('#mapId').context()` 获取 `MapContext`；`MapContext.*`（`addArc` / `addCustomLayer` / `addGroundOverlay` / `addMarkers` / `addVisualLayer` / `eraseLines` / `executeVisualLayerCommand` / `fromScreenLocation` / `getCenterLocation` / `getRegion` / `getRotate` / `getScale` / `getSkew` / `includePoints` / `initMarkerCluster` / `moveAlong` / `moveToLocation` / `on` / `removeArc` / `removeCustomLayer` / `removeGroundOverlay` / `removeMarkers` / `removeVisualLayer` / `setBoundary` / `setCenterOffset` / `setLocMarkerIcon` / `toScreenLocation` / `translateMarker` / `updateGroundOverlay`）；**`MapContext.openMapApp` 不支持** |

**组件侧禁用**：`wx.cloud.*` / 位置 / 登录 / 支付 / 其它任何接口侧业务接口（除上表已列出的能力）。组件只能收数据（接口返回的 `structuredContent` / `_meta`）、做预览、读系统信息、读写本地缓存、读账号信息、操作 `MapContext`、发声明过能力的网络请求。组件与接口处于不同 JS 上下文，**全局变量不共享**。在 `methods` / tap handler / 异步回调里主动调 `sendFollowUpMessage` / `getDimensions` 时必须现取 `wx.modelContext.getContext(this)` / `getViewContext(this)`，不要通过 `this._modelCtx` 等缓存引用调（详见 `references/COMPONENT_TEMPLATES.md`）。

---

## 3. 不可迁移 JSAPI（接口与组件均禁用）

| 不可用 API | 替代策略 |
|-----------|---------|
| `wx.showToast` / `hideToast` / `showModal` / `showLoading` / `hideLoading` / `showActionSheet` | 结果通过 `content` / `structuredContent` 回馈，Agent 无 loading/modal 概念 |
| `wx.pageScrollTo` | 组件容器不支持滚动 |
| `wx.createAnimation` | 用 CSS `transition/animation`（限 opacity/transform） |
| `wx.navigateTo` / `redirectTo` / `switchTab` / `reLaunch` / `navigateBack` | 删除，Agent 不在页面栈内导航 |
| `wx.chooseImage`（老） | 改用 `wx.chooseMedia` |
| `wx.chooseVideo`（老） | 改用 `wx.chooseMedia` |
| `wx.previewImage`（老） | 组件侧改用 `wx.previewMedia` |
| `wx.setClipboardData` / `getClipboardData` | 跳过 |
| `wx.createSelectorQuery` / `createCanvasContext` | 接口侧不适用；组件侧仅允许通过 `this.createSelectorQuery().select('#mapId').context()` 获取 `MapContext`（详见 §2 地图） |
| `wx.getUserInfo` / `getUserProfile` | 改用登录 + 后端资料接口 |

> Taro 源码里这些 JSAPI 同样可能以 `Taro.xxx` 出现，识别后按上表替代策略处理。

### Taro 特有不可迁移（仅 Taro 项目）

详见 `wxa-skills-generate-taro/references/TARO_ANALYSIS_PATTERNS.md` §4.8。

| 不可用 | 替代策略 |
|-------|---------|
| `useRouter()` / `getCurrentInstance().router.params` | 改用 `inputSchema` 显式声明 query 参数 |
| `useShareAppMessage()` Hook | 接口/组件主动调 `wx.shareAppMessage`（白名单内） |
| `usePullDownRefresh()` / `useReachBottom()` | 删除（卡片不支持滚动） |
| `useDidShow()` / `useDidHide()` | 删除（接口/组件无页面生命周期） |
| `<Navigator url="...">` 组件跳页 | `<view bindtap>` + tap handler 上行 `api/call` |
| Vue `defineComponent` / `<script setup>` / `setup()` 函数 | 改写为原生 `Component({ data, methods })` |
| Pinia `useXxxStore()` / Vuex `mapState` | 字段从 `inputSchema` 入参或 `wx.getStorageSync` 读 |

---

## 4. 判定规则

1. 能力**仅能**通过不可迁移 JSAPI 实现（如"扫码核验"且源码无网络 API 替代）→ 触发阻断规则 B
2. 能力核心逻辑可用网络请求实现 → 生成纯网络请求版本，丢掉不可迁移的 JSAPI 调用
3. 老接口有白名单内新接口替代（`chooseImage` → `chooseMedia`、`previewImage` → `previewMedia`）→ 自动替换
