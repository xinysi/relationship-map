'use strict';
/* ================= 社区发现（Louvain 模块度优化 · 单层多 pass） =================
   自动检测关系网中的"圈子/社区"（家族、阵营等聚类），
   供「自动分簇」布局与后续分析使用，不改动用户数据。
   复杂度 O(pass × E)，3000 节点 / 9000 边毫秒级。
------------------------------------------------ */
const Community = {

  /* detect(persons, relations) → Map(personId → communityId)
     社区编号按社区规模降序（0 = 最大社区），顺序稳定 */
  detect(persons, relations) {
    const n = persons.length;
    if (!n) return new Map();
    const idx = new Map();
    persons.forEach((p, i) => idx.set(p.id, i));
    const inv = persons.map(p => p.id);

    // ---- 无向加权边（平行边合并权重；权重 = 关系强度或 1）----
    const wMap = new Map();
    for (const r of relations) {
      const a = idx.get(r.sourceId), b = idx.get(r.targetId);
      if (a == null || b == null || a === b) continue;
      const key = a < b ? a + '|' + b : b + '|' + a;
      wMap.set(key, (wMap.get(key) || 0) + (r.strength || 1));
    }
    const adj = Array.from({ length: n }, () => new Map());
    const nodeWeight = new Float64Array(n);
    let m2 = 0;
    for (const [key, w] of wMap) {
      const [a, b] = key.split('|').map(Number);
      adj[a].set(b, (adj[a].get(b) || 0) + w);
      adj[b].set(a, (adj[b].get(a) || 0) + w);
      nodeWeight[a] += w; nodeWeight[b] += w;
      m2 += w * 2;
    }
    if (m2 <= 0) {
      // 无任何关系：每人自成社区（布局时等价于普通分簇）
      return new Map(persons.map(p => [p.id, 0]));
    }

    // ---- 局部移动（多 pass 至一致，模块度增量最大化）----
    let comm = new Array(n).fill(0).map((_, i) => i);
    const sigma = new Float64Array(n); // 各社区总权重
    for (let i = 0; i < n; i++) sigma[i] = nodeWeight[i];

    const order = new Array(n).fill(0).map((_, i) => i);
    let pass = 0, movedAny = true;
    while (movedAny && pass < 30) {
      movedAny = false; pass++;
      // 随机顺序遍历（打散扫描偏差）
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }
      for (const i of order) {
        const c0 = comm[i];
        const kI = nodeWeight[i];
        // 暂移出 i
        sigma[c0] -= kI;
        // 邻居社区入权重统计（同一邻居社区多条边求和）
        const kIn = new Map();
        for (const [nb, w] of adj[i]) {
          const c = comm[nb];
          kIn.set(c, (kIn.get(c) || 0) + w);
        }
        // ΔQ = Σtot(C)·kI/(2m) 之差：kIn(C) 越大、Σtot(C) 越小越有利
        let best = c0;
        let bestDq = (kIn.get(c0) || 0) - sigma[c0] * kI / m2;
        for (const [c, kin] of kIn) {
          if (c === c0) continue;
          const dq = kin - sigma[c] * kI / m2;
          if (dq > bestDq) { bestDq = dq; best = c; }
        }
        if (best !== c0) {
          comm[i] = best;
          movedAny = true;
        }
        sigma[best] += kI;
      }
    }

    // ---- 按社区规模降序重编号（0 = 最大社区）----
    const sizes = new Map();
    for (const c of comm) sizes.set(c, (sizes.get(c) || 0) + 1);
    const rank = [...sizes.entries()].sort((a, b) => b[1] - a[1]);
    const newId = new Map();
    rank.forEach(([c], k) => newId.set(c, k));

    const out = new Map();
    for (let i = 0; i < n; i++) out.set(inv[i], newId.get(comm[i]));
    return out;
  }
};
