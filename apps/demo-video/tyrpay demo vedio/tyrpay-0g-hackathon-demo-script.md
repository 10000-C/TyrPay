# TyrPay 0G Hackathon Demo 展示短片脚本

> 版本：0G 生态融合版 / 80 秒 Demo Short Film  
> 用途：0G Hackathon demo video / 产品机制短片 / Remotion 动画脚本前置设计  
> 核心表达：**TyrPay 是构建在 0G 上的 Agent-to-Agent 可验证履约结算层：合约在 0G Chain，证明在 0G Storage，默认证明路径为 0G teeTLS，同时提供 zkTLS 高保证模式。**

---

## 0. 导演总纲

这支短片不是单纯解释一个支付流程，而是展示：

```text
Agent 交易中的核心问题：
Seller 声称完成任务，但 Buyer 看不到真实执行。

TyrPay 的解决方式：
先承诺、再托管、再通过 0G teeTLS / zkTLS 生成可验证证明，
证明存储到 0G Storage，
最终由 0G Chain 上的合约执行结算或退款。
```

原本的通用流程是：

```text
Buyer 创建任务
→ Seller 提交承诺
→ Buyer 锁款
→ Seller 执行
→ Seller 提交证明
→ 系统验证
→ 验证通过后放款
```

0G Hackathon 版本应改成：

```text
Buyer 想付款，但看不到真实执行
→ Evil Seller 展示“声明不可信”的风险
→ TyrPay on 0G 入场，挡住未经证明的付款
→ Honest Seller 提交 Execution Commitment
→ Commitment 与 Escrow 状态写入 0G Chain 合约
→ Seller 通过默认 0G teeTLS 路径执行模型/API调用
→ 证明绑定 provider、request hash、response hash、task、commitment
→ 完整 proof bundle 存储到 0G Storage
→ 0G Chain 合约记录 proof hash / storage reference / settlement state
→ Verifier 判断是否满足付款条件
→ PASS：0G Chain 合约释放托管资金
→ FAIL / TIMEOUT：0G Chain 合约退款给 Buyer
→ 补充：zkTLS mode 用于更严格的数学 / 密码学证明场景
```

### 0.1 一句话定位

```text
TyrPay: verifiable Agent settlement on 0G.
```

中文：

```text
TyrPay：构建在 0G 上的 Agent 可验证履约结算协议。
```

### 0.2 技术主轴

```text
Settlement：0G Chain Contract
Proof Archive：0G Storage
Default Proof Path：0G teeTLS
Advanced Proof Mode：zkTLS
```

### 0.3 需要让评委记住的 4 个点

```text
1. Contract deployed on 0G Chain
   承诺、托管、证明引用、结算状态都由 0G Chain 上的合约管理。

2. Proof stored on 0G Storage
   完整 proof bundle 不塞进合约，而是上传到 0G Storage。
   链上只记录 proof hash / storage reference / settlement state。

3. Default path: 0G teeTLS
   主路径使用 0G teeTLS，作为 0G-native 的证明生成路径。

4. Besides: zkTLS mode
   对更高保证需求，提供 zkTLS 模式，用更严格的数学 / 密码学证明验证 API 交互。
```

### 0.4 边界声明

短片必须明确：

```text
TyrPay does not prove the answer is perfect.
It proves the seller executed the committed call before getting paid.
```

中文：

```text
TyrPay 不证明答案一定完美。
它证明 Seller 在收款之前，确实执行了承诺的调用。
```

这个边界要出现在 Verifier 镜头中，而不是藏在最后。

---

## 1. 视觉主轴

### 1.1 空间规则

```text
左侧：Buyer Agent / 资金来源 / Task Card
右侧：Seller Agent / 服务执行方 / Model/API 调用方
中心：TyrPay Gate / Escrow Vault / Verifier
底部：0G Chain State Rail
上方：Model/API Provider World
右上：0G teeTLS Broker / Proof Layer
右下：0G Storage Proof Archive
阴影区：Fake Log / Cheap Model / Reused Response / Replay Proof
```

### 1.2 技术路径视觉化

```text
资金路径：
Buyer Wallet
→ 0G Chain TyrPay Contract
→ Seller Wallet / Buyer Refund

承诺路径：
Seller Commitment Card
→ commitmentHash
→ 0G Chain Contract

证明路径：
Seller Execution
→ 0G teeTLS Proof Path
→ teeTLS Receipt
→ Proof Bundle
→ 0G Storage
→ proofHash / storageReference
→ 0G Chain Contract

高保证路径：
zkTLS Mode
→ stricter cryptographic proof
→ same settlement interface
```

### 1.3 风格

| 元素 | 风格 |
|---|---|
| 背景 | 深色 OLED / protocol space |
| TyrPay 主色 | Amber + Cyan |
| 0G Chain | 紫色链条 / block rail / contract state |
| 0G Storage | 紫色数据仓 / proof archive grid |
| 0G teeTLS | Cyan-purple secure tunnel / TEE shield |
| zkTLS | Silver-blue math proof grid |
| PASS | Emerald |
| FAIL / INVALID | Rose red |
| Refund | Blue |
| 动效 | 克制、工程感、可解释，不做过度粒子 |

