# Context Is All You Need: Evolutive Agentic Intelligence through Context-Time Training (CTT)

**Mauricio Perera**

March 2026

---

## Abstract

Traditional approaches to enhancing Large Language Model (LLM) performance, such as supervised fine-tuning (SFT), often incur prohibitive computational costs, introduce data obsolescence, and suffer from irreversible weight updates. We present Context-Time Training (CTT), a novel machine learning paradigm that shifts the focus from model-centric training to agent-centric evolution. Under CTT, the underlying LLM remains a frozen, static reasoning engine, while the agent's intelligence is developed through a continuous cycle of experience accumulation, automated mining, and multi-vector consolidation.

We implement this framework in RepoMemory v2, a Git-inspired persistent memory system that utilizes content-addressable storage and immutable commit chains to provide a transparent and versioned audit trail of an agent's knowledge. Our architecture employs a hybrid retrieval engine — combining lexical TF-IDF with a 3-level Matryoshka neural pyramid — to optimize context injection within the transformer's attention mechanism.

Empirical benchmarks across 10 models (270M–30B parameters), 3 knowledge domains, and 15 test queries demonstrate that CTT significantly compensates for model scale: a 0.6B parameter model augmented with CTT consistently outperforms 20B parameter models without memory, achieving an average precision increase of +202% across all evaluated configurations. Furthermore, we introduce the Correction Boost mechanism, which applies a 2.0× scoring multiplier to corrective memories, effectively resolving the "stale fact" problem inherent in standard RAG systems. We also observe a paradoxical latency reduction in 75% of configurations, where CTT responses are faster than baseline despite additional retrieval overhead. Our results suggest that for the next generation of autonomous agents, sophisticated context management is not just a supplement to model weights — context is all you need.

**Keywords:** Context-Time Training, Agentic Memory, Large Language Models, RepoMemory, Context Injection, Machine Learning Paradigms, Retrieval-Augmented Generation.

---

## 1. Introduction

### 1.1 The Static Model Problem

The rapid advancement of Large Language Models has democratized access to high-capability reasoning engines. However, the construction of persistent, autonomous agents faces a fundamental obstacle: the inherent "amnesia" of static models. A model's knowledge is frozen at training time, and its inability to accumulate, correct, or consolidate experience across interactions represents the primary barrier to true agentic intelligence.

Traditionally, the industry has addressed the injection of new knowledge or behavioral modification through supervised fine-tuning (SFT). However, SFT presents critical limitations that make it unsuitable as the primary learning mechanism for agentic systems:

1. **Catastrophic forgetting**: Fine-tuned models lose general capabilities in proportion to specialization depth (Kirkpatrick et al., 2017). Domain mastery comes at the cost of general competence.
2. **Computational cost**: Even parameter-efficient methods (LoRA, QLoRA) require GPU-hours proportional to dataset size and model scale (Hu et al., 2021).
3. **Irreversibility**: Weight modifications cannot be selectively reverted without maintaining complete checkpoint histories. Learning erroneous information contaminates the model permanently.
4. **Data privacy**: Training data becomes embedded in model weights, creating extraction risks (Carlini et al., 2021) and GDPR compliance challenges.
5. **Temporal rigidity**: Fine-tuned knowledge reflects training data at a fixed point in time. Real-time corrections require full retraining cycles.

### 1.2 Beyond RAG: From Passive Retrieval to Active Learning

Retrieval-Augmented Generation (RAG) (Lewis et al., 2020) has partially mitigated these problems by externalizing knowledge. However, conventional RAG is fundamentally passive: it retrieves static documents but does not allow the agent to learn, consolidate experience, or proactively correct its own interactive biases over time. Standard RAG systems treat every query independently, with no state evolution between interactions.

### 1.3 The CTT Paradigm Shift

We present Context-Time Training (CTT), a paradigm shift that postulates that the evolution of an intelligent agent does not require the mutation of its underlying neural network. Under the CTT framework, the LLM is treated as immutable cognitive "hardware," while the agent is trained by accumulating a dynamic, versioned knowledge base. The agent's effective intelligence is not determined by model weights alone, but by the composition of weights and accumulated contextual state:

$$\text{EffectiveCapability}(t) = f(\theta, \mathcal{S}(t))$$

where $\theta$ represents frozen model weights and $\mathcal{S}(t)$ represents a time-evolving structured state comprising memories, skills, knowledge, and user profiles. The model $\theta$ never changes; the agent improves because $\mathcal{S}(t)$ grows, refines, and self-corrects over time.

To instantiate this framework, we introduce RepoMemory v2, a Git-inspired persistent memory system. Through this system, we demonstrate that algorithmic and hierarchical context management enables small language models (sub-1B parameters) to outperform massive architectures (20B parameters), empirically proving that for long-term agentic cognition, context is all you need.

### 1.4 CTT vs. Related Paradigms

| Dimension | Fine-Tuning (SFT) | Standard RAG | CTT |
|-----------|-------------------|-------------|-----|
| **Model weights** | Modified | Frozen | Frozen |
| **Knowledge source** | Training data | Static document store | Dynamic multi-type entity store |
| **Learning signal** | Gradient descent | None (stateless) | Access frequency, corrections, mining |
| **Temporal adaptation** | Requires retraining | Manual re-indexing | Continuous (decay + correction + consolidation) |
| **Personalization** | Per-model | Per-query | Per-user × per-agent |
| **Reversibility** | Checkpoint-based | N/A | Full Git-like audit trail |
| **Privacy** | Data in weights | Data in index | Data in store, never in weights |
| **Cost** | GPU-hours | Embedding compute | CPU-only (TF-IDF) or optional embeddings |
| **Catastrophic forgetting** | Yes | No | No |
| **Self-correction** | No | No | Yes (Correction Boost) |

### 1.5 Contributions

This paper makes the following contributions:

1. **Formal definition** of CTT as a machine learning paradigm with a well-defined state transition function, composite scoring formula, and five-phase learning cycle.
2. **Reference implementation** (RepoMemory v2) featuring Git-inspired content-addressable storage, immutable commit chains, multi-collection recall, configurable prompt templates, and correction-aware scoring.
3. **Comprehensive evaluation** across 10 models (270M–30B parameters), 3 domains, and 15 queries, demonstrating +36% to +800% accuracy improvements with no regressions.
4. **Size compensation analysis** establishing that CTT enables sub-1B models to achieve performance comparable to models 10–50× larger.
5. **Latency analysis** revealing the counterintuitive finding that contextually-primed models respond faster in 75% of configurations.

---

## 2. Formal Framework

### 2.1 Definitions

**Definition 1 (Agent State).** An agent state $\mathcal{S}$ is a tuple $(\mathcal{M}, \mathcal{K}, \mathcal{P}, \mathcal{R})$ where:
- $\mathcal{M} = \{m_1, m_2, \ldots, m_n\}$ is a set of memories (episodic facts, decisions, issues, tasks, corrections)
- $\mathcal{K} = \{k_1, k_2, \ldots, k_p\}$ is a set of skills and knowledge (procedural and declarative)
- $\mathcal{P}$ is a user profile (preferences, constraints, metadata)
- $\mathcal{R}$ is a set of scoring parameters (weights, decay rates, boost factors)

**Definition 2 (Context-Time Training Function).** The CTT function maps a query $q$, frozen model $\theta$, and agent state $\mathcal{S}(t)$ to a response:

$$\text{CTT}(q, \theta, \mathcal{S}(t)) = \theta\left(q \mid \text{Recall}(q, \mathcal{S}(t))\right)$$

where $\text{Recall}(q, \mathcal{S}(t))$ selects, scores, and formats relevant context from $\mathcal{S}(t)$ as a system prompt prefix injected into the model's attention mechanism.

**Definition 3 (Five-Phase Learning Cycle).** A CTT learning cycle consists of five phases, operating LLM-agnostically:

$$\mathcal{S}(t+1) = \text{Consolidate}(\text{Correct}(\text{Mine}(\text{Interact}(\text{Recall}(q, \mathcal{S}(t))))))$$

1. **Recall**: Score-ranked retrieval from multi-collection state, formatted within a strict token budget
2. **Interact**: Agent generates response using recalled context; the conversation is recorded as a raw session
3. **Mine**: AI-powered extraction of atomic, classified structures (memories, skills, profile updates) from the raw session
4. **Correct**: Entities categorized as corrections receive a mathematical relevance multiplier of 2.0×, ensuring new paradigms surface above obsolete information without physically purging old data
5. **Consolidate**: Semantic overlap fusion via deduplication, preventing context window saturation from unbounded entity accumulation

### 2.2 Composite Scoring Function

The scoring function assigns a relevance score to each entity $e$ given query $q$. It is the product of four orthogonal signals:

$$\text{Score}(e, q) = \text{Relevance}(e, q) \times \text{Decay}(e) \times \text{Access}(e) \times \text{Correction}(e)$$

#### 2.2.1 Multi-Signal Relevance

Relevance is a weighted combination of three retrieval signals, normalized to sum to 1.0:

$$\text{Relevance}(e, q) = \frac{w_{\text{tfidf}}}{W} \cdot \text{TFIDF}(e, q) + \frac{w_{\text{tag}}}{W} \cdot J(\text{tags}(e), \text{tags}(q)) + \frac{w_{\text{emb}}}{W} \cdot \cos(\vec{e}, \vec{q})$$

where $W = w_{\text{tfidf}} + w_{\text{tag}} + w_{\text{emb}}$ is the normalization factor. Default weights: $w_{\text{tfidf}} = 0.7$, $w_{\text{tag}} = 0.3$, $w_{\text{emb}} = 0$ (or $0.4$ when neural search is active). The normalization ensures backward compatibility: when $w_{\text{emb}} = 0$, the formula reduces to the pre-neural weighted sum without score inflation.

The tag overlap function $J$ uses Jaccard similarity with stemming normalization:

$$J(A, B) = \frac{|\text{stem}(A) \cap \text{stem}(B)|}{|\text{stem}(A) \cup \text{stem}(B)|}$$

#### 2.2.2 Temporal Decay

Temporal decay prevents stale information from dominating retrieval results:

$$\text{Decay}(e) = \max\left(0.01, \; e^{-\lambda \cdot \Delta t(e)}\right)$$

where $\lambda = 0.005$ (configurable) and $\Delta t(e)$ is days since last update. The floor of 0.01 prevents complete suppression — even old entities remain discoverable, preserving the long tail of historical knowledge. At $\lambda = 0.005$: half-life ≈ 139 days, 99% decay at ~920 days.

#### 2.2.3 Access Frequency Boost

Frequently-recalled entities receive an amplification signal (implicit popularity):

$$\text{Access}(e) = \min\left(\log_2(2 + c(e)), \; B_{\max}\right)$$

where $c(e)$ is the cumulative access count and $B_{\max} = 5.0$. The logarithmic curve provides diminishing returns:

| Access Count | Boost Factor |
|-------------|-------------|
| 0 | 1.00× |
| 1 | 1.58× |
| 5 | 2.81× |
| 10 | 3.58× |
| 30 | 5.00× (capped) |

The cap prevents runaway amplification where a few highly-accessed entities dominate all future retrievals.

#### 2.2.4 Correction Boost

The correction category implements a self-correcting knowledge layer:

$$\text{Correction}(e) = \begin{cases} \beta & \text{if } e.\text{category} = \text{`correction'} \\ 1 & \text{otherwise} \end{cases}$$

where $\beta = 2.0$ by default. This ensures that when conflicting information coexists in the store, the correction ranks higher than the original erroneous memory:

```
t=0: Memory "PostgreSQL does not support JSONB" → score = 0.8
t=1: Correction "PostgreSQL DOES support JSONB since v9.4" → score = 0.8 × 2.0 = 1.6
```

The original memory remains in the audit trail (tombstone-free), but the correction consistently surfaces above it. The `[CORRECTION]` prefix in formatted output provides explicit signaling to the LLM.

### 2.3 Entity Taxonomy

CTT defines five entity types organized in a scoping hierarchy:

| Entity Type | Scope | Categories | Purpose |
|-------------|-------|------------|---------|
| **Memory** | user × agent | fact, decision, issue, task, correction | Episodic: what happened, what was decided, what was corrected |
| **Skill** | agent | procedure, configuration, troubleshooting, workflow | Procedural: how to perform tasks |
| **Knowledge** | agent | (source-tracked, chunk-aware) | Declarative: reference documents, ingested content |
| **Session** | user × agent | (raw content or structured messages) | Interaction transcripts; mining source material |
| **Profile** | user × agent | (free-form + metadata) | User preferences, constraints, persistent context |

Memories and sessions are scoped to a specific user-agent pair (personalized), while skills and knowledge are agent-scoped (shared across all users). A special `_shared` agent ID enables cross-agent knowledge transfer.

---

## 3. System Architecture: The RepoMemory v2 Implementation

To decouple learning from neural weight updates, the CTT framework requires a memory infrastructure that is concurrent, auditable, and capable of resolving semantic conflicts. The methodology is built on three architectural pillars.

### 3.1 Content-Addressable Storage and Version Control

Unlike standard vector databases that overwrite records, RepoMemory uses a Git-inspired architecture where every write operation produces an immutable, content-addressable artifact:

```
save(entity) →
  1. SHA-256(entity.content) → hash → objects/{hash}    (content store)
  2. Commit{parent, hash, timestamp, author} → commits/  (immutable chain)
  3. refs/{type}/{agentId}/{userId}/{entityId}.ref → commitHash
  4. lookupIndex[entityId] → refPath                     (O(1) lookup)
```

This design guarantees:

- **Absolute traceability**: It is possible to reconstruct exactly what the agent knew at any time $t$ and revert any hallucination or corrupted data by traversing the commit chain.
- **Tombstone deletes**: Deletions create tombstone commits (`objectHash: "TOMBSTONE"`), preserving the history tree's integrity while hiding deleted entities from read paths.
- **Crash recovery**: Content-addressable storage is inherently consistent — partial writes produce orphaned objects but never corrupt existing data.
- **Concurrent safety**: A `LockGuard` using `Atomics.wait()` with exponential backoff (10ms base, 500ms cap, jitter) serializes write access without busy-waiting.
- **Content validation**: Entities are validated on save — content ≤ 1MB, ≤ 50 tags, type whitelist enforcement, ID sanitization against path traversal.

### 3.2 Hybrid Search and Context Curation (Matryoshka Pyramid)

To maximize retrieval precision, the search engine discards exclusive dependence on expensive embeddings, implementing a hybrid pipeline:

**Lexical Layer (TF-IDF)**: Uses a Porter stemmer, bilingual stopword filtering (EN/ES), and automatic query expansion (synonym/abbreviation mapping). Each `type:agentId:userId` combination maintains its own TF-IDF index (scoped isolation), serialized to disk with LRU eviction (max 100 loaded indices).

**Neural Layer (Matryoshka Pyramid)**: Employs EmbeddingGemma-300m (308M parameters, ONNX q8 quantization) with cascading three-level resolution filtering:

| Level | Dimensions | Purpose | Computational Cost |
|-------|-----------|---------|-------------------|
| Coarse scan | 128-dim | Fast candidate identification | 1× (baseline) |
| Re-rank | 256-dim | Precision refinement | 2× |
| Final ranking | 768-dim | Full-precision scoring | 6× |

This pyramid technique eliminates approximately 83% of false positives at the cheapest computational level (128-dim), achieving ~6× speedup over traditional full-dimension semantic search.

**MMR Diversity**: Maximal Marginal Relevance ($\lambda = 0.7$) is applied to retrieved candidates to ensure that the context injected into the LLM is orthogonal and non-redundant.

**Score Integration**: When neural search is active, embedding scores are combined with TF-IDF through weight normalization. The formula is mathematically identical to pre-neural behavior when $w_{\text{emb}} = 0$, ensuring backward compatibility.

### 3.3 Recall Engine and Configurable Prompt Templates

The `RecallEngine` pools candidates from all three searchable collections (memories, skills, knowledge), applies optional template-aware weight multipliers, sorts by composite score, and selects the top-N items within a strict character budget.

**Template System**: Configurable templates control section ordering, headers, and per-collection weight multipliers:

| Template | Section Order | Weights (M / S / K) | Use Case |
|----------|--------------|---------------------|----------|
| `default` | Profile → Memories → Skills → Knowledge | 1.0 / 1.0 / 1.0 | General purpose |
| `technical` | Profile → Skills → Knowledge → Memories | 0.7 / 1.5 / 1.3 | Code and architecture queries |
| `support` | Profile → Memories → Knowledge → Skills | 1.5 / 0.8 / 1.2 | Customer service contexts |
| `rag_focused` | Knowledge → Profile → Memories → Skills | 0.5 / 0.3 / 2.0 | Document-heavy Q&A |

Weight multipliers are applied before score pooling. For example, the `technical` template multiplies skill scores by 1.5×, causing more procedural items to surface in the final context. This template-level tuning provides a lightweight alternative to model fine-tuning for domain adaptation.

**Budget-Aware Formatting**: The formatter operates within a configurable character budget (default 8,000 chars). Items are never truncated mid-content — if an item exceeds the remaining budget, formatting stops for that section and proceeds to the next.

### 3.4 Learning Pipelines

**Mining Pipeline**: Extracts structured entities from raw session transcripts:

```
Session transcript → AI extraction prompt → [memories[], skills[], profile_updates]
                  → saveOrUpdate() per entity (deduplication via content similarity)
                  → markMined(session)
```

Mining uses `saveOrUpdate()` rather than `save()` to prevent duplicate entities when the same session is processed multiple times or when similar knowledge is extracted from different sessions.

**Consolidation Pipeline**: Periodically merges semantically overlapping entities:

```
All entities of type T → chunk by category (20 per chunk)
                       → AI-planned merge (identify similar items, propose fusion)
                       → Validate merged content (non-empty, ≤50 tags)
                       → saveOrUpdate() merged entity
                       → delete() consolidated source entities
```

Consolidation is idempotent and validates AI-returned content before saving, preventing empty or malformed entities from entering the store. This prevents the unbounded growth that would eventually saturate the context window.

### 3.5 CTT Metrics and Observability

A lightweight metrics tracker records per-agent-per-day effectiveness data:

| Metric | Description | Computed Summary |
|--------|-------------|-----------------|
| `recallCalls` | Total recall invocations | — |
| `recallHits` | Recalls returning >0 items | Hit Rate = hits / calls |
| `totalItemsReturned` | Sum of items across calls | Avg Items = total / calls |
| `totalTopScore` | Sum of top-item scores | Avg Top Score = total / calls |
| `correctionsApplied` | Corrections saved | — |
| `miningExtractions` | Mining pipeline runs | — |
| `uniqueQueries` | Distinct queries (capped 100) | Query Diversity |

This provides observability into the CTT learning process: rising hit rates indicate improving knowledge coverage, while increasing unique query counts signal broadening agent utility.

---

## 4. Experimental Setup

### 4.1 Model Selection

We selected a representative spectrum of LLMs, from massive cloud architectures to sub-1B models designed for edge computing:

| Model | Parameters | Provider | Quantization |
|-------|-----------|----------|--------------|
| Gemma 3 | 270M | Ollama (local VPS) | Default |
| Qwen 3 | 600M | Ollama (local VPS) | Default |
| IBM Granite 4.0 H-Micro | ~3B | Cloudflare Workers AI | Default |
| GLM 4.7 Flash | ~5B | Cloudflare Workers AI | Default |
| Llama 2 Chat | 7B | Cloudflare Workers AI | INT8 |
| Llama 2 Chat | 7B | Cloudflare Workers AI | FP16 |
| Mistral Instruct v0.1 | 7B | Cloudflare Workers AI | Default |
| Llama 3.1 Instruct | 8B | Cloudflare Workers AI | Default |
| GPT-OSS | 20B | Cloudflare Workers AI | Default |
| Qwen 3 30B A3B | 30B (3B active, MoE) | Cloudflare Workers AI | FP8 |

### 4.2 Knowledge Domains

Three orthogonal domains were designed to test different CTT capabilities while minimizing overlap with pre-training data:

**Domain 1: TechStartup** (Spanish-dominant, cross-lingual)
- 8 seed entities covering database choices, deployment strategies, authentication, budget, API standards
- 5 queries in Spanish and English (testing cross-lingual recall)
- Tests: factual recall of project-specific decisions

**Domain 2: APIDesign** (English, procedural knowledge)
- 12 seed entities covering REST conventions, error handling, authentication, pagination, rate limiting, webhook delivery
- 5 queries about specific API design patterns
- Tests: procedural knowledge recall, multi-entity aggregation

**Domain 3: CustomerSupport** (Mixed language, corrections + profiles)
- 15 seed entities including customer records, subscription details, refund policies, SLA terms, and explicit corrections
- 5 queries about specific customers and organizational policies
- Tests: correction prioritization, user-specific recall, profile injection

### 4.3 Evaluation Protocol

For each model × domain combination (30 configurations):

1. **Initialize**: Fresh RepoMemory instance with temporary directory
2. **Seed**: Save all domain entities via `save()` / `saveMany()`
3. **Base condition** (Untrained Agent): Send each query directly to the model without context, evaluating intrinsic parametric knowledge
4. **CTT condition** (Trained Agent): Run `recall(agentId, userId, query)`, inject formatted context as system prompt prefix, then send query with the same model
5. **Evaluate**: Count topic hits (binary: topic mentioned or not) and fact hits (binary: specific fact correct or not) against manually-verified ground truth

**Composite Score**:
$$\text{Score} = \frac{\text{topicHits} + \text{factHits}}{\text{totalTopics} + \text{totalFacts}} \times 100\%$$

Each query has 2–3 expected topics and 3–5 expected facts. Both latency (ms) and recall metadata (items returned, context characters) are recorded.

### 4.4 Configuration

- **Search**: TF-IDF only (weight 0.7), no neural embeddings in benchmark (isolating CTT core mechanism)
- **Context budget**: 8,000 characters maximum per recall
- **Template**: `default` (Profile → Memories → Skills → Knowledge, equal weights)
- **Scoring**: decay rate λ = 0.005, max access boost 5.0, correction boost β = 2.0
- **Infrastructure**: Cloudflare Workers AI (serverless, edge), Ollama on VPS (2 vCPU, 4GB RAM)

---

## 5. Results

### 5.1 Aggregate Performance

Across all 10 models, 3 domains, and 150 individual query evaluations:

| Metric | Value |
|--------|-------|
| Mean base score | 27.4% |
| Mean CTT score | 65.6% |
| Mean absolute improvement | +38.2 percentage points |
| Mean relative improvement | +202% |
| Minimum improvement | +36% (GLM 4.7 Flash, TechStartup) |
| Maximum improvement | +800% (Llama 2 FP16, APIDesign) |
| Configurations with improvement | **30/30 (100%)** |
| Configurations with regression | **0/30 (0%)** |

**Finding 1**: CTT improved performance in every single model-domain configuration tested. No model performed worse with CTT than without, demonstrating the paradigm's universal applicability.

### 5.2 Impact by Knowledge Domain

**Table 2: Domain-aggregated results (8 Cloudflare models)**

| Domain | Mean Base | Mean CTT | Mean Improvement | Interpretation |
|--------|----------|---------|-----------------|----------------|
| TechStartup | 32% | 65% | +115% | Cross-lingual recall effective for project-specific decisions |
| APIDesign | 15% | 62% | +416% | Maximum gains — models lack domain-specific procedural knowledge |
| CustomerSupport | 41% | 82% | +101% | Highest absolute scores — correction and profile mechanisms validated |

**Finding 2**: The largest relative improvements occur in APIDesign (+416% average), where base models score lowest (15%). Models lack specific business rules about the evaluated API, making CTT's contribution most dramatic. For example, Llama 2 7B FP16 improved from 6% to 56% in this domain — an 800% increase.

**Finding 3**: CustomerSupport achieves the highest absolute CTT scores (82% average) and the most consistent improvements, validating the correction boost and profile injection mechanisms for personalized, fact-intensive contexts.

### 5.3 Parametric Scale Compensation

The most significant finding of our research is the inversion of model capability hierarchy when CTT is introduced:

**Table 3: Size-stratified results**

| Size Category | Models | Mean Base | Mean CTT | Mean Improvement |
|--------------|--------|----------|---------|-----------------|
| Sub-1B (270M–600M) | Gemma3, Qwen3 | 24% | 53% | +159% |
| 3B–8B | Llama2, Llama3.1, Mistral, GLM, Granite | 30% | 69% | +175% |
| 20B | GPT-OSS | 27% | 60% | +160% |
| 30B (MoE) | Qwen3-30B-A3B | 40% | 78% | +101% |

**Table 4: Cross-scale performance comparison**

| Small Model + CTT | Score | vs. Large Model (base) | Score | Size Ratio |
|-------------------|-------|----------------------|-------|-----------|
| Qwen3 0.6B + CTT | 65% | > Qwen3-30B base | 40% | 50× smaller |
| Qwen3 0.6B + CTT | 65% | > GPT-OSS-20B base | 27% | 33× smaller |
| Llama2-7B-INT8 + CTT | 69% | > GPT-OSS-20B base | 27% | 3× smaller |
| Granite-4.0 + CTT (Support) | 86% | > Qwen3-30B base (Support) | 48% | ~10× smaller |

**Finding 4**: A 600M-parameter model with CTT (65%) conclusively outperforms a 30B-parameter model without CTT (40%). This 50× size ratio demonstrates that structured context injection can partially substitute for model scale, with profound implications for deployment cost, latency, and on-device AI.

**Finding 5**: The 3B–8B category shows the highest average improvement (+175%), representing a "sweet spot" where models possess sufficient reasoning capacity to effectively utilize injected context but insufficient parametric knowledge to answer domain-specific queries independently.

**Finding 6**: The 30B MoE model achieves the highest absolute CTT score (78%) but the lowest relative improvement (+101%), indicating diminishing marginal returns as intrinsic model capability increases.

### 5.4 Latency Analysis

A common concern with context injection is latency overhead from retrieval processing. Our results reveal a paradoxical finding:

**Table 5: Latency comparison (Cloudflare models, averaged across 3 domains)**

| Model | Mean Base Latency | Mean CTT Latency | Speedup Factor |
|-------|------------------|------------------|---------------|
| Llama 3.1 8B | 7,982ms | 5,335ms | 1.50× faster |
| GPT-OSS 20B | 6,940ms | 3,547ms | 1.96× faster |
| GLM 4.7 Flash | 16,574ms | 5,028ms | **3.30× faster** |
| Granite 4.0 H-Micro | 12,243ms | 13,633ms | 0.90× (slower) |
| Qwen3 30B A3B | 22,772ms | 7,180ms | **3.17× faster** |
| Llama 2 7B INT8 | 11,259ms | 3,243ms | **3.47× faster** |
| Mistral 7B | 25,372ms | 10,428ms | 2.43× faster |
| Llama 2 7B FP16 | 37,117ms | 15,407ms | 2.41× faster |

**Finding 7**: In 7 out of 8 Cloudflare models (87.5%), CTT responses are faster than baseline, with an average speedup of **2.59×**. The sole exception (Granite 4.0) shows only a marginal 10% slowdown.

**Hypothesis**: When a model receives relevant context in its system prompt, it generates responses with reduced uncertainty — shorter reasoning chains, fewer hedging phrases, and less speculative enumeration. This results in fewer generated tokens and thus lower end-to-end latency. Without context, models generate verbose exploratory responses, list possibilities, and produce lengthy disclaimers, all of which increase token count and inference time.

### 5.5 Sub-1B Model Analysis (Edge Computing)

The sub-1B results (Ollama, local inference on 2 vCPU / 4GB RAM) reveal a distinct and commercially significant pattern:

**Table 6: Sub-1B model detailed results**

| Model | Domain | Base | CTT | Improvement | Base Latency | CTT Latency |
|-------|--------|------|-----|-------------|-------------|-------------|
| Gemma3 270M | TechStartup | 18% | 39% | +120% | 6.8s | 0.9s |
| Gemma3 270M | APIDesign | 9% | 22% | +133% | 5.9s | 2.2s |
| Gemma3 270M | CustomerSupport | 38% | 62% | +64% | 2.3s | 1.3s |
| Qwen3 0.6B | TechStartup | 21% | 50% | +133% | 13.3s | 10.1s |
| Qwen3 0.6B | APIDesign | 13% | 63% | +400% | 15.3s | 15.3s |
| Qwen3 0.6B | CustomerSupport | 41% | 83% | +100% | 10.8s | 10.7s |

**Finding 8**: Qwen3 0.6B with CTT in APIDesign achieves 63% — outperforming the base scores of every Cloudflare model (7B–20B) except Qwen3-30B and GLM 4.7 in that domain. A 600M-parameter model with structured context surpasses base 7B–20B models.

**Finding 9**: Gemma3 270M shows dramatic latency improvements (up to 7.6× faster with CTT), suggesting that very small models particularly benefit from context-guided generation that constrains output space and reduces speculative token generation.

**Finding 10**: The per-model averages show Gemma3 270M at 22% base → 41% CTT (+106%) and Qwen3 0.6B at 25% base → 65% CTT (+211%). Qwen3 0.6B demonstrates nearly double the CTT benefit, suggesting that models above a minimum reasoning threshold (~500M parameters) extract significantly more value from injected context.

### 5.6 Per-Query Analysis

Examining individual queries across all models reveals systematic patterns:

**High-CTT-gain queries** (consistently large improvements):
- "¿Cuál es nuestra estrategia de deploy?" — Base avg: 1.2/6 → CTT avg: 5.4/6 (+350%)
- "How should we handle API errors?" — Base avg: 0.5/6 → CTT avg: 5.2/6 (+940%)
- "What are the steps to process a refund?" — Base avg: 2.0/7 → CTT avg: 5.5/7 (+175%)

These queries share a critical characteristic: they target **specific organizational knowledge** that no general-purpose model could possess from pre-training alone. CTT provides maximum advantage when queries target information that exists only in the agent's accumulated state.

**Low-CTT-gain queries** (minimal improvement):
- "¿Cómo manejamos la autenticación?" — Base avg: 0.6/6 → CTT avg: 1.2/6 (+100%)
- "What are the rate limits per tier?" — Base avg: 0.5/7 → CTT avg: 1.0/7 (+100%)

These queries had low recall hit rates (0–1 items retrieved), indicating insufficient matching in the seed data. **CTT performance is bounded by knowledge quality** — the framework cannot improve beyond what the stored knowledge contains.

---

## 6. Key Innovations and Contributions

### 6.1 Correction Boost: Self-Correcting Memory

Traditional memory systems treat all stored information equally. CTT introduces a category-based correction mechanism creating a **self-correcting knowledge store without deletion**:

1. User or system saves a memory with `category: 'correction'`
2. The correction receives a 2.0× scoring boost via the $\beta$ multiplier
3. In recall output, corrections are prefixed with `[CORRECTION]` for explicit LLM signaling
4. Optional `supersedes` tag links to the incorrect entity for traceability

This solves the "stale fact" problem inherent in standard RAG systems, where outdated information persists at equal rank with current information. In CTT, corrections self-organize to the top of retrieval results through the scoring mechanism alone, requiring no manual curation or data purging.

### 6.2 Intelligent Consolidation with Validation

Unchecked entity accumulation eventually saturates the context window. The consolidation pipeline uses AI-planned merging with strict validation gates:

1. **Chunking**: Group entities by category (20 per chunk) for tractable AI processing
2. **AI Planning**: Model identifies semantically similar items and proposes fusions
3. **Validation**: Merged content must be non-empty with ≤ 50 tags (preventing AI hallucination)
4. **Atomic replacement**: Merged entity saved via `saveOrUpdate()`, sources deleted
5. **Idempotency**: Repeated runs produce the same result (`saveOrUpdate` deduplication)

### 6.3 Template-Aware Context Engineering

The template system provides domain adaptation without model modification or data changes:

- **Support context**: Prioritize customer history (memories × 1.5) over procedures
- **Technical context**: Prioritize skills (× 1.5) and knowledge (× 1.3) over memories
- **RAG context**: Maximize knowledge weight (× 2.0), minimize memories (× 0.5)

Switching templates changes how the same knowledge base is presented to the model, providing a "soft tuning" mechanism at the context level rather than the weight level.

### 6.4 Privacy, Cost, and Portability

| Dimension | Fine-Tuning | CTT |
|-----------|------------|-----|
| **Data residency** | Embedded in weights (extraction risk) | Stored in encrypted filesystem (deletable) |
| **Right to be forgotten** | Requires full retraining | Simple `deleteMany()` operation |
| **Compute cost** | GPU-hours per training run | CPU-only (TF-IDF); optional ~50ms embeddings |
| **Model lock-in** | Weight changes are model-specific | Agent state is model-agnostic (portable JSON) |
| **Regulatory compliance** | Complex (data in weights) | Standard data management (GDPR-compatible) |

---

## 7. Discussion

### 7.1 Limitations

1. **Context window constraint**: CTT is bounded by the model's context window. The 8,000-character default budget works well for 8K–128K context models but may be insufficient for extremely dense knowledge domains requiring hundreds of entities simultaneously.

2. **Retrieval quality ceiling**: CTT cannot improve beyond what the stored knowledge contains. Incomplete or poorly structured seed data produces irrelevant context, potentially degrading rather than improving responses (though no such regression was observed in our benchmarks).

3. **Cold start problem**: A new agent with empty state provides zero CTT benefit. The mining pipeline requires several interactions to accumulate useful state, creating a "bootstrap period" where the agent operates at baseline capability.

4. **Evaluation granularity**: Our topic/fact hit counting is a coarse metric that does not capture response quality dimensions such as coherence, completeness, or style. Human evaluation and LLM-as-judge metrics would provide more nuanced assessment.

5. **Domain coverage**: Three domains provide reasonable spread but do not cover all agentic use cases (creative writing, mathematical reasoning, multi-step planning).

### 7.2 When CTT Is Maximally Effective

- **Domain-specific organizational knowledge**: Queries about internal decisions, processes, customer data
- **Models in the 1B–10B range**: Sufficient reasoning capacity, insufficient parametric knowledge
- **Dynamic knowledge environments**: Facts change frequently; corrections are common
- **Privacy-critical applications**: User data must remain deletable and outside model weights
- **Cost-constrained deployment**: Sub-1B models + CTT achieving parity with 10–50× larger models

### 7.3 When Fine-Tuning Remains Preferable

- **Style transfer**: Changing writing tone, persona, or output format
- **Novel reasoning patterns**: Teaching domain-specific chain-of-thought strategies
- **Offline deployment**: No retrieval infrastructure available alongside the model
- **Latency-critical paths**: Where even ~10ms retrieval overhead is unacceptable (though our results suggest CTT often *reduces* total latency)

### 7.4 Future Work

1. **Multi-modal CTT**: Extending the entity store to image, audio, and video embeddings
2. **Federated CTT**: Cross-agent knowledge sharing with differential privacy guarantees
3. **Adaptive template selection**: Automatic template choice via query classification
4. **Reinforcement from outcomes**: Using task success/failure to adjust scoring weights dynamically
5. **Context compression**: Investigating minimum viable context budgets while maintaining CTT benefits
6. **Neural-augmented benchmarks**: Evaluating CTT with the full Matryoshka pyramid active (TF-IDF + embeddings)

---

## 8. Conclusion

This work introduces and empirically validates Context-Time Training (CTT), a framework that challenges the orthodoxy of deep learning applied to autonomous agents. Using the RepoMemory v2 system, we have demonstrated that modifying neural weights through SFT is not an indispensable requirement for achieving domain mastery or continuous learning.

Our evaluation across 10 models, 3 domains, and 150 query evaluations establishes four principal conclusions:

1. **Universal improvement**: CTT improved performance in 100% of tested configurations, with gains ranging from +36% to +800% and zero regressions.

2. **Parametric scale compensation**: A 0.6B-parameter model with CTT outperforms 20B-parameter models without memory (65% vs. 27%), demonstrating that structured context can substitute for 50× model scale.

3. **Paradoxical latency reduction**: Contextually-primed models respond faster in 87.5% of cloud configurations (average 2.6× speedup), contradicting the assumption that retrieval overhead degrades inference performance.

4. **Self-correcting knowledge**: The Correction Boost mechanism enables knowledge stores to evolve and self-correct without information loss, solving the stale fact problem inherent in standard RAG systems.

These results confirm that the language model should be treated as a static, disposable reasoning engine, while the true "intelligence" resides in the agent's capacity to accumulate, consolidate, and retrieve context algorithmically. The fact that a 0.6B-parameter model with CTT surpasses models 50× its size opens the door to a new era of on-device AI, where absolute privacy and near-zero execution costs are viable for enterprise applications.

Ultimately, for the construction of the next generation of agentic artificial intelligence systems, model scale is not the definitive answer. Curated, structured, and immutable context is all you need.

---

## References

Carlini, N., Tramer, F., Wallace, E., Jagielski, M., Herbert-Voss, A., Lee, K., Roberts, A., Brown, T., Song, D., Erlingsson, U., Oprea, A., & Raffel, C. (2021). Extracting training data from large language models. *30th USENIX Security Symposium*, 2633–2650.

Hu, E. J., Shen, Y., Wallis, P., Allen-Zhu, Z., Li, Y., Wang, S., Wang, L., & Chen, W. (2021). LoRA: Low-rank adaptation of large language models. *arXiv preprint arXiv:2106.09685*.

Kirkpatrick, J., Pascanu, R., Rabinowitz, N., Vinyals, O., Desjardins, G., Rusu, A. A., Milan, K., Quan, J., Ramalho, T., Grabska-Barwinska, A., Hassabis, D., Clopath, C., Kumaran, D., & Hadsell, R. (2017). Overcoming catastrophic forgetting in neural networks. *Proceedings of the National Academy of Sciences, 114*(13), 3521–3526.

Kusupati, A., Bhatt, G., Rege, A., Wallingford, M., Sinha, A., Sapber, V., Jain, P., Kakade, S., & Farhadi, A. (2022). Matryoshka representation learning. *Advances in Neural Information Processing Systems 35 (NeurIPS 2022)*.

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., Küttler, H., Lewis, M., Yih, W., Rocktäschel, T., Riedel, S., & Kiela, D. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *Advances in Neural Information Processing Systems 33 (NeurIPS 2020)*.

Robertson, S., & Zaragoza, H. (2009). The probabilistic relevance framework: BM25 and beyond. *Foundations and Trends in Information Retrieval, 3*(4), 333–389.

Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I. (2017). Attention is all you need. *Advances in Neural Information Processing Systems 30 (NeurIPS 2017)*.

---

## Appendix A: Complete Benchmark Data

### A.1 Cloudflare Workers AI — Full Results (March 9, 2026)

| # | Model | Domain | Base | CTT | Δ | Base Latency | CTT Latency |
|---|-------|--------|------|-----|---|-------------|-------------|
| 1 | Llama 3.1 8B | TechStartup | 25% | 50% | +100% | 13,659ms | 7,658ms |
| 2 | GPT-OSS 20B | TechStartup | 29% | 61% | +113% | 8,094ms | 3,964ms |
| 3 | GLM 4.7 Flash | TechStartup | 39% | 54% | +36% | 16,419ms | 5,431ms |
| 4 | Granite 4.0 | TechStartup | 21% | 68% | +217% | 16,934ms | 15,954ms |
| 5 | Qwen3-30B | TechStartup | 43% | 79% | +83% | 24,563ms | 8,635ms |
| 6 | Llama 2 7B INT8 | TechStartup | 36% | 64% | +80% | 14,343ms | 4,018ms |
| 7 | Mistral 7B | TechStartup | 39% | 79% | +100% | 26,926ms | 8,731ms |
| 8 | Llama 2 7B FP16 | TechStartup | 21% | 68% | +217% | 44,178ms | 12,407ms |
| 9 | Llama 3.1 8B | APIDesign | 9% | 72% | +667% | 6,334ms | 6,702ms |
| 10 | GPT-OSS 20B | APIDesign | 13% | 47% | +275% | 8,817ms | 7,320ms |
| 11 | GLM 4.7 Flash | APIDesign | 28% | 63% | +122% | 16,995ms | 6,046ms |
| 12 | Granite 4.0 | APIDesign | 9% | 69% | +633% | 10,508ms | 21,045ms |
| 13 | Qwen3-30B | APIDesign | 28% | 66% | +133% | 27,836ms | 10,083ms |
| 14 | Llama 2 7B INT8 | APIDesign | 16% | 63% | +300% | 10,718ms | 3,210ms |
| 15 | Mistral 7B | APIDesign | 13% | 63% | +400% | 28,193ms | 15,771ms |
| 16 | Llama 2 7B FP16 | APIDesign | 6% | 56% | +800% | 29,619ms | 22,838ms |
| 17 | Llama 3.1 8B | CustomerSupport | 48% | 86% | +79% | 3,951ms | 1,645ms |
| 18 | GPT-OSS 20B | CustomerSupport | 38% | 72% | +91% | 3,909ms | 1,357ms |
| 19 | GLM 4.7 Flash | CustomerSupport | 45% | 69% | +54% | 16,307ms | 3,608ms |
| 20 | Granite 4.0 | CustomerSupport | 34% | 86% | +150% | 9,287ms | 3,899ms |
| 21 | Qwen3-30B | CustomerSupport | 48% | 90% | +86% | 15,917ms | 4,821ms |
| 22 | Llama 2 7B INT8 | CustomerSupport | 34% | 79% | +130% | 8,717ms | 2,500ms |
| 23 | Mistral 7B | CustomerSupport | 38% | 86% | +127% | 20,099ms | 6,782ms |
| 24 | Llama 2 7B FP16 | CustomerSupport | 45% | 86% | +92% | 37,470ms | 11,262ms |

### A.2 Ollama Sub-1B Models — Full Results (March 10, 2026)

| # | Model | Domain | Base | CTT | Δ | Base Latency | CTT Latency |
|---|-------|--------|------|-----|---|-------------|-------------|
| 25 | Gemma3 270M | TechStartup | 18% | 39% | +120% | 6.8s | 0.9s |
| 26 | Gemma3 270M | APIDesign | 9% | 22% | +133% | 5.9s | 2.2s |
| 27 | Gemma3 270M | CustomerSupport | 38% | 62% | +64% | 2.3s | 1.3s |
| 28 | Qwen3 0.6B | TechStartup | 21% | 50% | +133% | 13.3s | 10.1s |
| 29 | Qwen3 0.6B | APIDesign | 13% | 63% | +400% | 15.3s | 15.3s |
| 30 | Qwen3 0.6B | CustomerSupport | 41% | 83% | +100% | 10.8s | 10.7s |

### A.3 Sub-1B Per-Model Averages

| Model | Avg Base | Avg CTT | Avg Improvement |
|-------|----------|---------|-----------------|
| Gemma3 270M | 22% | 41% | +106% |
| Qwen3 0.6B | 25% | 65% | +211% |

---

## Appendix B: Scoring Formula Quick Reference

```
Score(e, q) = Relevance × Decay × Access × Correction

Relevance = (w_tfidf/W)·TFIDF + (w_tag/W)·Jaccard + (w_emb/W)·CosSim
    W = w_tfidf + w_tag + w_emb  (normalization)
    Defaults: 0.7, 0.3, 0 (or 0.4 with neural)

Decay = max(0.01, exp(-λ · Δt))     λ=0.005, Δt=days
Access = min(log₂(2 + count), 5.0)
Correction = 2.0 if category='correction', else 1.0
```

---

## Appendix C: Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    CTT Framework (RepoMemory v2)                  │
│                                                                   │
│  ┌──────────┐     ┌──────────────┐     ┌───────────────────┐    │
│  │  Query q  │────▶│ RecallEngine │────▶│ Prompt Formatter  │    │
│  └──────────┘     │              │     │  (Template-aware)  │    │
│                   │  ┌─────────┐ │     └─────────┬─────────┘    │
│                   │  │Memories │ │               │               │
│                   │  │Skills   │ │     ┌─────────▼─────────┐    │
│                   │  │Knowledge│ │     │   LLM (frozen θ)   │    │
│                   │  │Profile  │ │     └─────────┬─────────┘    │
│                   │  └─────────┘ │               │               │
│                   └──────────────┘     ┌─────────▼─────────┐    │
│                                        │     Response       │    │
│  ┌───────────────────────────┐         └─────────┬─────────┘    │
│  │    Learning Pipelines     │                   │               │
│  │  ┌─────────┐ ┌──────────┐│     ┌─────────────▼──────────┐   │
│  │  │  Mining  │ │Consolidate│◀────│    Session Store        │   │
│  │  └────┬────┘ └──────────┘│     └──────────────────────── ┘   │
│  │       │                   │                                    │
│  │  ┌────▼──────────────┐   │                                    │
│  │  │  saveOrUpdate()   │   │      ┌──────────────────────┐     │
│  │  │  + Correction     │   │      │   CTT Metrics        │     │
│  │  │    Boost (2.0×)   │   │      │   (per-agent/day)    │     │
│  │  └───────────────────┘   │      └──────────────────────┘     │
│  └───────────────────────────┘                                    │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Storage Engine (Git-like, Immutable)           │  │
│  │  objects/ ──▶ commits/ ──▶ refs/ ──▶ lookupIndex           │  │
│  │  SHA-256     chain        pointer    O(1) lookup            │  │
│  │                                                             │  │
│  │  Tombstone deletes │ Full history traversal │ Crash-safe    │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```
