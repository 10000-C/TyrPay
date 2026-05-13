# TyrPay Phase 1 技术选型与模块化开发计划

目标：以最小可信闭环为优先，先打通任务创建、承诺、锁款、可证明执行、验证报告与结算。

Phase 1 的核心闭环：

```text
Task Intent
→ Commitment
→ Funding
→ Proven Execution
→ Proof Bundle
→ Verification Report
→ Settlement / Refund
```

---

## 一、技术选型

| 类别 | 推荐选型 | 说明 |
|---|---|---|
| 合约语言 | Solidity ^0.8.24 | EVM 生态成熟，适合实现 Escrow、Registry、Settlement、签名验签与资金状态机。 |
| 合约框架 | Hardhat + TypeScript | 继续使用已有 Hardhat 经验；便于合约测试、部署脚本、ABI 生成和 SDK/E2E 集成。 |
| 合约库 | OpenZeppelin Contracts | 复用 AccessControl、ECDSA/EIP-712、ERC20、安全工具，降低基础安全风险。 |
| 签名标准 | EIP-712 Typed Data | 绑定 taskId、commitmentHash、proofBundleHash、buyer、seller、chainId、settlementContract，降低跨链/跨合约重放风险。 |
| SDK 语言 | TypeScript | Buyer SDK、Seller SDK、Verifier、Storage、zkTLS Adapter、Skill 层共享类型、hash、ABI 与工具链。 |
| 后端 / Verifier | Node.js 20+ + TypeScript + Fastify | Phase 1 中心化 Verifier 快速实现 proof 读取、检查、聚合 usage、生成并签名 Verification Report。 |
| 数据库 | PostgreSQL + Prisma | 存储 proof consumption registry、verification reports、proof bundle 索引；Prisma 提供类型安全和迁移便利。 |
| Storage | StorageAdapter 抽象 + Local/Memory + 0G Storage Adapter | 本地先跑通，正式环境接 0G Storage；链上只记录 hash 与 URI，完整对象放可验证存储。 |
| zkTLS | ZkTlsAdapter 抽象 + Mock Adapter + Reclaim Adapter | 先用 Mock 打通闭环，再接 Reclaim；避免主流程被 provider 细节绑定。 |
| Reclaim 集成 | TypeScript：`@reclaimprotocol/js-sdk` / zkFetch SDK | TyrPay Seller SDK / zkTLS Adapter 最适合用 TypeScript 集成 Reclaim；移动端 SDK 暂不作为 Phase 1 主路径。 |
| 0G Compute TeeTLS 集成 | TypeScript：`@0gfoundation/0g-compute-ts-sdk` | 作为 `ZkTlsAdapter` 的可选 provider；使用 `getServiceMetadata` 获取 endpoint/model，使用 OpenAI-compatible response 提取 usage，使用 `processResponse` 记录 TEE 响应验证结果。 |
| Agent Skill 层 | `@tyrpay/buyer-skill` + `@tyrpay/seller-skill` + `@tyrpay/agent-kit` | 不运行独立服务；Skill 直接 import SDK，导出带结构化描述的 tool 定义，Agent 拿来即传给 Claude/OpenAI API 的 `tools` 字段。agent-kit 将 SDK + Skill 组装为开箱即用的 kit。 |
| 测试 | Hardhat TypeScript tests + E2E fixtures；Foundry 可选 | Hardhat 做主测试与链下集成；Foundry 后续可补 fuzz / invariant。 |
| 工程结构 | pnpm monorepo | 一个仓库、多 package；统一管理 contracts、sdk-core、buyer-sdk、seller-sdk、verifier、storage、zktls、skill、agent-kit、examples。 |

---

## 二、模块化开发计划

