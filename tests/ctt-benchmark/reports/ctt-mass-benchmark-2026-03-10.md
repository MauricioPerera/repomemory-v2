# CTT Mass Benchmark Report — 2026-03-10
> 25 models tested across 3 domains (TechStartup, APIDesign, CustomerSupport)

## Leaderboard (sorted by CTT Quality Score)

| Rank | Model | Params | Size | Family | Base | CTT | Improve | Quality | Eff/GB | Latency |
|------|-------|--------|------|--------|------|-----|---------|---------|--------|---------|
| 1 | qwen3:1.7b | 2.0B | 1296MB | qwen3 | 31% | 74% | +142% | 69% | 54 | 15.1s |
| 2 | qwen2.5:1.5b | 1.5B | 940MB | qwen2 | 23% | 71% | +210% | 68% | 74 | 9.7s |
| 3 | granite3.1-moe:3b | 3.3B | 1941MB | granitemoe | 28% | 71% | +149% | 66% | 35 | 9.7s |
| 4 | gemma3:1b | 999.89M | 778MB | gemma3 | 33% | 71% | +117% | 65% | 85 | 13.4s |
| 5 | gemma:2b | 3B | 1601MB | gemma | 26% | 69% | +164% | 65% | 41 | 16.7s |
| 6 | qwen2.5:3b | 3.1B | 1841MB | qwen2 | 26% | 67% | +158% | 64% | 36 | 13.5s |
| 7 | llama3.2:3b | 3.2B | 1926MB | llama | 24% | 67% | +184% | 63% | 34 | 23.4s |
| 8 | qwen3:0.6b | 751.63M | 498MB | qwen3 | 29% | 67% | +134% | 63% | 130 | 6.9s |
| 9 | llama3.2:1b | 1.2B | 1260MB | llama | 19% | 67% | +249% | 63% | 51 | 12.9s |
| 10 | phi4-mini-reasoning | 3.8B | 3006MB | phi3 | 33% | 76% | +132% | 63% | 21 | 58.9s |
| 11 | smollm2:1.7b | 1.7B | 1736MB | llama | 20% | 69% | +237% | 62% | 37 | 15.5s |
| 12 | granite3.1-moe:1b | 1.3B | 1356MB | granitemoe | 25% | 64% | +157% | 62% | 47 | 9.7s |
| 13 | deepcoder:1.5b | 1.8B | 1066MB | qwen2 | 12% | 71% | +472% | 61% | 59 | 19.6s |
| 14 | qwen2:1.5b | 1.5B | 892MB | qwen2 | 25% | 65% | +160% | 59% | 68 | 8.8s |
| 15 | qwen2.5-coder:1.5b | 1.5B | 940MB | qwen2 | 18% | 62% | +239% | 58% | 64 | 9.3s |
| 16 | qwen2.5-coder:3b | 3.1B | 1841MB | qwen2 | 25% | 65% | +158% | 57% | 32 | 10.8s |
| 17 | qwen2.5:0.5b | 494.03M | 379MB | qwen2 | 26% | 66% | +152% | 57% | 154 | 5.0s |
| 18 | qwen:4b | 4B | 2222MB | qwen2 | 17% | 57% | +236% | 54% | 25 | 12.4s |
| 19 | deepseek-r1:1.5b | 1.8B | 1066MB | qwen2 | 12% | 47% | +304% | 45% | 44 | 9.9s |
| 20 | smollm2:360m | 361.82M | 692MB | llama | 19% | 48% | +159% | 43% | 64 | 8.0s |
| 21 | qwen2.5-coder:0.5b | 494.03M | 379MB | qwen2 | 21% | 55% | +157% | 43% | 116 | 4.9s |
| 22 | qwen2:0.5b | 494.03M | 336MB | qwen2 | 17% | 47% | +178% | 43% | 131 | 4.6s |
| 23 | qwen:0.5b | 620M | 377MB | qwen2 | 15% | 39% | +162% | 34% | 91 | 3.2s |
| 24 | smollm2:135m | 134.52M | 258MB | llama | 17% | 36% | +111% | 30% | 119 | 6.3s |
| 25 | qwen:1.8b | 2B | 1068MB | qwen2 | 27% | 46% | +72% | 24% | 23 | 19.4s |

