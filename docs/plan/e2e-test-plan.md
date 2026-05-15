# FulFilPay E2E 集成测试方案

> 版本：v1.0  
> 日期：2026-05-04  
> 前置条件：M0–M7 模块开发完成，P0 合规问题已修复  
> 目标：验证 Mock 闭环全链路（Buyer → Seller → Verifier → Contract），覆盖规范要求的全部 E2E 场景

---

## 一、测试目标与范围

### 1.1 目标

验证 FulFilPay Phase 1 最小可信闭环在 Mock 环境下的端到端正确性：

```
Buyer 创建任务 → Seller 提交承诺 → Buyer 锁款 → Seller 执行 Mock zkTLS → Seller 提交 Proof Bundle
→ Verifier 验证并签名 Report → 合约结算/退款
```

### 1.2 范围

| 层级 | 组件 | 说明 |
|---|---|---|
| 链上 | TyrPaySettlement + VerifierRegistry + MockERC20 | Hardhat local node |
| 链下 SDK | BuyerSdk + SellerAgent | 调用 SDK 方法驱动流程 |
| 链下 Adapter | MemoryStorageAdapter + MockZkTlsAdapter | Mock 实现 |
| 链下 Service | Verifier Service (HTTP) | 真实 Fastify 服务器，内存存储 |
| 链下 Client | VerifierClient | 调用 Verifier Service API |

### 1.3 不在范围

- Reclaim 真实 zkTLS（M8）
- 0G Storage（M7b）
- MCP/Skill Layer（M9）
- Demo Agent
- 主网/测试网部署

---

## 二、测试架构

### 2.1 整体架构图

```text
┌─────────────────────────────────────────────────────────┐
│                    E2E Test Runner                       │
│                  (Hardhat + Mocha)                       │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌───────────────────┐  │
│  │ BuyerSdk │    │SellerAgent│    │ VerifierClient    │  │
│  └────┬─────┘    └────┬─────┘    └────────┬──────────┘  │
│       │               │                   │              │
│       ▼               ▼                   ▼              │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Hardhat Local Network                   │   │
│  │  ┌──────────────┐ ┌────────────────┐ ┌────────┐  │   │
│  │  │Settlement    │ │VerifierRegistry│ │MockERC20│  │   │
│  │  └──────────────┘ └────────────────┘ └────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │MemoryStorage   │  │MockZkTls       │                 │
│  │Adapter         │  │Adapter         │                 │
│  └────────────────┘  └────────────────┘                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │        Verifier Service (Fastify, in-process)     │   │
│  │  内存存储 proofConsumption + verificationReports   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 测试环境搭建

每个测试用例共享一个 `setupE2eEnvironment` fixture：

```typescript
interface E2eEnvironment {
  // 合约实例
  settlement: TyrPaySettlement;
  verifierRegistry: VerifierRegistry;
  mockToken: MockERC20;
  
  // SDK 实例
  buyerSdk: BuyerSdk;
  sellerAgent: SellerAgent;
  verifierClient: VerifierClient;
  
  // Adapters（共享同一实例）
  storage: MemoryStorageAdapter;
  zkTlsAdapter: MockZkTlsAdapter;
  
  // Verifier Service
  verifierServer: FastifyInstance;
  verifierUrl: string;
  
  // Signers
  owner: HardhatEthersSigner;
  buyer: HardhatEthersSigner;
  seller: HardhatEthersSigner;
  verifier: HardhatEthersSigner;
  stranger: HardhatEthersSigner;
  