| 阶段 | 模块 | 顺序依赖 / 必须顺次 | 可并行推进 | 交付物 |
|---|---|---|---|---|
| M0 | Protocol Spec & Shared Types | 必须最先完成；冻结 ExecutionCommitment、TaskContext、DeliveryReceipt、ProofBundle、VerificationReport、TaskStatus、SettlementAction。 | 不可并行替代；但可由合约、SDK、Verifier 共同评审。 | schema、canonicalize 规则、hash 规则、EIP-712 report struct、fixtures v0。 |
| M1 | Contracts | 依赖 M0；需先于完整 Buyer/Seller SDK 和 Verifier settlement 集成。 | 可与 M2、M3 并行。 | TyrPaySettlement、VerifierRegistry、MockERC20、Hardhat tests、deploy scripts。 |
| M2 | SDK Core | 依赖 M0；Buyer SDK、Seller SDK、Verifier、Adapters 均依赖它。 | 可与 M1、M3 并行。 | canonicalize、hashObject、buildTaskContext、buildCallIntentHash、EIP-712 helper、shared types。 |
| M3 | Storage Adapter | 依赖 M0/M2 的 hash 与对象规范；正式 0G 可晚于 Local/Memory。 | 可与 M1/M2/M4 并行。 | StorageAdapter interface、LocalStorageAdapter、MemoryStorageAdapter、0G Adapter placeholder / 实现。 |
| M4 | Mock zkTLS Adapter | 依赖 M2；必须先于真实 Reclaim 主路径，以便先打通 Mock E2E。 | 可与 M3 并行。 | Mock `provenFetch`、`verifyRawProof`、`normalizeReceipt`；模拟 PASS、model mismatch、usage insufficient、timestamp invalid 等场景。 |
| M6 | Buyer SDK | 依赖 M1/M2；锁款、状态查询依赖合约 ABI。 | 可与 M5 的 commitment 构造部分并行。 | `createTaskIntent`、`getCommitment`、`validateCommitment`、`fundTask`（强制锁款前校验 commitment）、`getTaskStatus`（EXECUTING / EXPIRED 派生状态）、`getReport`、`refundAfterProofSubmissionDeadline`、`refundAfterVerificationTimeout`。 |
| M5 | Seller SDK | 依赖 M1/M2/M3/M4；proof bundle 生成后才能支撑 Verifier 完整开发。 | commitment 构造可与 Buyer SDK 并行；`provenFetch` / `submitProofBundle` 需等 Storage/Mock。 | `submitCommitment`、`provenFetch`、`buildDeliveryReceipt`、`buildProofBundle`、`uploadProofBundle`、`submitProofBundleHash`；`provenFetch` 新增可选 `providerOptions` 透传槽供具体 zkTLS adapter 扩展。 |
| M7 | Centralized Verifier | 依赖 M1/M2/M3/M4/M5；必须在 Seller SDK 能产出 Mock Proof Bundle 后进入完整实现。 | Verifier 框架可与 Reclaim Adapter PoC 并行。 | 读取链上 task、读取 proof bundle、检查 context/timestamp/model/usage、防重放、签名 Verification Report。 |
| E2E | Mock Closed Loop | 依赖 M1-M7；必须先跑通再替换真实 zkTLS / 0G。 | 测试 fixtures 可提前并行准备。 | PASS 放款、model mismatch 退款、usage 不足退款、proofBundle 重放拒绝、非法 verifier 签名拒绝。 |
| M8 | Reclaim zkTLS Adapter | 不阻塞 Mock 闭环；在 E2E 稳定后替换 Mock Adapter。 | 可作为支线与 M5/M7 并行做 PoC。 | ReclaimZkTlsAdapter、proof context mapping、raw proof verify、receipt normalization、OpenAI-compatible extraction；依赖 Seller SDK 的可选 `providerOptions` 透传约定承载 Reclaim 私有运行参数。 |
| M7b | 0G Storage Adapter | LocalStorage 跑通后接入；不应阻塞 Mock E2E。 | 可与 Reclaim Adapter 并行。 | 0G `putObject` / `getObject`、hash verification、URI persistence、fallback local mode。 |
| M9 | Buyer / Seller Skill + Agent Kit | 依赖 M6/M5 稳定；无需运行独立服务，直接 import SDK。 | 可与 M8/M7b 并行；agent-kit 在 buyer-skill + seller-skill 完成后组装。 | **buyer-skill**：`tyrpay_post_task`、`tyrpay_check_task`、`tyrpay_refund_task`、`tyrpay_list_tasks`（各含 name / description / input_schema / handler）。**seller-skill**：`tyrpay_accept_task`、`tyrpay_execute_task`、`tyrpay_submit_proof`、`tyrpay_check_settlement`。**agent-kit**：将 SDK + Skill 组装为 `BuyerKit` / `SellerKit`，同时导出 Claude 与 OpenAI 两种 tool 格式（`kit.tools` / `kit.toOpenAIFormat()`），开箱即用。 |
| M10 | 0G TeeTLS Adapter | 依赖 M5/M7 稳定；不替换 Verifier，只替换证据采集 provider。 | 可与 M8/M7b/M9 并行；先用 `examples/0g-teetls-lab` 验证真实 provider 字段。 | `ZeroGTeeTlsAdapter`、0G raw proof envelope、endpoint/model/usage extraction、`processResponse` verification result capture、receipt normalization、Verifier 能消费 `0g-teetls` raw proof。 |

### Skill 设计原则

