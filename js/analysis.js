'use strict';
/* ================= 关系网高级分析 =================
   最短路径（无权 BFS）/ 度中心性 / 介数中心性（Brandes 算法）
   不修改画布数据，纯查询计算。
------------------------------------------------ */
const Analysis = {

  /* 邻接表（无自环、无重复）：返回 Map(id → [{other, edge}]) */
  _adjacency(persons, relations) {
    const adj = new Map(persons.map(p => [p.id, []]));
    for (const r of relations) {
      if (r.sourceId === r.targetId) continue;
      const a = adj.get(r.sourceId), b = adj.get(r.targetId);
      if (!a || !b) continue;
      a.push({ other: r.targetId, edge: r });
      b.push({ other: r.sourceId, edge: r });
    }
    return adj;
  },

  /* 最短路径（无权 BFS，返回 { ids:[from..to], edges:[关系…], dist } 或 null） */
  shortestPath(persons, relations, fromId, toId) {
    if (fromId === toId) return { ids: [fromId], edges: [], dist: 0 };
    const adj = this._adjacency(persons, relations);
    if (!adj.has(fromId) || !adj.has(toId)) return null;
    const prev = new Map(); // id → {from, edge}
    const queue = [fromId];
    const seen = new Set([fromId]);
    for (let q = 0; q < queue.length; q++) {
      const cur = queue[q];
      if (cur === toId) break;
      for (const nb of adj.get(cur)) {
        if (seen.has(nb.other)) continue;
        seen.add(nb.other);
        prev.set(nb.other, { from: cur, edge: nb.edge });
        queue.push(nb.other);
      }
    }
    if (!seen.has(toId)) return null;
    // 回溯路径
    const ids = [toId], edges = [];
    let cur = toId;
    while (cur !== fromId) {
      const p = prev.get(cur);
      edges.unshift(p.edge);
      ids.unshift(p.from);
      cur = p.from;
    }
    return { ids, edges, dist: edges.length };
  },

  /* 度中心性：Map(id → {deg, ratio})，ratio 相对最大度数（1 = 最多关系的人） */
  degrees(persons, relations) {
    const deg = new Map(persons.map(p => [p.id, 0]));
    for (const r of relations) {
      if (r.sourceId === r.targetId) continue;
      if (deg.has(r.sourceId)) deg.set(r.sourceId, deg.get(r.sourceId) + 1);
      if (deg.has(r.targetId)) deg.set(r.targetId, deg.get(r.targetId) + 1);
    }
    let max = 0;
    for (const v of deg.values()) if (v > max) max = v;
    const out = new Map();
    for (const [id, v] of deg) out.set(id, { deg: v, ratio: max ? v / max : 0 });
    return out;
  },

  /* 介数中心性（Brandes 无权算法）：返回按介数降序的数组 [{id, value, rank}] */
  betweenness(persons, relations) {
    const adj = this._adjacency(persons, relations);
    const nodes = persons.map(p => p.id);
    const n = nodes.length;
    const val = new Map(nodes.map(id => [id, 0]));
    for (const s of nodes) {
      const stack = [];
      const pred = new Map(nodes.map(id => [id, []]));
      const sigma = new Map(nodes.map(id => [id, 0]));
      const dist = new Map(nodes.map(id => [id, -1]));
      sigma.set(s, 1); dist.set(s, 0);
      const queue = [s];
      for (let q = 0; q < queue.length; q++) {
        const v = queue[q];
        stack.push(v);
        for (const nb of adj.get(v)) {
          const w = nb.other;
          if (dist.get(w) < 0) { dist.set(w, dist.get(v) + 1); queue.push(w); }
          if (dist.get(w) === dist.get(v) + 1) {
            sigma.set(w, sigma.get(w) + sigma.get(v));
            pred.get(w).push(v);
          }
        }
      }
      const delta = new Map(nodes.map(id => [id, 0]));
      while (stack.length) {
        const w = stack.pop();
        for (const v of pred.get(w)) {
          const c = (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w));
          delta.set(v, delta.get(v) + c);
        }
        if (w !== s) val.set(w, val.get(w) + delta.get(w));
      }
    }
    // 无向图介数 = 有向累积 / 2
    const out = [];
    for (const [id, v] of val) out.push({ id, value: v / 2 });
    out.sort((a, b) => b.value - a.value);
    out.forEach((x, i) => { x.rank = i + 1; });
    return out;
  },

  /* 核心人物榜单（介数排序，附度中心性）：前 limit 名 */
  topCentral(persons, relations, limit) {
    const degMap = this.degrees(persons, relations);
    const bc = this.betweenness(persons, relations);
    const list = bc.slice(0, limit || 10).map(x => ({
      id: x.id,
      value: x.value,
      rank: x.rank,
      deg: (degMap.get(x.id) || {}).deg || 0,
      ratio: (degMap.get(x.id) || {}).ratio || 0
    }));
    return list;
  },

  /* 桥梁判定：介数排名前 10% 且 > 0 */
  isBridge(entry, bcList) {
    if (!entry || entry.value <= 0) return false;
    const top10 = Math.ceil(bcList.length * 0.1);
    return entry.rank <= Math.max(1, top10);
  }
};