---

## 2. 角色表

### 2.1 Buyer Agent

| 项目 | 设计 |
|---|---|
| 戏剧功能 | 付款方，代表“我愿意付钱，但我要知道对方真的履约” |
| 产品含义 | Buyer 只为可验证履约付款，而不是为 Seller 的声明付款 |
| 性格 | 谨慎、理性、专业 |
| 外形 | 圆角矩形小机器人 / agent terminal (buyer.svg)|
| 主色 | 冷白、淡蓝、少量银灰 |
| 配件 | Task Card、Budget Wallet、验证放大镜 UI |
| 标志动作 | 创建 task、观察 “Done”、把 token 推向 TyrPay 合约而不是 Seller |
| 禁忌 | 不要画成惊慌的人类用户；Buyer 不是受害者，而是理性的自动化付款方 |

#### 关键视觉

```text
Buyer 左手拿 Task Card，右手握着 token。
Seller 说 Done 时，Buyer 的 scanner eye 扫描结果，但看不到真实执行。
```

#### Caption

```text
The buyer sees the result — not the execution.
```

---

### 2.2 Evil Seller

| 项目 | 设计 |
|---|---|
| 戏剧功能 | 具象化 Agent 交易中的不可信风险 |
| 产品含义 | Seller 可能使用低成本模型、假日志、复用响应来伪装履约 |
| 性格 | 投机、快速、试图绕过规则 |
| 外形 | 棱角更尖的 shadow seller / glitch robot (evil_seller.svg)|
| 主色 | 暗紫、灰黑、blocked/error 红 |
| 配件 | Fake Log、Cheap Model、Reused Response 三张卡 |
| 标志动作 | 快速递出 “Done”、把 fake log 塞给 Buyer、伸手直接抓 token |
| 禁忌 | 不要画成夸张恶魔；它是投机型 Agent，不是童话反派 |

#### 关键视觉

```text
Evil Seller 的 “Done” 气泡很大。
但背后藏着：
- Cheap Model
- Fake Log
- Reused Response
- Old Proof Replay
```

#### Caption

```text
Was the promised model really called — or just claimed?
```

---

### 2.3 Honest Seller

| 项目 | 设计 |
|---|---|
| 戏剧功能 | 展示 TyrPay 对真正履约的 Seller 是结算通道，不是阻碍 |
| 产品含义 | Seller 可以通过证明履约获得自动结算 |
| 性格 | 专业、克制、愿意接受规则 |
| 外形 | 干净的模块化机器人 / service agent (honset_seller.svg)|
| 主色 | 深灰机身、cyan proof ribbon、少量 emerald 成功色 |
| 配件 | API connector、model chip、proof capsule、commitment card |
| 标志动作 | 提交 commitment、通过 0G teeTLS 执行调用、上传 proof bundle、等待合约裁决、PASS 后收款 |
| 禁忌 | 不要让它直接向 Buyer 伸手要钱；它应始终通过 TyrPay 获得结算 |

#### 关键视觉

```text
Honest Seller 不绕过 TyrPay。
它的路径是：
commit → escrow → execute via 0G teeTLS → store proof on 0G Storage → settle on 0G Chain
```

#### Caption

```text
For honest sellers, proof becomes the fastest path to payment.
```

---

### 2.4 TyrPay

| 项目 | 设计 |
|---|---|
| 戏剧功能 | 交易规则层，阻止未经证明的付款，并根据证明裁决放款或退款 |
| 产品含义 | 先证明履约，再自动结算 |
| 角色性质 | 不是普通中介，不偏袒 Buyer 或 Seller；它是可执行规则 |
| 视觉形式 | Escrow Vault + Proof Gate + Verifier + 0G Chain Contract |
| 主色 | Tyr amber + proof cyan + 0G purple |
| 核心物件 | 中央托管金库、承诺门、证明扫描器、PASS/FAIL 裁决牌、0G Chain State Rail |
| 标志动作 | 挡住直接付款、记录 commitment、锁定 escrow、扫描 proof、触发 settlement / refund |
| 禁忌 | 不要只表现为普通 escrow；必须表现为 0G 上的可验证结算层 |

#### Caption

```text
Payment waits for proof — enforced on 0G Chain.
```

---

### 2.5 Tyr Guide

| 项目 | 设计 |
|---|---|
| 戏剧功能 | TyrPay 的人格化引导者，帮助观众理解规则变化 |
| 产品含义 | 公平、规则、誓约、验证 |
| 性格 | 冷静、公平、快速 |
| 外形 | 圆盾形 hood、amber visor、cyan holographic tablet、小披带或 proof trail (tyr.svg)|
| 动作组 | Guard、Stamp、Scan、Point、Nod |
| 标志动作 | 对无证明路径举盾；对有效 commitment / proof 盖章；指向 0G Chain、0G Storage、teeTLS path |
| 禁忌 | 不要表现得像 Buyer 的保镖；它不是偏袒者，而是规则执行者 |

