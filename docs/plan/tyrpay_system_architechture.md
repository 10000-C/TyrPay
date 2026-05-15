# TyrPay 系统角色与分层架构文档
1. 系统定位

TyrPay 是面向 Agent-to-Agent 经济的可验证履约结算协议。其核心目标不是证明模型计算本身的正确性，而是证明服务方 Agent 是否按照事前承诺调用了指定模型、API 或工具，并在满足履约条件后触发结算。

Phase 1 的系统目标是实现最小可信闭环：

证明 Seller Agent 调用了承诺的模型或 API，
并满足最低 usage 要求后，才允许释放 Buyer 锁定的资金。
2. 分层架构概览

TyrPay Phase 1 采用分层架构，核心组件包括：

Agent Interface Layer
  └── Buyer Agent / Seller Agent / MCP / Skill

SDK Layer
  ├── Buyer SDK
  └── Seller SDK

Contract Layer
  ├── Task Registry
  ├── Escrow
  ├── Settlement
  └── Verifier Registry

Proof Layer
  ├── zkTLS Adapter
  ├── Delivery Receipt
  └── Proof Bundle

Verification Layer
  └── Centralized Verifier

Storage Layer
  └── 0G Storage / Verifiable Storage

该架构的基本原则是：

SDK 负责协议可用性；
Contracts 负责资金与状态；
Verifier 负责履约判断；
Storage 负责证明数据可用性；
zkTLS 负责外部调用真实性证明。

3. Buyer SDK

3.1 角色定位

Buyer SDK 是 Buyer Agent 接入 TyrPay 的主要接口。它负责封装任务创建、承诺读取、资金锁定和结算结果查询等流程，使 Buyer Agent 能够以程序化方式购买可验证服务。

Buyer SDK 不直接处理 zkTLS 证明，也不判断证明是否有效。

3.2 核心职责

Buyer SDK 主要承担以下职责：

1. 创建任务意向；
2. 从合约获取 taskId 与 taskNonce；
3. 读取 Seller 提交的 Execution Commitment；
4. 校验 commitment 是否符合 Buyer 预期；
5. 在确认 commitment 后锁款（`fundTask` 强制在锁款前调用 `validateCommitment`，确保链下承诺内容符合 Buyer 预期）；
6. 监听任务状态；
7. 查询 Verification Report 与最终结算结果；
8. 超时退款：在 proof submission grace period 结束后未提交 proof 时退款（`refundAfterProofSubmissionDeadline`）；在 verification timeout 后未收到 settlement report 时退款（`refundAfterVerificationTimeout`）。

3.3 设计边界

Buyer SDK 只负责 Buyer 侧的任务生命周期管理，不负责证明生成、证明聚合或履约裁决。其关注点是：

Buyer 是否接受 Seller 的承诺；
资金是否被正确锁定；
任务最终是放款还是退款。

---

4. Seller SDK

4.1 角色定位

Seller SDK 是 Seller Agent 接入 TyrPay 的主要接口。它负责将普通模型或 API 调用封装为可证明调用，并生成 TyrPay 标准化的履约证明数据。

Seller SDK 是系统中的执行侧与证明生成侧，但不是最终裁决方。

4.2 核心职责

Seller SDK 主要承担以下职责：

1. 读取任务信息，包括 taskId、taskNonce、buyer、deadline；
2. 构造并提交 Execution Commitment；
3. 计算 commitmentHash；
4. 包装模型或 API 调用；
5. 生成 callIntentHash；
6. 将 task context 写入 zkTLS proof context；
7. 调用 zkTLS provider 生成原始证明；
8. 提取 response 中的 model、usage、timestamp 等字段；
9. 生成 Delivery Receipt；
10. 聚合多次调用为 Proof Bundle；
11. 上传 proof 数据到 Storage；
12. 向合约提交 proofBundleHash。

Seller SDK 与 zkTLS adapter 的接口约定：

1. Seller SDK 对外维持稳定的 `provenFetch` 必填参数：`commitment`、`callIndex`、`request`、`declaredModel`、`taskNonce`。
2. Seller SDK 允许新增可选 `providerOptions` 字段，用于向具体 zkTLS adapter 透传 provider 私有运行参数。
3. `providerOptions` 不属于协议对象，不进入 `TaskContext`、`DeliveryReceipt`、`ProofBundle` 或链上状态。
4. Mock adapter 可以忽略 `providerOptions`；Reclaim adapter 可以消费其中的 `privateOptions`、`retries`、`retryIntervalMs`、`useTee` 等私有参数。

