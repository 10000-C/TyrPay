# M1–M7 合规审计报告

> 审计日期：2026-05-04  
> 范围：对照 `docs/plan/tyrpay_dev_plan.md` 与 `docs/protocol/*.md` 规范，逐模块审查 M1–M7 实现的合规性、缺失与偏差。

---

## 审计总结

| 模块 | 合规度 | 关键问题数 | 状态 |
|---|---|---|---|
| M0 Protocol Spec & Shared Types | 🟡 85% | 3 | 正向 fixture 完备，**11 个负向 fixture 缺失** |
| M1 Contracts | 🟢 90% | 2 | 核心功能完整，缺少部分边界测试 |
| M2 SDK Core | 🟢 95% | 1 | 类型/哈希/EIP-712 完整，**缺少 receipt/proofBundle 哈希向量** |
| M3 Storage Adapter | 🟢 95% | 1 | 接口与 Local/Memory 完整，**0G 仅为占位** |
| M4 Mock zkTLS Adapter | 🟡 75% | 2 | 基本功能具备，**场景模拟能力未文档化** |
| M5 Seller SDK | 🟡 70% | 3 | 核心流程可跑通，**缺少集成测试** |
| M6 Buyer SDK | 🟢 90% | 1 | 功能完整且有集成测试，**少量边界条件未覆盖** |
| M7 Verifier Service | 🟢 95% | 1 | 验证逻辑完整，verifier-client 已实现 `verifyTask`（缺少 `getReport` 方法），无集成测试 |
| E2E 闭环 | 🔴 0% | 1 | **test/e2e/ 为空目录**，零 E2E 测试 |

---

## 一、逐模块详细审计

### M0 — Protocol Spec & Shared Types

**规范要求**：schema、canonicalize 规则、hash 规则、EIP-712 report struct、fixtures v0。

#### ✅ 已完成

| 项目 | 状态 | 说明 |
|---|---|---|
| Protocol objects schema | ✅ | `docs/protocol/protocol-objects.md` 定义完整，`sdk-core/types/index.ts` 类型实现对应 |
| Canonicalize 规则 | ✅ | `docs/protocol/canonicalization-and-hashing.md` 规范，`sdk-core/canonicalize/index.ts` 实现 |
| Hash 规则 | ✅ | `sdk-core/hash/index.ts` 实现，与 test vectors 一致 |
| EIP-712 report struct | ✅ | `sdk-core/eip712/index.ts` 完整实现 |
| 正向 fixtures (7个) | ✅ | task-intent.basic, commitment.openai-compatible, task-context.basic, call-intent.basic, receipt.mock.valid, proof-bundle.pass-basic, verification-report.pass-basic.unsigned |
| Test vectors (hashing + eip712) | ✅ | `test/vectors/hashing/pass-basic.json` 和 `test/vectors/eip712/verification-report-pass-basic.json` |
| Hash 一致性 | ✅ | Solidity 测试和 TypeScript 测试使用相同向量 |

#### ❌ 不合规项

| # | 问题 | 严重度 | 规范来源 |
|---|---|---|---|
| M0-1 | **缺少 11 个负向 fixture 文件**：`commitment.model-empty.json`、`receipt.context-wrong-task.json`、`receipt.model-mismatch.json`、`receipt.timestamp-before-funded.json`、`receipt.timestamp-after-deadline.json`、`proof-bundle.submitted-within-grace.json`、`proof-bundle.usage-insufficient.json`、`proof-bundle.duplicate-call-index.json`、`verification-report.bad-verifier.json`、`verification-report.wrong-chain.json`、`verification-report.wrong-contract.json` | 🔴 高 | `fixtures-and-test-vectors.md` §Required Negative Fixtures |
| M0-2 | `packages/shared` 仅有 `protocolName` 常量，实际类型全部定义在 `sdk-core` 中，shared 包角色不明确 | 🟡 低 | `dev_plan.md` §项目结构 |
| M0-3 | 缺少 `receiptHash`、`proofBundleHash` 的独立 test vector | 🟡 中 | `fixtures-and-test-vectors.md` §Vector Requirements |

---

### M1 — Contracts

**规范要求**：TyrPaySettlement、VerifierRegistry、MockERC20、Hardhat tests、deploy scripts。

#### ✅ 已完成