## By Size Category

### Nano (<500MB) — 6 models

| Model | Params | Size | Base | CTT | Quality | Eff/GB | Latency |
|-------|--------|------|------|-----|---------|--------|---------|
| qwen3:0.6b | 751.63M | 498MB | 29% | 67% | 63% | 130 | 6.9s |
| qwen2.5:0.5b | 494.03M | 379MB | 26% | 66% | 57% | 154 | 5.0s |
| qwen2.5-coder:0.5b | 494.03M | 379MB | 21% | 55% | 43% | 116 | 4.9s |
| qwen2:0.5b | 494.03M | 336MB | 17% | 47% | 43% | 131 | 4.6s |
| qwen:0.5b | 620M | 377MB | 15% | 39% | 34% | 91 | 3.2s |
| smollm2:135m | 134.52M | 258MB | 17% | 36% | 30% | 119 | 6.3s |

### Micro (500MB-1GB) — 5 models

| Model | Params | Size | Base | CTT | Quality | Eff/GB | Latency |
|-------|--------|------|------|-----|---------|--------|---------|
| qwen2.5:1.5b | 1.5B | 940MB | 23% | 71% | 68% | 74 | 9.7s |
| gemma3:1b | 999.89M | 778MB | 33% | 71% | 65% | 85 | 13.4s |
| qwen2:1.5b | 1.5B | 892MB | 25% | 65% | 59% | 68 | 8.8s |
| qwen2.5-coder:1.5b | 1.5B | 940MB | 18% | 62% | 58% | 64 | 9.3s |
| smollm2:360m | 361.82M | 692MB | 19% | 48% | 43% | 64 | 8.0s |

### Small (1-2GB) — 12 models

| Model | Params | Size | Base | CTT | Quality | Eff/GB | Latency |
|-------|--------|------|------|-----|---------|--------|---------|
| qwen3:1.7b | 2.0B | 1296MB | 31% | 74% | 69% | 54 | 15.1s |
| granite3.1-moe:3b | 3.3B | 1941MB | 28% | 71% | 66% | 35 | 9.7s |
| gemma:2b | 3B | 1601MB | 26% | 69% | 65% | 41 | 16.7s |
| qwen2.5:3b | 3.1B | 1841MB | 26% | 67% | 64% | 36 | 13.5s |
| llama3.2:3b | 3.2B | 1926MB | 24% | 67% | 63% | 34 | 23.4s |
| llama3.2:1b | 1.2B | 1260MB | 19% | 67% | 63% | 51 | 12.9s |
| smollm2:1.7b | 1.7B | 1736MB | 20% | 69% | 62% | 37 | 15.5s |
| granite3.1-moe:1b | 1.3B | 1356MB | 25% | 64% | 62% | 47 | 9.7s |
| deepcoder:1.5b | 1.8B | 1066MB | 12% | 71% | 61% | 59 | 19.6s |
| qwen2.5-coder:3b | 3.1B | 1841MB | 25% | 65% | 57% | 32 | 10.8s |
| deepseek-r1:1.5b | 1.8B | 1066MB | 12% | 47% | 45% | 44 | 9.9s |
| qwen:1.8b | 2B | 1068MB | 27% | 46% | 24% | 23 | 19.4s |

### Medium (2-4GB) — 2 models

| Model | Params | Size | Base | CTT | Quality | Eff/GB | Latency |
|-------|--------|------|------|-----|---------|--------|---------|
| phi4-mini-reasoning | 3.8B | 3006MB | 33% | 76% | 63% | 21 | 58.9s |
| qwen:4b | 4B | 2222MB | 17% | 57% | 54% | 25 | 12.4s |

## Per-Domain Results

### TechStartup

