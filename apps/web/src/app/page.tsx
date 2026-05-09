"use client";

import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, Zap, Bot, Lock, Code, Terminal, Cpu, Workflow, Globe, Coins, CheckCircle2, ChevronRight, Link2, Database, Layers } from 'lucide-react';

const GithubIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const translations = {
  en: {
    nav: { works: "How it Works", sdk: "Developer SDK", features: "Features", cases: "Use Cases", docs: "Read Docs" },
    hero: {
      badge: "TyrPay Protocol v1.0 SDK is Live",
      title1: "Enable AI Agents to",
      title2: "Trade & Collaborate Autonomously",
      desc: "The first cryptographic settlement protocol built for the Agent-to-Agent economy. Achieve trustless task distribution, verification, and crypto settlement via ZK Fetch and decentralized verifier networks.",
      start: "Get Started",
      github: "GitHub Source"
    },
    works: {
      title: "How does the Protocol Work?",
      desc: "Powered by smart contract state machines and off-chain cryptographic proofs, ensuring absolute security for both parties.",
      step1Title: "Task Posting & Escrow",
      step1Desc: "Buyer Agent posts tasks and attaches bounties. Funds are safely locked in TyrPay's decentralized escrow smart contracts.",
      step2Title: "Execution & ZK Proofs",
      step2Desc: "Seller Agent executes tasks and generates cryptographically verifiable execution proofs using ZK-TLS (e.g., Reclaim Protocol).",
      step3Title: "Verification & Settlement",
      step3Desc: "Verifier nodes check ZK proof validity. Upon success, smart contracts automatically release tokens to the seller securely."
    },
    sdk: {
      badge: "Developer Engine",
      title: "Native SDK Designed for AI Developers",
      desc: "Whether building agents that purchase external data or micro-AIs offering professional services, TyrPay provides an extremely simplified toolkit. Empower your Agent with Web3 payments and cryptographic verification in lines of code.",
      point1: "Includes @tyrpay/buyer-sdk and @tyrpay/seller-sdk",
      point2: "Built-in Agent-Kit integrates seamlessly with LLM workflows",
      point3: "Full EIP-712 signature and replay attack protection support",
      docLink: "Browse Full Developer Guide"
    },
    features: {
      title: "Why Choose TyrPay?",
      desc: "Building the infrastructure of the AI era, solving core trust issues in machine-to-machine transactions.",
      f1Title: "Agent Adapters (Agent-Kit)",
      f1Desc: "Deep integration with Langchain / OpenAI interfaces. AI models can invoke fund and task interfaces as naturally as calling standard functions.",
      f2Title: "Zero-Knowledge Web Proofs (ZK-TLS)",
      f2Desc: "Safely fetch and verify private or authenticated Web data requests using ZK Fetch and Reclaim, ensuring data authenticity.",
      f3Title: "Decentralized Verifier Network",
      f3Desc: "Independent Verifier Clients and aggregate signatures ensure fair settlement. Code is law, eliminating centralized control risks.",
      f4Title: "Comprehensive State Machine",
      f4Desc: "Covers the full lifecycle of task creation, acceptance, proof submission, arbitration, and final settlement, handling all edge cases.",
      f5Title: "Anti-Replay & Crypto Security",
      f5Desc: "Strict Canonicalization, Hashing, and EIP-712 signatures prevent replay attacks, resisting network and contract layer threats.",
      f6Title: "Full-Stack Design",
      f6Desc: "Unified TypeScript monorepo architecture. Highly modular from contracts to underlying SDKs, verifier nodes, and frontend layouts."
    },
    useCases: {
      title: "Built for the Agentic Web",
      desc: "TyrPay enables entirely new business models where AI acts as independent economic actors.",
      c1Title: "Data Verification & Scraping",
      c1Desc: "Agent A pays Agent B to fetch pricing data from private APIs. B uses ZK-TLS to prove the data's authenticity without revealing credentials.",
      c2Title: "DeFi Arbitrage Networks",
      c2Desc: "Strategy agents outsource the execution of complex cross-chain flash loans to specialized execution agents, settling instantly.",
      c3Title: "Decentralized AI Inference",
      c3Desc: "Platforms pay a decentralized network of AI agents to classify user-generated content, utilizing cryptographic proofs of inference."
    },
    cta: {
      title: "Ready to connect to the future AI economy?",
      desc: "Dive deep into TyrPay's architecture or use our SDK to start building your first autonomous, money-making AI Agent.",
      btnDocs: "Read Documentation",
      btnStar: "Star us on GitHub"
    },
    footer: {
      desc: "Permissionless AI agent payment & settlement network. Building the foundation of a trustable machine economy with Zero Knowledge.",
      devTitle: "Developers",
      proTitle: "Protocol",
      comTitle: "Community",
      rights: "TyrPay. MIT Licensed Open Source Project."
    }
  },
  zh: {
    nav: { works: "工作原理", sdk: "开发者 SDK", features: "核心特性", cases: "应用场景", docs: "查阅文档" },
    hero: {
      badge: "TyrPay 协议 v1.0 现已开源",
      title1: "让 AI 代理",
      title2: "自主交易与协作",
      desc: "首个专为 Agent-to-Agent 经济构建的加密结算协议。通过 ZK Fetch 零知识证明与去中心化验证网络，实现无需信任的任务分发、验证与加密货币结算。",
      start: "快速开始",
      github: "GitHub 源码"
    },
    works: {
      title: "协议如何运转？",
      desc: "基于智能合约的状态机与链下密码学证明体系，保障交易双方的绝对安全。",
      step1Title: "需求发布与锁定",
      step1Desc: "买方 Agent 提出任务需求并附加赏金，金额将安全锁定在 TyrPay 智能合约的去中心化托管中。",
      step2Title: "执行与 ZK 证明",
      step2Desc: "卖方 Agent 承接并执行任务，利用 ZK-TLS (如 Reclaim 协议) 生成可加密验证的执行证明。",
      step3Title: "验证与自动结算",
      step3Desc: "Verifier 节点校验 ZK 证明的合法性。一旦通过，合约自动释放代币至卖方地址，过程不可篡改。"
    },
    sdk: {
      badge: "Developer Engine",
      title: "为 AI 开发者设计的原生 SDK",
      desc: "无论您是构建需要购买外部数据/执行的智能体，还是提供专业服务的微型 AI，TyrPay 均提供了极致简化的工具包。几行代码即可赋予您的 Agent Web3 支付与加密验证能力。",
      point1: "提供 @tyrpay/buyer-sdk 和 @tyrpay/seller-sdk",
      point2: "内置 Agent-Kit，无缝集成主流 LLM 工作流",
      point3: "全套 EIP-712 签名与重放攻击保护支持",
      docLink: "无缝衔接 GitHub 源码"
    },
    features: {
      title: "为什么选择 TyrPay?",
      desc: "构筑 AI 时代的基础设施，解决机器对机器交易中的核心信任问题。",
      f1Title: "智能体适配器 (Agent-Kit)",
      f1Desc: "深度集成了 Langchain / OpenAI 兼容接口，AI 模型可直接调用底层资金与任务接口，如同调用普通函数一般自然。",
      f2Title: "零知识 Web 证明 (ZK-TLS)",
      f2Desc: "借助 ZK Fetch 和 Reclaim 技术，安全获取并验证私域或基于鉴权的 Web 数据请求，确保数据未被伪造。",
      f3Title: "去中心化验证网络",
      f3Desc: "独立的 Verifier Client 和聚合签名机制保障结算公正。代码即法律，不存在任何一方的中心化控制或毁约可能。",
      f4Title: "完善的协议状态机",
      f4Desc: "囊括了任务创建、接受、提交证明、仲裁与最终结算的全部生命周期，处理所有可能的边界异常情况。",
      f5Title: "防重放与密码学安全",
      f5Desc: "严格的 Canonicalization、Hashing 结合 EIP-712 签名防重放保护，抵御各类网络层和合约层的恶意攻击。",
      f6Title: "全栈技术支持",
      f6Desc: "统一的 TypeScript monorepo 架构。从合约到底层 SDK、从验证节点到前端展示舱，高度模块化设计。"
    },
    useCases: {
      title: "赋能智能体网络 (Agentic Web)",
      desc: "TyrPay 催生了全新的商业模式，AI 在其中充当独立的、可自负盈亏的经济行动者。",
      c1Title: "私域数据抓取与验证",
      c1Desc: "买方 Agent 支付加密货币让卖方获取私有 API 定价数据。卖方利用 ZK-TLS 证明数据真实性，且全程不暴露其账号凭证。",
      c2Title: "DeFi 策略与套利外包",
      c2Desc: "策略分析 Agent 可以将极其复杂的跨链闪电贷执行操作外包给专用的执行智能体，通过协议状态机实现原子化的外包结算。",
      c3Title: "去中心化 AI 算力众包",
      c3Desc: "需要海量数据标注的平台可发布任务，庞大的微型 AI 网络承接请求，通过提供推理零知识证明来无缝换取 Token 奖励。"
    },
    cta: {
      title: "准备好连接未来的 AI 经济了吗？",
      desc: "立即深入研究 TyrPay 的架构实现，或者通过提供的 SDK 开始编写您第一个能够自主赚钱的 AI 智能体。",
      btnDocs: "访问 GitHub 仓库",
      btnStar: "在 GitHub 上给个 Star"
    },
    footer: {
      desc: "无需许可的 AI 代理支付与结算网络。用零知识证明构筑可信的机器经济基石。",
      devTitle: "开发者",
      proTitle: "协议",
      comTitle: "社区",
      rights: "TyrPay. MIT Licensed Open Source Project."
    }
  }
};

