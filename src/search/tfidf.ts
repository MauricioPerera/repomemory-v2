import { tokenize } from './tokenizer.js';

interface DocEntry {
  id: string;
  tf: Map<string, number>;
  totalTerms: number;
}

export interface TfIdfSerializedDoc {
  id: string;
  tf: Record<string, number>;
  totalTerms: number;
}

export interface TfIdfSerialized {
  docs: TfIdfSerializedDoc[];
  df: Record<string, number>;
}

export class TfIdfIndex {
  private docs = new Map<string, DocEntry>();
  private df = new Map<string, number>();
  private dirty = true;
  private cachedIdf = new Map<string, number>();

  get size(): number {
    return this.docs.size;
  }

  addDocument(id: string, text: string): void {
    this.removeDocument(id);
    const tokens = tokenize(text);
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    this.docs.set(id, { id, tf, totalTerms: tokens.length });
    for (const term of tf.keys()) {
      this.df.set(term, (this.df.get(term) ?? 0) + 1);
    }
    this.dirty = true;
  }

  removeDocument(id: string): boolean {
    const existing = this.docs.get(id);
    if (!existing) return false;
    for (const term of existing.tf.keys()) {
      const count = this.df.get(term) ?? 1;
      if (count <= 1) {
        this.df.delete(term);
      } else {
        this.df.set(term, count - 1);
      }
    }
    this.docs.delete(id);
    this.dirty = true;
    return true;
  }

  search(query: string, limit = 10): Array<{ id: string; score: number }> {
    if (this.docs.size === 0) return [];
    if (this.dirty) this.recomputeIdf();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const results: Array<{ id: string; score: number }> = [];
    for (const [docId, doc] of this.docs) {
      let score = 0;
      for (const qt of queryTokens) {
        const tfVal = (doc.tf.get(qt) ?? 0) / (doc.totalTerms || 1);
        const idfVal = this.cachedIdf.get(qt) ?? 0;
        score += tfVal * idfVal;
      }
      if (score > 0) results.push({ id: docId, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private recomputeIdf(): void {
    const n = this.docs.size;
    this.cachedIdf.clear();
    for (const [term, docFreq] of this.df) {
      this.cachedIdf.set(term, Math.log(1 + n / (1 + docFreq)));
    }
    this.dirty = false;
  }

  serialize(): TfIdfSerialized {
    const docs: TfIdfSerializedDoc[] = [];
    for (const doc of this.docs.values()) {
      docs.push({
        id: doc.id,
        tf: Object.fromEntries(doc.tf),
        totalTerms: doc.totalTerms,
      });
    }
    return { docs, df: Object.fromEntries(this.df) };
  }

  static deserialize(data: TfIdfSerialized): TfIdfIndex {
    const index = new TfIdfIndex();
    index.df = new Map(Object.entries(data.df));
    for (const d of data.docs) {
      index.docs.set(d.id, {
        id: d.id,
        tf: new Map(Object.entries(d.tf)),
        totalTerms: d.totalTerms,
      });
    }
    // Pre-compute IDF from deserialized data instead of marking dirty
    index.recomputeIdf();
    return index;
  }
}
