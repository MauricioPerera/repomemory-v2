# CTT Benchmark Report — 2026-03-09

## Summary

| Model | Domain | Base Score | CTT Score | Improvement | Base Latency | CTT Latency |
|-------|--------|-----------|-----------|-------------|-------------|-------------|
| @cf/meta/llama-3.1-8b-instruct | TechStartup | 25% | 50% | +100% | 13659ms | 7658ms |
| @cf/openai/gpt-oss-20b | TechStartup | 29% | 61% | +113% | 8094ms | 3964ms |
| @cf/zai-org/glm-4.7-flash | TechStartup | 39% | 54% | +36% | 16419ms | 5431ms |
| @cf/ibm-granite/granite-4.0-h-micro | TechStartup | 21% | 68% | +217% | 16934ms | 15954ms |
| @cf/qwen/qwen3-30b-a3b-fp8 | TechStartup | 43% | 79% | +83% | 24563ms | 8635ms |
| @cf/meta/llama-2-7b-chat-int8 | TechStartup | 36% | 64% | +80% | 14343ms | 4018ms |
| @cf/mistral/mistral-7b-instruct-v0.1 | TechStartup | 39% | 79% | +100% | 26926ms | 8731ms |
| @cf/meta/llama-2-7b-chat-fp16 | TechStartup | 21% | 68% | +217% | 44178ms | 12407ms |
| @cf/meta/llama-3.1-8b-instruct | APIDesign | 9% | 72% | +667% | 6334ms | 6702ms |
| @cf/openai/gpt-oss-20b | APIDesign | 13% | 47% | +275% | 8817ms | 7320ms |
| @cf/zai-org/glm-4.7-flash | APIDesign | 28% | 63% | +122% | 16995ms | 6046ms |
| @cf/ibm-granite/granite-4.0-h-micro | APIDesign | 9% | 69% | +633% | 10508ms | 21045ms |
| @cf/qwen/qwen3-30b-a3b-fp8 | APIDesign | 28% | 66% | +133% | 27836ms | 10083ms |
| @cf/meta/llama-2-7b-chat-int8 | APIDesign | 16% | 63% | +300% | 10718ms | 3210ms |
| @cf/mistral/mistral-7b-instruct-v0.1 | APIDesign | 13% | 63% | +400% | 28193ms | 15771ms |
| @cf/meta/llama-2-7b-chat-fp16 | APIDesign | 6% | 56% | +800% | 29619ms | 22838ms |
| @cf/meta/llama-3.1-8b-instruct | CustomerSupport | 48% | 86% | +79% | 3951ms | 1645ms |
| @cf/openai/gpt-oss-20b | CustomerSupport | 38% | 72% | +91% | 3909ms | 1357ms |
| @cf/zai-org/glm-4.7-flash | CustomerSupport | 45% | 69% | +54% | 16307ms | 3608ms |
| @cf/ibm-granite/granite-4.0-h-micro | CustomerSupport | 34% | 86% | +150% | 9287ms | 3899ms |
| @cf/qwen/qwen3-30b-a3b-fp8 | CustomerSupport | 48% | 90% | +86% | 15917ms | 4821ms |
| @cf/meta/llama-2-7b-chat-int8 | CustomerSupport | 34% | 79% | +130% | 8717ms | 2500ms |
| @cf/mistral/mistral-7b-instruct-v0.1 | CustomerSupport | 38% | 86% | +127% | 20099ms | 6782ms |
| @cf/meta/llama-2-7b-chat-fp16 | CustomerSupport | 45% | 86% | +92% | 37470ms | 11262ms |

## Detail per Query

### @cf/meta/llama-3.1-8b-instruct — TechStartup

**Q:** ¿Qué base de datos elegimos y por qué?
- Base: topics 2/2, facts 1/3 (3845ms)
- CTT:  topics 1/2, facts 2/3 (27504ms, 1 items, 254 chars)

**Q:** ¿Cuál es nuestra estrategia de deploy?
- Base: topics 1/3, facts 0/3 (44612ms)
- CTT:  topics 3/3, facts 3/3 (5470ms, 2 items, 392 chars)

**Q:** ¿Cómo manejamos la autenticación?
- Base: topics 0/2, facts 0/4 (4595ms)
- CTT:  topics 0/2, facts 0/4 (3672ms, 0 items, 0 chars)