---

### 2.6 0G Chain Contract

| 项目 | 设计 |
|---|---|
| 戏剧功能 | TyrPay 的结算执行层 |
| 产品含义 | 合约部署在 0G Chain 上，管理 commitment、escrow、proof reference、settlement state |
| 外形 | 紫色链条轨道 / contract core / block rail |
| 入场时机 | TyrPay 入场后，作为底部 State Rail 持续存在 |
| 主要状态 | `COMMITTED`、`ESCROW_LOCKED`、`PROOF_SUBMITTED`、`VERIFIED`、`SETTLED`、`REFUNDED` |
| 禁忌 | 不要用太多 Solidity 代码遮挡主画面；代码只作为角落 UI 快闪 |

#### Caption

```text
0G Chain Contract: escrow, commitment, settlement state.
```

---

### 2.7 0G Storage Proof Archive

| 项目 | 设计 |
|---|---|
| 戏剧功能 | 存储完整 proof bundle 和可审计记录 |
| 产品含义 | 大型证明材料不放入合约，而是存储到 0G Storage；链上只记录 hash 和 reference |
| 外形 | 紫色分布式数据仓 / proof archive grid |
| 入场时机 | Seller 生成 teeTLS receipt 后 |
| 存储内容 | `provider identity`、`request hash`、`response hash`、`taskId`、`commitmentHash`、`usage metadata`、`signature / proof` |
| 禁忌 | 不要把 0G Storage 表现成普通数据库；它是去中心化 proof archive |

#### Caption

```text
Full proof bundle stored on 0G Storage.
```

---

### 2.8 0G teeTLS Proof Path

| 项目 | 设计 |
|---|---|
| 戏剧功能 | 默认主路径，展示 TyrPay 与 0G 生态的深度融合 |
| 产品含义 | Seller 的模型/API调用经过 0G teeTLS 路径，生成绑定 provider、request hash、response hash 的证明凭证 |
| 外形 | Cyan-purple secure tunnel + TEE shield + signed receipt |
| 入场时机 | Honest Seller 执行任务时 |
| 标志动作 | Routing、Signing、Binding、Receipt generation |
| 禁忌 | 不要说它证明“答案质量正确”；它证明的是调用事实与绑定关系 |

#### Caption

```text
Default Proof Path: 0G teeTLS.
```

---

### 2.9 zkTLS Mode

| 项目 | 设计 |
|---|---|
| 戏剧功能 | 可选高保证模式，展示 TyrPay 的可扩展证明接口 |
| 产品含义 | 对更严格的信任假设，zkTLS 提供更数学化 / 密码学严格的 API 交互证明 |
| 外形 | Silver-blue proof grid / math circuit / optional mode toggle |
| 入场时机 | teeTLS 主路径执行时，以 secondary capability 的形式出现 |
| 标志动作 | `Advanced Mode: zkTLS` 小按钮亮起 |
| 禁忌 | 不要让 zkTLS 抢走 0G teeTLS 主线；这是补充能力，不是主路径 |

#### Caption

```text
Besides, zkTLS mode provides stricter cryptographic proof.
```

---

### 2.10 Model / API Provider World

| 项目 | 设计 |
|---|---|
| 戏剧功能 | 被调用的外部服务世界 |
| 产品含义 | TyrPay 要证明 Seller 是否真实调用了承诺的模型、API 或工具 |
| 外形 | 上方云状节点 / API tower / model chip cluster |
| 主色 | 深蓝底 + cyan 连接线 |
| 入场时机 | Honest Seller 执行任务时 |
| 标志动作 | 接收 request packet，返回 response packet，经过 teeTLS path 形成 receipt |

---

## 3. 时间轴

> 推荐长度：80 秒  
> 叙事结构：风险 → 0G 规则层入场 → 承诺与托管 → 0G teeTLS 执行 → 0G Storage 存证 → 0G Chain 裁决 → Built on 0G 收束
> 工作版原则：实际 Remotion 镜头以评审可读性为准，不机械卡原始秒数；元素入场后尽量保持到段尾，最终合成时用自然 cut/短 crossfade 连接，不把时间浪费在长退出动画。

---

### 0-8s：Buyer 入场，Seller 声称完成

> 节奏修订：单分镜预览不做长退出动画。元素入场后保持到段尾，把最后几秒留给评审阅读核心问题。

