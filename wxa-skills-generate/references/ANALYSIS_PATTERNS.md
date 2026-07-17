# 分析模式参考

> 第一、二、三阶段使用。包含页面功能识别、接口调用搜索、JSAPI 匹配、依赖追踪的正则模式与搜索关键词。

## 目录

- [一、业务流程分析模式](#一业务流程分析模式)
  - [页面功能识别](#页面功能识别)
  - [用户交互事件提取](#用户交互事件提取)
  - [页面间导航追踪](#页面间导航追踪)
- [二、网络接口搜索模式](#二网络接口搜索模式)
  - [wx.request（HTTP 请求）](#wxrequesthttp-请求)
  - [wx.cloud.callFunction（云函数）](#wxcloudcallfunction云函数)
  - [wx.cloud.database（云数据库）](#wxclouddatabase云数据库)
  - [wx.cloud 云存储](#wxcloud-云存储)
  - [wx.cloud.callContainer（云托管）](#wxcloudcallcontainer云托管)
- [三、JSAPI 使用搜索模式](#三jsapi-使用搜索模式)
  - [定位相关](#定位相关)
  - [支付相关](#支付相关)
  - [登录与授权相关](#登录与授权相关)
  - [手机号 / 分享 / 订阅消息](#手机号--分享--订阅消息)
  - [图片视频](#图片视频)
  - [人脸核身](#人脸核身)
  - [系统信息 / 加密](#系统信息--加密)
  - [云开发相关](#云开发相关)
  - [不可迁移的 JSAPI（仅用于分析记录）](#不可迁移的-jsapi仅用于分析记录)
  - [JSAPI 调用上下文分析](#jsapi-调用上下文分析)
- [四、变量引用追踪](#四变量引用追踪)
- [五、信息提取](#五信息提取)
- [六、云环境 ID 提取](#六云环境-id-提取)
- [七、原子接口关联分析](#七原子接口关联分析)
- [八、小程序插件依赖检测](#八小程序插件依赖检测)

---

## 一、业务流程分析模式

### 页面功能识别

通过页面路径和 WXML 内容推断页面用途：

| 路径关键词 | 常见业务 |
|-----------|---------|
| `goods/list`、`product/list`、`shop/index` | 商品列表/首页 |
| `goods/detail`、`product/detail` | 商品详情 |
| `cart`、`shopping-cart` | 购物车 |
| `order/create`、`order/confirm` | 订单确认 |
| `order/list`、`order/index` | 订单列表 |
| `order/detail` | 订单详情 |
| `pay`、`checkout` | 支付 |
| `user`、`mine`、`profile` | 个人中心 |
| `address`、`addr` | 地址管理 |
| `search` | 搜索 |
| `login`、`auth` | 登录/授权 |
| `store`、`shop/nearby` | 门店 |
| `book`、`reserve`、`appointment` | 预约 |

### 用户交互事件提取

```regex
bind(tap|submit|change|input|confirm)\s*=\s*['"](\w+)['"]
catch(tap)\s*=\s*['"](\w+)['"]
```

追踪事件处理函数中的网络请求和 JSAPI 调用，建立"用户操作 → 接口调用"映射。

### 页面间导航追踪

```regex
wx\.(navigateTo|redirectTo|switchTab|reLaunch)\s*\(\s*\{[^}]*url\s*:\s*['"]([^'"]+)['"]
```

提取页面间的 query 参数传递，识别业务流程的页面跳转链路。

---

## 二、网络接口搜索模式

### wx.request（HTTP 请求）

```regex
wx\.request\s*\(\s*\{
wx\s*\[\s*['"]request['"]\s*\]\s*\(
```

追踪封装函数（常见文件名：`request.js`、`http.js`、`api.js`、`service.js`）：
```regex
return\s+new\s+Promise\s*\(.*wx\.request
async\s+function\s+\w*(request|fetch|http|api)\w*
```

### wx.cloud.callFunction（云函数）

```regex
wx\.cloud\.callFunction\s*\(\s*\{
await\s+wx\.cloud\.callFunction\s*\(
wx\s*\[\s*['"]cloud['"]\s*\]\s*\.?\s*\[?\s*['"]?callFunction['"]?\s*\]?\s*\(
```

封装调用：
```regex
function\s+\w*(cloud|callCloud)\w*\s*\(
```

### wx.cloud.database（云数据库）

```regex
wx\.cloud\.database\s*\(\s*\)
\.collection\s*\(\s*['"](\w+)['"]\s*\)
```

操作链追踪：`.where()` → `.orderBy()` → `.limit()` → `.get()|.add()|.update()|.remove()|.count()`

### wx.cloud 云存储

```regex
wx\.cloud\.(uploadFile|downloadFile|getTempFileURL|deleteFile)\s*\(
```

### wx.cloud.callContainer（云托管）

```regex
wx\.cloud\.callContainer\s*\(\s*\{
```

提取 `path`、`X-WX-SERVICE` 头。

---

## 三、JSAPI 使用搜索模式

> ⚠️ 以下是技能分包**白名单内**支持的 JSAPI 搜索模式。**完整白名单见 `references/JSAPI_WHITELIST.md`**（`SKILL.md` D 节只列高频项）。源项目中可能用到白名单之外的接口（如 `wx.scanCode`、`wx.chooseAddress`、`wx.navigateTo` 等），这些不可迁移，提取时应标记并按 D.7 / D.9 判定规则处理。

### 定位相关

```regex
wx\.getLocation\s*\(
wx\.getFuzzyLocation\s*\(
wx\.openLocation\s*\(
wx\.chooseLocation\s*\(
```

分析 `getLocation` 的结果如何被使用（作为请求参数、展示等）；`openLocation` / `chooseLocation` 通常是独立的地图页面交互。

### 支付相关

```regex
wx\.requestPayment\s*\(
wx\.requestVirtualPayment\s*\(
wx\.openBusinessView\s*\(
```

追踪支付参数来源（通常来自一个预下单接口的返回值）。常见模式：
```javascript
// 模式1：直接从接口返回中解构
const payParams = await request('/api/order/prepay', { orderId })
wx.requestPayment({ ...payParams })

// 模式2：从接口返回中提取特定字段
const res = await request('/api/pay/create', { orderId })
wx.requestPayment({
  timeStamp: res.timeStamp,
  nonceStr: res.nonceStr,
  package: res.package,
  signType: res.signType,
  paySign: res.paySign
})

// 模式3：微信支付分（openBusinessView）
wx.openBusinessView({
  businessType: 'wxpayScoreUse',  // 或 'wxpayScoreEnable'
  extraData: { /* 签名参数 */ }
})
```

> 仅 `businessType=wxpayScoreUse` / `wxpayScoreEnable` 在白名单内；其它 `businessType` 不可迁移。

### 登录与授权相关

```regex
wx\.login\s*\(
wx\.checkSession\s*\(
wx\.authorize\s*\(
```

分析登录凭证（code）如何使用（通常发送到后端换取 token）；`authorize` 用于主动申请 scope 授权（如 `scope.userLocation`）。

### 手机号 / 分享 / 订阅消息

```regex
wx\.getPhoneNumber\s*\(
wx\.getRealtimePhoneNumber\s*\(
wx\.shareAppMessage\s*\(
wx\.requestSubscribeMessage\s*\(
```

源项目常见用法：
- **手机号**：通常通过 `<button open-type="getPhoneNumber">` + `bindgetphonenumber` 处理；迁移时改为 `bindtap` + `wx.getPhoneNumber()`
- **分享**：源项目常用 `onShareAppMessage` 页面生命周期；技能分包内应改为在原子接口主动调用 `wx.shareAppMessage`
- **订阅消息**：通常与支付或下单流程绑定，在关键节点请求用户授权

### 图片视频

```regex
wx\.chooseMedia\s*\(
wx\.chooseMessageFile\s*\(
wx\.previewMedia\s*\(
```

> `wx.previewMedia` **仅原子组件可用**，原子接口不支持；`chooseMedia` / `chooseMessageFile` **仅原子接口可用**。

老接口替换：
- `wx.chooseImage` / `wx.chooseVideo` → 统一改为 `wx.chooseMedia`
- `wx.previewImage` → 组件侧改为 `wx.previewMedia`

### 人脸核身

```regex
wx\.startFacialRecognitionVerify\s*\(
wx\.startFacialRecognitionVerifyAndUploadVideo\s*\(
```

### 系统信息 / 加密

```regex
wx\.getDeviceInfo\s*\(
wx\.getAppBaseInfo\s*\(
wx\.getUserCryptoManager\s*\(
```

`wx.getDeviceInfo` / `wx.getAppBaseInfo` 接口与组件**均可用**；其余仅接口可用。

### 云开发相关

```regex
wx\.cloud\.init\s*\(
wx\.cloud\.callFunction\s*\(
wx\.cloud\.database\s*\(
```

> 云开发仅在原子接口中可用，组件侧不可用。

### 不可迁移的 JSAPI（仅用于分析记录）

以下 JSAPI 不在技能分包白名单中，生成代码时不应使用：

```regex
wx\.(scanCode|chooseAddress|chooseImage|chooseVideo)\s*\(
wx\.(setClipboardData|getClipboardData|saveImageToPhotosAlbum|previewImage)\s*\(
wx\.(getUserProfile|getUserInfo)\s*\(
wx\.(navigateTo|redirectTo|switchTab|reLaunch|navigateBack)\s*\(
wx\.(showToast|showModal|showLoading|showActionSheet|hideToast|hideLoading)\s*\(
wx\.(pageScrollTo|createAnimation|createSelectorQuery|createCanvasContext)\s*\(
```

遇到源项目中使用了这些接口的业务功能时：
- 若核心逻辑仍可通过网络请求实现 → 生成纯网络请求版本，丢掉不可迁移的 JSAPI 调用
- 若强依赖不可用 JSAPI（如扫码核心功能且无 API 替代）→ 跳过该功能，不生成原子接口
- 老接口若有白名单内的新接口替代（如 `chooseImage` → `chooseMedia`、`previewImage` → `previewMedia`）→ 自动替换，不标记为"不可迁移"

### JSAPI 调用上下文分析

对每个 JSAPI 调用，需要分析：

1. **调用时机**：是在函数开头（先获取信息再请求）还是在请求之后（如支付）
2. **结果使用**：返回值作为后续请求的参数？展示给用户？存入 storage？
3. **错误处理**：是否有 fail 回调？如何处理用户拒绝/取消？
4. **关联接口**：与哪个网络请求配合使用？

---

## 四、变量引用追踪

wx 和 wx.cloud 可能被赋值给变量：

```javascript
var e = wx; e.request({...})         // 追踪 e → wx
const cloud = wx.cloud; cloud.callFunction({...})  // 追踪 cloud → wx.cloud
```

搜索策略：先找所有 `.request(`、`.callFunction(`、`.database()`、`.callContainer(` 调用，再向上追踪调用对象是否指向 wx/wx.cloud。

---

## 五、信息提取

### URL/路径提取

```regex
['"`](https?:\/\/[^\s'"`]+)['"`]          # 完整 URL
['"`](\/api\/[^\s'"`]+)['"`]              # API 路径
(baseUrl|BASE_URL)\s*[:=]\s*['"`]([^'"`]+)  # baseURL 定义
```

### 云函数名提取

```regex
callFunction\s*\(\s*\{\s*name\s*:\s*['"](\w+)['"]
```

### 集合名提取

```regex
\.collection\s*\(\s*['"](\w+)['"]\s*\)
```

### 云托管路径提取

```regex
callContainer\s*\(\s*\{[^}]*path\s*:\s*['"]([^'"]+)['"]
X-WX-SERVICE['"]\s*:\s*['"]([^'"]+)['"]
```

---

## 六、云环境 ID 提取

> **必须提取**：独立分包需自行 `wx.cloud.init()`。

```regex
wx\.cloud\.init\s*\(\s*\{[^}]*env\s*:\s*['"]([^'"]+)['"]           # 字符串 env
wx\.cloud\.init\s*\(\s*\{[^}]*env\s*:\s*wx\.cloud\.DYNAMIC_CURRENT_ENV  # 动态 env
```

**4 种场景：**
1. 字符串 env `'cloud-xxx'` → 直接写入 `ensureCloudInit()`
2. `wx.cloud.DYNAMIC_CURRENT_ENV` → 分包中也用此值
3. 条件 env（if/三元） → 分析条件，提取对应值
4. 未找到 init → 告警 + TODO 注释

---

## 七、原子接口 关联分析

### 多调用串联模式识别

在同一个事件处理函数中，依次调用多个接口或 JSAPI 的模式：

```regex
// 模式：async 函数中有多个 await 调用
async\s+\w+\s*\([^)]*\)\s*\{[^}]*await[^}]*await
```

### Storage 数据流追踪

识别页面间通过 storage 传递数据的模式：

```regex
wx\.setStorageSync\s*\(\s*['"]([^'"]+)['"]
wx\.getStorageSync\s*\(\s*['"]([^'"]+)['"]
```

追踪同一个 key 在哪些页面写入、哪些页面读取，建立数据流图。

### 页面参数传递追踪

```regex
// 页面跳转中的参数
url:\s*['"][^'"]*\?([^'"]+)['"]
// 页面 onLoad 中的参数接收
onLoad\s*\(\s*(options|params|query)\s*\)
```

---

## 八、小程序插件依赖检测

> ⛔ 如果目标原子接口依赖的业务逻辑中使用了小程序插件，**直接退出生成流程**，告知用户小程序插件暂未支持。

### app.json 插件声明

```regex
"plugins"\s*:\s*\{
```

提取 `plugins` 中声明的所有插件 ID 和版本。

### 页面/组件 JSON 中的插件引用

```regex
"plugin://
```

在 `usingComponents` 中出现 `plugin://` 前缀即表示使用了插件组件。

### JS 中的插件模块引用

```regex
requirePlugin\s*\(
require\s*\(\s*['"]plugin://
```

`requirePlugin` 或 `require('plugin://...')` 是加载插件 JS 模块的方式。

### 检测流程

1. 扫描 `app.json` 的 `plugins` 字段，获取插件声明列表
2. 扫描目标页面/组件的 JSON 文件，检查 `usingComponents` 中是否有 `plugin://` 引用
3. 扫描目标页面/组件的 JS 文件，检查是否调用 `requirePlugin`
4. **任一匹配命中** → 退出生成流程，告知用户：「该功能依赖小程序插件，当前暂不支持自动生成，需手动接入技能分包。」