| Model | Base | CTT | Improve | Base Lat | CTT Lat | Base Tok | CTT Tok |
|-------|------|-----|---------|----------|---------|---------|---------|
| qwen3:1.7b | 29% | 61% | +113% | 23.0s | 14.3s | 2213 | 1129 |
| qwen2.5:1.5b | 21% | 54% | +150% | 13.2s | 8.5s | 1499 | 822 |
| granite3.1-moe:3b | 25% | 54% | +114% | 14.9s | 9.4s | 2120 | 1157 |
| gemma3:1b | 21% | 61% | +183% | 22.3s | 12.8s | 2560 | 1382 |
| gemma:2b | 21% | 46% | +117% | 15.5s | 15.5s | 1070 | 879 |
| qwen2.5:3b | 25% | 54% | +114% | 28.1s | 10.8s | 1943 | 528 |
| llama3.2:3b | 14% | 57% | +300% | 30.4s | 22.3s | 2045 | 1325 |
| qwen3:0.6b | 32% | 46% | +44% | 10.3s | 5.7s | 1571 | 822 |
| llama3.2:1b | 11% | 50% | +367% | 14.6s | 13.9s | 1436 | 1345 |
| phi4-mini-reasoning | 32% | 86% | +167% | 53.3s | 55.5s | 2560 | 2560 |
| smollm2:1.7b | 14% | 64% | +350% | 13.0s | 15.7s | 975 | 1021 |
| granite3.1-moe:1b | 14% | 54% | +275% | 11.6s | 11.3s | 2155 | 1949 |
| deepcoder:1.5b | 11% | 61% | +467% | 10.6s | 14.8s | 1249 | 1630 |
| qwen2:1.5b | 25% | 54% | +114% | 12.1s | 6.8s | 1333 | 551 |
| qwen2.5-coder:1.5b | 14% | 54% | +275% | 9.8s | 8.8s | 1066 | 834 |
| qwen2.5-coder:3b | 25% | 50% | +100% | 21.2s | 7.0s | 1461 | 245 |
| qwen2.5:0.5b | 21% | 43% | +100% | 8.7s | 6.8s | 1633 | 1105 |
| qwen:4b | 7% | 54% | +650% | 8.3s | 9.3s | 395 | 272 |
| deepseek-r1:1.5b | 7% | 50% | +600% | 10.6s | 12.7s | 1224 | 1345 |
| smollm2:360m | 21% | 43% | +100% | 4.1s | 5.4s | 631 | 772 |
| qwen2.5-coder:0.5b | 14% | 39% | +175% | 4.6s | 6.0s | 898 | 1097 |
| qwen2:0.5b | 11% | 39% | +267% | 9.0s | 3.1s | 1905 | 524 |
| qwen:0.5b | 11% | 32% | +200% | 3.5s | 3.6s | 689 | 562 |
| smollm2:135m | 21% | 32% | +50% | 5.2s | 5.6s | 1653 | 1711 |
| qwen:1.8b | 32% | 50% | +56% | 19.2s | 21.4s | 1950 | 2036 |

### APIDesign

