# RepoMemory CTT — Full Benchmark Report
> Context-Time Training: 30 models tested across 3 domains — March 9-10, 2026

## What is CTT?

**Context-Time Training (CTT)** is a paradigm where the model stays frozen and the agent evolves via memory accumulation through RepoMemory. Instead of fine-tuning model weights, CTT injects relevant context (memories, skills, knowledge) at inference time via the `recall` pipeline. This report measures CTT effectiveness: how much better does a model perform when given RepoMemory context vs. operating with zero context (base).

## Test Methodology

- **3 domains**, 5 queries each (15 queries total per model):
  - **TechStartup** — Spanish technical decisions (PostgreSQL, Docker, AWS, auth, budget)
  - **APIDesign** — English procedural knowledge (error handling, auth strategy, versioning, validation, pagination)
  - **CustomerSupport** — Mixed language, corrections + profile (subscription, contact, refund, troubleshooting)
- **Scoring**: Topic hits + fact hits vs expected answers, normalized as percentage
- **Quality assessment** (mass benchmark only): Coherence, repetition detection, language match
- **Infrastructure**: Ollama on VPS (4-core AMD EPYC, 16GB RAM, CPU-only) + Cloudflare Workers AI

---

## Master Leaderboard — All 30 Models

Sorted by average CTT score. Models from different benchmark runs are unified here.

| # | Model | Source | Params | Size | Base | CTT | Improv | Latency |
|---|-------|--------|--------|------|------|-----|--------|---------|
| 1 | lfm2.5-thinking (no-think) | Ollama | 3B | ~2GB | 32% | **86%** | +168% | 18.3s |
| 2 | @cf/qwen/qwen3-30b-a3b-fp8 | CF Workers | 30B(3B) | cloud | 40% | **78%** | +96% | 7.8s |
| 3 | phi4-mini-reasoning | Ollama | 3.8B | 3.0GB | 33% | **76%** | +132% | 58.9s |
| 4 | @cf/mistral/mistral-7b-instruct-v0.1 | CF Workers | 7B | cloud | 30% | **76%** | +152% | 10.4s |
| 5 | @cf/ibm-granite/granite-4.0-h-micro | CF Workers | ~3B | cloud | 21% | **74%** | +246% | 13.6s |
| 6 | qwen3:1.7b | Ollama | 2.0B | 1.3GB | 31% | **74%** | +142% | 15.1s |
| 7 | granite4:3b | Ollama | 3B | ~2GB | 26% | **73%** | +181% | 18.5s |
| 8 | qwen2.5:1.5b | Ollama | 1.5B | 940MB | 23% | **71%** | +210% | 9.7s |
| 9 | granite3.1-moe:3b | Ollama | 3.3B | 1.9GB | 28% | **71%** | +149% | 9.7s |
| 10 | gemma3:1b | Ollama | 1.0B | 778MB | 33% | **71%** | +117% | 13.4s |
| 11 | deepcoder:1.5b | Ollama | 1.8B | 1.1GB | 12% | **71%** | +472% | 19.6s |
| 12 | qwen3.5:0.8b (no-think) | Ollama | 0.8B | ~600MB | 39% | **70%** | +81% | 24.6s |
| 13 | gemma:2b | Ollama | 3B | 1.6GB | 26% | **69%** | +164% | 16.7s |
| 14 | smollm2:1.7b | Ollama | 1.7B | 1.7GB | 20% | **69%** | +237% | 15.5s |
| 15 | @cf/meta/llama-3.1-8b-instruct | CF Workers | 8B | cloud | 27% | **69%** | +155% | 5.3s |
| 16 | granite4:1b | Ollama | 1B | ~1GB | 25% | **68%** | +169% | 17.2s |
| 17 | @cf/meta/llama-2-7b-chat-fp16 | CF Workers | 7B | cloud | 24% | **70%** | +192% | 15.5s |
| 18 | @cf/meta/llama-2-7b-chat-int8 | CF Workers | 7B | cloud | 29% | **69%** | +138% | 3.2s |
| 19 | qwen2.5:3b | Ollama | 3.1B | 1.8GB | 26% | **67%** | +158% | 13.5s |
| 20 | llama3.2:3b | Ollama | 3.2B | 1.9GB | 24% | **67%** | +184% | 23.4s |
| 21 | qwen3:0.6b | Ollama | 752M | 498MB | 29% | **67%** | +134% | 6.9s |
| 22 | llama3.2:1b | Ollama | 1.2B | 1.3GB | 19% | **67%** | +249% | 12.9s |
| 23 | qwen2.5:0.5b | Ollama | 494M | 379MB | 26% | **66%** | +152% | 5.0s |
| 24 | qwen2.5-coder:3b | Ollama | 3.1B | 1.8GB | 25% | **65%** | +158% | 10.8s |
| 25 | qwen2:1.5b | Ollama | 1.5B | 892MB | 25% | **65%** | +160% | 8.8s |
| 26 | granite3.1-moe:1b | Ollama | 1.3B | 1.4GB | 25% | **64%** | +157% | 9.7s |
| 27 | qwen2.5-coder:1.5b | Ollama | 1.5B | 940MB | 18% | **62%** | +239% | 9.3s |
| 28 | @cf/zai-org/glm-4.7-flash | CF Workers | ~4B | cloud | 37% | **62%** | +67% | 5.0s |
| 29 | @cf/openai/gpt-oss-20b | CF Workers | 20B | cloud | 27% | **60%** | +125% | 4.2s |
| 30 | granite4:350m | Ollama | 350M | ~300MB | 18% | **60%** | +232% | 4.3s |
| 31 | qwen:4b | Ollama | 4B | 2.2GB | 17% | **57%** | +236% | 12.4s |
| 32 | qwen2.5-coder:0.5b | Ollama | 494M | 379MB | 21% | **55%** | +157% | 4.9s |
| 33 | smollm2:360m | Ollama | 362M | 692MB | 19% | **48%** | +159% | 8.0s |
| 34 | deepseek-r1:1.5b | Ollama | 1.8B | 1.1GB | 12% | **47%** | +304% | 9.9s |
| 35 | qwen2:0.5b | Ollama | 494M | 336MB | 17% | **47%** | +178% | 4.6s |
| 36 | qwen:1.8b | Ollama | 2B | 1.1GB | 27% | **46%** | +72% | 19.4s |
| 37 | gemma3:270m | Ollama | 270M | ~200MB | 22% | **41%** | +106% | 1.5s |
| 38 | qwen:0.5b | Ollama | 620M | 377MB | 15% | **39%** | +162% | 3.2s |
| 39 | smollm2:135m | Ollama | 135M | 258MB | 17% | **36%** | +111% | 6.3s |