| 项目 | 状态 | 说明 |
|---|---|---|
| TyrPaySettlement.sol | ✅ | 含 createTaskIntent、submitCommitment、fundTask、submitProofBundle、settle、refund 等核心函数 |
| VerifierRegistry.sol | ✅ | 含 addVerifier、removeVerifier、isVerifier |
| MockERC20.sol | ✅ | 含 mint、approve、transfer |
| Hardhat tests | ✅ | `test/TyrPay-settlement.test.ts` 覆盖主要状态转换 |
| Deploy scripts | ✅ | `scripts/deploy.ts` 存在 |
| EIP-712 签名验证 | ✅ | 继承 OpenZeppelin EIP712，使用 ECDSA.recover |
| 状态机转换保护 | ✅ | 各函数有 require 校验前置状态 |

#### ❌ 不合规项

| # | 问题 | 严重度 | 规范来源 |
|---|---|---|---|
| M1-2 | 合约缺少对 `proofSubmissionDeadline` 过期后仍提交 proof 的拒绝测试（即 `proofSubmissionDeadline` 边界条件的 Hardhat 测试） | 🟡 中 | `boundary-cases.md` |
| M1-3 | `VerifierRegistry` 缺少 `onlyAdmin` / AccessControl 的完整权限测试（如非 owner 调用 addVerifier 应被拒绝） | 🟡 中 | `dev_plan.md` §M1 验收标准 |

#### ⚠️ 需注意

- 合约引入了 `taskNonce` 字段用于防重放，规范中未明确提及但与 `signatures-and-replay-protection.md` 一致
- 合约的 `proofSubmissionGracePeriod` 和 `verificationTimeout` 以构造函数参数注入，符合设计

---

### M2 — SDK Core

**规范要求**：canonicalize、hashObject、buildTaskContext、buildCallIntentHash、EIP-712 helper、shared types。

#### ✅ 已完成

| 项目 | 状态 | 说明 |
|---|---|---|
| Shared types (全部协议对象) | ✅ | 741 行完整类型定义，含 validators 和 builders |
| canonicalize() | ✅ | 按规范对 key 排序、值递归序列化 |
| hashObject() | ✅ | canonicalize + keccak256 |
| buildTaskContext() | ✅ | 构造 TaskContext 对象 |
| buildCallIntentHash() | ✅ | 构造 callIntent 的哈希 |
| buildVerificationReportTypedData() | ✅ | EIP-712 typed data 构造 |
| Test vector 测试 | ✅ | 与 `test/vectors/` 中的数据一致 |

#### ❌ 不合规项

| # | 问题 | 严重度 | 规范来源 |
|---|---|---|---|
| M2-1 | 缺少 `receiptHash` 和 `proofBundleHash` 的 test vector 对应测试用例（仅 `commitmentHash`、`taskContextHash`、`callIntentHash`、`verificationReportHash` 有向量） | 🟡 中 | `fixtures-and-test-vectors.md` §Vector Requirements |

---

### M3 — Storage Adapter

**规范要求**：StorageAdapter interface、LocalStorageAdapter、MemoryStorageAdapter、0G Adapter placeholder。

#### ✅ 已完成

| 项目 | 状态 | 说明 |
|---|---|---|
| StorageAdapter 接口 | ✅ | `types.ts` 定义 putObject/getObject/deleteObject |
| MemoryStorageAdapter | ✅ | 基于内存 Map 的实现 |
| LocalStorageAdapter | ✅ | 基于文件系统的实现 |
| 0G Adapter placeholder | ✅ | `zero-g/index.ts` 存在，抛出 "not implemented" |
| Hash 校验 | ✅ | getObject 时验证 hash 一致性 |
| Namespace 支持 | ✅ | 按 namespace 组织存储路径 |

#### ❌ 不合规项

| # | 问题 | 严重度 | 规范来源 |
|---|---|---|---|
| M3-1 | 0G Storage Adapter 仅为占位（符合 Phase 1 计划，M7b 才正式实现） | 🟢 预期 | `dev_plan.md` §M7b |

---

### M4 — Mock zkTLS Adapter

**规范要求**：Mock provenFetch、verifyRawProof、normalizeReceipt；模拟 PASS、model mismatch、usage insufficient、timestamp invalid 等场景。

#### ✅ 已完成

| 项目 | 状态 | 说明 |
|---|---|---|
| ZkTlsAdapter 核心接口 | ✅ | `core/index.ts` 定义接口 |
| MockZkTlsAdapter | ✅ | `mock/index.ts` 实现 provenFetch |
| Reclaim 占位 | ✅ | `reclaim/index.ts` 存在 |
| DeliveryReceipt 生成 | ✅ | provenFetch 返回含 receipt 和 rawProof |