| Model | Base | CTT | Improve | Base Lat | CTT Lat | Base Tok | CTT Tok |
|-------|------|-----|---------|----------|---------|---------|---------|
| qwen3:1.7b | 22% | 72% | +229% | 25.3s | 21.4s | 2509 | 1578 |
| qwen2.5:1.5b | 13% | 69% | +450% | 12.1s | 13.7s | 1490 | 1197 |
| granite3.1-moe:3b | 19% | 69% | +267% | 13.1s | 12.7s | 1949 | 1260 |
| gemma3:1b | 25% | 66% | +163% | 22.8s | 20.4s | 2560 | 2049 |
| gemma:2b | 13% | 75% | +500% | 14.5s | 21.5s | 1073 | 1245 |
| qwen2.5:3b | 19% | 66% | +250% | 26.5s | 17.8s | 1920 | 753 |
| llama3.2:3b | 16% | 63% | +300% | 23.4s | 35.0s | 1610 | 1826 |
| qwen3:0.6b | 13% | 66% | +425% | 10.7s | 11.1s | 1816 | 1396 |
| llama3.2:1b | 9% | 59% | +533% | 14.5s | 16.2s | 1546 | 1406 |
| phi4-mini-reasoning | 25% | 56% | +125% | 50.8s | 58.2s | 2560 | 2375 |
| smollm2:1.7b | 13% | 56% | +350% | 16.4s | 22.0s | 1288 | 1303 |
| granite3.1-moe:1b | 16% | 59% | +280% | 10.3s | 11.8s | 2067 | 1836 |
| deepcoder:1.5b | 9% | 56% | +500% | 9.9s | 22.7s | 1165 | 2339 |
| qwen2:1.5b | 16% | 63% | +300% | 16.2s | 11.9s | 1856 | 919 |
| qwen2.5-coder:1.5b | 6% | 47% | +650% | 11.4s | 12.0s | 1396 | 1025 |
| qwen2.5-coder:3b | 13% | 66% | +425% | 16.4s | 14.0s | 1202 | 459 |
| qwen2.5:0.5b | 19% | 75% | +300% | 7.8s | 5.5s | 1522 | 814 |
| qwen:4b | 9% | 28% | +200% | 7.6s | 14.0s | 422 | 242 |
| deepseek-r1:1.5b | 0% | 28% | N/A | 1.5s | 8.7s | 155 | 579 |
| smollm2:360m | 3% | 25% | +700% | 9.8s | 12.3s | 1716 | 1572 |
| qwen2.5-coder:0.5b | 16% | 44% | +180% | 4.6s | 5.6s | 961 | 882 |
| qwen2:0.5b | 9% | 41% | +333% | 8.3s | 6.4s | 1606 | 1023 |
| qwen:0.5b | 9% | 22% | +133% | 1.9s | 2.8s | 398 | 309 |
| smollm2:135m | 9% | 25% | +167% | 4.9s | 8.5s | 1691 | 2331 |
| qwen:1.8b | 6% | 25% | +300% | 12.6s | 17.0s | 1428 | 1344 |

### CustomerSupport

| Model | Base | CTT | Improve | Base Lat | CTT Lat | Base Tok | CTT Tok |
|-------|------|-----|---------|----------|---------|---------|---------|
| qwen3:1.7b | 41% | 90% | +117% | 21.9s | 9.5s | 2155 | 437 |
| qwen2.5:1.5b | 34% | 90% | +160% | 11.8s | 6.8s | 1450 | 299 |
| granite3.1-moe:3b | 41% | 90% | +117% | 10.8s | 6.8s | 1641 | 454 |
| gemma3:1b | 52% | 86% | +67% | 23.5s | 6.9s | 2560 | 412 |
| gemma:2b | 45% | 86% | +92% | 22.3s | 13.0s | 1632 | 543 |
| qwen2.5:3b | 34% | 83% | +140% | 17.0s | 11.9s | 1209 | 259 |
| llama3.2:3b | 41% | 83% | +100% | 19.5s | 12.9s | 1347 | 310 |
| qwen3:0.6b | 41% | 90% | +117% | 5.2s | 3.8s | 910 | 280 |
| llama3.2:1b | 38% | 93% | +145% | 11.1s | 8.4s | 1156 | 596 |
| phi4-mini-reasoning | 41% | 86% | +108% | 51.6s | 63.0s | 2560 | 2560 |
| smollm2:1.7b | 34% | 86% | +150% | 11.7s | 8.8s | 938 | 333 |
| granite3.1-moe:1b | 45% | 79% | +77% | 10.0s | 6.0s | 1970 | 753 |
| deepcoder:1.5b | 17% | 97% | +460% | 5.7s | 21.2s | 686 | 2111 |
| qwen2:1.5b | 34% | 79% | +130% | 7.8s | 7.7s | 890 | 429 |
| qwen2.5-coder:1.5b | 34% | 86% | +150% | 3.7s | 7.0s | 400 | 327 |
| qwen2.5-coder:3b | 38% | 79% | +109% | 17.1s | 11.4s | 1175 | 159 |
| qwen2.5:0.5b | 38% | 79% | +109% | 5.4s | 2.7s | 1062 | 215 |
| qwen:4b | 34% | 90% | +160% | 6.3s | 13.8s | 361 | 182 |
| deepseek-r1:1.5b | 28% | 62% | +125% | 3.3s | 8.2s | 378 | 489 |
| smollm2:360m | 31% | 76% | +144% | 6.5s | 6.2s | 1063 | 729 |
| qwen2.5-coder:0.5b | 34% | 83% | +140% | 5.8s | 3.1s | 1047 | 285 |
| qwen2:0.5b | 31% | 62% | +100% | 3.8s | 4.2s | 835 | 582 |
| qwen:0.5b | 24% | 62% | +157% | 2.2s | 3.2s | 513 | 347 |
| smollm2:135m | 21% | 52% | +150% | 3.6s | 4.9s | 1198 | 1157 |
| qwen:1.8b | 41% | 62% | +50% | 7.8s | 19.8s | 854 | 1474 |