**Q:** What is the monthly infrastructure budget?
- Base: topics 2/2, facts 0/4 (208ms)
- CTT:  topics 0/2, facts 1/4 (443ms, 1 items, 191 chars)

**Q:** ¿Cuáles son los estándares para diseñar APIs?
- Base: topics 1/2, facts 0/3 (15036ms)
- CTT:  topics 1/2, facts 3/3 (1202ms, 4 items, 903 chars)

### @cf/openai/gpt-oss-20b — TechStartup

**Q:** ¿Qué base de datos elegimos y por qué?
- Base: topics 1/2, facts 2/3 (10118ms)
- CTT:  topics 1/2, facts 2/3 (1972ms, 1 items, 254 chars)

**Q:** ¿Cuál es nuestra estrategia de deploy?
- Base: topics 3/3, facts 2/3 (6564ms)
- CTT:  topics 2/3, facts 3/3 (1717ms, 2 items, 392 chars)

**Q:** ¿Cómo manejamos la autenticación?
- Base: topics 0/2, facts 0/4 (10537ms)
- CTT:  topics 1/2, facts 3/4 (10599ms, 0 items, 0 chars)

**Q:** What is the monthly infrastructure budget?
- Base: topics 0/2, facts 0/4 (920ms)
- CTT:  topics 2/2, facts 1/4 (548ms, 1 items, 191 chars)

**Q:** ¿Cuáles son los estándares para diseñar APIs?
- Base: topics 0/2, facts 0/3 (12329ms)
- CTT:  topics 1/2, facts 1/3 (4984ms, 4 items, 903 chars)

### @cf/zai-org/glm-4.7-flash — TechStartup

**Q:** ¿Qué base de datos elegimos y por qué?
- Base: topics 1/2, facts 1/3 (18277ms)
- CTT:  topics 1/2, facts 2/3 (4577ms, 1 items, 254 chars)

**Q:** ¿Cuál es nuestra estrategia de deploy?
- Base: topics 1/3, facts 1/3 (15618ms)
- CTT:  topics 2/3, facts 3/3 (6764ms, 2 items, 392 chars)

**Q:** ¿Cómo manejamos la autenticación?
- Base: topics 1/2, facts 1/4 (17634ms)
- CTT:  topics 0/2, facts 0/4 (7682ms, 0 items, 0 chars)

**Q:** What is the monthly infrastructure budget?
- Base: topics 2/2, facts 2/4 (11778ms)
- CTT:  topics 2/2, facts 1/4 (1946ms, 1 items, 191 chars)

**Q:** ¿Cuáles son los estándares para diseñar APIs?
- Base: topics 1/2, facts 0/3 (18789ms)
- CTT:  topics 1/2, facts 3/3 (6184ms, 4 items, 903 chars)

### @cf/ibm-granite/granite-4.0-h-micro — TechStartup

**Q:** ¿Qué base de datos elegimos y por qué?
- Base: topics 1/2, facts 1/3 (20279ms)
- CTT:  topics 1/2, facts 2/3 (11546ms, 1 items, 254 chars)

**Q:** ¿Cuál es nuestra estrategia de deploy?
- Base: topics 1/3, facts 0/3 (15454ms)
- CTT:  topics 3/3, facts 3/3 (3397ms, 2 items, 392 chars)

**Q:** ¿Cómo manejamos la autenticación?
- Base: topics 0/2, facts 1/4 (19327ms)
- CTT:  topics 1/2, facts 2/4 (41042ms, 0 items, 0 chars)

**Q:** What is the monthly infrastructure budget?
- Base: topics 1/2, facts 0/4 (2478ms)
- CTT:  topics 2/2, facts 1/4 (780ms, 1 items, 191 chars)

**Q:** ¿Cuáles son los estándares para diseñar APIs?
- Base: topics 1/2, facts 0/3 (27131ms)
- CTT:  topics 1/2, facts 3/3 (23007ms, 4 items, 903 chars)

### @cf/qwen/qwen3-30b-a3b-fp8 — TechStartup

**Q:** ¿Qué base de datos elegimos y por qué?
- Base: topics 2/2, facts 1/3 (23972ms)
- CTT:  topics 1/2, facts 2/3 (4463ms, 1 items, 254 chars)

**Q:** ¿Cuál es nuestra estrategia de deploy?
- Base: topics 2/3, facts 2/3 (29286ms)
- CTT:  topics 3/3, facts 3/3 (5473ms, 2 items, 392 chars)