#### ❌ 不合规项

| # | 问题 | 严重度 | 规范来源 |
|---|---|---|---|
| M4-1 | **Mock 场景模拟能力不完整**：Mock adapter 通过 `scenario` 参数区分场景，但缺乏 `timestamp-before-funded`、`timestamp-after-deadline`、`duplicate-call-index` 等关键负向场景的显式支持 | 🔴 高 | `dev_plan.md` §M4 验收标准 |
| M4-2 | **缺少 Mock zkTLS 的单元测试**：无法验证各场景的输出是否符合 receipt 结构规范 | 🟡 中 | `dev_plan.md` §M4 验收标准 |

---

### M5 — Seller SDK

**规范要求**：submitCommitment、provenFetch、buildDeliveryReceipt、buildProofBundle、uploadProofBundle、submitProofBundleHash。

#### ✅ 已完成

| 项目 | 状态 | 说明 |
|---|---|---|
| SellerAgent 类 | ✅ | `seller-sdk/src/seller-agent.ts` 完整实现 |
| submitCommitment | ✅ | 构造 commitment → storage put → 链上提交 |
| provenFetch | ✅ | 调用 zkTLS adapter 执行 proven fetch |
| buildDeliveryReceipt | ✅ | 从 zkTLS 结果构造 DeliveryReceipt |
| buildProofBundle | ✅ | 组装 receipts → 计算 proofBundleHash |
| uploadProofBundle | ✅ | 通过 storage adapter 上传 |
| submitProofBundleHash | ✅ | 链上提交 proofBundleHash |

#### ❌ 不合规项

| # | 问题 | 严重度 | 规范来源 |
|---|---|---|---|
| M5-1 | **完全缺少集成测试**：Seller SDK 无任何 test 文件，无法验证端到端的 commitment→provenFetch→proofBundle→链上提交流程 | 🔴 高 | `dev_plan.md` §M5 验收标准 |
| M5-2 | `buildCallIntentHash` 中 `requestBodyHash` 的计算依赖 request body 的 canonicalization，但 Seller SDK 未导出独立的 requestBody hash 工具函数 | 🟡 中 | `protocol-objects.md` §CallIntent |
| M5-3 | Seller SDK 的 `provenFetch` 返回结果类型与 Mock zkTLS adapter 的输出类型存在隐式耦合，无显式类型校验 | 🟡 中 | — |

---

### M6 — Buyer SDK

**规范要求**：createTaskIntent、getCommitment、validateCommitment、fundTask（强制锁款前校验 commitment）、getTaskStatus（EXECUTING/EXPIRED 派生状态）、getReport、refundAfterProofSubmissionDeadline、refundAfterVerificationTimeout。

#### ✅ 已完成

| 项目 | 状态 | 说明 |
|---|---|---|
| BuyerSdk 类 | ✅ | 完整实现，480+ 行 |
| createTaskIntent | ✅ | 构造 intent → storage → 链上提交 |
| getTask / getCommitment | ✅ | 从链上读取 + storage 获取完整对象 |
| validateCommitment | ✅ | 校验 host/path/method/model/verifier/minUsage |
| fundTask | ✅ | **强制锁款前校验 commitment**（符合规范） |
| getTaskStatus | ✅ | 实现 EXECUTING/EXPIRED 派生状态 |
| getReport | ✅ | 通过 reportResolver 获取 |
| refundAfterProofSubmissionDeadline | ✅ | 实现 |
| refundAfterVerificationTimeout | ✅ | 实现 |
| 集成测试 | ✅ | `tests/buyer-sdk.integration.ts` 覆盖 6 个场景 |

#### ❌ 不合规项

| # | 问题 | 严重度 | 规范来源 |
|---|---|---|---|
| M6-1 | 集成测试未覆盖 `getTaskStatus` 在 PROOF_SUBMITTED 之后、SETTLED 之前的中间状态 | 🟡 中 | `state-machine.md` §Derived Status |
| M6-2 | `validateCommitment` 的 `requireNonZeroMinUsage` 检查仅在传入 `true` 时生效，默认不检查（可能导致 buyer 接受零 usage commitment） | 🟡 低 | `boundary-cases.md` |

---

### M7 — Centralized Verifier