  // 配置
  chainId: bigint;
  settlementAddress: Address;
  proofSubmissionGracePeriod: bigint;  // 15 min
  verificationTimeout: bigint;         // 60 min
}
```

### 2.3 Verifier Service 集成方式

Verifier Service 在 E2E 测试中以 **in-process** 模式启动：

1. 使用 Fastify 的 `listen(0)` 绑定随机端口
2. 注入与测试相同的 `storage`、`zkTlsAdapter`、ethers provider
3. 使用 `verifier` signer 的私钥签名
4. 测试结束后通过 `close()` 关闭

---

## 三、E2E 测试用例设计

### 3.1 场景总览

| # | 场景名称 | 类型 | 覆盖规范 | 优先级 |
|---|---|---|---|---|
| E2E-01 | Happy Path — PASS 放款 | 正向 | E2E Mock Closed Loop | P0 |
| E2E-02 | Model Mismatch → 退款 | 负向 | boundary-cases.md | P0 |
| E2E-03 | Usage 不足 → 退款 | 负向 | boundary-cases.md | P0 |
| E2E-04 | ProofBundle 重放拒绝 | 负向 | signatures-and-replay-protection.md | P0 |
| E2E-05 | 非法 Verifier 签名拒绝 | 负向 | verification-and-settlement.md | P0 |
| E2E-06 | Proof 提交宽限期内的有效执行 | 边界 | boundary-cases.md | P1 |
| E2E-07 | Duplicate callIndex 拒绝 | 负向 | boundary-cases.md | P1 |
| E2E-08 | Timestamp 超出任务窗口 | 负向 | boundary-cases.md | P1 |
| E2E-09 | Task 过期 → EXPIRED 派生状态 | 边界 | state-machine.md | P1 |
| E2E-10 | ProofSubmissionDeadline 后退款 | 负向 | boundary-cases.md | P1 |
| E2E-11 | VerificationTimeout 后退款 | 负向 | boundary-cases.md | P1 |
| E2E-12 | 未注册 Verifier 签名拒绝 | 负向 | verification-and-settlement.md | P2 |
| E2E-13 | Wrong chain / wrong contract 的 EIP-712 拒绝 | 负向 | signatures-and-replay-protection.md | P2 |
| E2E-14 | Commitment 校验失败阻止锁款 | 负向 | boundary-cases.md | P2 |
| E2E-15 | 多任务并发（2 个独立任务分别 PASS 和 REFUND） | 正向 | 集成压力 | P2 |

---

### 3.2 详细用例设计

#### E2E-01: Happy Path — PASS 放款

```text
前置: 部署合约, mint token, approve, 注册 verifier
步骤:
  1. BuyerSdk.createTaskIntent(amount=1_000_000)
  2. SellerAgent.submitCommitment(taskId, commitmentParams)
  3. BuyerSdk.validateCommitment(taskId, expectations)
  4. BuyerSdk.fundTask(taskId)
  5. SellerAgent.provenFetch(taskId, { scenario: "pass" })
  6. SellerAgent.buildDeliveryReceipt(...)
  7. SellerAgent.buildProofBundle(taskId, receipts)
  8. SellerAgent.uploadProofBundle(proofBundle)
  9. SellerAgent.submitProofBundleHash(taskId)
  10. VerifierClient.submitVerification(taskId)
      → Verifier Service 读取链上 task + storage proof bundle
      → 执行全部检查 → 签名 VerificationReport(passed=true, action=RELEASE)
  11. BuyerSdk 或 VerifierClient 调用 settlement.settle(report, signature)
断言:
  - 最终状态 = SETTLED
  - Seller 余额增加 1_000_000
  - Buyer 余额减少 1_000_000
  - VerificationReport.passed = true
  - VerificationReport.settlement.action = "RELEASE"
  - VerificationReport.checks 全部 = true
```

#### E2E-02: Model Mismatch → 退款

```text
步骤:
  1-4. 同 E2E-01 步骤 1-4（创建、承诺、锁款）
  5. SellerAgent.provenFetch(taskId, { scenario: "model-mismatch" })
     → Mock adapter 返回 model="gpt-3.5-turbo"（不在 allowedModels 中）
  6-9. 构建 receipt/proofBundle/upload/提交链上
  10. VerifierClient.submitVerification(taskId)
      → Verifier 检查 modelMatched=false
      → 签名 VerificationReport(passed=false, action=REFUND)
  11. 调用 settlement.settle(report, signature)
断言:
  - 最终状态 = REFUNDED
  - Buyer 余额恢复（退款）
  - VerificationReport.passed = false
  - VerificationReport.checks.modelMatched = false
```

#### E2E-03: Usage 不足 → 退款

```text
步骤:
  1-4. 同 E2E-01 步骤 1-4（设置 minUsage.totalTokens=500）
  5. SellerAgent.provenFetch(taskId, { scenario: "usage-insufficient" })
     → Mock adapter 返回 usage.totalTokens=50（不满足 500）
  6-9. 构建 receipt/proofBundle/upload/提交链上
  10. VerifierClient.submitVerification(taskId)
      → Verifier 检查 usageSatisfied=false
      → 签名 VerificationReport(passed=false, action=REFUND)
  11. 调用 settlement.settle(report, signature)
断言:
  - 最终状态 = REFUNDED
  - VerificationReport.checks.usageSatisfied = false