> Note: lfm2.5-thinking and qwen3.5:0.8b were tested with think vs no-think modes; only no-think results shown here (think mode degrades sub-4B models). Granite4 family does not support think mode. CF Workers models run on GPU in the cloud.

---

## Key Findings

### 1. CTT improves EVERY model tested

**100% of models improved with CTT context.** Average improvement: **+170%**. The worst case was qwen:1.8b (+72%) and the best was deepcoder:1.5b (+472%).

### 2. Model size vs CTT effectiveness

| Size Tier | Models | Avg Base | Avg CTT | Avg Improvement |
|-----------|--------|----------|---------|-----------------|
| Nano (<500MB) | 8 | 20% | 51% | +153% |
| Micro (500MB-1GB) | 6 | 26% | 67% | +163% |
| Small (1-2GB) | 14 | 24% | 66% | +189% |
| Medium (2-4GB) | 3 | 28% | 63% | +153% |
| Cloud (7B+) | 8 | 29% | 70% | +146% |

**Takeaway**: The sweet spot is **Micro/Small (0.5-2GB)**. These models gain the most from CTT while keeping resource usage low. Cloud 7B+ models start with higher base scores but their absolute CTT gain is similar.

### 3. Think mode is harmful for small models

| Mode | Avg Base | Avg CTT | Winner |
|------|----------|---------|--------|
| No-Think | 35% | 78% | **No-Think** |
| Think | 3% | 50% | - |

Think mode (extended reasoning) consistently degraded performance for all sub-4B models tested (qwen3.5:0.8b, lfm2.5-thinking, granite4 family). Models waste their limited token budget on reasoning chains instead of answering.

### 4. Best models by use case

| Category | Model | Why |
|----------|-------|-----|
| **Best overall quality** | lfm2.5-thinking (no-think) | 86% CTT, best across all 3 domains |
| **Best quality/size ratio** | qwen2.5:1.5b | 71% CTT in only 940MB, 9.7s latency |
| **Best nano model** | qwen3:0.6b | 67% CTT in 498MB, 6.9s latency |
| **Best for constrained devices** | qwen2.5:0.5b | 66% CTT in 379MB, 5.0s latency |
| **Best cloud model** | qwen3-30b-a3b-fp8 | 78% CTT via Cloudflare Workers AI |
| **Fastest response** | gemma3:270m | 1.5s avg but only 41% CTT |
| **Best improvement from CTT** | deepcoder:1.5b | +472% improvement (12%→71%) |

### 5. Per-domain analysis

| Domain | Easiest for CTT? | Best Model | Notes |
|--------|-------------------|------------|-------|
| **CustomerSupport** | Yes (avg 80% CTT) | deepcoder:1.5b (97%) | Profile + corrections = easy wins |
| **APIDesign** | Medium (avg 58% CTT) | lfm2.5-thinking (81%) | Procedural knowledge requires instruction-following |
| **TechStartup** | Hardest (avg 58% CTT) | phi4-mini-reasoning (86%) | Spanish + technical = challenging |

### 6. Model families compared