> LLM 不擅长管理多步骤 on-chain 流程，Skill 应对应**业务意图**而非 SDK 方法。

- **每个 tool 完成一个完整意图**：`tyrpay_post_task` 内部处理 createTaskIntent → 等待 commitment → validateCommitment → fundTask，LLM 只需传业务参数。
- **description 写"什么场景下用"**：帮助 LLM 决策何时调用，而不是描述内部实现。
- **agent-kit 双格式导出**：Claude API (`input_schema`) 和 OpenAI API (`parameters`) 均支持，调用方自选。
- **Buyer / Seller 链外协调（M9 阶段 A）**：Buyer 将 `taskId` 通过消息传给 Seller，Seller 用 `tyrpay_accept_task(taskId, ...)` 接入；两个 agent 各自独立运行，仅通过 taskId 关联。链上任务发现（Seller 主动扫描 TaskIntentCreated 事件）作为后续扩展。

### 模块依赖关系图

```text
                 ┌────────────────────────┐
                 │ M0 Protocol Spec        │
                 │ Shared Types / Hashing  │
                 └───────────┬────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐    ┌───────▼────────┐   ┌───────▼────────┐
│ M1 Contracts  │    │ M2 SDK Core     │   │ M3 Storage     │
└───────┬───────┘    └───────┬────────┘   └───────┬────────┘
        │                    │                    │
        │            ┌───────▼────────┐           │
        │            │ M4 Mock zkTLS   │           │
        │            └───────┬────────┘           │
        │                    │                    │
        ├────────────┬───────┴────────────┬───────┘
        │            │                    │
┌───────▼───────┐ ┌──▼────────────┐ ┌─────▼──────────┐
│ M6 Buyer SDK  │ │ M5 Seller SDK │ │ M7 Verifier    │
└───────┬───────┘ └──┬────────────┘ └─────┬──────────┘
        │            │                    │
        └────────────┴────────┬───────────┘
                              │
                    ┌─────────▼─────────┐
                    │ E2E Mock Closed    │
                    │ Loop               │
                    └─────────┬─────────┘
                              │
          ┌───────────────────┼───────────────────┬───────────────────┐
          │                   │                   │                   │
  ┌───────▼───────┐  ┌────────▼───────┐  ┌────────▼────────┐  ┌──────▼─────────────────┐
  │ M8 Reclaim    │  │ M7b 0G Storage │  │ M10 0G TeeTLS   │  │ M9 Buyer/Seller Skill  │
  │ Adapter       │  │ Adapter        │  │ Adapter         │  │    + Agent Kit         │
  └───────────────┘  └────────────────┘  └─────────────────┘  │ (import SDK, no server)│
                                                               └────────────────────────┘
```

推荐实际顺序：

```text
M0 → M1/M2/M3 并行 → M4 → M6/M5 → M7 → Mock E2E → M8 / M7b / M9 / M10 并行
```

---

## 三、模块验收标准与负责人