## Response Quality Samples

### Top 5 Models — Sample Responses

#### qwen3:1.7b (CTT: 74%, Quality: 69%)

**[TechStartup] Q:** ¿Qué base de datos elegimos y por qué?
- Base (0t/0f): La respuesta a la pregunta **"¿Qué base de datos elegimos y por qué?"** depende del contexto en el que se haga la pregunta. Sin embargo, si se refiere a una situación común, como en un proyecto de des...
- CTT (1t/2f): Elegimos **PostgreSQL** como base de datos principal por varias razones:

1. **Soporte de JSONB**: PostgreSQL ofrece el tipo de datos `JSONB`, que es ideal para manejar datos estructurados en formato ...

**[APIDesign] Q:** How should we handle API errors?
- Base (1t/0f): Handling API errors is crucial for maintaining a good user experience and ensuring the reliability of your application. Here's a structured approach to handling API errors effectively:

---

### **1. ...
- CTT (2t/4f): When handling API errors, it's important to follow a structured approach to ensure consistency, clarity, and maintainability. Here's a recommended approach:

### 1. **Error Handling Strategy**
- **Cat...

**[CustomerSupport] Q:** What is ACME Corp's subscription and who is their contact?
- Base (2t/0f): ACME Corp is a fictional company often used in examples or hypothetical scenarios. There is no real-world ACME Corp, and it is not a known public company. Therefore, there is no official subscription ...
- CTT (1t/4f): ACME Corp is on the Enterprise plan, which costs **$499/month**. Their primary contact is **Sarah Chen** at **sarah@acme.com**.

#### qwen2.5:1.5b (CTT: 71%, Quality: 68%)

**[TechStartup] Q:** ¿Qué base de datos elegimos y por qué?
- Base (1t/1f): Como asistente de IA, no tengo la capacidad de realizar decisiones o tomar elecciones, incluyendo la elección de una base de datos. Sin embargo, puedo ofrecerte una guía general sobre las bases de dat...
- CTT (1t/2f): Encontramos que PostgreSQL fue la opción más adecuada para nuestros requisitos. La razón principal fue que soporta JSONB y PostGIS, lo que nos permitía almacenar y acceder fácilmente a datos relaciona...

**[APIDesign] Q:** How should we handle API errors?
- Base (1t/0f): Handling API errors effectively is crucial for maintaining user satisfaction and ensuring smooth operation of your application. Here are some best practices for managing API errors:

1. **Catch and Ha...
- CTT (2t/4f): To handle API errors appropriately, we should follow a structured approach as outlined in the relevant context. Here’s a summary of how to implement error handling in our API:

### Error Handling Patt...

**[CustomerSupport] Q:** What is ACME Corp's subscription and who is their contact?
- Base (2t/0f): I'm sorry, but I can't answer this question. The reason is that I do not have any information about ACME Corp's subscription or contact details. It's possible that ACME Corp is a company that does not...
- CTT (2t/4f): ACME Corp's subscription plan is Enterprise ($499/month) and their primary contact is Sarah Chen (sarah@acme.com). They have been on the Enterprise plan since January 2024. The context does not mentio...