```

#### E2E-04: ProofBundle 重放拒绝

```text
步骤:
  1. 先执行完整的 E2E-01（PASS 放款），记录 proofBundleHash
  2. 创建新任务，走完到 FUNDED 状态
  3. 用相同的 proofBundleHash 尝试 submitProofBundle
断言:
  - settlement.submitProofBundle 应该 revert（如果合约记录已消耗的 proofBundleHash）
  - 或 Verifier 在验证时拒绝（proofNotConsumed=false）
```

#### E2E-05: 非法 Verifier 签名拒绝

```text
步骤:
  1. 执行到 PROOF_SUBMITTED 状态
  2. 用 stranger（非注册 verifier）的私钥签名 VerificationReport
  3. 调用 settlement.settle(report, strangerSignature)
断言:
  - settle 交易 revert
  - 错误原因包含 "Invalid verifier" 或类似信息
```

#### E2E-06: Proof 提交宽限期内有效执行

```text
步骤:
  1-4. 创建任务（deadline 设置为较短时间）
  5. Seller 在 deadline 内执行 provenFetch（receipt.timestamp < deadline）
  6. evm_increaseTime 使 block.timestamp 超过 deadline 但在 proofSubmissionGracePeriod 内
  7. Seller 提交 proofBundleHash
断言:
  - submitProofBundle 成功（在宽限期内）
  - Verifier 验证时 withinTaskWindow=true（因为 observedAt < deadline）
  - 最终可正常 SETTLE
```

#### E2E-07: Duplicate callIndex 拒绝

```text
步骤:
  1-4. 创建任务并锁款
  5. 构造一个包含两个相同 callIndex（如都是 0）的 receipt 的 ProofBundle
  6. 提交到链上
  7. Verifier 验证
断言:
  - VerificationReport.checks.callIndicesUnique=false
  - 最终 REFUND
```

#### E2E-08: Timestamp 超出任务窗口

```text
子场景 A: timestamp-before-funded
  1-4. 锁款后记录 fundedAt
  5. Mock provenFetch 返回 observedAt < fundedAt
  6-7. 构建 proofBundle/提交
  8. Verifier 验证
  断言: withinTaskWindow=false, REFUND

子场景 B: timestamp-after-deadline
  5. Mock provenFetch 返回 observedAt > deadline
  6-8. 同上
  断言: withinTaskWindow=false, REFUND
```

#### E2E-09: Task 过期 → EXPIRED 派生状态

```text
步骤:
  1. BuyerSdk.createTaskIntent（设置较短的 deadline，如 5 秒后）
  2. Seller 提交 commitment
  3. evm_increaseTime 超过 deadline
  4. BuyerSdk.getTaskStatus()
断言:
  - 返回 "EXPIRED"（派生状态）
  - 链上状态仍为 COMMITMENT_SUBMITTED（未锁款）
```

#### E2E-10: ProofSubmissionDeadline 后退款

```text
步骤:
  1-4. 创建任务、承诺、锁款
  5. 不提交 proof
  6. evm_increaseTime 超过 deadline + proofSubmissionGracePeriod
  7. BuyerSdk.refundAfterProofSubmissionDeadline(taskId)
断言:
  - 最终状态 = REFUNDED
  - Buyer 余额恢复
```

#### E2E-11: VerificationTimeout 后退款

```text
步骤:
  1-4. 创建任务、承诺、锁款
  5. Seller 提交 proofBundleHash
  6. evm_increaseTime 超过 verificationTimeout
  7. BuyerSdk.refundAfterVerificationTimeout(taskId)
断言:
  - 最终状态 = REFUNDED
  - Buyer 余额恢复
```

#### E2E-12: 未注册 Verifier 签名拒绝

```text
步骤:
  1. 使用未注册到 VerifierRegistry 的地址签名 report
  2. 调用 settlement.settle()
断言:
  - revert，错误信息指向 verifier 未注册
```

#### E2E-13: Wrong chain / wrong contract EIP-712 拒绝

```text
子场景 A: wrong chain
  1. 构造 EIP-712 domain 时使用错误的 chainId
  2. 用合法 verifier 签名
  3. 调用 settlement.settle()
  断言: revert（EIP-712 domain 不匹配）

子场景 B: wrong contract
  1. 构造 EIP-712 domain 时使用错误的 verifyingContract
  2. 用合法 verifier 签名
  3. 调用 settlement.settle()
  断言: revert
```

#### E2E-14: Commitment 校验失败阻止锁款

```text
步骤:
  1. 创建任务
  2. Seller 提交 commitment（target.host="api.anthropic.com"）
  3. Buyer 调用 fundTask(taskId, { validateCommitment: { acceptedHosts: ["api.openai.com"] } })