**Q:** ¿Cómo manejamos la autenticación?
- Base: topics 1/2, facts 1/4 (30414ms)
- CTT:  topics 1/2, facts 2/4 (21615ms, 0 items, 0 chars)

**Q:** What is the monthly infrastructure budget?
- Base: topics 2/2, facts 0/4 (16934ms)
- CTT:  topics 2/2, facts 4/4 (4001ms, 1 items, 191 chars)

**Q:** ¿Cuáles son los estándares para diseñar APIs?
- Base: topics 1/2, facts 0/3 (22211ms)
- CTT:  topics 1/2, facts 3/3 (7624ms, 4 items, 903 chars)

### @cf/meta/llama-2-7b-chat-int8 — TechStartup

**Q:** ¿Qué base de datos elegimos y por qué?
- Base: topics 1/2, facts 1/3 (14835ms)
- CTT:  topics 1/2, facts 2/3 (2293ms, 1 items, 254 chars)

**Q:** ¿Cuál es nuestra estrategia de deploy?
- Base: topics 2/3, facts 1/3 (12669ms)
- CTT:  topics 3/3, facts 2/3 (3137ms, 2 items, 392 chars)

**Q:** ¿Cómo manejamos la autenticación?
- Base: topics 1/2, facts 1/4 (13897ms)
- CTT:  topics 1/2, facts 1/4 (11552ms, 0 items, 0 chars)

**Q:** What is the monthly infrastructure budget?
- Base: topics 2/2, facts 0/4 (11087ms)
- CTT:  topics 2/2, facts 1/4 (869ms, 1 items, 191 chars)

**Q:** ¿Cuáles son los estándares para diseñar APIs?
- Base: topics 1/2, facts 0/3 (19228ms)
- CTT:  topics 2/2, facts 3/3 (2240ms, 4 items, 903 chars)

### @cf/mistral/mistral-7b-instruct-v0.1 — TechStartup

**Q:** ¿Qué base de datos elegimos y por qué?
- Base: topics 2/2, facts 1/3 (25805ms)
- CTT:  topics 2/2, facts 2/3 (4542ms, 1 items, 254 chars)

**Q:** ¿Cuál es nuestra estrategia de deploy?
- Base: topics 2/3, facts 1/3 (29464ms)
- CTT:  topics 3/3, facts 2/3 (8153ms, 2 items, 392 chars)

**Q:** ¿Cómo manejamos la autenticación?
- Base: topics 1/2, facts 0/4 (35917ms)
- CTT:  topics 1/2, facts 1/4 (16662ms, 0 items, 0 chars)

**Q:** What is the monthly infrastructure budget?
- Base: topics 2/2, facts 0/4 (15514ms)
- CTT:  topics 2/2, facts 4/4 (6661ms, 1 items, 191 chars)

**Q:** ¿Cuáles son los estándares para diseñar APIs?
- Base: topics 2/2, facts 0/3 (27932ms)
- CTT:  topics 2/2, facts 3/3 (7639ms, 4 items, 903 chars)

### @cf/meta/llama-2-7b-chat-fp16 — TechStartup

**Q:** ¿Qué base de datos elegimos y por qué?
- Base: topics 1/2, facts 1/3 (46131ms)
- CTT:  topics 2/2, facts 2/3 (12595ms, 1 items, 254 chars)

**Q:** ¿Cuál es nuestra estrategia de deploy?
- Base: topics 1/3, facts 0/3 (30720ms)
- CTT:  topics 3/3, facts 3/3 (10712ms, 2 items, 392 chars)

**Q:** ¿Cómo manejamos la autenticación?
- Base: topics 0/2, facts 0/4 (54508ms)
- CTT:  topics 1/2, facts 0/4 (25441ms, 0 items, 0 chars)

**Q:** What is the monthly infrastructure budget?
- Base: topics 2/2, facts 0/4 (39450ms)
- CTT:  topics 2/2, facts 1/4 (1655ms, 1 items, 191 chars)

**Q:** ¿Cuáles son los estándares para diseñar APIs?
- Base: topics 1/2, facts 0/3 (50080ms)
- CTT:  topics 2/2, facts 3/3 (11633ms, 4 items, 903 chars)

### @cf/meta/llama-3.1-8b-instruct — APIDesign

**Q:** How should we handle API errors?
- Base: topics 1/2, facts 0/4 (15789ms)
- CTT:  topics 2/2, facts 4/4 (6991ms, 6 items, 1506 chars)

