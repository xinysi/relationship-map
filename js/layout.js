'use strict';
/* ================= 自动布局算法 =================
   PRD 3.1.4：环形 / 层级树状 / 力导向（默认）/ 网格
------------------------------------------------ */
const Layouts = {

  /* 对外入口：name ∈ force | circular | tree | grid | grouped | radial */
  async apply(name, onProgress) {
    const persons = GraphStore.persons;
    if (!persons.length) return;
    let fn;
    if (name === 'circular') fn = this.circular;
    else if (name === 'tree') fn = this.tree;
    else if (name === 'grid') fn = this.grid;
    else if (name === 'grouped') fn = this.grouped;
    else if (name === 'radial') fn = this.radial;
    else fn = this.force;
    await fn.call(this, persons, GraphStore.relations, onProgress || null);
    this._center(persons);
  },

  /* 把布局结果平移到世界坐标原点附近 */
  _center(persons) {
    if (!persons.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of persons) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    for (const p of persons) { if (!p.isLock) { p.x -= cx; p.y -= cy; } }
  },

  /* 网格近似排斥（Barnes-Hut 简化版）：把空间切成 2×理想间距 的网格，
     近邻 3×3 网格内精确计算（对称力），远处网格用质心近似（单向力）。
     将 O(n²) 排斥降到约 O(n·cells)，1500 节点以上提速 4-6 倍，布局形态基本一致 */
  _repulsionGrid(px, py, fx, fy, n, dist, k2) {
    const cell = Math.max(90, dist * 2);
    const CI = (v) => Math.floor(v / cell);
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      const cx = CI(px[i]), cy = CI(py[i]);
      const k = cx + ':' + cy;
      let g = grid.get(k);
      if (!g) { g = { cx, cy, pts: [] }; grid.set(k, g); }
      g.pts.push(i);
    }
    const words = [];      // 同 cell 质心（一次扫描）
    for (const g of grid.values()) {
      let sx = 0, sy = 0;
      for (const i of g.pts) { sx += px[i]; sy += py[i]; }
      g.sx = sx; g.sy = sy; g.n = g.pts.length;
      words.push({ cx: g.cx, cy: g.cy, n: g.n, sx: g.sx, sy: g.sy });
    }
    const cells = [...grid.values()];
    const R2 = k2 * 25, FMAX = dist * 0.06;

    for (let i = 0; i < n; i++) {
      const icx = CI(px[i]), icy = CI(py[i]);
      // ① 近邻 3×3 网格：精确对称力（j > i 去重）
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const g = grid.get((icx + a) + ':' + (icy + b));
          if (!g) continue;
          for (const j of g.pts) {
            if (j <= i) continue;
            let dx = px[i] - px[j], dy = py[i] - py[j];
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { dx = (Math.random() - 0.5) * 2; dy = (Math.random() - 0.5) * 2; d2 = 4; }
            if (d2 > R2) continue;
            const d = Math.sqrt(d2);
            let f = k2 / d2;
            if (f > FMAX) f = FMAX;
            const ux = dx / d * f, uy = dy / d * f;
            fx[i] += ux; fy[i] += uy;
            fx[j] -= ux; fy[j] -= uy;
          }
        }
      }
      // ② 远处网格：质心近似（该群 n 个点的合力）
      for (const g of cells) {
        if (Math.abs(g.cx - icx) <= 1 && Math.abs(g.cy - icy) <= 1) continue;
        const mx = g.sx / g.n, my = g.sy / g.n;
        let dx = px[i] - mx, dy = py[i] - my;
        let d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        if (d2 < 1) { dx = (Math.random() - 0.5) * 2; dy = (Math.random() - 0.5) * 2; d2 = 4; }
        const d = Math.sqrt(d2);
        let f = k2 / d2 * g.n;
        if (f > FMAX * g.n) f = FMAX * g.n;
        fx[i] += dx / d * f; fy[i] += dy / d * f;
      }
    }
  },

  /* ---------- 力导向布局（默认）：节点排斥 + 关系线自适应拉伸 ----------
     Web Worker（Blob URL）优先计算，file:// 或 Worker 不可用时自动降级主线程算法 */
  async force(persons, relations, onProgress) {
    const n = persons.length;
    if (!n) return;
    try {
      if (await this._forceViaWorker(persons, relations, onProgress || null)) return;
    } catch (e) { /* 降级到主线程 */ }
    await this._forceMain(persons, relations, onProgress || null);
  },

  /* 初始化布局状态：p/lock 与初始位置（旧位置优先，否则环形随机撒点） */
  _forceInit(persons) {
    const n = persons.length;
    const px = new Float64Array(n), py = new Float64Array(n);
    const locked = new Uint8Array(n);
    let hasOldPos = false;
    for (let i = 0; i < n; i++) {
      const p = persons[i];
      locked[i] = p.isLock ? 1 : 0;
      if (p.x || p.y) { hasOldPos = true; px[i] = p.x; py[i] = p.y; }
    }
    if (!hasOldPos) {
      // 无初始位置：随机撒点在一个圆环上，加快收敛
      const r0 = Math.max(260, Math.sqrt(n) * 34);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
        px[i] = Math.cos(a) * r0 * (0.6 + Math.random() * 0.5);
        py[i] = Math.sin(a) * r0 * (0.6 + Math.random() * 0.5);
      }
    }
    return { px, py, locked };
  },

  /* 关系边预解码为 [a, b, strength] 索引三元组，避免 tick 内反复 Map 查找 */
  _decodeEdges(persons, relations) {
    const idx = new Map();
    persons.forEach((p, i) => idx.set(p.id, i));
    const edges = [];
    for (const r of relations) {
      const a = idx.get(r.sourceId), b = idx.get(r.targetId);
      if (a != null && b != null && a !== b) edges.push([a, b, r.strength || 5]);
    }
    return edges;
  },

  /* 精确排斥（小图分支，主线程与 Worker 共用同一实现） */
  _repulsionExact(px, py, fx, fy, n, dist, k2) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = px[i] - px[j], dy = py[i] - py[j];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (Math.random() - 0.5) * 2; dy = (Math.random() - 0.5) * 2; d2 = 4; }
        if (d2 > k2 * 25) continue; // 距离过远时忽略，控制计算量
        const d = Math.sqrt(d2);
        let f = k2 / d2;
        if (f > dist * 0.06) f = dist * 0.06;
        const ux = dx / d * f, uy = dy / d * f;
        fx[i] += ux; fy[i] += uy;
        fx[j] -= ux; fy[j] -= uy;
      }
    }
  },

  /* 力导向单 tick 计算（纯函数）：排斥 + 弹簧 + 向心力/积分，返回动能用于收敛判断 */
  _forceTick(px, py, vx, vy, locked, edges, n, dist, k2, repulsion, alpha) {
    const fx = new Float64Array(n), fy = new Float64Array(n);
    repulsion(px, py, fx, fy, n, dist, k2);

    // 关系边弹簧引力：强度越高距离越近
    for (const e of edges) {
      const a = e[0], b = e[1];
      const dx = px[b] - px[a], dy = py[b] - py[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const rest = dist * (1.5 - 0.07 * e[2]);
      const f = (d - rest) * 0.02;
      const ux = dx / d * f, uy = dy / d * f;
      fx[a] += ux; fy[a] += uy;
      fx[b] -= ux; fy[b] -= uy;
    }

    // 向心力 + 积分
    let energy = 0;
    for (let i = 0; i < n; i++) {
      fx[i] -= px[i] * 0.012; fy[i] -= py[i] * 0.012;
      vx[i] = (vx[i] + fx[i] * alpha) * 0.82;
      vy[i] = (vy[i] + fy[i] * alpha) * 0.82;
      const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      if (sp > dist * 0.4) { vx[i] *= dist * 0.4 / sp; vy[i] *= dist * 0.4 / sp; }
      energy += vx[i] * vx[i] + vy[i] * vy[i];
      if (!locked[i]) { px[i] += vx[i]; py[i] += vy[i]; }
    }
    return energy;
  },

  /* 主线程力导向（降级路径，与原算法逐参数一致，分帧执行避免卡顿） */
  async _forceMain(persons, relations, onProgress) {
    const n = persons.length;
    const { px, py, locked } = this._forceInit(persons);
    const vx = new Float64Array(n), vy = new Float64Array(n);
    const edges = this._decodeEdges(persons, relations);
    const dist = Utils.clamp(2400 / Math.sqrt(n), 110, 300); // 理想间距
    const k2 = dist * dist;
    const maxTicks = n > 600 ? 220 : (n > 200 ? 280 : 340);
    const repulsion = (px2, py2, fx, fy, n2, d, k) => {
      if (n2 > 240) this._repulsionGrid(px2, py2, fx, fy, n2, d, k);
      else this._repulsionExact(px2, py2, fx, fy, n2, d, k);
    };
    let alpha = 1;
    for (let tick = 0; tick < maxTicks; tick++) {
      const energy = this._forceTick(px, py, vx, vy, locked, edges, n, dist, k2, repulsion, alpha);
      alpha *= 0.982;
      if (energy / n < 0.04 && tick > 60) break; // 0.02→0.04：收敛末期视觉差异极小，可省 20%+ tick
      if (tick % 4 === 0) {
        if (onProgress) onProgress(tick / maxTicks);
        await Utils.nextFrame(); // 分帧计算，避免界面卡顿
      }
    }
    for (let i = 0; i < n; i++) { persons[i].x = px[i]; persons[i].y = py[i]; }
    if (onProgress) onProgress(1);
  },

  /* Worker 源码：字符串化共用纯函数（_forceTick/_repulsionGrid/_repulsionExact），
     主线程与 Worker 运行同一套计算逻辑，避免实现漂移 */
  _forceWorkerCode() {
    const b64 = (fn) => fn.toString();
    const tick = b64(this._forceTick).replace(/^_forceTick\s*\(/, 'function forceTick(');
    const grid = b64(this._repulsionGrid).replace(/^_repulsionGrid\s*\(/, 'function repulsionGrid(');
    const exact = b64(this._repulsionExact).replace(/^_repulsionExact\s*\(/, 'function repulsionExact(');
    return `${tick}
${grid}
${exact}
function run(data) {
  const n = data.n, px = data.px, py = data.py;
  const vx = new Float64Array(n), vy = new Float64Array(n);
  const locked = data.locked, edges = data.edges;
  const dist = data.dist, k2 = data.k2, maxTicks = data.maxTicks;
  const repulsion = function (px2, py2, fx, fy, n2, d, k) {
    if (n2 > 240) repulsionGrid(px2, py2, fx, fy, n2, d, k);
    else repulsionExact(px2, py2, fx, fy, n2, d, k);
  };
  let alpha = 1;
  for (let tick = 0; tick < maxTicks; tick++) {
    const energy = forceTick(px, py, vx, vy, locked, edges, n, dist, k2, repulsion, alpha);
    alpha *= 0.982;
    if (energy / n < 0.04 && tick > 60) break;
    if (tick % 8 === 0) postMessage({ type: 'progress', t: tick / maxTicks });
  }
  const out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) { out[i * 2] = px[i]; out[i * 2 + 1] = py[i]; }
  postMessage({ type: 'done', positions: out }, [out.buffer]);
}
onmessage = function (ev) { run(ev.data); };
`;
  },

  /* Worker 计算路径：ArrayBuffer 零拷贝传输；任何失败返回 false 由上层降级 */
  async _forceViaWorker(persons, relations, onProgress) {
    const n = persons.length;
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return false;
    let worker = null;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([this._forceWorkerCode()], { type: 'application/javascript' })));
    } catch (e) { return false; }

    const { px, py, locked } = this._forceInit(persons);
    const edges = this._decodeEdges(persons, relations);
    const dist = Utils.clamp(2400 / Math.sqrt(n), 110, 300);
    const k2 = dist * dist;
    const maxTicks = n > 600 ? 220 : (n > 200 ? 280 : 340);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { worker.terminate(); } catch (e) { /* ignore */ }
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 120000); // 兜底：worker 无响应则降级
      worker.onerror = () => finish(false);
      worker.onmessage = (ev) => {
        const d = ev.data;
        if (d.type === 'progress') { if (onProgress) onProgress(d.t); return; }
        if (d.type === 'done') {
          const out = d.positions;
          for (let i = 0; i < n; i++) { persons[i].x = out[i * 2]; persons[i].y = out[i * 2 + 1]; }
          if (onProgress) onProgress(1);
          Layouts._forceViaWorkerCount = (Layouts._forceViaWorkerCount || 0) + 1; // 诊断计数
          finish(true);
        }
      };
      worker.postMessage({ type: 'start', n, px, py, locked, edges, dist, k2, maxTicks }, [px.buffer, py.buffer, locked.buffer]);
    });
  },

  /* ---------- 环形布局：按分组排序后依次上环 ---------- */
  async circular(persons) {
    const n = persons.length;
    if (!n) return;
    const sorted = persons.slice().sort((a, b) =>
      (a.group || '').localeCompare(b.group || '', 'zh') || a.name.localeCompare(b.name, 'zh'));
    const movable = sorted.filter(p => !p.isLock);
    // 半径 = 首圈内圈（保证周长）→ 每环数量按周长自适应（环上间距约 46px），
    // 避免固定 48/环导致节点重叠或环数过多
    const r0 = Utils.clamp(movable.length * 2.2, 260, 560);
    const perRing = Math.max(24, Math.floor((Math.PI * 2 * r0) / 46));
    for (let i = 0; i < movable.length; i++) {
      const ring = Math.floor(i / perRing);
      const inRing = i % perRing;
      const count = Math.min(perRing, movable.length - ring * perRing);
      const r = r0 + ring * 135;
      const a = (inRing / count) * Math.PI * 2 - Math.PI / 2;
      movable[i].x = Math.cos(a) * r;
      movable[i].y = Math.sin(a) * r;
    }
    await Utils.nextFrame();
  },

  /* ---------- 层级树状布局：BFS 分层 + 叶子宽度均摊 ---------- */
  async tree(persons, relations) {
    const n = persons.length;
    if (!n) return;
    const adj = new Map();
    persons.forEach(p => adj.set(p.id, []));
    for (const r of relations) {
      if (adj.has(r.sourceId) && adj.has(r.targetId) && r.sourceId !== r.targetId) {
        adj.get(r.sourceId).push(r.targetId);
        adj.get(r.targetId).push(r.sourceId);
      }
    }
    // 根节点：优先选入度（作为 target 出现）为 0 的节点，否则选度数最高者
    const asTarget = new Set();
    for (const r of relations) if (adj.has(r.sourceId) && adj.has(r.targetId)) asTarget.add(r.targetId);
    let roots = persons.filter(p => !asTarget.has(p.id)).map(p => p.id);
    if (!roots.length) {
      let best = persons[0], bestDeg = -1;
      for (const p of persons) { const deg = adj.get(p.id).length; if (deg > bestDeg) { bestDeg = deg; best = p; } }
      roots = [best.id];
    }

    const depth = new Map();
    const parent = new Map();
    const queue = [];
    for (const rid of roots) { depth.set(rid, 0); parent.set(rid, null); queue.push(rid); }
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      for (const nb of adj.get(cur)) {
        if (!depth.has(nb)) { depth.set(nb, depth.get(cur) + 1); parent.set(nb, cur); queue.push(nb); }
      }
    }

    // 未连通节点也作为独立根
    for (const p of persons) if (!depth.has(p.id)) { depth.set(p.id, 0); parent.set(p.id, null); roots.push(p.id); }

    // 按父子关系建树（每个节点只挂一次）
    const children = new Map();
    persons.forEach(p => children.set(p.id, []));
    for (const p of persons) {
      const par = parent.get(p.id);
      if (par) children.get(par).push(p.id);
    }

    // 后序遍历计算子树叶子宽度（显式栈迭代，防深链图递归爆栈）
    const leafCount = new Map();
    const postOrder = [];
    for (const rid of roots) {
      const st = [rid];
      while (st.length) {
        const id = st.pop();
        postOrder.push(id);
        const ch = children.get(id);
        for (let ki = ch.length - 1; ki >= 0; ki--) st.push(ch[ki]);
      }
    }
    for (let i = postOrder.length - 1; i >= 0; i--) {
      const id = postOrder[i];
      const ch = children.get(id);
      if (!ch.length) leafCount.set(id, 1);
      else leafCount.set(id, ch.reduce((s, c) => s + (leafCount.get(c) || 1), 0));
    }
    // 宽高自适应：叶子多时压缩横向间距，深度大时压缩纵向间距，避免超宽/超高图
    const totalLeaf = roots.reduce((s, r) => s + (leafCount.get(r) || 1), 0);
    const LEAF_SP = Math.max(12, Math.min(110, Math.floor(15000 / Math.max(1, totalLeaf))));
    let maxDepth = 0;
    for (const d of depth.values()) if (d > maxDepth) maxDepth = d;
    const yGap = Utils.clamp(9000 / (maxDepth + 1), 14, 170);
    const leafW = new Map();
    for (const id of leafCount.keys()) leafW.set(id, leafCount.get(id) * LEAF_SP);

    // 前序遍历分配坐标（迭代：子节点逆序入栈，正序出栈）
    const placeStack = [];
    let cur = 0;
    {
      let totalW = 0;
      for (const rid of roots) totalW += (leafW.get(rid) || LEAF_SP);
      cur = -totalW / 2;
      for (const rid of roots) {
        const w = leafW.get(rid) || LEAF_SP;
        placeStack.push({ id: rid, x0: cur, x1: cur + w, level: 0 });
        cur += w;
      }
    }
    while (placeStack.length) {
      const { id, x0, x1, level } = placeStack.pop();
      const p = GraphStore.getPerson(id);
      if (!p) continue;
      const w = leafW.get(id) || LEAF_SP;
      const ch = children.get(id);
      const cx = ch.length ? (x0 + x1) / 2 : x0 + w / 2;
      if (!p.isLock) { p.x = cx; p.y = level * yGap; }
      let cCur = x0;
      for (let ki = ch.length - 1; ki >= 0; ki--) {
        const c = ch[ki];
        const cw = leafW.get(c) || LEAF_SP;
        placeStack.push({ id: c, x0: cCur, x1: cCur + cw, level: level + 1 });
        cCur += cw;
      }
    }
    await Utils.nextFrame();
  },

  /* ---------- 网格布局 ---------- */
  async grid(persons) {
    const n = persons.length;
    if (!n) return;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const sp = 130;
    let i = 0;
    for (const p of persons) {
      if (p.isLock) { i++; continue; }
      const c = i % cols, r = Math.floor(i / cols);
      p.x = (c - (cols - 1) / 2) * sp;
      p.y = (r - (rows - 1) / 2) * sp;
      i++;
    }
    await Utils.nextFrame();
  },

  /* ---------- 分簇布局：按归属分组聚簇，簇心沿圆周分布（分组明显/人物多的图更易读） ---------- */
  async grouped(persons) {
    const movable = persons.filter(p => !p.isLock);
    if (!movable.length) return;
    const groups = new Map();
    for (const p of movable) {
      const g = p.group || '未分组';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    const keys = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
    const sp = 52;          // 簇内节点间距
    const disc = [];        // 圆盘栅格（同心圆圈）
    let ring = 0;
    while (disc.length < movable.length) {
      const cap = ring === 0 ? 1 : Math.max(1, Math.floor(2 * Math.PI * ring));
      for (let j = 0; j < cap && disc.length < movable.length; j++) {
        const a = (j / cap) * Math.PI * 2 - Math.PI / 2;
        disc.push({ x: Math.cos(a) * ring * sp, y: Math.sin(a) * ring * sp });
      }
      ring++;
    }
    // 簇内半径 / 簇心圆周半径（周长容纳各簇直径 + 间隙）
    const innerR = new Map();
    for (const g of keys) innerR.set(g, 60 + Math.ceil(Math.sqrt(groups.get(g).length) / 0.8) * sp * 0.55);
    const maxR = Math.max(...keys.map(g => innerR.get(g)));
    const arcSlot = Math.max(180, maxR * 2 + 110);
    const ringR = keys.length <= 1 ? 0 : Math.max(340, Math.ceil((keys.length * arcSlot) / (Math.PI * 2)));
    // 按人数占比分配扇区弧长，簇心落在扇区中点，簇内按圆盘栅格排布
    let ang = -Math.PI / 2;
    let di = 0;
    for (const g of keys) {
      const cnt = groups.get(g).length;
      const arc = (cnt / movable.length) * Math.PI * 2;
      const cx = ringR * Math.cos(ang + arc / 2), cy = ringR * Math.sin(ang + arc / 2);
      for (const p of groups.get(g)) {
        const o = disc[di++];
        p.x = cx + o.x; p.y = cy + o.y;
      }
      ang += arc;
    }
    await Utils.nextFrame();
  },

  /* ---------- 放射状布局：以最高度节点为中心，BFS 分层同心圆（主角/核心人物为中心时直观） ---------- */
  async radial(persons, relations) {
    const n = persons.length;
    if (!n) return;
    const adj = new Map();
    persons.forEach(p => adj.set(p.id, []));
    for (const r of relations) {
      if (adj.has(r.sourceId) && adj.has(r.targetId) && r.sourceId !== r.targetId) {
        adj.get(r.sourceId).push(r.targetId);
        adj.get(r.targetId).push(r.sourceId);
      }
    }
    // 中心：度数最高者（含孤点时第一个）
    let center = persons[0].id, bestDeg = -1;
    for (const p of persons) { const deg = adj.get(p.id).length; if (deg > bestDeg) { bestDeg = deg; center = p.id; } }
    // BFS 分层
    const depth = new Map([[center, 0]]);
    const queue = [center];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      for (const nb of adj.get(cur)) {
        if (!depth.has(nb)) { depth.set(nb, depth.get(cur) + 1); queue.push(nb); }
      }
    }
    // 未连通节点放最外圈
    let far = Math.max(...depth.values()) + 2;
    const byLevel = new Map();
    for (const p of persons) {
      const d = depth.has(p.id) ? depth.get(p.id) : far;
      if (!byLevel.has(d)) byLevel.set(d, []);
      byLevel.get(d).push(p.id);
    }
    // 半径自适应：总直径控制在 ~12000 内
    const maxD = Math.max(...byLevel.keys());
    const gap = Utils.clamp(6000 / Math.max(1, maxD), 40, 170);
    for (const [d, ids] of byLevel) {
      for (let i = 0; i < ids.length; i++) {
        const p = GraphStore.getPerson(ids[i]);
        if (!p) continue;
        const a = ids.length === 1 ? 0 : (i / ids.length) * Math.PI * 2 - Math.PI / 2;
        const r = d * gap;
        if (!p.isLock) { p.x = Math.cos(a) * r; p.y = Math.sin(a) * r; }
      }
    }
    await Utils.nextFrame();
  }
};