4.3 Task Binding

Phase 1 采用 proof-level task binding。Seller SDK 不强制将 `taskNonce` 注入上游 HTTP 请求；相反，SDK 将任务上下文写入 zkTLS provider 支持的 proof context 中。该 context 必须进入 provider 生成的 proof identifier、claim identifier 或等价可验证字段。

推荐的任务上下文为：

{
  "protocol": "TyrPay",
  "version": 1,
  "chainId": "...",
  "settlementContract": "0x...",
  "taskId": "0x...",
  "taskNonce": "0x...",
  "commitmentHash": "0x...",
  "buyer": "0x...",
  "seller": "0x..."
}

每次模型或 API 调用仍然生成 callIntentHash：

callIntentHash = hash(
  taskContextHash,
  callIndex,
  host,
  path,
  method,
  declaredModel,
  requestBodyHash
)

callIntentHash 也应写入 proof context。Verifier 后续检查 proof context 是否与链上任务状态一致，并检查 proof 是否已经被消费。

4.4 设计边界

Seller SDK 不负责最终判断是否放款。它只负责：

执行任务；
生成证明；
提交证明。

它不能绕过 Verifier 或 Settlement Contract 直接触发结算。

---

5. Contracts

5.1 角色定位

Contracts 是 TyrPay 的链上状态与资金结算层。它们负责维护任务状态、生成任务 nonce、托管资金，并根据 Verifier 签名结果执行放款或退款。

Contracts 不直接验证完整 zkTLS proof，也不解析模型 API 的 response。

5.2 核心职责

Contracts 主要承担以下职责：

1. 创建任务意向；
2. 生成 taskId 与 taskNonce；
3. 记录 commitmentHash；
4. 接收 Buyer 锁款；
5. 记录 proofBundleHash；
6. 验证 Verifier 签名；
7. 检查 Verification Report 与链上状态是否一致；
8. 检查 proofBundleHash 是否已经被消费；
9. 根据 PASS / FAIL 结果执行放款或退款；
10. 维护任务状态机。

5.3 Phase 1 状态机

链上持久状态：

INTENT_CREATED
→ COMMITMENT_SUBMITTED
→ FUNDED
→ PROOF_SUBMITTED
→ SETTLED / REFUNDED

超时退款路径：

FUNDED → REFUNDED（refundAfterProofSubmissionDeadline，proof submission grace period 结束后未提交 proof）
PROOF_SUBMITTED → REFUNDED（refundAfterVerificationTimeout，verification timeout 后未收到 settlement report）

SDK 派生状态（不上链）：

EXECUTING：链上状态为 FUNDED 且未提交 proof bundle
EXPIRED：链上状态为 INTENT_CREATED 或 COMMITMENT_SUBMITTED 且 deadline 已过
VERIFIED_PASS / VERIFIED_FAIL：Phase 1 暂不实现，Buyer Agent 可通过 getReport() 主动查询

5.4 结算规则

Phase 1 采用最简结算规则：

若证明满足承诺的 model 与 usage 要求，则全额放款给 Seller；
否则，全额退款给 Buyer。

该规则避免了早期系统中过早引入部分结算、主观质量判断或仲裁机制。

5.5 设计边界

Contracts 只处理链上可确定事项：

状态；
资金；
hash；
签名；
权限；
结算动作。

复杂证明验证和履约语义判断由 Verifier 处理。

---

6. Verifier

6.1 角色定位

Verifier 是 TyrPay 的履约判断层。它负责验证 Seller 提交的 Proof Bundle 是否满足 Execution Commitment，并生成带签名的 Verification Report。

Phase 1 中，Verifier 先设定为中心化服务。V2 可演进为 DAO 聚合签名验证或 0G Compute 验证。

6.2 核心职责

Verifier 主要承担以下职责：

1. 读取链上 task 状态；
2. 读取 Execution Commitment；
3. 读取 Proof Bundle 与 Delivery Receipts；
4. 验证原始 zkTLS proof；
5. 检查 endpoint 是否符合 commitment；
6. 检查 proof context 是否绑定 taskId / taskNonce / commitmentHash；
7. 检查 proof 是否已经被消费；
8. 检查 proof timestamp 是否在任务窗口内；
9. 检查 response model 是否符合承诺；
10. 提取并聚合 usage；
11. 检查 aggregateUsage 是否达到 minUsage；
12. 生成 Verification Report；
13. 对 Verification Report 签名。

6.3 Verification Report

Verifier 输出标准化报告：