**Q:** What is our auth strategy?
- Base: topics 0/2, facts 0/5 (333ms)
- CTT:  topics 2/2, facts 4/5 (10094ms, 2 items, 727 chars)

**Q:** How does pagination work in our API?
- Base: topics 1/2, facts 0/4 (6373ms)
- CTT:  topics 2/2, facts 4/4 (5323ms, 5 items, 1244 chars)

**Q:** What are the rate limits per tier?
- Base: topics 0/2, facts 0/5 (1860ms)
- CTT:  topics 0/2, facts 1/5 (3222ms, 1 items, 199 chars)

**Q:** How do we handle webhook deliveries?
- Base: topics 1/2, facts 0/4 (7313ms)
- CTT:  topics 1/2, facts 3/4 (7882ms, 3 items, 848 chars)

### @cf/openai/gpt-oss-20b — APIDesign

**Q:** How should we handle API errors?
- Base: topics 0/2, facts 0/4 (11474ms)
- CTT:  topics 0/2, facts 0/4 (12156ms, 6 items, 1506 chars)

**Q:** What is our auth strategy?
- Base: topics 1/2, facts 0/5 (1762ms)
- CTT:  topics 2/2, facts 4/5 (5570ms, 2 items, 727 chars)

**Q:** How does pagination work in our API?
- Base: topics 2/2, facts 1/4 (11032ms)
- CTT:  topics 2/2, facts 2/4 (6358ms, 5 items, 1244 chars)

**Q:** What are the rate limits per tier?
- Base: topics 0/2, facts 0/5 (9314ms)
- CTT:  topics 1/2, facts 1/5 (1333ms, 1 items, 199 chars)

**Q:** How do we handle webhook deliveries?
- Base: topics 0/2, facts 0/4 (10503ms)
- CTT:  topics 1/2, facts 2/4 (11185ms, 3 items, 848 chars)

### @cf/zai-org/glm-4.7-flash — APIDesign

**Q:** How should we handle API errors?
- Base: topics 0/2, facts 0/4 (14935ms)
- CTT:  topics 1/2, facts 4/4 (10118ms, 6 items, 1506 chars)

**Q:** What is our auth strategy?
- Base: topics 2/2, facts 1/5 (12193ms)
- CTT:  topics 2/2, facts 2/5 (6639ms, 2 items, 727 chars)

**Q:** How does pagination work in our API?
- Base: topics 2/2, facts 1/4 (18351ms)
- CTT:  topics 2/2, facts 4/4 (5008ms, 5 items, 1244 chars)

**Q:** What are the rate limits per tier?
- Base: topics 1/2, facts 0/5 (14247ms)
- CTT:  topics 0/2, facts 0/5 (3374ms, 1 items, 199 chars)

**Q:** How do we handle webhook deliveries?
- Base: topics 1/2, facts 1/4 (25249ms)
- CTT:  topics 2/2, facts 3/4 (5094ms, 3 items, 848 chars)

### @cf/ibm-granite/granite-4.0-h-micro — APIDesign

**Q:** How should we handle API errors?
- Base: topics 1/2, facts 0/4 (19239ms)
- CTT:  topics 2/2, facts 4/4 (39886ms, 6 items, 1506 chars)

**Q:** What is our auth strategy?
- Base: topics 1/2, facts 0/5 (3891ms)
- CTT:  topics 1/2, facts 3/5 (20464ms, 2 items, 727 chars)

**Q:** How does pagination work in our API?
- Base: topics 1/2, facts 0/4 (11591ms)
- CTT:  topics 2/2, facts 3/4 (14204ms, 5 items, 1244 chars)

**Q:** What are the rate limits per tier?
- Base: topics 0/2, facts 0/5 (2264ms)
- CTT:  topics 0/2, facts 2/5 (2729ms, 1 items, 199 chars)

**Q:** How do we handle webhook deliveries?
- Base: topics 0/2, facts 0/4 (15554ms)
- CTT:  topics 2/2, facts 3/4 (27943ms, 3 items, 848 chars)

### @cf/qwen/qwen3-30b-a3b-fp8 — APIDesign

**Q:** How should we handle API errors?
- Base: topics 0/2, facts 0/4 (33888ms)
- CTT:  topics 2/2, facts 4/4 (17845ms, 6 items, 1506 chars)

**Q:** What is our auth strategy?
- Base: topics 2/2, facts 0/5 (22956ms)
- CTT:  topics 2/2, facts 2/5 (10411ms, 2 items, 727 chars)