断言:
  - fundTask 抛出 BuyerSdkValidationError
  - 任务状态保持 COMMITMENT_SUBMITTED，未锁款
```

#### E2E-15: 多任务并发

```text
步骤:
  1. 创建 Task-A 和 Task-B
  2. Task-A 走完整 PASS 流程
  3. Task-B 的 seller 使用 model-mismatch
  4. 两个任务独立结算
断言:
  - Task-A = SETTLED，Seller 收到资金
  - Task-B = REFUNDED，Buyer 收到退款
  - 两个任务的 proofConsumption 互不影响
```

---

## 四、测试基础设施

### 4.1 目录结构

```text
test/
  e2e/
    helpers/
      setup.ts              # E2E 环境搭建 (deploy + SDK 实例化)
      verifier-server.ts    # in-process Verifier Service 启动/关闭
      assertions.ts         # 通用断言辅助（余额检查、事件检查）
    e2e-happy-path.test.ts          # E2E-01
    e2e-negative-model-usage.test.ts # E2E-02, E2E-03
    e2e-replay-protection.test.ts   # E2E-04
    e2e-invalid-signature.test.ts   # E2E-05, E2E-12, E2E-13
    e2e-boundary-cases.test.ts      # E2E-06, E2E-07, E2E-08
    e2e-timeout-refund.test.ts      # E2E-09, E2E-10, E2E-11
    e2e-commitment-validation.test.ts # E2E-14
    e2e-multi-task.test.ts          # E2E-15
  fixtures/
    protocol/              # 现有正向 fixture
    negative/              # 新增负向 fixture
      commitment.model-empty.json
      receipt.context-wrong-task.json
      receipt.model-mismatch.json
      receipt.timestamp-before-funded.json
      receipt.timestamp-after-deadline.json
      proof-bundle.submitted-within-grace.json
      proof-bundle.usage-insufficient.json
      proof-bundle.duplicate-call-index.json
      verification-report.bad-verifier.json
      verification-report.wrong-chain.json
      verification-report.wrong-contract.json
  vectors/
    hashing/
      pass-basic.json       # 现有
      negative.json         # 新增负向场景 hash 向量
    eip712/
      verification-report-pass-basic.json  # 现有
      verification-report-fail.json        # 新增
```

### 4.2 环境搭建伪代码

```typescript
// test/e2e/helpers/setup.ts

import { ethers } from "hardhat";
import { BuyerSdk } from "@tyrpay/buyer-sdk";
import { SellerAgent } from "@tyrpay/seller-sdk";
import { MemoryStorageAdapter } from "@tyrpay/storage-adapter";
import { MockZkTlsAdapter } from "@tyrpay/zktls-adapter";

export async function setupE2eEnvironment(): Promise<E2eEnvironment> {
  const [owner, buyer, seller, verifier, stranger] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  // 1. 部署合约
  const verifierRegistry = await deployVerifierRegistry(owner);
  await verifierRegistry.addVerifier(verifier.address);
  
  const proofSubmissionGracePeriod = 15n * 60n * 1000n; // 15 min in ms
  const verificationTimeout = 60n * 60n * 1000n;        // 60 min in ms
  const settlement = await deploySettlement(
    verifierRegistry, proofSubmissionGracePeriod, verificationTimeout
  );
  
  const mockToken = await deployMockERC20(owner);
  await settlement.setAllowedToken(mockToken, true);
  await mockToken.mint(buyer, INITIAL_BALANCE);
  await mockToken.connect(buyer).approve(settlement, MAX_UINT256);

  // 2. 共享 Adapter
  const storage = new MemoryStorageAdapter();
  const zkTlsAdapter = new MockZkTlsAdapter();

  // 3. SDK 实例
  const buyerSdk = new BuyerSdk({
    settlementAddress: settlement.address,
    signer: buyer,
    storage,
    reportResolver: new ReportResolverViaVerifierClient(),
  });

  const sellerAgent = new SellerAgent({
    settlementAddress: settlement.address,
    signer: seller,
    storage,
    zkTlsAdapter,
  });

  // 4. Verifier Service (in-process)
  const { server, verifierClient, url } = await startVerifierService({
    settlementAddress: settlement.address,
    verifierSigner: verifier,
    storage,
    zkTlsAdapter,
    provider: ethers.provider,
  });

  return {
    settlement, verifierRegistry, mockToken,
    buyerSdk, sellerAgent, verifierClient,
    storage, zkTlsAdapter,
    verifierServer: server, verifierUrl: url,
    owner, buyer, seller, verifier, stranger,
    chainId, settlementAddress: settlement.address,
    proofSubmissionGracePeriod, verificationTimeout,
  };
}
```

### 4.3 Verifier Service in-process 启动

```typescript
// test/e2e/helpers/verifier-server.ts