| 项目 | 内容 |
|---|---|
| 新引入角色 | Buyer Agent、模糊 Seller 声明 |
| 画面 | Buyer 从左侧进入，手持 Task Card 与 token；右侧弹出 Seller 气泡：“Done.” |
| 镜头重点 | Buyer 看得到结果，看不到执行过程 |
| 角色走向 | Buyer 停在左侧；Seller 只以模糊头像或气泡出现 |
| 屏幕文字 | `A seller says “done.” But what was actually done?` |
| 旁白 | `Agents will pay other agents for research, data, code, and API-backed work. But when a seller says “done,” the buyer only sees the result — not the execution.` |
| 音效 | 轻微 notification sound；“Done” 出现后短暂停顿 |
| 导演意图 | 先制造“要不要付款”的悬念，不急着解释 0G 技术栈 |

#### 画面草图

```text
[Buyer Agent + Task Card + Token]        [Seller Bubble: Done]
```

---

### 8-17s：Evil Seller 入场，具象化不可信风险

> 实际动画时长：9 秒。此段风险卡信息较多，动画中放慢为逐张进入并增加停留时间，同时弱化 Honest Seller 轮廓，保证评审优先读懂 Evil Seller 的风险。单分镜预览不做长退出动画，风险卡保持到段尾。

| 项目 | 内容 |
|---|---|
| 新引入角色 | Evil Seller、Honest Seller 半透明轮廓 |
| 画面 | Seller 头像分裂成两种可能：Honest Seller silhouette 与 Evil Seller；Evil Seller 抽出 Fake Log / Cheap Model / Reused Response / Old Proof Replay 四张卡 |
| 镜头重点 | Buyer 无法区分真实履约和伪装履约 |
| 角色走向 | Evil Seller 从右侧斜向冲向 Buyer 的 token；Honest Seller 只作为静态可能性存在 |
| 屏幕文字 | `Claim ≠ fulfillment` |
| 旁白 | `Did it call the promised model? Did it use the right API? Or did it replace the work with a cheaper shortcut?` |
| 音效 | Glitch / warning pulse |
| 导演意图 | 把产品痛点从抽象信任问题变成具体交易风险 |

#### 画面草图

```text
[Buyer Token]  ←  [Evil Seller: Fake Log / Cheap Model / Reused Response / Replay]
```

---

### 17-26s：TyrPay on 0G 入场，挡住直接付款

> 实际动画时长：9 秒。此段需要让评审清楚看到 TyrPay Gate 落下、Tyr Guide 举盾、0G Chain Contract rail 点亮，故比原计划多 1 秒。单分镜预览不做长退出动画，Gate 和 0G Chain rail 保持到段尾。

| 项目 | 内容 |
|---|---|
| 新引入角色 | TyrPay Gate、Escrow Vault、Tyr Guide、0G Chain State Rail |
| 画面 | Evil Seller 快碰到 token 时，TyrPay Gate 从中间落下；Tyr Guide 举盾挡住直接付款路径；底部亮起 `0G Chain Contract` |
| 镜头重点 | TyrPay 第一次作为“0G 上的规则层”出现 |
| 角色走向 | Buyer 在左，Seller 侧在右，TyrPay 固定在中央；底部 0G Chain State Rail 成为持续 UI |
| 屏幕文字 | `Payment waits for proof — enforced on 0G Chain.` |
| 旁白 | `TyrPay turns agent payments into verifiable settlement. Funds can move only through commitment, proof, and verification enforced by contracts on 0G Chain.` |
| 音效 | Gate drop / shield block / amber + purple pulse |
| 导演意图 | 让 0G Chain 不是最后出现的 logo，而是 TyrPay 规则执行层 |

#### 画面草图

```text
[Buyer]  →  [TyrPay Gate / Escrow Vault]  ←  [Evil Seller blocked]

────────────────────────────────────────
0G Chain Contract: initialized
────────────────────────────────────────
```

---

### 26-37s：Honest Seller 提交 Execution Commitment

> 实际动画时长：约 11 秒。此段重点是让评审看清 commitment card 的字段、Tyr Guide 盖章、0G Chain rail 写入 `commitmentHash`。卡片、Gate、Seller 分开放置，避免和上一镜头一样把文字与角色堆在中心。

| 项目 | 内容 |
|---|---|
| 新引入角色 | Honest Seller 前景入场 |
| 画面 | Evil Seller 退入阴影；Honest Seller 从右侧走出，把 Commitment Card 递到 TyrPay Gate 左侧；Tyr Guide 盖章 `COMMITMENT`；底部 0G Chain State Rail 写入 `commitmentHash` |
| 镜头重点 | 诚实 Seller 不绕过规则，而是接受可验证承诺 |
| 角色走向 | Honest Seller 面向 TyrPay，不直接向 Buyer 要钱；Buyer 通过 TyrPay 查看 commitment |
| Commitment Card 字段 | `Task ID`、`Promised Model/API`、`Usage Limit`、`Deadline`、`Proof Mode: 0G teeTLS`、`Storage Target: 0G Storage` |
| 屏幕文字 | `A claim becomes an execution commitment.` |
| 旁白 | `Before funds move, the seller commits to the model, endpoint, usage, deadline, and proof mode. The commitment hash is recorded by the TyrPay contract on 0G Chain.` |
| 音效 | Stamp / clean UI click / chain write tick |
| 导演意图 | 把“承诺”从叙事概念变成链上状态 |