**Q:** How does pagination work in our API?
- Base: topics 2/2, facts 1/4 (35022ms)
- CTT:  topics 2/2, facts 3/4 (7012ms, 5 items, 1244 chars)

**Q:** What are the rate limits per tier?
- Base: topics 1/2, facts 1/5 (15927ms)
- CTT:  topics 0/2, facts 2/5 (4776ms, 1 items, 199 chars)

**Q:** How do we handle webhook deliveries?
- Base: topics 1/2, facts 1/4 (31386ms)
- CTT:  topics 1/2, facts 3/4 (10373ms, 3 items, 848 chars)

### @cf/meta/llama-2-7b-chat-int8 — APIDesign

**Q:** How should we handle API errors?
- Base: topics 1/2, facts 0/4 (13540ms)
- CTT:  topics 1/2, facts 4/4 (3442ms, 6 items, 1506 chars)

**Q:** What is our auth strategy?
- Base: topics 2/2, facts 0/5 (9395ms)
- CTT:  topics 2/2, facts 3/5 (4789ms, 2 items, 727 chars)

**Q:** How does pagination work in our API?
- Base: topics 1/2, facts 0/4 (12540ms)
- CTT:  topics 2/2, facts 4/4 (3032ms, 5 items, 1244 chars)

**Q:** What are the rate limits per tier?
- Base: topics 0/2, facts 0/5 (9505ms)
- CTT:  topics 0/2, facts 0/5 (1630ms, 1 items, 199 chars)

**Q:** How do we handle webhook deliveries?
- Base: topics 1/2, facts 0/4 (8612ms)
- CTT:  topics 1/2, facts 3/4 (3157ms, 3 items, 848 chars)

### @cf/mistral/mistral-7b-instruct-v0.1 — APIDesign

**Q:** How should we handle API errors?
- Base: topics 0/2, facts 0/4 (26986ms)
- CTT:  topics 2/2, facts 4/4 (22536ms, 6 items, 1506 chars)

**Q:** What is our auth strategy?
- Base: topics 1/2, facts 0/5 (16298ms)
- CTT:  topics 1/2, facts 1/5 (15505ms, 2 items, 727 chars)

**Q:** How does pagination work in our API?
- Base: topics 1/2, facts 0/4 (32204ms)
- CTT:  topics 2/2, facts 3/4 (16970ms, 5 items, 1244 chars)

**Q:** What are the rate limits per tier?
- Base: topics 1/2, facts 0/5 (35175ms)
- CTT:  topics 0/2, facts 2/5 (5026ms, 1 items, 199 chars)

**Q:** How do we handle webhook deliveries?
- Base: topics 1/2, facts 0/4 (30302ms)
- CTT:  topics 2/2, facts 3/4 (18819ms, 3 items, 848 chars)

### @cf/meta/llama-2-7b-chat-fp16 — APIDesign

**Q:** How should we handle API errors?
- Base: topics 1/2, facts 0/4 (36840ms)
- CTT:  topics 2/2, facts 4/4 (28001ms, 6 items, 1506 chars)

**Q:** What is our auth strategy?
- Base: topics 0/2, facts 0/5 (13355ms)
- CTT:  topics 0/2, facts 2/5 (30005ms, 2 items, 727 chars)

**Q:** How does pagination work in our API?
- Base: topics 1/2, facts 0/4 (31557ms)
- CTT:  topics 2/2, facts 4/4 (25465ms, 5 items, 1244 chars)

**Q:** What are the rate limits per tier?
- Base: topics 0/2, facts 0/5 (32456ms)
- CTT:  topics 0/2, facts 0/5 (16493ms, 1 items, 199 chars)

**Q:** How do we handle webhook deliveries?
- Base: topics 0/2, facts 0/4 (33885ms)
- CTT:  topics 1/2, facts 3/4 (14225ms, 3 items, 848 chars)

### @cf/meta/llama-3.1-8b-instruct — CustomerSupport

**Q:** What is ACME Corp's subscription and who is their contact?
- Base: topics 2/2, facts 0/4 (1962ms)
- CTT:  topics 1/2, facts 4/4 (2691ms, 4 items, 643 chars)

**Q:** What is ACME's refund policy?
- Base: topics 2/2, facts 0/3 (4625ms)
- CTT:  topics 2/2, facts 1/3 (289ms, 5 items, 929 chars)