| 模块 | 验收标准 | 负责人 |
|---|---|---|
| M0 Protocol Spec & Shared Types | 协议对象 schema 已冻结 v0.1；canonicalize 与 hash 规则有测试向量；EIP-712 report struct 明确；正向 + 负向 fixtures 可被合约、SDK、Verifier 共用。 |  |
| M1 Contracts | Hardhat 测试通过；状态机完整覆盖 intent、commitment、funding、proof submitted、settled/refunded；Verifier 签名校验可用；重复结算被拒绝；VerifierRegistry 权限控制测试覆盖。 |  |
| M2 SDK Core | TypeScript 类型、hash 工具、TaskContext 构造、callIntentHash、EIP-712 helper 可复用；与 fixtures 的 hash 测试结果一致。 |  |
| M3 Storage Adapter | Local/Memory Adapter 可完成 put/get/hash check；对象内容被篡改时读取失败；0G Adapter 接口不影响上层调用。 |  |
| M4 Mock zkTLS Adapter | 可生成稳定 mock rawProof、extracted fields、DeliveryReceipt；能模拟 PASS、model mismatch、usage insufficient、timestamp invalid 等场景。 |  |
| M6 Buyer SDK | 可完成 createTaskIntent、读取/校验 commitment、fundTask（强制锁款前校验 commitment）、查询 task/report、refundAfterProofSubmissionDeadline、refundAfterVerificationTimeout；单元测试覆盖所有校验规则；能在 E2E 中驱动 Buyer 侧全流程。 |  |
| M5 Seller SDK | 可提交 commitment、执行 mock provenFetch、生成 receipt/proofBundle、上传 storage、提交 proofBundleHash；能在 E2E 中驱动 Seller 侧全流程。 |  |
| M7 Centralized Verifier | 能读取链上 task 与 storage proof bundle；完成 context、timestamp、model、usage、防重放检查；能签名 Verification Report；PASS/FAIL 结果可被合约执行。 |  |
| E2E Mock Closed Loop | 覆盖 PASS 放款、model mismatch 退款、usage 不足退款、proofBundle 重放拒绝、非法 verifier 签名拒绝、并发任务独立性；CI 可一键运行。 |  |
| M8 Reclaim zkTLS Adapter | Reclaim proof 能被封装为 TyrPay DeliveryReceipt；proof context 与 task context 映射清楚；Verifier 能验证 raw proof 并提取 model/usage/timestamp。 |  |
| M7b 0G Storage Adapter | Proof Bundle、Receipt、Report 可写入 0G 并按 URI 读取；hash 校验通过；LocalStorage 与 0G Storage 可通过配置切换。 |  |
| M9 Buyer / Seller Skill + Agent Kit | buyer-skill 导出 4 个 tool（post/check/refund/list）；seller-skill 导出 4 个 tool（accept/execute/submit/check）；每个 tool 的 description 描述"何时调用"而非"如何实现"；agent-kit 的 `BuyerKit` / `SellerKit` 可直接向 Claude API 和 OpenAI API 传入 tools；示例 agent 能完整走通 Buyer 或 Seller 侧流程。 |  |
| M10 0G TeeTLS Adapter | 0G provider 的 endpoint/model 可从 `getServiceMetadata` 获取；usage 可从 OpenAI-compatible response 提取；raw proof envelope 保存 `chatId`、`processResponse` 结果、request/response、0G metadata 和 TyrPay proof context；Verifier 能验证并提取 evidence；缺少 usage 或 `processResponseResult !== true` 时不能生成有效 receipt。 |  |

---

## 四、项目结构

Phase 1 建议采用 pnpm monorepo：一个仓库、多 package。这样可以保持协议对象、hash 规则、ABI、Verifier 逻辑和 E2E 测试同步演进，同时每个模块仍保留清晰边界。

```text
TyrPay/
  apps/
    verifier-service/
      src/
      prisma/
      test/

  packages/
    contracts/
      contracts/
      scripts/
      test/
      hardhat.config.ts
    sdk-core/
      src/
        types/
        hash/
        eip712/
        canonicalize/
    buyer-sdk/
      src/
    seller-sdk/
      src/
    storage-adapter/
      src/
        local/
        memory/
        zero-g/
    zktls-adapter/
      src/
        core/
        mock/
        reclaim/
        zero-g-teetls/
    verifier-client/
      src/
    buyer-skill/
      src/
        tools/          ← 各 tool 定义（name/description/input_schema/handler）
        index.ts        ← 导出 buyerTools[]
    seller-skill/
      src/
        tools/
        index.ts        ← 导出 sellerTools[]
    agent-kit/
      src/
        buyer-kit.ts    ← BuyerKit：组装 BuyerSdk + buyerTools，toClaudeFormat/toOpenAIFormat
        seller-kit.ts   ← SellerKit：组装 SellerAgent + sellerTools
        index.ts
    shared/
      src/

  examples/
    buyer-agent/        ← 演示 BuyerKit 驱动完整 Buyer 流程的示例 agent
    seller-agent/       ← 演示 SellerKit 驱动完整 Seller 流程的示例 agent

  test/
    e2e/
    fixtures/
      protocol/
        commitments/
        receipts/
        proof-bundles/
        verification-reports/
    vectors/
      hashing/
      eip712/

  docs/
    plan/
    protocol/
    audit/

  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
```

建议 package 命名：

```text
@tyrpay/contracts
@tyrpay/sdk-core
@tyrpay/buyer-sdk
@tyrpay/seller-sdk
@tyrpay/storage-adapter
@tyrpay/zktls-adapter
@tyrpay/verifier-client
@tyrpay/buyer-skill
@tyrpay/seller-skill
@tyrpay/agent-kit
```

---

## 五、核心原则

先用 Mock zkTLS 与 LocalStorage 打通最小可信闭环，再替换为 Reclaim 与 0G；合约只负责状态、资金、hash、签名与结算，复杂 proof 判断留给 Verifier。

Skill 层不运行独立服务，只导出可传入任意 LLM API 的 tool 定义；每个 tool 对应一个业务意图（而非一个 SDK 方法），description 告诉 LLM **何时调用**，input_schema 告诉 LLM **如何传参**，handler 持有实际 SDK 调用逻辑。
