# FulfillPay Phase 1 技术选型与模块化开发计划

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
| SDK 语言 | TypeScript | Buyer SDK、Seller SDK、MCP、Verifier、Storage、zkTLS Adapter 可共享类型、hash、ABI 与工具链。 |
| 后端 / Verifier | Node.js 20+ + TypeScript + Fastify | Phase 1 中心化 Verifier 快速实现 proof 读取、检查、聚合 usage、生成并签名 Verification Report。 |
| 数据库 | PostgreSQL + Prisma | 存储 proof consumption registry、verification reports、proof bundle 索引；Prisma 提供类型安全和迁移便利。 |
| Storage | StorageAdapter 抽象 + Local/Memory + 0G Storage Adapter | 本地先跑通，正式环境接 0G Storage；链上只记录 hash 与 URI，完整对象放可验证存储。 |
| zkTLS | ZkTlsAdapter 抽象 + Mock Adapter + Reclaim Adapter | 先用 Mock 打通闭环，再接 Reclaim；避免主流程被 provider 细节绑定。 |
| Reclaim 集成 | TypeScript：`@reclaimprotocol/js-sdk` / zkFetch SDK | FulfillPay Seller SDK / zkTLS Adapter 最适合用 TypeScript 集成 Reclaim；移动端 SDK 暂不作为 Phase 1 主路径。 |
| MCP / Skill | TypeScript MCP Server + Buyer/Seller SDK | MCP / Skill 只封装 SDK 工具能力，不直接实现合约交互、proof 生成或 storage 逻辑。 |
| 测试 | Hardhat TypeScript tests + E2E fixtures；Foundry 可选 | Hardhat 做主测试与链下集成；Foundry 后续可补 fuzz / invariant。 |
| 工程结构 | pnpm monorepo | 一个仓库、多 package；统一管理 contracts、sdk-core、buyer-sdk、seller-sdk、verifier、storage、zktls、mcp、examples。 |

---

## 二、模块化开发计划

| 阶段 | 模块 | 顺序依赖 / 必须顺次 | 可并行推进 | 交付物 |
|---|---|---|---|---|
| M0 | Protocol Spec & Shared Types | 必须最先完成；冻结 ExecutionCommitment、TaskContext、DeliveryReceipt、ProofBundle、VerificationReport、TaskStatus、SettlementAction。 | 不可并行替代；但可由合约、SDK、Verifier 共同评审。 | schema、canonicalize 规则、hash 规则、EIP-712 report struct、fixtures v0。 |
| M1 | Contracts | 依赖 M0；需先于完整 Buyer/Seller SDK 和 Verifier settlement 集成。 | 可与 M2、M3 并行。 | FulfillPaySettlement、VerifierRegistry、MockERC20、Hardhat tests、deploy scripts。 |
| M2 | SDK Core | 依赖 M0；Buyer SDK、Seller SDK、Verifier、Adapters 均依赖它。 | 可与 M1、M3 并行。 | canonicalize、hashObject、buildTaskContext、buildCallIntentHash、EIP-712 helper、shared types。 |
| M3 | Storage Adapter | 依赖 M0/M2 的 hash 与对象规范；正式 0G 可晚于 Local/Memory。 | 可与 M1/M2/M4 并行。 | StorageAdapter interface、LocalStorageAdapter、MemoryStorageAdapter、0G Adapter placeholder / 实现。 |
| M4 | Mock zkTLS Adapter | 依赖 M2；必须先于真实 Reclaim 主路径，以便先打通 Mock E2E。 | 可与 M3 并行。 | Mock `provenFetch`、`verifyRawProof`、`normalizeReceipt`；模拟 model、usage、timestamp、proofContext。 |
| M6 | Buyer SDK | 依赖 M1/M2；锁款、状态查询依赖合约 ABI。 | 可与 M5 的 commitment 构造部分并行。 | `createTaskIntent`、`getCommitment`、`validateCommitment`、`fundTask`（强制锁款前校验 commitment）、`getTaskStatus`（实现 `EXECUTING` / `EXPIRED` 派生状态；`VERIFIED_PASS` / `VERIFIED_FAIL` 暂不实现，Buyer Agent 可通过 `getReport()` 主动查询）、`getReport`、`refundAfterProofSubmissionDeadline`、`refundAfterVerificationTimeout`。 |
| M5 | Seller SDK | 依赖 M1/M2/M3/M4；proof bundle 生成后才能支撑 Verifier 完整开发。 | commitment 构造可与 Buyer SDK 并行；`provenFetch` / `submitProofBundle` 需等 Storage/Mock。 | `submitCommitment`、`provenFetch`、`buildDeliveryReceipt`、`buildProofBundle`、`uploadProofBundle`、`submitProofBundleHash`。 |
| M7 | Centralized Verifier | 依赖 M1/M2/M3/M4/M5；必须在 Seller SDK 能产出 Mock Proof Bundle 后进入完整实现。 | Verifier 框架可与 Reclaim Adapter PoC 并行。 | 读取链上 task、读取 proof bundle、检查 context/timestamp/model/usage、防重放、签名 Verification Report。 |
| E2E | Mock Closed Loop | 依赖 M1-M7；必须先跑通再替换真实 zkTLS / 0G。 | 测试 fixtures 可提前并行准备。 | PASS 放款、model mismatch 退款、usage 不足退款、proofBundle 重放拒绝、非法 verifier 签名拒绝。 |
| M8 | Reclaim zkTLS Adapter | 不阻塞 Mock 闭环；在 E2E 稳定后替换 Mock Adapter。 | 可作为支线与 M5/M7 并行做 PoC。 | ReclaimZkTlsAdapter、proof context mapping、raw proof verify、receipt normalization、OpenAI-compatible extraction。 |
| M7b | 0G Storage Adapter | LocalStorage 跑通后接入；不应阻塞 Mock E2E。 | 可与 Reclaim Adapter 并行。 | 0G `putObject` / `getObject`、hash verification、URI persistence、fallback local mode。 |
| M9 | MCP / Skill Layer | 必须在 Buyer/Seller SDK 稳定后开发；不直接实现协议核心逻辑。 | 可与文档、demo agent 并行。 | Buyer MCP tools、Seller MCP tools、Skill wrapper、example agent。 |

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
             ┌────────────────┼────────────────┐
             │                │                │
     ┌───────▼───────┐ ┌──────▼──────┐ ┌──────▼──────┐
     │ M8 Reclaim    │ │ M7b 0G Store│ │ M9 MCP/Skill│
     │ Adapter       │ │ Adapter     │ │ Layer       │
     └───────────────┘ └─────────────┘ └─────────────┘