{
  "taskId": "0x...",
  "commitmentHash": "0x...",
  "proofBundleHash": "0x...",
  "passed": true,
  "checks": {
    "zkTlsProofValid": true,
    "endpointMatched": true,
    "taskContextMatched": true,
    "proofNotConsumed": true,
    "withinTaskWindow": true,
    "modelMatched": true,
    "usageSatisfied": true
  },
  "settlement": {
    "action": "RELEASE",
    "amount": "..."
  },
  "verifier": "0x...",
  "signature": "0x..."
}

6.4 设计边界

Verifier 是裁决方，但不是资金托管方。它不能直接控制 Buyer 资金，只能生成可被合约验证的签名报告。最终资金移动必须由 Settlement Contract 执行。

---

7. Storage

7.1 角色定位

Storage 是 TyrPay 的证明数据可用层。由于 zkTLS proof、Delivery Receipt、Proof Bundle 和 Verification Report 可能较大，不适合全部上链，因此系统将完整数据存储在可验证存储中，链上仅记录 hash 与 URI。

Phase 1 可采用 0G Storage 存储 proof bundle、delivery receipts 和 verification report。

7.2 核心职责

Storage 主要保存以下对象：

1. Execution Commitment；
2. Delivery Receipts；
3. Raw zkTLS Proofs；
4. Proof Bundle；
5. Verification Report；
6. Final Output Metadata，可选。

7.3 数据完整性

所有关键对象均需 canonicalize 后计算 hash：

commitmentHash = hash(canonical_commitment)
receiptHash = hash(canonical_receipt)
proofBundleHash = hash(canonical_bundle)
verificationReportHash = hash(canonical_report)

链上记录对应 hash，用于防止存储内容被篡改。

7.4 设计边界

Storage 不参与验证和结算。它只负责保存和提供可复验数据，不应承担裁决职责。


8. zkTLS Adapter

8.1 角色定位

zkTLS Adapter 位于 Seller SDK 与具体 zkTLS provider 之间，用于屏蔽不同 provider 的实现差异。

TyrPay 不应直接绑定某一 zkTLS provider 的原生格式，而应定义自己的标准化 Receipt 与 Proof Bundle。

8.2 核心职责

zkTLS Adapter 主要承担：

1. 调用底层 zkTLS provider；
2. 生成原始 proof；
3. 验证原始 proof；
4. 提取 request 与 response 中的关键字段；
5. 标准化为 TyrPay Delivery Receipt。

8.3 Provider 抽象

interface ZkTlsAdapter {
  name: string;

  provenFetch(input): Promise<{
    response: unknown;
    rawProof: unknown;
    extracted: ExtractedFields;
  }>;

  verifyRawProof(rawProof): Promise<boolean>;

  normalizeReceipt(rawProof, context): Promise<DeliveryReceipt>;
}

Seller SDK `provenFetch` 调用约定：

```ts
interface ProvenFetchInput {
  commitment: ExecutionCommitment;
  callIndex: number;
  request: ZkTlsRequestEvidence;
  declaredModel: string;
  taskNonce: Bytes32;
  providerOptions?: Record<string, unknown>;
}
```

其中：

1. `providerOptions` 是可选扩展槽，保持向后兼容。
2. Seller SDK 只负责透传 `providerOptions` 给 adapter，不负责解析其 provider 语义。
3. adapter 不得要求 Buyer SDK、Contracts 或 Verifier 理解 `providerOptions`。

8.4 TLS / zkTLS 防重放机制：Phase 1 方案 A

Phase 1 采用 方案 A：proof-level context binding。该方案不要求将 `taskNonce` 注入上游 HTTP request 的 header、metadata 或 body；`taskNonce` 进入 zkTLS provider 的 proof context，并由 provider 的 proof identifier、claim identifier 或等价签名对象绑定。

该方案的安全目标是防止：

同一份 proof 被重复用于同一任务；
同一份 proof 被迁移到另一任务；
同一份 proof 被迁移到另一 buyer / seller / contract / chain；
已过期或不在任务执行窗口内的 proof 被用于结算。

该方案不声称证明上游模型或 API 本身收到了 taskNonce。它证明的是：

该 zkTLS proof 被绑定到当前 TyrPay task context；
该 proof 尚未被消费；
该 proof 发生在任务允许的时间窗口内；
该 proof 中的 response model 与 usage 满足 commitment。

Proof Context

每个 proof 必须包含如下 context：