#### 画面草图

```text
[Buyer watches]  [TyrPay Gate: COMMITMENT]  [Honest Seller submits card]

0G Chain State:
COMMITTED
commitmentHash = 0x...
```

---

### 37-47s：Buyer 锁款，资金进入 0G Chain 合约

> 实际动画时长：约 10 秒。实现优先保证 token 入 vault、`ESCROW_LOCKED` 状态、Seller wallet 仍为 0 三件事读得清楚；不做长退出动画，直接承接上一镜头的 Chain rail。

| 项目 | 内容 |
|---|---|
| 新引入角色 | 无，新动作：Escrow funding |
| 画面 | Buyer 检查 commitment；token 从 Buyer 移动到 TyrPay Escrow Vault；底部 0G Chain State Rail 从 `COMMITTED` 变成 `ESCROW_LOCKED`；Seller 钱包保持未收款状态 |
| 镜头重点 | 钱进入 0G Chain 上的托管合约，而不是 Seller 钱包 |
| 角色走向 | Buyer 向中央推 token；TyrPay vault 发出 amber lock；Honest Seller 后退一步准备执行 |
| 屏幕文字 | `Funds enter the 0G Chain contract, not the seller wallet.` |
| 旁白 | `The buyer accepts the commitment and locks funds into the TyrPay contract on 0G Chain. The seller has not been paid yet.` |
| 音效 | Token slide / vault lock / chain state update |
| 导演意图 | 明确买方保护：不是预付款给 Seller，而是把钱锁入可执行规则中 |

#### 画面草图

```text
[Buyer]  → token →  [0G Chain Escrow Vault LOCKED]      [Seller Wallet: 0]

0G Chain State:
ESCROW_LOCKED
```

---

### 42-54s：Honest Seller 通过 0G teeTLS 主路径执行任务

| 项目 | 内容 |
|---|---|
| 新引入角色 | Model / API Provider World、0G teeTLS Proof Path、zkTLS Mode Toggle |
| 画面 | Honest Seller 向上方 Model/API Provider 发起调用；请求进入 `0G teeTLS Proof Path`；TEE shield 出现；response 返回后形成 `teeTLS Receipt`；receipt 被三道 seal 包裹：Provider / Request Hash / Response Hash |
| 镜头重点 | 主路径是 0G teeTLS；证明绑定真实 provider、request hash、response hash |
| 角色走向 | Honest Seller → 0G teeTLS Path → Model/API Provider → teeTLS Receipt → Proof Bundle |
| zkTLS 展示 | 右侧小卡片亮起：`Advanced Mode: zkTLS — stricter cryptographic proof`，但不抢主线 |
| Evil Seller 动作 | 试图递 Fake Log / Replay Proof，被 Tyr Guide shield 弹开并标记 INVALID |
| 屏幕文字 | `Default Proof Path: 0G teeTLS.` |
| 旁白 | `Now the seller executes through TyrPay’s default proof path: 0G teeTLS. The call produces a signed receipt bound to the provider, the request hash, and the response hash. For higher-assurance cases, TyrPay also provides zkTLS mode for stricter cryptographic proof of the API interaction.` |
| 音效 | Secure tunnel / seal clicks / invalid buzz |
| 导演意图 | 这是 0G 技术展示的主镜头：teeTLS 是主路径，zkTLS 是更严格的补充模式 |

#### 画面草图

```text
                         [Model / API Provider]
                                  ↑↓
[Honest Seller] → [0G teeTLS Proof Path / TEE Shield] → [teeTLS Receipt]

Side Toggle:
[Default: 0G teeTLS]  [Advanced: zkTLS]
```

---

### 54-62s：Proof Bundle 上传到 0G Storage

| 项目 | 内容 |
|---|---|
| 新引入角色 | 0G Storage Proof Archive |
| 画面 | teeTLS Receipt、taskId、commitmentHash、usage metadata 被打包成 Proof Bundle；Proof Bundle 上传到 0G Storage；返回 `proofHash` 和 `storageReference`；底部 0G Chain State Rail 更新为 `PROOF_SUBMITTED` |
| 镜头重点 | 完整证明包存储到 0G Storage，链上只记录证明引用 |
| 角色走向 | Proof Bundle → 0G Storage → proofHash / storageReference → 0G Chain Contract |
| Proof Bundle 字段 | `provider identity`、`request hash`、`response hash`、`taskId`、`commitmentHash`、`usage metadata`、`teeTLS receipt / zkTLS proof` |
| 屏幕文字 | `Full proof bundle stored on 0G Storage.` |
| 旁白 | `The full proof bundle is stored on 0G Storage. The 0G Chain contract only keeps the proof hash, storage reference, commitment state, and escrow state.` |
| 音效 | Data archive / storage confirm / chain reference tick |
| 导演意图 | 展示链上合约和去中心化存储的分工，避免把 proof storage 讲成普通数据库 |