**Q:** ¿Cuál es el plan de TechLatam y su contacto?
- Base: topics 2/2, facts 1/4 (2855ms)
- CTT:  topics 2/2, facts 4/4 (3457ms, 4 items, 809 chars)

**Q:** What are the steps to process a refund?
- Base: topics 2/2, facts 1/5 (5660ms)
- CTT:  topics 2/2, facts 4/5 (1372ms, 3 items, 587 chars)

**Q:** What SLA guarantees do Enterprise customers get?
- Base: topics 2/2, facts 2/3 (4654ms)
- CTT:  topics 2/2, facts 3/3 (417ms, 6 items, 1423 chars)

### @cf/openai/gpt-oss-20b — CustomerSupport

**Q:** What is ACME Corp's subscription and who is their contact?
- Base: topics 1/2, facts 0/4 (1445ms)
- CTT:  topics 1/2, facts 2/4 (858ms, 4 items, 643 chars)

**Q:** What is ACME's refund policy?
- Base: topics 2/2, facts 0/3 (1477ms)
- CTT:  topics 2/2, facts 1/3 (847ms, 5 items, 929 chars)

**Q:** ¿Cuál es el plan de TechLatam y su contacto?
- Base: topics 2/2, facts 1/4 (8251ms)
- CTT:  topics 2/2, facts 3/4 (693ms, 4 items, 809 chars)

**Q:** What are the steps to process a refund?
- Base: topics 2/2, facts 1/5 (6898ms)
- CTT:  topics 2/2, facts 5/5 (3104ms, 3 items, 587 chars)

**Q:** What SLA guarantees do Enterprise customers get?
- Base: topics 2/2, facts 0/3 (1476ms)
- CTT:  topics 2/2, facts 1/3 (1282ms, 6 items, 1423 chars)

### @cf/zai-org/glm-4.7-flash — CustomerSupport

**Q:** What is ACME Corp's subscription and who is their contact?
- Base: topics 2/2, facts 0/4 (13588ms)
- CTT:  topics 1/2, facts 4/4 (2972ms, 4 items, 643 chars)

**Q:** What is ACME's refund policy?
- Base: topics 2/2, facts 0/3 (21481ms)
- CTT:  topics 2/2, facts 1/3 (5327ms, 5 items, 929 chars)

**Q:** ¿Cuál es el plan de TechLatam y su contacto?
- Base: topics 2/2, facts 1/4 (14219ms)
- CTT:  topics 2/2, facts 4/4 (3402ms, 4 items, 809 chars)

**Q:** What are the steps to process a refund?
- Base: topics 2/2, facts 0/5 (16897ms)
- CTT:  topics 2/2, facts 4/5 (3244ms, 3 items, 587 chars)

**Q:** What SLA guarantees do Enterprise customers get?
- Base: topics 2/2, facts 2/3 (15349ms)
- CTT:  topics 0/2, facts 0/3 (3096ms, 6 items, 1423 chars)

### @cf/ibm-granite/granite-4.0-h-micro — CustomerSupport

**Q:** What is ACME Corp's subscription and who is their contact?
- Base: topics 1/2, facts 0/4 (1941ms)
- CTT:  topics 1/2, facts 3/4 (1536ms, 4 items, 643 chars)

**Q:** What is ACME's refund policy?
- Base: topics 2/2, facts 0/3 (4611ms)
- CTT:  topics 2/2, facts 2/3 (1434ms, 5 items, 929 chars)

**Q:** ¿Cuál es el plan de TechLatam y su contacto?
- Base: topics 2/2, facts 1/4 (12043ms)
- CTT:  topics 2/2, facts 4/4 (1509ms, 4 items, 809 chars)

**Q:** What are the steps to process a refund?
- Base: topics 2/2, facts 0/5 (11039ms)
- CTT:  topics 2/2, facts 4/5 (10393ms, 3 items, 587 chars)

**Q:** What SLA guarantees do Enterprise customers get?
- Base: topics 2/2, facts 0/3 (16799ms)
- CTT:  topics 2/2, facts 3/3 (4624ms, 6 items, 1423 chars)

### @cf/qwen/qwen3-30b-a3b-fp8 — CustomerSupport

**Q:** What is ACME Corp's subscription and who is their contact?
- Base: topics 2/2, facts 0/4 (9417ms)
- CTT:  topics 2/2, facts 4/4 (4426ms, 4 items, 643 chars)

