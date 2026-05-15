**[English](./README_EN.md)** | **中文**

# TyrPay

**先证明履约，再自动结算** — 面向 Agent-to-Agent 经济的可验证履约结算协议。

TyrPay 让买方锁定付款后，卖方 Agent 必须通过 zkTLS 加密证明证明其确实调用了约定的模型、API 或工具，验证通过后资金才自动释放。名字取自北欧神话中的 Tyr — 象征规则、公平与誓约。

## 解决什么问题

在 Agent 经济中，服务 Agent 声称自己调用了某些模型、API 或工具完成任务，但买方无法验证其是否真正履约。这造成了"先干活还是先付款"的信任死锁：

- **服务交付不可验证** — 买方无法确认 Agent 是否真的调用了承诺的高性能模型，还是用低成本服务替代。
- **调用过程黑箱** — AI 调用的请求、响应、用量缺乏可审计的证据链，责任难以界定。
- **跨主体信任缺失** — Agent 与 Agent 之间的协作依赖人工信任或中心化平台仲裁，无法实现真正的去信任化交易。
- **缺少结算闭环** — 高价值 AI API / 模型调用没有链上结算手段，付款与履约脱节。

TyrPay 将 Agent 服务拆成三个可验证阶段：

1. 买方发布任务并锁定资金
2. 卖方提交执行承诺（声明将调用什么模型、API、满足什么 usage 条件）
3. 卖方执行任务后提交 zkTLS 证明 → 验证通过自动放款，失败或超时自动退款

TyrPay 证明的**不是**模型内部计算是否正确或输出质量，而是：

- Agent 是否调用了承诺的模型或 API
- 请求和响应是否绑定到当前任务
- 最终交付结果是否来自真实上游响应
- 调用次数、usage、预算是否符合承诺

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        TyrPay Protocol                          │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌───────────────────────────┐  │
│  │ Buyer    │    │ Seller   │    │ Verifier Service          │  │
│  │ Agent    │    │ Agent    │    │                           │  │
│  │          │    │          │    │  - 校验 zkTLS 证明        │  │
│  │ Buyer    │    │ Seller   │    │  - 执行 10 项验证检查     │  │
│  │ SDK      │    │ SDK      │    │  - 签发 EIP-712 报告      │  │
│  │ Buyer    │    │ Seller   │    │  - 提交链上结算            │  │
│  │ Skill    │    │ Skill    │    │                           │  │
│  └────┬─────┘    └────┬─────┘    └────────────┬──────────────┘  │
│       │               │                       │                  │
│       ▼               ▼                       ▼                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              TyrPaySettlement (Smart Contract)           │    │
│  │                                                         │    │
│  │  状态机: INTENT → COMMITMENT → FUNDED → PROOF → SETTLED │    │
│  │  资金托管 · 状态转换 · EIP-712 验签 · 放款/退款         │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                    │
│  ┌──────────────────────────┼──────────────────────────────┐    │
│  │        0G Storage (证据可用层)                           │    │
│  │                                                         │    │
│  │  ExecutionCommitment · DeliveryReceipt · ProofBundle     │    │
│  │  VerificationReport — 大体积证明不上链，可独立校验       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  zkTLS Adapters                          │    │
│  │                                                         │    │
│  │  Reclaim zkFetch  ·  0G TeeTLS  ·  Mock (本地测试)      │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

核心分层：

| 层级 | 组件 | 职责 |
|------|------|------|
| 链上结算层 | TyrPaySettlement 合约 | 托管资金、记录状态、执行放款或退款 |
| 承诺层 | ExecutionCommitment | 卖方声明执行边界，防止事后篡改 |
| 证明层 | zkTLS Adapters | 为真实 API/模型调用生成加密证明 |
| 验证层 | Verifier Service | 校验证明是否满足承诺，签发 EIP-712 报告 |
| 存储层 | 0G Storage | 保存完整证明对象，保证可追溯与可审计 |
| SDK 层 | Buyer SDK / Seller SDK | 面向 Agent 开发者的编程接口 |
| Skill 层 | Buyer Skill / Seller Skill | MCP 工具，直接集成 Agent tool calling 流程 |

## 交易流程