#### 画面草图

```text
[Proof Bundle]
  ├─ provider identity
  ├─ request hash
  ├─ response hash
  ├─ taskId
  ├─ commitmentHash
  ├─ usage metadata
  └─ teeTLS receipt / zkTLS proof
          ↓
[0G Storage Proof Archive]
          ↓
proofHash + storageReference
          ↓
[0G Chain Contract]
```

---

### 62-72s：Verifier 裁决，0G Chain 合约执行结算状态

| 项目 | 内容 |
|---|---|
| 新引入角色 | Verifier Panel、0G Chain Settlement Core |
| 画面 | TyrPay Gate 展开为三层：Verifier Panel、0G Storage Reference、0G Chain Settlement Contract；Verifier Panel 顶部出现问题：`Has the seller earned settlement?` |
| 镜头重点 | 验证不是技术炫耀，而是决定是否放款 |
| 角色走向 | Honest Seller 等待裁决；Buyer 等待结果；Evil Seller 的 fake log / replay proof 在旁边显示 INVALID |
| Checklist | `Proof valid`、`Provider matched`、`Request hash matched`、`Response hash matched`、`Task matched`、`Commitment matched`、`Usage satisfied`、`Within deadline`、`Not replayed`、`Proof archived on 0G Storage` |
| 边界声明 | `TyrPay does not judge answer quality. It verifies committed execution.` |
| 屏幕文字 | `Verification decides settlement.` |
| 旁白 | `The verifier checks whether the payment conditions were met: proof validity, provider match, task binding, commitment match, usage, deadline, replay protection, and proof availability on 0G Storage. TyrPay does not judge answer quality. It verifies committed execution.` |
| 音效 | Scanner / checklist ticks / heartbeat pause before verdict |
| 导演意图 | 把 verification 拍成“付款裁决”，同时明确 TyrPay 不证明答案质量 |

#### 画面草图

```text
[TyrPay Expanded]
  ├─ Verifier: Has the seller earned settlement?
  ├─ 0G Storage: proof bundle reference
  └─ 0G Chain: escrow + settlement state

Boundary:
Not answer quality.
Committed execution.
```

---

### 72-78s：PASS / FAIL 双路径裁决

| 项目 | 内容 |
|---|---|
| 新引入角色 | 无，新状态：PASS / FAIL / TIMEOUT |
| 画面 | 画面分为上下两条路径：上路 Honest Seller PASS，0G Chain Escrow Vault 解锁，资金流向 Seller；下路 Evil Seller FAIL/TIMEOUT，fake log / replay proof rejected，资金退回 Buyer |
| 镜头重点 | 证明通过放款，证明失败或超时退款 |
| 角色走向 | PASS：0G Chain Contract → Seller；FAIL/TIMEOUT：0G Chain Contract → Buyer Refund |
| 屏幕文字 | `PASS settles. FAIL refunds.` |
| 旁白 | `If the proof passes, the TyrPay contract on 0G Chain releases escrow to the seller. If the proof fails or times out, the buyer is refunded.` |
| 音效 | PASS chime / refund reverse sweep |
| 导演意图 | 这是主故事的判决结果，要拍成高潮，不要一闪而过 |

#### 画面草图

```text
PASS:
[0G Chain Escrow Vault] → [Honest Seller Wallet]

FAIL / TIMEOUT:
[0G Chain Escrow Vault] → [Buyer Refund]
```

---

### 78-80s：Built on 0G 收束

| 项目 | 内容 |
|---|---|
| 新引入内容 | 0G 技术栈总结 |
| 画面 | 主流程淡出，只保留 TyrPay vault 与 0G 技术栈四行总结 |
| 镜头重点 | 当前 demo 是 0G-native verifiable settlement，不只是普通协议部署到链上 |
| Roadmap 文案 | `Built on 0G` / `✓ 0G Chain settlement contracts` / `✓ 0G Storage proof archive` / `✓ 0G teeTLS default proof path` / `✓ zkTLS high-assurance mode` |
| 屏幕文字 | `TyrPay: verifiable Agent settlement on 0G.` |
| 旁白 | `TyrPay is verifiable Agent settlement on 0G: settlement contracts on 0G Chain, proof archives on 0G Storage, 0G teeTLS as the native proof path, and zkTLS for higher-assurance cases.` |
| 音效 | Calm closing pulse |
| 导演意图 | 最后一眼必须让评委记住 0G 融合点 |

#### 画面草图

```text
TyrPay: verifiable Agent settlement on 0G.

Built on 0G:
✓ 0G Chain settlement contracts
✓ 0G Storage proof archive
✓ 0G teeTLS default proof path
✓ zkTLS high-assurance mode

Next:
Proof-based reputation for Agent marketplaces
```