{
  "protocol": "TyrPay",
  "version": 1,
  "chainId": "...",
  "settlementContract": "0x...",
  "taskId": "0x...",
  "taskNonce": "0x...",
  "commitmentHash": "0x...",
  "buyer": "0x...",
  "seller": "0x...",
  "callIndex": 1,
  "callIntentHash": "0x..."
}

Verifier 检查项

Verifier 必须检查：

1. zkTLS proof cryptographically valid；
2. proof context 与链上 taskId / taskNonce / commitmentHash / buyer / seller 一致；
3. proof identifier / receiptHash / responseHash / callIntentHash 未被消费；
4. proof timestamp >= task.fundedAt；
5. proof timestamp <= task.deadline；
6. response model 符合 allowedModels；
7. aggregate usage >= minUsage。

Proof Consumption

Phase 1 中，proof consumption 分两层完成：

Verifier DB:
- usedProviderIdentifier
- usedReceiptHash
- usedResponseHash
- usedCallIntentHash

Contract:
- usedProofBundleHash
- task.status prevents double settlement

合约至少应保证：

require(task.status == PROOF_SUBMITTED);
require(!usedProofBundleHash[proofBundleHash]);
usedProofBundleHash[proofBundleHash] = true;
task.status = report.passed ? SETTLED : REFUNDED;

安全边界

方案 A 可以实现 proof-level 防重放，但不等同于 request-level task binding。若未来任务需要证明上游 API request 本身包含当前任务标识，应升级为：

方案 B：将 taskNonce 派生出的 callIntentHash 注入 HTTP transcript；或
方案 C：使用 TEE executor 将 nonce 与上游调用绑定。

8.5 M10：0G TeeTLS Adapter

M10 将 0G Compute TeeTLS 作为 `ZkTlsAdapter` 的一个具体 provider，而不是替换 Verifier 或 Settlement Contract。

实验结论：

1. 0G Compute SDK 的 `getServiceMetadata(providerAddress)` 可以返回模型端点和 model；
2. `getRequestHeaders(providerAddress, content)` 生成调用所需的 0G 计费 / 授权 header；
3. `processResponse(providerAddress, chatId, content)` 返回响应验证结果，但当前高层 SDK 不暴露稳定的 `TeeTLSProof` 原生对象；
4. usage 不由 0G metadata 直接返回，必须从 OpenAI-compatible response body 中提取，例如 `usage.total_tokens`；
5. live 调用依赖 0G inference ledger、provider acknowledgement 与 provider sub-account 余额。

因此，TyrPay 的 0G TeeTLS adapter 应采用 envelope 模式：把 0G 调用结果、response、`chatId`、`processResponse` 结果和 TyrPay `proofContext` 一起封装为 `ZeroGTeeTlsRawProof`，再归一化为标准 `DeliveryReceipt`。

推荐 raw proof envelope：

```ts
interface ZeroGTeeTlsRawProof {
  proofSchemaVersion: "TyrPay.0g-teetls-proof.v1";
  provider: "0g-teetls";
  providerProofId: string;
  proofContext: ProviderProofContext;
  request: ZkTlsRequestEvidence;
  response: ZkTlsResponseEvidence;
  observedAt: UnixMillis;
  extracted: ExtractedReceiptFields;
  zeroG: {
    providerAddress: Address;
    endpoint: string;
    modelFromMetadata: string;
    requestHeaderKeys: string[];
    chatId?: string;
    processResponseResult: boolean | null;
    teeSignerAddress?: Address;
    signerAcknowledged?: boolean;
  };
  metadata: {
    sdkPackage: "@0gfoundation/0g-compute-ts-sdk";
    requestPath: string;
    usageSource: "response.body.usage" | "response.body.x_groq.usage" | "custom";
    contentSource: "choices[0].message.content" | "choices[0].delta.content" | "custom";
  };
  proofHash: Bytes32;
}
```

M10 的 Verifier 检查要求：

1. `proofHash` 与 canonical raw proof payload 一致；
2. `processResponseResult === true`；
3. `endpoint` 与 commitment target 一致；
4. `modelFromMetadata` 与 declared/allowed model 一致，若 response body 中存在 `model` 字段也必须一致；
5. `usage.totalTokens` 可从 response body 提取，且满足 commitment；
6. `proofContext` 与链上 task context 一致；
7. `providerProofId` / `responseHash` / `callIntentHash` 未被消费。

安全边界：

0G TeeTLS 证明的是 provider response 的可信来源；TyrPay 仍负责 task binding、proof consumption、履约判定和 EIP-712 Verification Report 签名。除非 0G 后续提供可将 `taskNonce` 或 `callIntentHash` 写入 TeeTLS 签名对象的接口，M10 不应声明 request-level nonce binding。