**规范要求**：读取链上 task、读取 proof bundle、检查 context/timestamp/model/usage、防重放、签名 Verification Report。

#### ✅ 已完成

| 项目 | 状态 | 说明 |
|---|---|---|
| Verifier Service 完整实现 | ✅ | `apps/verifier-service/src/index.ts` 约 1000+ 行 |
| 链上 task 读取 | ✅ | 通过 ethers provider 读取 settlement 合约 |
| Proof bundle 读取 | ✅ | 通过 storage adapter 从 URI 读取 |
| Context 检查 | ✅ | taskContext 匹配验证 |
| Timestamp 检查 | ✅ | withinTaskWindow 验证 |
| Model 检查 | ✅ | modelMatched 验证 |
| Usage 检查 | ✅ | usageSatisfied 验证 |
| 防重放 | ✅ | proofConsumption 记录 + 去重检查 |
| 签名 Report | ✅ | EIP-712 typed data + verifier 私钥签名 |
| API 端点 | ✅ | POST /verify, GET /report/:taskId, GET /health |

#### ❌ 不合规项

| # | 问题 | 严重度 | 规范来源 |
|---|---|---|---|
| M7-1 | **`verifier-client` 缺少 `getReport(taskId)` 方法**：已实现 `verifyTask()` 调用 POST /verify 端点，但未实现 GET /report/:taskId 端点对应的客户端方法 | 🟡 中 | Verifier Service API |
| M7-2 | **Verifier Service 无集成测试**：虽有完整逻辑，但无独立测试验证 verify 端点的完整请求/响应 | 🔴 高 | `dev_plan.md` §M7 验收标准 |

---

## 二、跨模块一致性问题

| # | 问题 | 涉及模块 | 严重度 |
|---|---|---|---|
| X-2 | **EIP-712 domain 的 chainId 类型**：规范中 chainId 为 `uint256`，需确认合约端和 SDK 端的类型一致（SDK 使用 string，合约使用 uint256） | M1/M2/M7 | 🟡 中 |
| X-3 | **Storage URI 格式不统一**：MemoryStorage 使用 `memory://namespace/hash`，LocalStorage 使用 `file://`，链上存储的 URI 格式未标准化 | M3/M5/M7 | 🟡 低 |
| X-4 | **Address 大小写处理**：合约返回 checksummed address，SDK 中多处使用 `.toLowerCase()`，需确保所有地址比较在同一格式下进行 | M2/M5/M6/M7 | 🟡 中 |

---

## 三、E2E 闭环状态

**规范要求**：至少覆盖 PASS 放款、model mismatch 退款、usage 不足退款、proofBundle 重放拒绝、非法 verifier 签名拒绝；CI 可一键运行。

| E2E 场景 | 状态 | 说明 |
|---|---|---|
| PASS → RELEASE 放款 | ❌ 未实现 | test/e2e/ 目录为空 |
| Model mismatch → REFUND | ❌ 未实现 | — |
| Usage 不足 → REFUND | ❌ 未实现 | — |
| ProofBundle 重放拒绝 | ❌ 未实现 | — |
| 非法 verifier 签名拒绝 | ❌ 未实现 | — |
| CI 一键运行 | ❌ 未实现 | — |

> **注意**：Buyer SDK 的集成测试 `buyer-sdk.integration.ts` 覆盖了部分场景（happy path、commitment validation、expired status、refund），但这只是 Buyer 侧的集成测试，不是跨模块 E2E 闭环测试。

---

## 四、优先修复建议

### P0 — 必须在 E2E 前修复

1. **补充 11 个负向 fixture**（M0-1）— E2E 测试依赖这些 fixture
2. **补充 verifier-client 的 `getReport` 方法**（M7-1）— E2E 测试可能需要通过客户端查询 report
3. **完善 Mock zkTLS 场景**（M4-1）— E2E 负向测试依赖 Mock 的场景模拟
4. **补充 Seller SDK 集成测试**（M5-1）

### P1 — E2E 测试编写期间修复

5. **Verifier Service 集成测试**（M7-2）
6. **补充 receiptHash/proofBundleHash test vector**（M2-1）
7. **Mock zkTLS 单元测试**（M4-2）
8. **合约边界条件测试**（M1-2, M1-3）

### P2 — 后续优化

9. **shared 包角色明确化**（M0-2）
10. **Address 大小写统一处理**（X-4）
11. **Storage URI 格式标准化**（X-3）