---

## 4. 英文旁白整合版

```text
Agents will pay other agents for research, data, code, and API-backed work.

But when a seller says “done,” the buyer only sees the result — not the execution.
Did it call the promised model?
Did it use the right API?
Or did it replace the work with a cheaper shortcut?

TyrPay makes payment wait for proof.

Funds can move only through commitment, proof, and verification
enforced by contracts on 0G Chain.

Before funds move, the seller commits to the model, endpoint, usage, deadline, and proof mode.
The commitment hash is recorded by the TyrPay contract on 0G Chain.

The buyer accepts the commitment and locks funds into the contract.
The seller has not been paid yet.

Now the seller executes through TyrPay’s default proof path: 0G teeTLS.

The call produces a signed receipt bound to the provider,
the request hash,
and the response hash.

For higher-assurance cases,
TyrPay also provides zkTLS mode
for stricter cryptographic proof of the API interaction.

The full proof bundle is stored on 0G Storage.
The 0G Chain contract only keeps the proof hash,
storage reference,
commitment state,
and escrow state.

The verifier checks whether the payment conditions were met:
proof validity,
provider match,
task binding,
commitment match,
usage,
deadline,
replay protection,
and proof availability on 0G Storage.

TyrPay does not judge answer quality.
It verifies committed execution.

If the proof passes,
the TyrPay contract on 0G Chain releases escrow to the seller.

If proof fails or times out,
the buyer is refunded.

TyrPay is verifiable Agent settlement on 0G:
settlement contracts on 0G Chain,
proof archives on 0G Storage,
0G teeTLS as the native proof path,
and zkTLS for higher-assurance cases.
```

---

## 5. 中文字幕整合版

```text
未来，Agent 会为研究、数据、代码和 API 驱动的服务互相付款。

但当一个 Seller Agent 说“完成了”，Buyer 只能看到结果，看不到真实执行。
它真的调用了承诺的模型吗？
它真的访问了指定 API 吗？
还是用更低成本的方式替代了履约？

TyrPay 让支付等待证明。

资金只能通过承诺、证明和验证后移动，
并由 0G Chain 上的 TyrPay 合约执行。

资金移动之前，Seller 必须先提交执行承诺：
它要调用哪个模型或 API，
使用多少 usage，
在什么 deadline 前完成，
以及采用哪种证明模式。

这份 commitment hash 会记录在 0G Chain 上的 TyrPay 合约中。

Buyer 接受承诺后，把资金锁入合约。
此时 Seller 还没有收到付款。

随后，Seller 通过 TyrPay 的默认证明路径执行任务：0G teeTLS。

这次调用会生成一个签名凭证，
绑定 provider、
request hash、
和 response hash。

对于更高保证需求，
TyrPay 也提供 zkTLS 模式，
用更严格的密码学证明验证这次 API 交互。

完整的 proof bundle 会存储在 0G Storage。
0G Chain 上的合约只保存 proof hash、
storage reference、
commitment state、
和 escrow state。

Verifier 检查付款条件是否满足：
证明有效性、
provider 是否匹配、
任务是否绑定、
承诺是否匹配、
usage、
deadline、
防重放、
以及 proof 是否可从 0G Storage 获取。

TyrPay 不判断答案质量。
它验证的是 Seller 是否按承诺执行。

如果证明通过，
0G Chain 上的 TyrPay 合约自动释放托管资金给 Seller。

如果证明失败或超时，
资金退还给 Buyer。

TyrPay 是构建在 0G 上的 Agent 可验证履约结算层：
0G Chain 负责结算合约，
0G Storage 负责证明存储，
0G teeTLS 是原生证明路径，
zkTLS 用于更高保证场景。
```

---

## 6. 屏幕文字整合版

```text
A seller says “done.”
But what was actually done?

Claim ≠ fulfillment

Payment waits for proof — enforced on 0G Chain.

A claim becomes an execution commitment.

Funds enter the 0G Chain contract,
not the seller wallet.

Default Proof Path:
0G teeTLS

Advanced Mode:
zkTLS for stricter cryptographic proof

Full proof bundle stored on 0G Storage.

Verification decides settlement.

TyrPay does not judge answer quality.
It verifies committed execution.

PASS settles.
FAIL refunds.

TyrPay:
verifiable Agent settlement on 0G.

Built on 0G:
✓ 0G Chain settlement contracts
✓ 0G Storage proof archive
✓ 0G teeTLS default proof path
✓ zkTLS high-assurance mode
```

---

## 7. 技术展示 Checklist

### 7.1 必须展示

```text
[ ] TyrPay contract deployed on 0G Chain
[ ] Commitment hash recorded on 0G Chain
[ ] Escrow state locked on 0G Chain
[ ] Seller uses 0G teeTLS as the default proof path
[ ] teeTLS receipt binds provider / request hash / response hash
[ ] Full proof bundle uploaded to 0G Storage
[ ] 0G Chain contract stores proofHash / storageReference
[ ] Verifier checks task / commitment / provider / usage / deadline / replay protection
[ ] PASS releases escrow to seller
[ ] FAIL or TIMEOUT refunds buyer
[ ] zkTLS appears as optional high-assurance mode
```