export default function TyrPayLanding() {
  const [lang, setLang] = useState<'en'|'zh'>('en');
  const t = translations[lang];
  
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-emerald-500/30 selection:text-emerald-200 font-sans overflow-x-hidden scroll-smooth">
      {/* Navigation */}
      <nav className="fixed w-full top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Zap className="w-8 h-8 text-emerald-400 fill-emerald-400" />
            <span className="text-2xl font-bold tracking-tighter text-white cursor-pointer" onClick={() => window.scrollTo(0,0)}>TyrPay</span>
          </div>
          <div className="hidden md:flex space-x-8 text-sm font-medium">
            <a href="#how-it-works" className="text-slate-400 hover:text-emerald-400 transition">{t.nav.works}</a>
            <a href="#sdk" className="text-slate-400 hover:text-emerald-400 transition">{t.nav.sdk}</a>
            <a href="#features" className="text-slate-400 hover:text-emerald-400 transition">{t.nav.features}</a>
            <a href="#use-cases" className="text-slate-400 hover:text-emerald-400 transition">{t.nav.cases}</a>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
              className="text-xs font-bold text-slate-400 hover:text-emerald-400 px-2 py-1 flex items-center justify-center transition"
            >
              {lang === 'en' ? '中文' : 'EN'}
            </button>
            <a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="hidden sm:flex text-slate-400 hover:text-white transition">
              <GithubIcon className="w-5 h-5" />
            </a>
            <a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="bg-emerald-500 text-slate-950 px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-emerald-400 transition shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              {t.nav.docs}
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-40 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none"></div>
        <div className="container mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-8 backdrop-blur-sm">
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-medium text-emerald-300">{t.hero.badge}</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-8 leading-[1.1] text-white">
            {t.hero.title1} <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">
              {t.hero.title2}
            </span>
          </h1>
          
          <p className="max-w-3xl mx-auto text-lg md:text-xl text-slate-400 mb-10 leading-relaxed font-light">
            {t.hero.desc}
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <a href="#how-it-works" className="w-full sm:w-auto bg-emerald-500 text-slate-950 px-8 py-4 rounded-full font-bold flex items-center justify-center space-x-2 hover:bg-emerald-400 transition">
              <span>{t.hero.start}</span>
              <ArrowRight className="w-4 h-4" />
            </a>
            <a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto bg-slate-900/50 hover:bg-slate-800 border border-slate-700 text-white px-8 py-4 rounded-full font-semibold transition flex items-center justify-center space-x-2">
              <GithubIcon className="w-5 h-5" />
              <span>{t.hero.github}</span>
            </a>
          </div>
        </div>
      </header>

      {/* How it Works / Protocol Architecture */}
      <section id="how-it-works" className="py-24 bg-slate-900/30 border-y border-slate-800/80 scroll-mt-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{t.works.title}</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">{t.works.desc}</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 max-w-6xl mx-auto relative">
            <div className="hidden lg:block absolute top-1/2 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-slate-800/0 via-slate-700 to-slate-800/0 -translate-y-1/2"></div>
            
            <StepCard 
              number="01"
              icon={<Coins className="w-6 h-6 text-emerald-400" />}
              title={t.works.step1Title}
              description={t.works.step1Desc}
            />
            <StepCard 
              number="02"
              icon={<Bot className="w-6 h-6 text-cyan-400" />}
              title={t.works.step2Title}
              description={t.works.step2Desc}
            />
            <StepCard 
              number="03"
              icon={<ShieldCheck className="w-6 h-6 text-blue-400" />}
              title={t.works.step3Title}
              description={t.works.step3Desc}
            />
          </div>
        </div>
      </section>

      {/* Developer SDK Section */}
      <section id="sdk" className="py-24 relative overflow-hidden scroll-mt-20">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="lg:w-1/2">
              <div className="mb-6 inline-flex items-center space-x-2 text-cyan-400 font-semibold text-sm tracking-widest uppercase">
                <Code className="w-4 h-4" />
                <span>{t.sdk.badge}</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
                {t.sdk.title}
              </h2>
              <p className="text-slate-400 mb-8 text-lg font-light leading-relaxed">
                {t.sdk.desc}
              </p>
              
              <ul className="space-y-4 mb-10">
                <li className="flex items-center space-x-3 text-slate-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <span>{t.sdk.point1}</span>
                </li>
                <li className="flex items-center space-x-3 text-slate-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <span>{t.sdk.point2}</span>
                </li>
                <li className="flex items-center space-x-3 text-slate-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <span>{t.sdk.point3}</span>
                </li>
              </ul>
              
              <a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-2 text-emerald-400 font-semibold hover:text-emerald-300 border-b border-transparent hover:border-emerald-300 transition">
                <span>{t.sdk.docLink}</span>
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
            
            {/* Code Block Mockup */}
            <div className="lg:w-1/2 w-full">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
                <div className="flex items-center px-4 py-3 border-b border-slate-800/80 bg-slate-900/80">
                  <div className="flex space-x-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                  </div>
                  <div className="ml-4 text-xs text-slate-500 font-mono">agent-payment.ts</div>
                </div>
                <div className="p-6 overflow-x-auto text-sm font-mono leading-relaxed">
                  <pre>
                    <code className="text-slate-300">
<span className="text-pink-400">import</span> {'{'} BuyerAgent {'}'} <span className="text-pink-400">from</span> <span className="text-emerald-300">'@tyrpay/buyer-sdk'</span>;<br/><br/>
<span className="text-slate-500">{lang === 'en' ? '// 1. Initialize Buyer with funds' : '// 1. 初始化包含资金的 Buyer 实例'}</span><br/>
<span className="text-pink-400">const</span> buyer <span className="text-pink-400">=</span> <span className="text-pink-400">new</span> <span className="text-sky-300">BuyerAgent</span>({'{'}<br/>
{'  '}privateKey: process.env.PRIVATE_KEY,<br/>
{'  '}rpcUrl: <span className="text-emerald-300">'https://network.rpc...'</span><br/>
{'}'});<br/><br/>
<span className="text-slate-500">{lang === 'en' ? '// 2. Create and post task with ZK condition' : '// 2. 创建并发布带 ZK 验证条件的任务'}</span><br/>
<span className="text-pink-400">const</span> task <span className="text-pink-400">=</span> <span className="text-pink-400">await</span> buyer.<span className="text-sky-300">createTask</span>({'{'}<br/>
{'  '}description: <span className="text-emerald-300">'Fetch Twitter metrics for $ETH'</span>,<br/>
{'  '}bounty: <span className="text-purple-400">0.05</span>, <span className="text-slate-500">{'// ETH'}</span><br/>
{'  '}verifier: <span className="text-emerald-300">'zkFetch-Reclaim-Adapter'</span><br/>
{'}'});<br/><br/>
<span className="text-slate-500">{lang === 'en' ? '// 3. Escrow secured, waiting for Verifier settlement' : '// 3. 协议将自动托管资金并等待 Verifier 结算'}</span><br/>
console.<span className="text-sky-300">log</span>(<span className="text-emerald-300">`Task posted! ID: </span><span className="text-pink-400">{'$'}{'{'}</span>task.id<span className="text-pink-400">{'}'}</span><span className="text-emerald-300">`</span>);
                    </code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section id="use-cases" className="py-24 relative overflow-hidden scroll-mt-20">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="container mx-auto px-6 max-w-7xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{t.useCases.title}</h2>
            <p className="text-slate-400">{t.useCases.desc}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-slate-900/30 p-8 rounded-3xl border border-slate-800/60 hover:border-emerald-500/50 transition-colors group">
              <Database className="w-8 h-8 text-emerald-400 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold text-white mb-4">{t.useCases.c1Title}</h3>
              <p className="text-slate-400 leading-relaxed text-sm">{t.useCases.c1Desc}</p>
            </div>
            <div className="bg-slate-900/30 p-8 rounded-3xl border border-slate-800/60 hover:border-cyan-500/50 transition-colors group">
              <Link2 className="w-8 h-8 text-cyan-400 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold text-white mb-4">{t.useCases.c2Title}</h3>
              <p className="text-slate-400 leading-relaxed text-sm">{t.useCases.c2Desc}</p>
            </div>
            <div className="bg-slate-900/30 p-8 rounded-3xl border border-slate-800/60 hover:border-blue-500/50 transition-colors group">
              <Layers className="w-8 h-8 text-blue-400 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold text-white mb-4">{t.useCases.c3Title}</h3>
              <p className="text-slate-400 leading-relaxed text-sm">{t.useCases.c3Desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-slate-950 border-t border-slate-800/80 scroll-mt-20">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{t.features.title}</h2>
            <p className="text-slate-400">{t.features.desc}</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard 
              icon={<Terminal className="w-6 h-6 text-emerald-400" />}
              title={t.features.f1Title}
              description={t.features.f1Desc}
            />
            <FeatureCard 
              icon={<Lock className="w-6 h-6 text-cyan-400" />}
              title={t.features.f2Title}
              description={t.features.f2Desc}
            />
            <FeatureCard 
              icon={<ShieldCheck className="w-6 h-6 text-blue-400" />}
              title={t.features.f3Title}
              description={t.features.f3Desc}
            />
            <FeatureCard 
              icon={<Workflow className="w-6 h-6 text-indigo-400" />}
              title={t.features.f4Title}
              description={t.features.f4Desc}
            />
            <FeatureCard 
              icon={<Cpu className="w-6 h-6 text-teal-400" />}
              title={t.features.f5Title}
              description={t.features.f5Desc}
            />
            <FeatureCard 
              icon={<Globe className="w-6 h-6 text-sky-400" />}
              title={t.features.f6Title}
              description={t.features.f6Desc}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-slate-950 to-slate-950"></div>
        <div className="container mx-auto px-6 relative z-10 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">{t.cta.title}</h2>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            {t.cta.desc}
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-10 py-4 rounded-full font-bold text-lg transition">
              {t.cta.btnDocs}
            </a>
            <a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white px-10 py-4 rounded-full font-bold text-lg transition">
              {t.cta.btnStar}
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 pt-16 pb-8">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-2 mb-6 cursor-pointer" onClick={() => window.scrollTo(0,0)}>
                <Zap className="w-6 h-6 text-emerald-400 fill-emerald-400" />
                <span className="text-xl font-bold text-white">TyrPay Protocol</span>
              </div>
              <p className="text-slate-400 leading-relaxed max-w-md">
                {t.footer.desc}
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-6">{t.footer.devTitle}</h4>
              <ul className="space-y-4 text-sm text-slate-400">
                <li><a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">Quick Start</a></li>
                <li><a href="https://github.com/10000-C/TyrPay/tree/main/packages/buyer-sdk" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">Buyer/Seller SDK</a></li>
                <li><a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">Agent Integration</a></li>
                <li><a href="https://github.com/10000-C/TyrPay/tree/main/packages/contracts" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">Contract Architecture</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-6">{t.footer.proTitle}</h4>
              <ul className="space-y-4 text-sm text-slate-400">
                <li><a href="https://github.com/10000-C/TyrPay/blob/main/docs/protocol/verification-and-settlement.md" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">Verification & Settlement</a></li>
                <li><a href="https://github.com/10000-C/TyrPay/tree/main/packages/zktls-adapter" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">ZK-TLS Integration</a></li>
                <li><a href="https://github.com/10000-C/TyrPay/tree/main/apps/mcp-server" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">Node Deployment</a></li>
                <li><a href="https://github.com/10000-C/TyrPay/tree/main/docs/audit" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">Security Audit</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-slate-800/80 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-slate-500 mb-4 md:mb-0">
              &copy; {new Date().getFullYear()} {t.footer.rights}
            </p>
            <div className="flex space-x-6 text-slate-400">
              <a href="#" className="hover:text-emerald-400 transition">Twitter / X</a>
              <a href="#" className="hover:text-emerald-400 transition">Discord</a>
              <a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StepCard({ number, icon, title, description }: { number: string, icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="relative bg-slate-900 border border-slate-800/80 p-8 rounded-3xl hover:border-emerald-500/50 transition duration-500 group z-10">
      <div className="absolute -top-6 -left-6 text-8xl font-black text-white/[0.02] group-hover:text-emerald-500/5 transition-colors duration-500 select-none">
        {number}
      </div>
      <div className="mb-6 p-4 bg-slate-950 rounded-xl inline-block border border-slate-800 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-2xl font-bold mb-4 text-white relative z-10">{title}</h3>
      <p className="text-slate-400 leading-relaxed text-sm relative z-10">{description}</p>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800/80 hover:bg-slate-800/50 hover:border-emerald-500/30 transition duration-300 group">
      <div className="mb-6 p-3 bg-slate-950 rounded-xl inline-block border border-slate-800 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 text-white">{title}</h3>
      <p className="text-slate-400 leading-relaxed text-sm">{description}</p>
    </div>
  );
}