**Q:** What is ACME's refund policy?
- Base: topics 2/2, facts 0/3 (12037ms)
- CTT:  topics 2/2, facts 1/3 (5253ms, 5 items, 929 chars)

**Q:** ¿Cuál es el plan de TechLatam y su contacto?
- Base: topics 2/2, facts 1/4 (9037ms)
- CTT:  topics 2/2, facts 4/4 (4032ms, 4 items, 809 chars)

**Q:** What are the steps to process a refund?
- Base: topics 2/2, facts 2/5 (21463ms)
- CTT:  topics 2/2, facts 4/5 (7379ms, 3 items, 587 chars)

**Q:** What SLA guarantees do Enterprise customers get?
- Base: topics 2/2, facts 1/3 (27633ms)
- CTT:  topics 2/2, facts 3/3 (3016ms, 6 items, 1423 chars)

### @cf/meta/llama-2-7b-chat-int8 — CustomerSupport

**Q:** What is ACME Corp's subscription and who is their contact?
- Base: topics 2/2, facts 0/4 (6981ms)
- CTT:  topics 1/2, facts 3/4 (1606ms, 4 items, 643 chars)

**Q:** What is ACME's refund policy?
- Base: topics 0/2, facts 0/3 (1165ms)
- CTT:  topics 2/2, facts 1/3 (1940ms, 5 items, 929 chars)

**Q:** ¿Cuál es el plan de TechLatam y su contacto?
- Base: topics 2/2, facts 1/4 (12228ms)
- CTT:  topics 2/2, facts 4/4 (1404ms, 4 items, 809 chars)

**Q:** What are the steps to process a refund?
- Base: topics 2/2, facts 1/5 (11381ms)
- CTT:  topics 2/2, facts 4/5 (6086ms, 3 items, 587 chars)

**Q:** What SLA guarantees do Enterprise customers get?
- Base: topics 2/2, facts 0/3 (11831ms)
- CTT:  topics 1/2, facts 3/3 (1461ms, 6 items, 1423 chars)

### @cf/mistral/mistral-7b-instruct-v0.1 — CustomerSupport

**Q:** What is ACME Corp's subscription and who is their contact?
- Base: topics 2/2, facts 0/4 (11118ms)
- CTT:  topics 2/2, facts 3/4 (10093ms, 4 items, 643 chars)

**Q:** What is ACME's refund policy?
- Base: topics 2/2, facts 0/3 (14433ms)
- CTT:  topics 2/2, facts 1/3 (7013ms, 5 items, 929 chars)

**Q:** ¿Cuál es el plan de TechLatam y su contacto?
- Base: topics 2/2, facts 0/4 (20575ms)
- CTT:  topics 2/2, facts 4/4 (2605ms, 4 items, 809 chars)

**Q:** What are the steps to process a refund?
- Base: topics 2/2, facts 0/5 (17864ms)
- CTT:  topics 2/2, facts 5/5 (11867ms, 3 items, 587 chars)

**Q:** What SLA guarantees do Enterprise customers get?
- Base: topics 2/2, facts 1/3 (36505ms)
- CTT:  topics 2/2, facts 2/3 (2333ms, 6 items, 1423 chars)

### @cf/meta/llama-2-7b-chat-fp16 — CustomerSupport

**Q:** What is ACME Corp's subscription and who is their contact?
- Base: topics 2/2, facts 0/4 (28168ms)
- CTT:  topics 1/2, facts 4/4 (14655ms, 4 items, 643 chars)

**Q:** What is ACME's refund policy?
- Base: topics 2/2, facts 1/3 (28004ms)
- CTT:  topics 2/2, facts 1/3 (11180ms, 5 items, 929 chars)

**Q:** ¿Cuál es el plan de TechLatam y su contacto?
- Base: topics 2/2, facts 1/4 (45188ms)
- CTT:  topics 2/2, facts 4/4 (3000ms, 4 items, 809 chars)

**Q:** What are the steps to process a refund?
- Base: topics 2/2, facts 0/5 (32641ms)
- CTT:  topics 2/2, facts 4/5 (19240ms, 3 items, 587 chars)

**Q:** What SLA guarantees do Enterprise customers get?
- Base: topics 2/2, facts 1/3 (53349ms)
- CTT:  topics 2/2, facts 3/3 (8235ms, 6 items, 1423 chars)

---
*Generated by RepoMemory CTT Benchmark Framework*