```
Buyer Agent              Settlement Contract          Seller Agent             Verifier Service
    │                           │                          │                          │
    │── createTask() ──────────▶│                          │                          │
    │   (锁定资金条件)           │  INTENT_CREATED          │                          │
    │                           │                          │                          │
    │                           │◀── submitCommitment() ───│                          │
    │                           │   COMMITMENT_SUBMITTED   │                          │
    │                           │                          │                          │
    │── fundTask() ────────────▶│                          │                          │
    │   (ERC20 锁入托管)        │  FUNDED                  │                          │
    │                           │                          │                          │
    │                           │                          │── zkTLS provenFetch() ──▶│
    │                           │                          │   (通过 zkTLS 调用模型)   │
    │                           │                          │                          │
    │                           │◀── submitProof() ────────│                          │
    │                           │   PROOF_SUBMITTED        │                          │
    │                           │                          │                          │
    │                           │◀────────────────────── settle() ──────────────────│
    │                           │   SETTLED / REFUNDED     │   (验证报告 + EIP-712 签名)│
    │                           │                          │                          │
```

超时退款路径：
- **证明提交超时** — `deadline + gracePeriod` 后买方可调用 `refundAfterProofSubmissionDeadline()`
- **验证超时** — `proofSubmittedAt + verificationTimeout` 后买方可调用 `refundAfterVerificationTimeout()`

## 功能模块

### 智能合约

- **TyrPaySettlement** — 核心结算合约，实现完整的任务状态机、EIP-712 验签、防重放、超时退款
- **VerifierRegistry** — 授权验证者管理，合约 Owner 可添加/移除验证者地址

### SDK

| 包 | 说明 |
|----|------|
| `@tyrpay/sdk-core` | 核心类型定义、Canonical JSON 哈希、EIP-712 辅助函数、协议常量 |
| `@tyrpay/buyer-sdk` | 买方 Agent SDK：创建任务、验证承诺、锁定资金、查询状态、退款 |
| `@tyrpay/seller-sdk` | 卖方 Agent SDK：提交承诺、zkTLS 执行、组装证明、提交上链 |

### Skill (MCP Tools)

| 包 | 工具 | 说明 |
|----|------|------|
| `@tyrpay/buyer-skill` | `tyrpay_post_task` | 创建任务、等待承诺、验证并锁定资金 |
| | `tyrpay_fund_task` | 锁定资金 |
| | `tyrpay_check_task` | 查询任务状态 |
| | `tyrpay_refund_task` | 超时退款 |
| | `tyrpay_list_tasks` | 批量查询 |
| `@tyrpay/seller-skill` | `tyrpay_discover_model_endpoint` | 发现 0G TeeTLS 模型端点 |
| | `tyrpay_accept_task` | 提交执行承诺 |
| | `tyrpay_execute_task` | 执行 zkTLS 验证的 API 调用 |
| | `tyrpay_submit_proof` | 组装并提交证明 |
| | `tyrpay_check_settlement` | 查询结算状态 |

### Verifier Service

中心化验证服务，对提交的证明执行 10 项检查：

| 检查项 | 说明 |
|--------|------|
| `commitmentHashMatched` | 存储的承诺哈希与链上一致 |
| `proofBundleHashMatched` | 存储的证明包哈希与链上一致 |
| `zkTlsProofValid` | 每个 zkTLS 原始证明验证通过 |
| `endpointMatched` | 调用端点匹配承诺目标 |
| `taskContextMatched` | 证明上下文绑定到当前任务 |
| `callIndicesUnique` | callIndex 在 bundle 内唯一 |
| `proofNotConsumed` | 证明未被消费（防重放） |
| `withinTaskWindow` | 调用发生在任务有效窗口内 |
| `modelMatched` | 调用的模型在允许列表内 |
| `usageSatisfied` | 累计 usage 满足最低要求 |

全部通过 → RELEASE（放款给卖方）；任一失败 → REFUND（退款给买方）。

### 适配器

**zkTLS 适配器** — 为不同 zkTLS 提供商提供统一接口：

| 适配器 | 用途 |
|--------|------|
| `ReclaimZkTlsAdapter` | 生产环境，集成 Reclaim zkFetch |
| `ZeroGTeeTlsAdapter` | 生产环境，集成 0G Compute TeeTLS |
| `MockZkTlsAdapter` | 本地测试，模拟各种验证场景 |

**存储适配器** — 可插拔存储后端：

| 适配器 | 用途 |
|--------|------|
| `ZeroGStorageAdapter` | 生产环境，0G 去中心化存储 |
| `LocalStorageAdapter` | 本地开发，文件系统存储 |
| `MemoryStorageAdapter` | 单元测试，内存存储 |

## 项目结构