#### granite3.1-moe:3b (CTT: 71%, Quality: 66%)

**[TechStartup] Q:** ¿Qué base de datos elegimos y por qué?
- Base (1t/1f): Para elegir la base de datos adecuada, debemos considerar varios factores que garanticen que la elección cumpla con nuestras necesidades y objetivos específicos. A continuación, se presentan algunos p...
- CTT (1t/2f): Elegimos PostgreSQL como base de datos principal debido a su soporte de JSONB y extensiones como PostGIS, que son esenciales para nuestra aplicación que maneja grandes volúmenes de datos con un alto n...

**[APIDesign] Q:** How should we handle API errors?
- Base (1t/0f): Handling API errors effectively is crucial for maintaining system reliability and user experience. Here's a structured approach to manage API errors:

1. **Error Responses**: APIs should provide meani...
- CTT (2t/4f): To handle API errors effectively, consider implementing a structured error handling pattern that follows these steps:

1. Catch at the controller level: Implement a centralized error-handling mechanis...

**[CustomerSupport] Q:** What is ACME Corp's subscription and who is their contact?
- Base (2t/0f): I'm sorry for any confusion, but as a knowledge base AI, I don't have real-time data or the ability to track specific companies' subscriptions. My primary function is to provide general information an...
- CTT (2t/3f): ACME Corp is on the Enterprise plan, with the subscription costing $499 per month. The primary contact for ACME Corp is Sarah Chen, who can be reached at sarah@acme.com. This contact information is up...

#### gemma3:1b (CTT: 71%, Quality: 65%)

**[TechStartup] Q:** ¿Qué base de datos elegimos y por qué?
- Base (0t/0f): Para poder responder a tu pregunta de forma precisa, necesito saber a qué te refieres con "elegimos una base de datos".  Hay MUCHAS bases de datos diferentes, y la elección depende completamente de lo...
- CTT (1t/2f): Hemos elegido PostgreSQL como base de datos principal debido a su excelente soporte para JSONB y las extensiones PostGIS.

**Aquí está el por qué:**

*   **JSONB:** PostgreSQL tiene un soporte muy rob...

**[APIDesign] Q:** How should we handle API errors?
- Base (1t/0f): Okay, let's break down how to handle API errors effectively. It's crucial for building robust and resilient applications. Here's a breakdown of best practices, categorized for clarity:

**1. Understan...
- CTT (2t/3f): Okay, let's solidify the API error handling strategy based on the provided context. Here’s a breakdown of how we should approach it, incorporating best practices and the information we have:

**1. Err...

**[CustomerSupport] Q:** What is ACME Corp's subscription and who is their contact?
- Base (2t/1f): Okay, let's break down ACME Corp's subscription program.

**What is ACME Corp's Subscription Program?**

ACME Corp primarily offers a subscription service for their software, primarily focusing on **"...
- CTT (2t/3f): ACME Corp’s subscription is an **Enterprise plan** that costs $499 per month. Their primary contact is **Sarah Chen (sarah@acme.com)**.

#### gemma:2b (CTT: 69%, Quality: 65%)

**[TechStartup] Q:** ¿Qué base de datos elegimos y por qué?
- Base (0t/0f): No tengo memoria de trabajo y no puedo elegir bases de datos.  Soy un modelo lingüístico que está diseñado para ayudar con la comprensión de la información y la generación de lenguaje.
- CTT (2t/1f): The context does not provide information about the base of database chosen, or the reason for the decision to choose PostgreSQL over MySQL, so I cannot answer this question from the provided context.

**[APIDesign] Q:** How should we handle API errors?
- Base (1t/0f): **Handling API Errors**

**1. Define Error Handling Mechanism:**
* Determine how API responses will be handled (e.g., status codes, error messages).
* Use a consistent error handling mechanism, such a...
- CTT (2t/3f): **Summary:**

The context provides information about the decision to switch from REST to GraphQL, the versioning strategy, handling bugs, and best practices for input validation and API error handling...