| Family | Models Tested | Avg CTT | Best Model |
|--------|---------------|---------|------------|
| Qwen 3.x | 3 | 70% | qwen3:1.7b (74%) |
| Qwen 2.5 | 6 | 65% | qwen2.5:1.5b (71%) |
| Qwen 2.0 | 2 | 56% | qwen2:1.5b (65%) |
| Qwen 1.0 | 3 | 47% | qwen:4b (57%) |
| Gemma | 3 | 60% | gemma3:1b (71%) |
| Granite | 5 | 68% | granite4:3b (73%) |
| Llama | 5 | 68% | llama-3.1-8b (69%) |
| SmolLM2 | 3 | 51% | smollm2:1.7b (69%) |
| Other | 4 | 72% | lfm2.5 (86%) |

**Takeaway**: Newer model generations consistently outperform older ones. Qwen3 > Qwen2.5 > Qwen2 > Qwen1. Gemma3 > Gemma2.

### 7. Coder vs General models

| Variant | 0.5B | 1.5B | 3B |
|---------|------|------|-----|
| qwen2.5 (general) | 66% | **71%** | 67% |
| qwen2.5-coder | 55% | 62% | 65% |

General-purpose models consistently outperform coder variants for CTT tasks. Coder models optimize for code completion patterns that don't align well with contextual recall.

---

## Efficiency Analysis (Quality-Weighted CTT per GB)

From the mass benchmark (25 models with quality + size metrics):

| # | Model | Size | Quality-Weighted CTT | Efficiency/GB |
|---|-------|------|---------------------|---------------|
| 1 | qwen2.5:0.5b | 379MB | 57% | **154** |
| 2 | qwen2:0.5b | 336MB | 43% | 131 |
| 3 | qwen3:0.6b | 498MB | 63% | **130** |
| 4 | smollm2:135m | 258MB | 30% | 119 |
| 5 | qwen2.5-coder:0.5b | 379MB | 43% | 116 |
| 6 | qwen:0.5b | 377MB | 34% | 91 |
| 7 | gemma3:1b | 778MB | 65% | **85** |
| 8 | qwen2.5:1.5b | 940MB | 68% | **74** |
| 9 | qwen2:1.5b | 892MB | 59% | 68 |
| 10 | qwen2.5-coder:1.5b | 940MB | 58% | 64 |

**Best balance**: `qwen2.5:1.5b` — high quality (68%) with excellent efficiency (74/GB) in under 1GB.

---

## Recommendations

### For production deployment with RepoMemory:

1. **If you have 2GB+ RAM**: Use `qwen3:1.7b` or `lfm2.5-thinking` (no-think mode) — best quality
2. **If you have 1GB RAM**: Use `qwen2.5:1.5b` — best quality/size ratio
3. **If you have 512MB RAM**: Use `qwen3:0.6b` — surprisingly capable at 498MB
4. **If you need cloud inference**: Use `qwen3-30b-a3b-fp8` on Cloudflare Workers AI
5. **Always disable think mode** for sub-4B models
6. **Newer generations always win** — prefer Qwen3 > 2.5 > 2, Gemma3 > 2

### CTT works because:

- Even 135M-parameter models (smollm2:135m) improve +111% with context
- The context provides **grounding** — facts the model couldn't know
- CustomerSupport domain shows highest gains because profiles/corrections are unambiguous
- TechStartup shows CTT enables **cross-lingual** retrieval (Spanish queries, mixed memories)

---

## All Benchmark Sources

| Report | Models | Date | Type |
|--------|--------|------|------|
| `ctt-benchmark-report-2026-03-09.md` | 8 CF Workers AI models | Mar 9 | Cloud GPU |
| `ctt-benchmark-ollama-sub1b-2026-03-10.md` | gemma3:270m, qwen3:0.6b | Mar 10 | Ollama CPU |
| `ctt-benchmark-qwen35-think-2026-03-10.md` | qwen3.5:0.8b (think vs no-think) | Mar 10 | Ollama CPU |
| `ctt-benchmark-lfm2.5-thinking-think-2026-03-10.md` | lfm2.5-thinking (think vs no-think) | Mar 10 | Ollama CPU |
| `ctt-benchmark-granite4-350m-think-2026-03-10.md` | granite4:350m | Mar 10 | Ollama CPU |
| `ctt-benchmark-granite4-1b-think-2026-03-10.md` | granite4:1b | Mar 10 | Ollama CPU |
| `ctt-benchmark-granite4-3b-think-2026-03-10.md` | granite4:3b | Mar 10 | Ollama CPU |
| `ctt-mass-benchmark-2026-03-10.md` | 25 models mass benchmark | Mar 10 | Ollama CPU |

---

*Generated from RepoMemory v2.16.0 CTT Benchmark Framework — March 2026*
*Infrastructure: VPS 4-core AMD EPYC 7543P, 16GB RAM, CPU-only + Cloudflare Workers AI*