### 7.2 不要过度展示

```text
[ ] 不要把 zkTLS 拍成主路径，主路径必须是 0G teeTLS
[ ] 不要把 0G Storage 拍成普通数据库
[ ] 不要说 TyrPay 证明答案质量正确
[ ] 不要过早展示复杂架构图，先讲清楚交易冲突
[ ] 不要把 reputation / marketplace ranking 说成已实现能力
```

### 7.3 Future Work 保持一行即可

```text
Next:
Proof-based reputation for Agent marketplaces.
```

不要在主流程中展开 marketplace ranking、pricing signals、long-term trust layer。否则会稀释 0G 技术展示。

---

## 8. Remotion 实现建议

### 8.1 组件拆分

```text
components/
  BuyerAgent.tsx
  EvilSeller.tsx
  HonestSeller.tsx
  TyrPayGate.tsx
  TyrGuide.tsx
  EscrowVault.tsx
  CommitmentCard.tsx
  ZeroGChainRail.tsx
  ZeroGStorageArchive.tsx
  TeeTLSProofPath.tsx
  ZkTLSModeToggle.tsx
  ModelApiProvider.tsx
  ProofBundleCard.tsx
  VerifierPanel.tsx
  VerdictSplit.tsx
  BuiltOnZeroGSummary.tsx

scenes/
  OpeningClaim.tsx
  RiskReveal.tsx
  TyrPayOnZeroGEntrance.tsx
  CommitmentOnChain.tsx
  EscrowFunding.tsx
  TeeTLSExecution.tsx
  ProofStorage.tsx
  Verification.tsx
  Verdict.tsx
  BuiltOnZeroGClose.tsx
```

### 8.2 状态 rail 文案

```text
0G Chain State:
INIT
COMMITTED
ESCROW_LOCKED
PROOF_SUBMITTED
VERIFIED
SETTLED / REFUNDED
```

### 8.3 Proof Bundle UI

```text
Proof Bundle
├─ provider identity
├─ request hash
├─ response hash
├─ taskId
├─ commitmentHash
├─ usage metadata
├─ proof mode: 0G teeTLS
└─ optional: zkTLS proof
```

### 8.4 动效节奏

| 镜头 | 动效建议 |
|---|---|
| Done 气泡 | 突然弹出，随后轻微不稳定 |
| Evil Seller | glitch、斜向移动、红色 INVALID 闪烁 |
| TyrPay Gate | 从中间落下，形成不可绕过的规则墙 |
| 0G Chain Rail | 底部连续状态更新，不抢主镜头 |
| Commitment | 卡片盖章后变成 hash 写入链上 rail |
| Escrow | token 滑入 vault，vault lock + purple chain tick |
| 0G teeTLS | secure tunnel + TEE shield + receipt seal |
| zkTLS | 作为右侧 secondary mode toggle，短暂亮起 |
| 0G Storage | proof bundle 分片进入 archive grid |
| Verifier | checklist 逐项 tick，最后出现 verdict |
| PASS / FAIL | 上下双路径，资金分别流向 Seller 或 Buyer |
| 结尾 | 四行 Built on 0G 总结，停留足够长 |

---

## 9. 最终定位文案

### 9.1 英文

```text
TyrPay is a verifiable settlement layer for Agent-to-Agent payments, built on 0G.

Escrow and settlement are enforced by contracts on 0G Chain.
Proof bundles are stored on 0G Storage.
The default proof path uses 0G teeTLS, making TyrPay native to the 0G ecosystem.

For higher-assurance cases, TyrPay also provides zkTLS mode,
offering stricter cryptographic proof of the API interaction.

TyrPay does not prove that an answer is perfect.
It proves that the seller executed the committed call before getting paid.
```

### 9.2 中文

```text
TyrPay 是构建在 0G 上的 Agent-to-Agent 可验证结算层。

托管与结算由 0G Chain 上的合约执行。
完整 proof bundle 存储在 0G Storage。
默认证明路径使用 0G teeTLS，使 TyrPay 原生接入 0G 生态。

对于更高保证需求，TyrPay 也提供 zkTLS 模式，
用更严格的密码学证明验证 API 交互。

TyrPay 不证明答案一定完美。
它证明 Seller 在收款之前，确实执行了承诺的调用。
```

---

## 10. 一句话收束

```text
TyrPay turns 0G Chain, 0G Storage, and 0G teeTLS into a verifiable settlement layer for Agent-to-Agent payments.
```

中文：

```text
TyrPay 将 0G Chain、0G Storage 和 0G teeTLS 组合成 Agent-to-Agent 支付的可验证履约结算层。
```