**[CustomerSupport] Q:** What is ACME Corp's subscription and who is their contact?
- Base (1t/0f): I'm unable to access real-time or specific personal and financial information, therefore I cannot provide you with the requested data about ACME Corp.
- CTT (2t/4f): Sure, I can assist you with your question about ACME Corp's subscription and contact information.

**Subscription:**
- ACME Corp is on the Enterprise plan ($499/month).

**Contact:**
- Primary contact...

### Bottom 5 Models — Sample Responses

#### qwen2.5-coder:0.5b (CTT: 55%, Quality: 43%)

**[TechStartup] Q:** ¿Qué base de datos elegimos y por qué?
- Base (0t/0f): Como asistente de IA, no tengo la capacidad de seleccionar un base de datos o usar cualquier otro tipo de base de datos. Sin embargo, puedo proporcionarte algunos puntos para ayudarte a seleccionar la...
- CTT (1t/2f): Decidimos usar PostgreSQL como base de datos principal por su soporte de JSONB y extensiones como PostGIS.

**[APIDesign] Q:** How should we handle API errors?
- Base (1t/0f): API errors can be a common issue in web development, especially in mobile applications. To handle API errors effectively, we need to follow these steps:

1. **Check the API Response**: First, ensure t...
- CTT (1t/3f): To handle API errors effectively, we should follow the guidelines provided in the relevant context:

1. **Catch at controller level**:
   - Implement a middleware in the controller that checks if the ...

**[CustomerSupport] Q:** What is ACME Corp's subscription and who is their contact?
- Base (1t/0f): ACME Corp. is a software provider that provides secure, automated, and reliable SSL certificate issuance services. The contact information for ACME Corp. is: support@acme.com.
- CTT (1t/4f): According to the context provided, ACME Corp is on the Enterprise plan ($499/month). The primary contact is Sarah Chen (sarah@acme.com).

#### qwen2:0.5b (CTT: 47%, Quality: 43%)

**[TechStartup] Q:** ¿Qué base de datos elegimos y por qué?
- Base (0t/0f): Como asistente, no tengo la capacidad de diseñar bases de datos, pero puedo proporcionarte un consejo basado en los estándares más comunes y suelen ser bastante fáciles de manejar. 

1. Base de datos:...
- CTT (1t/2f): Decidimos usar PostgreSQL como base de datos principal por su soporte de JSONB y extensiones como PostGIS. MySQL era descartado por limitaciones en tipos de datos complejos.

**[APIDesign] Q:** How should we handle API errors?
- Base (1t/0f): Handling API errors is an important practice to ensure that users are informed and have a positive experience. There are several common strategies for handling API errors. For example:

1. **Log error...
- CTT (0t/1f): API errors should be handled in the following way:

1. Catch at the controller level: If an error is detected at the controller level, a catch block should be used to handle the error gracefully. 

2....

**[CustomerSupport] Q:** What is ACME Corp's subscription and who is their contact?
- Base (1t/0f): ACME Corp is a retail company.
- CTT (2t/3f): ACME Corp's subscription is on the Enterprise plan, which costs $499/month. Their contact is Sarah Chen.

#### qwen:0.5b (CTT: 39%, Quality: 34%)

**[TechStartup] Q:** ¿Qué base de datos elegimos y por qué?
- Base (0t/0f): Asunto: ¿Qué base de datos elegimos y por qué?

Para elegir una base de datos, se considera la siguiente:

1. Reusability: La base de datos debe ser fácil de usar y mantenible. Esto significa que la b...
- CTT (0t/0f): Como modelo de lenguaje, no tengo la capacidad de elegir una base de datos. Sin embargo, es recomendable tener una base de datos de alta calidad para garantizar la disponibilidad de información y herr...

**[APIDesign] Q:** How should we handle API errors?
- Base (0t/0f): API errors can occur due to various reasons, such as incorrect input parameters, invalid request headers, or unexpected errors in the API calls.