import Fastify from "fastify";

export async function startVerifierService(config: {
  settlementAddress: string;
  verifierSigner: HardhatEthersSigner;
  storage: MemoryStorageAdapter;
  zkTlsAdapter: MockZkTlsAdapter;
  provider: ethers.Provider;
}) {
  const app = Fastify();
  
  // 注册 verifier service 路由（复用 apps/verifier-service 的逻辑）
  registerVerifierRoutes(app, config);
  
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const verifierClient = new VerifierClient({ baseUrl: address });
  
  return { server: app, verifierClient, url: address };
}
```

---

## 五、前置修复清单

E2E 测试编写前必须完成的前置修复：

| 序号 | 修复项 | 关联审计编号 | 预估工作量 |
|---|---|---|---|
| 1 | 补充 11 个负向 fixture 文件 | M0-1 | 2h |
| 2 | 补充 VerifierClient 的 `getReport(taskId)` 方法 | M7-1 | 1h |
| 4 | 完善 MockZkTlsAdapter 的负向场景支持 | M4-1 | 2h |
| 5 | Seller SDK 补充集成测试 | M5-1 | 4h |
| 6 | Verifier Service 补充集成测试 | M7-2 | 4h |

---

## 六、执行策略

### 6.1 分阶段执行

| 阶段 | 内容 | 用例 | 依赖 |
|---|---|---|---|
| Phase A | 环境搭建 + Happy Path | E2E-01 | 前置修复 1-4 |
| Phase B | 核心负向场景 | E2E-02, E2E-03, E2E-05 | Phase A |
| Phase C | 重放/边界场景 | E2E-04, E2E-06, E2E-07, E2E-08 | Phase A |
| Phase D | 超时/退款场景 | E2E-09, E2E-10, E2E-11 | Phase A |
| Phase E | 完整性补充 | E2E-12, E2E-13, E2E-14, E2E-15 | Phase B, C, D |

### 6.2 CI 集成

在 `turbo.json` 中添加 E2E pipeline：

```json
{
  "pipeline": {
    "test:e2e": {
      "dependsOn": ["build", "contracts:compile"],
      "outputs": []
    }
  }
}
```

在根 `package.json` 中添加：

```json
{
  "scripts": {
    "test:e2e": "npx hardhat test test/e2e/*.test.ts --network hardhat"
  }
}
```

### 6.3 测试超时配置

E2E 测试涉及链上交易和 Verifier Service 启动，需要较长的超时时间：

```typescript
// 每个测试文件顶部
const E2E_TIMEOUT_MS = 120_000; // 2 minutes per test

describe("E2E: Happy Path", function () {
  this.timeout(E2E_TIMEOUT_MS);
  // ...
});
```

---

## 七、验收标准

| # | 标准 | 验证方式 |
|---|---|---|
| AC-1 | 所有 P0 场景（E2E-01~05）通过 | CI 绿灯 |
| AC-2 | 所有 P1 场景（E2E-06~11）通过 | CI 绿灯 |
| AC-3 | 所有 P2 场景（E2E-12~15）通过 | CI 绿灯 |
| AC-4 | `pnpm test:e2e` 一键运行所有 E2E 测试 | 命令行执行 |
| AC-5 | 无随机失败（连续 3 次运行结果一致） | 重复执行 |
| AC-6 | 测试覆盖了全部 5 个规范要求的 E2E 场景 | 对照 `dev_plan.md` |
| AC-7 | Mock zkTLS 的所有场景都被至少一个 E2E 测试覆盖 | 对照 M4 验收标准 |

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| Verifier Service in-process 启动失败 | 阻塞 E2E-01~08 | 先验证 standalone 启动，再切换 in-process |
| Hardhat 时间操作（evm_increaseTime）与 Verifier Service 的 nowMs 不同步 | 时间相关测试不一致 | Verifier Service 使用 provider.getBlock() 获取时间 |
| MemoryStorageAdapter 跨 SDK 实例共享状态 | 测试隔离性差 | 每个测试用例创建新的 MemoryStorageAdapter |