```
tyrpay/
├── apps/
│   └── verifier-service/        # 验证服务 (HTTP API)
├── packages/
│   ├── sdk-core/                # 核心类型与工具函数
│   ├── buyer-sdk/               # 买方 Agent SDK
│   ├── seller-sdk/              # 卖方 Agent SDK
│   ├── buyer-skill/             # 买方 MCP 工具集
│   ├── seller-skill/            # 卖方 MCP 工具集
│   ├── contracts/               # Solidity 智能合约
│   ├── storage-adapter/         # 存储适配器
│   └── zktls-adapter/           # zkTLS 适配器
├── test/
│   └── e2e/                     # 端到端集成测试
├── docs/
│   ├── product doc.md           # 产品文档
│   └── protocol/                # 协议规范文档
└── examples/
    └── 0g-teetls-lab/           # 0G TeeTLS 示例
```

## 快速开始

### 前置要求

- Node.js >= 18
- pnpm >= 10.0.0
- Git

### 安装

```bash
git clone <repo-url> && cd TyrPay
pnpm install
pnpm build
```

### 部署合约

```bash
# 本地 Hardhat 网络（开发调试）
pnpm contracts:node          # 启动本地节点
pnpm contracts:deploy:local  # 部署合约

# 测试网
# 在 .env 中配置 ZERO_G_EVM_RPC 和 DEPLOYER_PRIVATE_KEY
pnpm contracts:deploy:testnet
```

部署完成后，合约地址会写入 `packages/contracts/deployments/addresses.<chainId>.json`。

#### 0G Galileo Testnet 已部署合约 (Chain ID: 16602)

| 合约 | 地址 |
|------|------|
| TyrPaySettlement | `0xa6488EEcD8f13564297dD76E04B550A7580d4C78` |
| VerifierRegistry | `0x0584f117c0703A00Ac8ca9965c825F8a51Cbb619` |

### 部署 Verifier Service

#### 1. 准备环境变量

复制 `.env.example` 为 `.env` 并填入实际值：

```bash
cp .env.example .env
```

```env
# 必填 — 区块链与存储
ZERO_G_EVM_RPC=https://evmrpc-testnet.0g.ai
ZERO_G_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai

# 必填 — 合约地址（来自部署输出）
SETTLEMENT_CONTRACT=0xYourSettlementContractAddress

# 必填 — 验证者私钥（地址需在 VerifierRegistry 中注册）
VERIFIER_PRIVATE_KEY=0xYourVerifierPrivateKey

# 可选
VERIFIER_PORT=3000
CHAIN_ID=16602
```

#### 2. 注册验证者

使用合约 Owner 调用 `VerifierRegistry.addVerifier(verifierAddress)` 将验证者钱包地址添加到白名单。

#### 3. 启动服务

```bash
# 开发模式（热重载）
pnpm --filter @tyrpay/verifier-service dev

# 生产模式
pnpm --filter @tyrpay/verifier-service start
```

启动后服务提供：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/verify` | POST | 验证任务并结算 |

验证请求示例：

```bash
curl -X POST http://127.0.0.1:3000/verify \
  -H "Content-Type: application/json" \
  -d '{"taskId":"0x...","settle":true,"waitForSettlement":true}'
```

响应包含完整的 `VerificationReport`、各项检查结果、以及结算交易信息。

#### 4. 生产部署注意事项

- **Proof Consumption Registry**：默认使用 `InMemoryProofConsumptionRegistry`（进程内存储，重启后丢失）。生产环境应替换为持久化实现（如基于 Prisma + PostgreSQL 的 `PrismaProofConsumptionRegistry`）。
- **私钥安全**：`VERIFIER_PRIVATE_KEY` 建议通过环境变量或密钥管理服务注入，不要写入代码或版本控制。
- **反向代理**：建议在 Verifier Service 前部署 Nginx 等反向代理，处理 TLS 终止和限流。

### 运行测试

```bash
# 单元测试
pnpm test

# 合约测试
pnpm contracts:test

# E2E 测试（需要本地节点运行）
pnpm contracts:node
pnpm test:e2e
```

## 目标用户

- **Buyer Agent** — 购买研究、审计、数据分析、交易信号等服务，只为可验证履约付款
- **Seller Agent** — 用证明提升可信度，积累 proof-based reputation
- **Agent Marketplace** — 基于真实履约记录排序、筛选和定价

## 0G 集成

TyrPay 集成 0G Storage 作为证据可用层，存储 `ExecutionCommitment`、`DeliveryReceipt`、`ProofBundle`、`VerificationReport` 等关键证明对象。链上仅保存哈希与 URI，实现：

- 大体积证明数据不上链，降低结算成本
- 证明材料可持久存储、可独立校验、可随时复查
- 完整的可验证证据链：承诺 → 执行 → 验证 → 结算

## License

MIT License