When handling API errors, it is important to understan...
- CTT (0t/0f): API errors are not typically handled manually by the developer. Instead, the API server should log the error and return the appropriate response. For example, if the API error is "404 Not Found", the ...

**[CustomerSupport] Q:** What is ACME Corp's subscription and who is their contact?
- Base (1t/0f): As an AI language model, I don't have access to information about ACME Corp. Additionally, as an AI language model, I don't have access to information about ACME Corp. Additionally, as an AI language ...
- CTT (2t/1f): ACME Corp' s subscription is their monthly plan. The plan is for 12 months of unlimited access to products and services. The contact for ACME Corp' s subscription is Sarah Chen.

#### smollm2:135m (CTT: 36%, Quality: 30%)

**[TechStartup] Q:** ¿Qué base de datos elegimos y por qué?
- Base (1t/0f): Hola! Welcome to our chat. I'm here to help with data analysis and interpretation.

**Data Base**

I can help with a variety of data bases including:

1. **Datasets**: A collection of data points or m...
- CTT (2t/1f): The database Base De Datos Nuances Clásicos (BDN) is an architecture and storage system for PostgreSQL. It is designed for efficient storage and retrieval of large datasets, particularly for relationa...

**[APIDesign] Q:** How should we handle API errors?
- Base (0t/0f): As a helpful AI assistant, I am designed to provide guidance on handling API errors, but I'm not programmed to provide the specifics of how to resolve them. I recommend using the official documentatio...
- CTT (1t/0f): Dealing with API errors in a React app requires a thoughtful approach, as errors can be difficult to debug and propagate. Here are some general steps to handle API errors in React:

1. **Be prepared t...

**[CustomerSupport] Q:** What is ACME Corp's subscription and who is their contact?
- Base (1t/0f): ACME Corp is an energy and innovative business that focuses on sustainable and environmentally friendly practices. They offer a range of services, including energy audits, electric vehicle maintenance...
- CTT (2t/1f): ACME Corp's subscription is a monthly membership plan. The subscription price starts at $499/month and is available at the following channels:

- [acme.com] (subscription)
- [acme.com.au] (subscriptio...

#### qwen:1.8b (CTT: 46%, Quality: 24%)

**[TechStartup] Q:** ¿Qué base de datos elegimos y por qué?
- Base (1t/1f): El base de datos elegido depende de varios factores, como la naturaleza de los datos, la disponibilidad y la costo de la conexión a la base de datos.

Una base de datos comúnmente utilizada en el mund...
- CTT (1t/2f): Para elegir una base de datos principal, hemos considerado los siguientes factores:

1. Soporte de JSONB y extensiones como PostGIS:
  * PostgreSQL es conocido por su soporte de JSONB y extensiones co...

**[APIDesign] Q:** How should we handle API errors?
- Base (0t/0f): API errors are a common occurrence in web application development. These errors can occur due to various reasons, such as invalid input data, connection timeouts, API rate limits, etc.

Here are some ...
- CTT (0t/0f): API errors are a common occurrence in the world of APIs. When an API encounters an error, it needs to handle the error gracefully and provide a clear and informative error message.
Here are some steps...

**[CustomerSupport] Q:** What is ACME Corp's subscription and who is their contact?
- Base (2t/0f): As an AI developed by Alibaba Cloud, I don't have access to specific information about ACME Corp or their contact details.

However, in general, subscription companies typically require customers to s...
- CTT (2t/2f): ACME Corp's subscription plan is the Enterprise plan, which costs $499 per month. This subscription plan allows access to all features of ACME Corp's products, including PDF export, for over 50MB file...

## Key Findings

- **Best CTT Quality**: qwen3:1.7b — 69% quality-weighted CTT score
- **Best Efficiency**: qwen2.5:0.5b — 154 quality per GB
- **Fastest CTT**: qwen:0.5b — 3.2s avg latency
- **Worst Performance**: qwen:1.8b — 24% quality-weighted CTT score
- **Average CTT Improvement**: +184%

---
*Generated by RepoMemory CTT Mass Benchmark — 2026-03-10 — 25 models*