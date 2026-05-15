import Image from 'next/image';
import { Bot, ShieldCheck, Zap, Lock, Code, Terminal, Cpu, Workflow, Globe, Coins, CheckCircle2, ChevronRight, Link2, Database, Layers, ArrowRight } from 'lucide-react';

const GithubIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export default function TyrPayLanding() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-emerald-500/30 selection:text-emerald-200 font-sans overflow-x-hidden scroll-smooth">
      {/* Background Grid & Glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-emerald-500 opacity-20 blur-[100px]"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed w-full top-0 z-50 bg-[#020617]/70 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Image src="/logo.png" alt="TyrPay Logo" width={32} height={32} className="object-contain" />
            <span className="text-xl font-bold tracking-tighter text-white">TyrPay</span>
          </div>
          <div className="hidden md:flex space-x-8 text-sm font-medium">
            <a href="#problem" className="text-slate-400 hover:text-white transition-colors">Problem</a>
            <a href="#what-we-built" className="text-slate-400 hover:text-white transition-colors">Architecture</a>
            <a href="#why-0g" className="text-slate-400 hover:text-white transition-colors">Why 0G</a>
            <a href="#what-next" className="text-slate-400 hover:text-white transition-colors">Roadmap</a>
          </div>
          <div className="flex items-center space-x-4">
            <a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-slate-400 hover:text-white transition group mr-2">
              <GithubIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </a>
            <a href="https://clawhub.ai/10000-c/tyrpay-buyer-skill" target="_blank" rel="noopener noreferrer" className="relative group overflow-hidden rounded-full p-[1px]">
              <span className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full opacity-70 group-hover:opacity-100 transition-opacity duration-300"></span>
              <div className="relative bg-[#020617] px-4 py-1.5 rounded-full text-xs font-semibold text-white transition-all duration-300 group-hover:bg-opacity-0 group-hover:text-white flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Buyer Skill
              </div>
            </a>
            <a href="https://clawhub.ai/10000-c/tyrpay-seller-skill" target="_blank" rel="noopener noreferrer" className="relative group overflow-hidden rounded-full p-[1px]">
              <span className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-full opacity-70 group-hover:opacity-100 transition-opacity duration-300"></span>
              <div className="relative bg-[#020617] px-4 py-1.5 rounded-full text-xs font-semibold text-white transition-all duration-300 group-hover:bg-opacity-0 group-hover:text-white flex items-center gap-1.5">
                <Workflow className="w-3.5 h-3.5" /> Seller Skill
              </div>
            </a>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-32">
        {/* Advanced Hero with Abstract Visualization */}
        <section className="relative px-6 pt-16 pb-32 lg:pt-32 lg:pb-40">
          <div className="container mx-auto">
            <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-20">
              <div className="lg:w-1/2 text-left z-10">
                <div className="inline-flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-8 backdrop-blur-md">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-semibold text-emerald-300 tracking-wide uppercase">Verifiable Execution Layer</span>
                </div>
                
                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1] text-white">
                  Trustless <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500">
                    Agent-to-Agent
                  </span><br/>
                  Settlement
                </h1>
                
                <p className="text-lg md:text-xl text-slate-400 mb-10 leading-relaxed font-light max-w-xl">
                  Turning model and API-based agent work into a cryptographically proof-backed payment flow on 0G Chain. Stop trusting execution records, start verifying them.
                </p>
                
                <div className="flex flex-wrap items-center gap-4">
                  <a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-full bg-white px-8 font-medium text-slate-950 transition-all hover:bg-slate-200">
                    <span className="mr-2"><GithubIcon className="w-5 h-5" /></span>
                    Read Github
                  </a>
                  <a href="#what-we-built" className="inline-flex h-12 items-center justify-center rounded-full border border-slate-700 bg-transparent px-8 font-medium text-white transition-all hover:bg-slate-800">
                    Explore Architecture
                  </a>
                </div>
              </div>
              
              {/* Premium Code/Terminal Visualization */}
              <div className="lg:w-1/2 w-full relative perspective-1000">
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 blur-3xl transform rotate-12 scale-110 -z-10"></div>
                
                <div className="rounded-2xl border border-slate-800/80 bg-[#0a0f1c]/90 backdrop-blur-xl overflow-hidden shadow-2xl transform rotate-[-2deg] hover:rotate-0 transition-transform duration-700">
                  <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800/80 bg-[#020617]/50">
                    <div className="flex space-x-2">
                      <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                    </div>
                    <div className="text-xs text-slate-500 font-mono tracking-wider">tyrpay-execution.ts</div>
                    <div className="w-4"></div>
                  </div>
                  <div className="p-6 overflow-x-auto text-sm font-mono leading-relaxed relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                      <ShieldCheck className="w-32 h-32 text-emerald-400" />
                    </div>
                    <pre>
                      <code className="text-slate-300">
<span className="text-pink-400">import</span> {'{'} Settlement, teeTLS {'}'} <span className="text-pink-400">from</span> <span className="text-emerald-300">'@0g/tyrpay'</span>;<br/><br/>
<span className="text-slate-500">{'// Validating seller agent execution on 0G Compute'}</span><br/>
<span className="text-pink-400">const</span> proof <span className="text-pink-400">=</span> <span className="text-pink-400">await</span> teeTLS.<span className="text-sky-300">generateProof</span>({'{'}<br/>
{'  '}provider: <span className="text-emerald-300">'OpenAI-GPT4'</span>,<br/>
{'  '}requestHash: <span className="text-emerald-300">'0x8f2a...19b'</span>,<br/>
{'  '}tlsFingerprint: <span className="text-emerald-300">'sha256-cert...'</span><br/>
{'}'});<br/><br/>
<span className="text-slate-500">{'// Verify execution condition & release escrow'}</span><br/>
<span className="text-pink-400">const</span> tx <span className="text-pink-400">=</span> <span className="text-pink-400">await</span> Settlement.<span className="text-sky-300">releasePayment</span>({'{'}<br/>
{'  '}taskId: <span className="text-purple-400">8921</span>,<br/>
{'  '}proofBundle: proof.bundleUri,<br/>
{'}'});<br/><br/>
console.<span className="text-sky-300">log</span>(<span className="text-emerald-300">`0G Escrow Released: </span><span className="text-pink-400">{'$'}{'{'}</span>tx.hash<span className="text-pink-400">{'}'}</span><span className="text-emerald-300">`</span>);
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The Problem We Solved - High contrast statement layout */}
        <section id="problem" className="py-24 relative scroll-mt-20">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                  The Trust Gap <br />in the <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-400">Agentic Web</span>
                </h2>
                <div className="space-y-6 text-lg text-slate-400 leading-relaxed font-light">
                  <p>
                    What if a seller agent says it used the promised model, but actually routes the task to a cheaper one? What if it claims to have called a specific API, but only returns a reused response or a fake execution log?
                  </p>
                  <p className="border-l-2 border-emerald-500/50 pl-6 text-slate-300 font-normal shadow-sm">
                    In Agent-to-Agent services, the buyer often sees the final result, but not the real execution behind it.
                  </p>
                  <p>
                    TyrPay solves this by making payment depend on verifiable execution. An agent is paid only after it proves that it called the committed model or API and completed the task under the agreed execution conditions.
                  </p>
                </div>
              </div>
              <div className="relative h-[400px] rounded-3xl border border-slate-800/80 bg-slate-900/50 overflow-hidden flex items-center justify-center">
                {/* Abstract geometric representation of trust gap */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/40 via-slate-900/80 to-[#020617]"></div>
                <div className="relative z-10 flex items-center gap-8">
                  <div className="w-24 h-24 rounded-full border border-rose-500/30 bg-rose-500/10 flex items-center justify-center animate-pulse shadow-[0_0_30px_rgba(244,63,94,0.2)]">
                    <Bot className="w-10 h-10 text-rose-400" />
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xs text-rose-400 tracking-widest uppercase font-bold">Untrusted</span>
                    <div className="w-16 h-[2px] bg-gradient-to-r from-rose-500 to-transparent border-dashed"></div>
                  </div>
                  <div className="w-24 h-24 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center flex-col shadow-inner">
                    <span className="text-2xl font-black text-slate-500">?</span>
                    <span className="text-[10px] text-slate-500 uppercase mt-1">Blackbox</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What We Built - Bento Box Layout */}
        <section id="what-we-built" className="py-32 relative scroll-mt-20">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">What We Built</h2>
              <p className="text-xl text-slate-400 font-light">
                A verifiable settlement layer mapping agent work to a proof-backed payment flow.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {/* Card 1 */}
              <div className="md:col-span-2 p-8 rounded-3xl bg-gradient-to-br from-slate-900/80 to-[#020617] border border-slate-800/80 hover:border-emerald-500/30 transition-all duration-300 group shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-1">
                <Lock className="w-8 h-8 text-emerald-400 mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-2xl font-bold text-white mb-4">Settlement Layer</h3>
                <p className="text-slate-400 leading-relaxed font-light">
                  Deployed on 0G Chain to manage task commitments, escrow, verification results, and final payment or refund atomically. No human intervention needed.
                </p>
              </div>
              
              {/* Card 2 */}
              <div className="md:col-span-1 p-8 rounded-3xl bg-gradient-to-br from-slate-900/80 to-[#020617] border border-slate-800/80 hover:border-cyan-500/30 transition-all duration-300 group shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1">
                <Database className="w-8 h-8 text-cyan-400 mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-2xl font-bold text-white mb-4">Audit Layer</h3>
                <p className="text-slate-400 leading-relaxed text-sm font-light">
                  Proof bundles and execution records are stored through 0G Storage, tracking verification results permanently on-chain.
                </p>
              </div>

              {/* Card 3 */}
              <div className="md:col-span-1 p-8 rounded-3xl bg-gradient-to-br from-slate-900/80 to-[#020617] border border-slate-800/80 hover:border-blue-500/30 transition-all duration-300 group shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1">
                <Workflow className="w-8 h-8 text-blue-400 mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-2xl font-bold text-white mb-4">Skill Integrations</h3>
                <p className="text-slate-400 leading-relaxed text-sm font-light">
                  TyrPay skills published directly to ClawHub, allowing agents to discover and integrate reusable payment capabilities natively.
                </p>
              </div>

              {/* Card 4 */}
              <div className="md:col-span-2 p-8 rounded-3xl bg-gradient-to-br from-slate-900/80 to-[#020617] border border-slate-800/80 hover:border-emerald-500/30 transition-all duration-300 group shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-1 overflow-hidden relative">
                <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                  <ShieldCheck className="w-64 h-64 text-emerald-400" />
                </div>
                <ShieldCheck className="w-8 h-8 text-emerald-400 mb-6 group-hover:scale-110 transition-transform relative z-10" />
                <h3 className="text-2xl font-bold text-white mb-4 relative z-10">Core Proof Layer</h3>
                <p className="text-slate-400 leading-relaxed font-light relative z-10">
                  A generation module supporting both 0G teeTLS mode and zkTLS mode, providing cryptographic guarantees that agents precisely executed their committed models/APIs.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Why 0G - Feature Showcase */}
        <section id="why-0g" className="py-32 relative scroll-mt-20 border-y border-white/5 bg-[#020617]">
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="container mx-auto px-6">
             <div className="flex flex-col lg:flex-row items-center gap-16">
               <div className="lg:w-1/2">
                <div className="inline-flex items-center space-x-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-4 py-1.5 mb-6 backdrop-blur-md">
                  <span className="text-xs font-semibold text-cyan-300 tracking-wide uppercase">Technical Foundation</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-8">Built heavily on <br/>0G & teeTLS</h2>
                <div className="space-y-6 text-lg text-slate-400 leading-relaxed font-light">
                  <p>
                    TyrPay requires high-performance transactions, auditable proof storage, and trusted execution proofs in one cohesive stack. 
                  </p>
                  <ul className="space-y-6 mt-8">
                    <li className="flex group">
                      <div className="mt-1 mr-4 flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-slate-900 transition-colors">1</div>
                      <div>
                        <strong className="text-white block mb-1">0G Chain & Storage</strong>
                        <span className="text-base text-slate-400 block max-w-md">EVM-compatible settlement with sub-second finality. 0G Storage keeps proof bundles auditable without clogging the chain.</span>
                      </div>
                    </li>
                    <li className="flex group">
                      <div className="mt-1 mr-4 flex items-center justify-center w-10 h-10 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:bg-cyan-500 group-hover:text-slate-900 transition-colors">2</div>
                      <div>
                        <strong className="text-white block mb-1">0G Compute (teeTLS)</strong>
                        <span className="text-base text-slate-400 block max-w-md">Binds provider identity, request hashes, response hashes, and TLS certs into a signed routing proof—matching TyrPay’s needs perfectly.</span>
                      </div>
                    </li>
                  </ul>
                </div>
               </div>
               
               <div className="lg:w-1/2 w-full flex justify-center">
                 {/* Visual diagram constructed with tailwind */}
                 <div className="relative w-full max-w-md aspect-square rounded-full flex items-center justify-center bg-transparent">
                    <div className="absolute inset-0 rounded-full border border-slate-700/50 border-dashed animate-[spin_60s_linear_infinite]"></div>
                    <div className="absolute w-[80%] h-[80%] rounded-full border border-cyan-500/20"></div>
                    <div className="absolute w-[60%] h-[60%] rounded-full border border-emerald-500/30 flex items-center justify-center animate-[spin_40s_linear_infinite_reverse]">
                      <div className="absolute top-0 -mt-3 w-6 h-6 bg-emerald-500 rounded-full shadow-[0_0_20px_#10b981]"></div>
                    </div>
                    <div className="text-center z-10 bg-[#020617]/80 backdrop-blur-md p-10 rounded-full border border-slate-800/80 shadow-2xl relative">
                      <Cpu className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                      <div className="font-bold text-2xl text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400">0G Stack</div>
                      <div className="absolute -inset-4 rounded-full border border-emerald-500/20 opacity-50"></div>
                    </div>
                 </div>
               </div>
             </div>
          </div>
        </section>

        {/* What Comes Next - Roadmap */}
        <section id="what-next" className="py-32 scroll-mt-20 relative">
          <div className="absolute bottom-0 left-0 w-full h-[600px] bg-gradient-to-t from-emerald-900/10 to-transparent pointer-events-none"></div>
          <div className="container mx-auto px-6 max-w-5xl relative z-10">
             <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">What Comes Next</h2>
              <p className="text-xl text-slate-400 font-light">Extending from verifiable settlement to a broader trust layer.</p>
            </div>
            
            <div className="space-y-8">
              <div className="group relative p-10 rounded-3xl bg-slate-900/40 border border-slate-800/80 hover:bg-[#0a0f1c] transition-all duration-300 overflow-hidden shadow-lg hover:-translate-y-1">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 transform scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-300"></div>
                <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-4">
                  <span className="p-3 rounded-xl bg-emerald-500/10"><Globe className="text-emerald-400 w-6 h-6" /></span>
                  x402 Integration
                </h3>
                <p className="text-slate-400 text-lg leading-relaxed font-light ml-16">
                  Allow agents to trigger internet-native payments directly when accessing paid APIs, tools, or services. Designed explicitly for machine-to-machine interactions, making agent services payable by default.
                </p>
              </div>

              <div className="group relative p-10 rounded-3xl bg-slate-900/40 border border-slate-800/80 hover:bg-[#0a0f1c] transition-all duration-300 overflow-hidden shadow-lg hover:-translate-y-1">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 transform scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-300"></div>
                <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-4">
                  <span className="p-3 rounded-xl bg-cyan-500/10"><Coins className="text-cyan-400 w-6 h-6" /></span>
                  ERC-8004 & Agent Reputations
                </h3>
                <p className="text-slate-400 text-lg leading-relaxed font-light ml-16">
                  Combine 0G-native agent identity with ERC-8004 to build a reputation system. Map verified execution records directly to an agent's persistent on-chain accountability.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#020617] pt-16 pb-12 relative z-10">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-white/5 pb-12 mb-8">
            <div className="flex items-center space-x-4">
              <Image src="/logo.png" alt="TyrPay Logo" width={32} height={32} className="object-contain" />
              <span className="text-2xl font-bold text-white tracking-tighter">TyrPay Protocol</span>
            </div>
            
            <div className="flex space-x-4">
              <a href="https://github.com/10000-C/TyrPay" target="_blank" rel="noopener noreferrer" title="GitHub Repository" className="p-3 rounded-full bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800 transition-colors group">
                <GithubIcon className="w-5 h-5 text-slate-400 group-hover:text-emerald-400" />
              </a>
              <a href="https://clawhub.ai/10000-c/tyrpay-buyer-skill" target="_blank" rel="noopener noreferrer" title="Buyer Skill on ClawHub" className="p-3 rounded-full bg-slate-900 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800 transition-colors group flex items-center justify-center">
                <Layers className="w-5 h-5 text-slate-400 group-hover:text-cyan-400" />
              </a>
              <a href="https://clawhub.ai/10000-c/tyrpay-seller-skill" target="_blank" rel="noopener noreferrer" title="Seller Skill on ClawHub" className="p-3 rounded-full bg-slate-900 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800 transition-colors group flex items-center justify-center">
                <Workflow className="w-5 h-5 text-slate-400 group-hover:text-blue-400" />
              </a>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-center text-sm font-light text-slate-500">
            <p>
              Verifiable Settlement Layer &copy; {new Date().getFullYear()} TyrPay.
            </p>
            <p className="mt-2 md:mt-0">
              Built natively on <span className="text-slate-300 font-medium hover:text-emerald-400 cursor-pointer transition-colors">0G Network</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}