```

推荐实际顺序：

```text
M0 → M1/M2/M3 并行 → M4 → M6/M5 → M7 → Mock E2E → M8 / M7b → M9
```

---

## 三、模块验收标准与负责人

| 模块 | 验收标准 | 负责人 |
|---|---|---|
| M0 Protocol Spec & Shared Types | 协议对象 schema 已冻结 v0.1；canonicalize 与 hash 规则有测试向量；EIP-712 report struct 明确；fixtures 可被合约、SDK、Verifier 共用。 |  |
| M1 Contracts | Hardhat 测试通过；状态机完整覆盖 intent、commitment、funding、proof submitted、settled/refunded；Verifier 签名校验可用；重复结算被拒绝。 |  |
| M2 SDK Core | TypeScript 类型、hash 工具、TaskContext 构造、callIntentHash、EIP-712 helper 可复用；与 fixtures 的 hash 测试结果一致。 |  |
| M3 Storage Adapter | Local/Memory Adapter 可完成 put/get/hash check；对象内容被篡改时读取失败；0G Adapter 接口不影响上层调用。 |  |
| M4 Mock zkTLS Adapter | 可生成稳定 mock rawProof、extracted fields、DeliveryReceipt；能模拟 PASS、model mismatch、usage insufficient、timestamp invalid 等场景。 |  |
| M6 Buyer SDK | 可完成 createTaskIntent、读取/校验 commitment、fundTask（强制锁款前校验 commitment）、查询 task/report、refundAfterProofSubmissionDeadline、refundAfterVerificationTimeout；能在 E2E 中驱动 Buyer 侧全流程。 |  |
| M5 Seller SDK | 可提交 commitment、执行 mock provenFetch、生成 receipt/proofBundle、上传 storage、提交 proofBundleHash；能在 E2E 中驱动 Seller 侧全流程。 |  |
| M7 Centralized Verifier | 能读取链上 task 与 storage proof bundle；完成 context、timestamp、model、usage、防重放检查；能签名 Verification Report；PASS/FAIL 结果可被合约执行。 |  |
| E2E Mock Closed Loop | 至少覆盖 PASS 放款、model mismatch 退款、usage 不足退款、proofBundle 重放拒绝、非法 verifier 签名拒绝；CI 可一键运行。 |  |
| M8 Reclaim zkTLS Adapter | Reclaim proof 能被封装为 FulfillPay DeliveryReceipt；proof context 与 task context 映射清楚；Verifier 能验证 raw proof 并提取 model/usage/timestamp。 |  |
| M7b 0G Storage Adapter | Proof Bundle、Receipt、Report 可写入 0G 并按 URI 读取；hash 校验通过；LocalStorage 与 0GStorage 可通过配置切换。 |  |
| M9 MCP / Skill Layer | Buyer/Seller MCP tools 调用 SDK 而非直接实现协议逻辑；示例 Agent 能完成创建任务、锁款、提交 proof、查询结算状态。 |  |

---

## 四、项目结构

Phase 1 建议采用 pnpm monorepo：一个仓库、多 package。这样可以保持协议对象、hash 规则、ABI、Verifier 逻辑和 E2E 测试同步演进，同时每个模块仍保留清晰边界。

```text
fulfillpay/
  apps/
    verifier-service/
      src/
      prisma/
      test/
    mcp-server/
      src/
    demo-agent/
      src/

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
    verifier-client/
      src/
    shared/
      src/

  examples/
    openai-compatible-demo/

  test/
    e2e/
    fixtures/
      commitments/
      receipts/
      proof-bundles/
      verification-reports/

  docs/
    protocol-objects.md
    e2e-flow.md
    reclaim-adapter.md

  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
```

建议 package 命名：

```text
@fulfillpay/contracts
@fulfillpay/sdk-core
@fulfillpay/buyer-sdk
@fulfillpay/seller-sdk
@fulfillpay/storage-adapter
@fulfillpay/zktls-adapter
@fulfillpay/verifier-client
@fulfillpay/mcp-server
```

---

## 五、核心原则

先用 Mock zkTLS 与 LocalStorage 打通最小可信闭环，再替换为 Reclaim 与 0G；合约只负责状态、资金、hash、签名与结算，复杂 proof 判断留给 Verifier。