9. MCP 与 Skill

9.1 角色定位

MCP 和 Skill 是面向 Agent 的接入层。它们不实现协议核心逻辑，而是调用 Buyer SDK 或 Seller SDK，将 TyrPay 能力暴露为 Agent 可使用的工具。

9.2 Buyer MCP Tools

tyrpay_create_task_intent
tyrpay_get_commitment
tyrpay_validate_commitment
tyrpay_fund_task
tyrpay_get_task_status
tyrpay_get_report
tyrpay_refund_after_proof_submission_deadline
tyrpay_refund_after_verification_timeout

9.3 Seller MCP Tools

tyrpay_list_tasks
tyrpay_submit_commitment
tyrpay_proven_fetch
tyrpay_submit_proof_bundle
tyrpay_get_settlement_status

9.4 依赖方向

推荐依赖结构为：

Core Protocol
→ SDK
→ MCP
→ Skill

Skill 不应直接实现合约交互、proof 生成或 storage 逻辑。


10. 端到端流程

1. Buyer SDK 创建任务意向；
2. Contract 生成 taskId 与 taskNonce；
3. Seller SDK 提交 Execution Commitment；
4. Storage 保存 Commitment；
5. Contract 记录 commitmentHash；
6. Buyer SDK 确认 commitment 并锁款；
7. Seller SDK 执行 proven model/API call；
8. zkTLS Adapter 生成带 task context 的 raw proof；
9. Seller SDK 生成 Delivery Receipt；
10. Storage 保存 Receipt 与 raw proof；
11. Seller SDK 聚合 Proof Bundle；
12. Contract 记录 proofBundleHash；
13. Verifier 读取 Commitment、Receipt、Proof Bundle；
14. Verifier 检查 proof context、proof consumption 与任务时间窗口；
15. Verifier 判断是否满足 model 与 usage 承诺；
16. Verifier 生成并签名 Verification Report；
17. Contract 验证 Verifier 签名并检查 proofBundleHash 未消费；
18. PASS 则全额放款给 Seller；
19. FAIL 则全额退款给 Buyer。

---

11. 角色边界总结

角色
核心职责
不应承担的职责
Buyer SDK
创建任务、确认承诺、锁款、查询结果
生成 zkTLS proof、判断 proof 是否有效
Seller SDK

提交承诺、执行可证明调用、生成 Receipt、提交 Proof Bundle
决定放款、生成最终裁决
Contracts

生成 nonce、记录 hash、托管资金、验签、结算、记录 proofBundleHash 消费状态
验证完整 zkTLS proof、解析 response
Verifier
验证 proof、检查 context、检查 proof 未消费、检查任务时间窗口、判断履约、签名报告
托管资金、绕过合约结算
Storage
保存 commitment、receipt、proof bundle、report
判断 proof、执行结算

zkTLS Adapter
适配底层 zkTLS provider，标准化 receipt，承载 proof context
决定任务是否通过

MCP / Skill
面向 Agent 暴露工具能力
实现协议核心逻辑
12. Phase 1 最小实现范围

Phase 1 应优先实现：

Buyer SDK
Seller SDK
Settlement Contract
Centralized Verifier
0G Storage Adapter
zkTLS Provider Adapter
0G TeeTLS Adapter（作为可选 zkTLS provider）
OpenAI-compatible model API support
proof-level context binding
proof consumption registry
任务时间窗口检查
ALL_OR_REFUND settlement rule
暂不实现：
前端
Marketplace
部分结算
DAO 聚合签名
0G Compute verifier
主观质量判断
复杂仲裁
streaming API proof
request-level nonce injection
13. 架构原则

TyrPay 的系统分工可以概括为：

Buyer SDK defines demand and locks funds.
Seller SDK executes service and produces proofs.
Storage preserves verifiable evidence.
Verifier judges fulfillment.
Contracts enforce settlement.

中文表述为：

Buyer SDK 负责需求与资金入口；
Seller SDK 负责执行与证明生成；
Storage 负责证据保存；
Verifier 负责履约判断；
Contracts 负责状态与资金结算。

该分层使 TyrPay 能够在 Phase 1 中快速实现可信闭环，并为后续引入 DAO 聚合签名、0G Compute verifier、多 Verifier 机制、request-level task binding 和 proof-based reputation layer 保留演进空间。M10 只把 0G TeeTLS 引入证据采集层，不改变 Verifier 的最终裁决职责。
