'use strict';
/* ================= Canvas 渲染引擎 =================
   动态画布绘制 / 命中检测 / 高亮淡化 / 视口裁剪
   支持导出时复用同一套绘制逻辑（drawScene）
------------------------------------------------ */
const Renderer = {
  canvas: null, ctx: null, dpr: 1, w: 0, h: 0,
  view: { x: 0, y: 0, scale: 1 },
  theme: null,
  options: { nodeSize: 22, labelSize: 13, curvature: 0.12, showArrow: false, showEdgeLabels: false, edgeWidthMul: 1, colorByGroup: true },
  MIN_ZOOM: 0.3, MAX_ZOOM: 3, FIT_MIN: 0.04,

  /* 交互态（由 App 驱动） */
  hoverPersonId: null, hoverEdgeId: null,
  connectFromId: null, mouseWorld: { x: 0, y: 0 },
  boxRect: null, // {x0,y0,x1,y1} 屏幕坐标

  _avatarCache: new Map(), // id → {img, ok, src, tainted}
  _parallel: new Map(), _parallelDirty: true,
  _drawPending: false,

  THEMES: {
    light:    { name: '浅色主题', bg: '#f0f2f6', dot: '#dde3ec', nodeFill: '#ffffff', nodeBorder: '#3f7ef7', nodeText: '#2b3445', subText: '#7a8699', edge: '#b6c2d8', edgeText: '#4a5568', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#3f7ef7', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    dark:     { name: '深色主题', bg: '#10141c', dot: '#222b3a', nodeFill: '#1f2937', nodeBorder: '#5b8ff7', nodeText: '#e4e9f2', subText: '#8b96ab', edge: '#3d4b66', edgeText: '#aab6cc', edgeTextBg: 'rgba(23,30,44,.95)', primary: '#5b8ff7', search: '#f59f24', dimNode: 0.16, dimEdge: 0.08 },
    simple:   { name: '简约主题', bg: '#ffffff', dot: '#efefef', nodeFill: '#ffffff', nodeBorder: '#555555', nodeText: '#1f1f1f', subText: '#8a8a8a', edge: '#d0d0d0', edgeText: '#444', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#1f1f1f', search: '#e8890c', dimNode: 0.15, dimEdge: 0.06 },
    business: { name: '商务主题', bg: '#0d1a30', dot: '#1d3050', nodeFill: '#16294a', nodeBorder: '#c9a05a', nodeText: '#e8edf6', subText: '#93a5c4', edge: '#3a5378', edgeText: '#c9d4e8', edgeTextBg: 'rgba(15,26,48,.95)', primary: '#c9a05a', search: '#e0a63f', dimNode: 0.16, dimEdge: 0.08 },
    forest:   { name: '森语绿', bg: '#eef4ef', dot: '#cfe0d2', nodeFill: '#ffffff', nodeBorder: '#3aa76d', nodeText: '#2b3a2f', subText: '#748a7a', edge: '#b9cdbb', edgeText: '#4d6b56', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#3aa76d', search: '#e8961f', dimNode: 0.16, dimEdge: 0.07 },
    violet:   { name: '罗兰紫', bg: '#f4f1fa', dot: '#dcd2ee', nodeFill: '#ffffff', nodeBorder: '#8b5cf6', nodeText: '#352d45', subText: '#857ba0', edge: '#c3b7e2', edgeText: '#5f5480', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#8b5cf6', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    ocean:    { name: '深海蓝', bg: '#0a1a2b', dot: '#1d3a57', nodeFill: '#12283f', nodeBorder: '#4fa3d9', nodeText: '#dceaf5', subText: '#8aa7bd', edge: '#37597a', edgeText: '#a8c4dc', edgeTextBg: 'rgba(10,26,43,.95)', primary: '#4fa3d9', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 },
    sunset:   { name: '落日橙', bg: '#fdf3ea', dot: '#f2ddcc', nodeFill: '#ffffff', nodeBorder: '#e8823a', nodeText: '#4a3527', subText: '#9c7f66', edge: '#e8d3bd', edgeText: '#7d5c3e', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#e8823a', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    sakura:   { name: '樱绯粉', bg: '#fdf1f5', dot: '#f3d8e1', nodeFill: '#ffffff', nodeBorder: '#e06a8f', nodeText: '#4a2f3c', subText: '#a8838f', edge: '#ecc5d2', edgeText: '#8f5a6e', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#e06a8f', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    mint:     { name: '薄荷青', bg: '#eef7f5', dot: '#d3e9e4', nodeFill: '#ffffff', nodeBorder: '#14b8a6', nodeText: '#1f3a36', subText: '#6f8d87', edge: '#b3dcd5', edgeText: '#407b72', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#14b8a6', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    night:    { name: '星夜紫', bg: '#151022', dot: '#2a2244', nodeFill: '#241c3d', nodeBorder: '#a78bfa', nodeText: '#ece7f8', subText: '#9d92bd', edge: '#41365f', edgeText: '#c4bae4', edgeTextBg: 'rgba(21,16,34,.95)', primary: '#a78bfa', search: '#f59f24', dimNode: 0.16, dimEdge: 0.08 },
    gold:     { name: '鎏金黑', bg: '#17130c', dot: '#2a2214', nodeFill: '#221c11', nodeBorder: '#d4a94e', nodeText: '#f3ead8', subText: '#a89879', edge: '#4b3f2a', edgeText: '#d9c493', edgeTextBg: 'rgba(23,19,12,.95)', primary: '#d4a94e', search: '#e8961f', dimNode: 0.16, dimEdge: 0.08 },
    flame:    { name: '朱砂红', bg: '#fdf2f0', dot: '#f3d8d2', nodeFill: '#ffffff', nodeBorder: '#c94f4f', nodeText: '#442c2c', subText: '#9d807c', edge: '#e8c8c2', edgeText: '#8f514e', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#c94f4f', search: '#e8961f', dimNode: 0.16, dimEdge: 0.07 },
    pine:     { name: '松林墨', bg: '#0f1a14', dot: '#1f3a2c', nodeFill: '#16281e', nodeBorder: '#58a670', nodeText: '#e0efe4', subText: '#87a68f', edge: '#315242', edgeText: '#a8c8b0', edgeTextBg: 'rgba(15,26,20,.95)', primary: '#58a670', search: '#e8961f', dimNode: 0.16, dimEdge: 0.08 },
    graphite: { name: '石墨灰', bg: '#1a1c20', dot: '#2d3037', nodeFill: '#26282e', nodeBorder: '#9aa3b0', nodeText: '#e8eaee', subText: '#98a0ac', edge: '#3f444d', edgeText: '#b6bcc6', edgeTextBg: 'rgba(26,28,32,.95)', primary: '#9aa3b0', search: '#e8890c', dimNode: 0.16, dimEdge: 0.08 },
    sun:      { name: '蜂蜜黄', bg: '#fdf8e8', dot: '#f2e6c0', nodeFill: '#ffffff', nodeBorder: '#d9a716', nodeText: '#443a1e', subText: '#9c8c5e', edge: '#e8dab2', edgeText: '#7d6b38', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#d9a716', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    coffee:   { name: '暮山棕', bg: '#f6f1ea', dot: '#e4d8c8', nodeFill: '#ffffff', nodeBorder: '#8d6e63', nodeText: '#3d322b', subText: '#97897d', edge: '#dccfbd', edgeText: '#6d5a4c', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#8d6e63', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    wine:     { name: '勃艮第红', bg: '#1d0f13', dot: '#3a2028', nodeFill: '#2a171c', nodeBorder: '#c96a7a', nodeText: '#f2e3e6', subText: '#a98d92', edge: '#4d3039', edgeText: '#d3aab2', edgeTextBg: 'rgba(29,15,19,.95)', primary: '#c96a7a', search: '#f59f24', dimNode: 0.16, dimEdge: 0.08 },
    indigo:   { name: '靛蓝', bg: '#eef0fb', dot: '#d5daf2', nodeFill: '#ffffff', nodeBorder: '#4f46e5', nodeText: '#30324a', subText: '#7c81a8', edge: '#c0c6e8', edgeText: '#565b8a', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#4f46e5', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    lagoon:   { name: '碧波青', bg: '#07211f', dot: '#14403b', nodeFill: '#0d2f2c', nodeBorder: '#3ecbab', nodeText: '#dcefe9', subText: '#8ab5aa', edge: '#2a544e', edgeText: '#a9d5c9', edgeTextBg: 'rgba(7,33,31,.95)', primary: '#3ecbab', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 }
  },

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = this.THEMES.light;
    this.resize();
    Utils.emitter.on('graph:change', () => { this._parallelDirty = true; this._pruneAvatarCache(); this.requestDraw(); });
  },

  /* 人物删除后清理头像缓存，避免缓存无限增长 */
  _pruneAvatarCache() {
    if (this._avatarCache.size <= GraphStore.persons.length + 16) return;
    const alive = new Set(GraphStore.pById.keys());
    for (const id of this._avatarCache.keys()) if (!alive.has(id)) this._avatarCache.delete(id);
  },

  setThemeName(name) {
    this.theme = this.THEMES[name] || this.THEMES.light;
    this.requestDraw();
  },

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, Math.floor(rect.width));
    this.h = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.requestDraw();
  },

  /* ---------- 坐标换算 ---------- */
  screenToWorld(sx, sy) {
    return { x: (sx - this.view.x) / this.view.scale, y: (sy - this.view.y) / this.view.scale };
  },
  worldToScreen(wx, wy) {
    return { x: wx * this.view.scale + this.view.x, y: wy * this.view.scale + this.view.y };
  },

  clampZoom(scale) { return Utils.clamp(scale, this.MIN_ZOOM, this.MAX_ZOOM); },

  zoomAt(sx, sy, factor, absolute) {
    const ns = absolute ? Utils.clamp(factor, this.MIN_ZOOM, this.MAX_ZOOM) : this.clampZoom(this.view.scale * factor);
    // 以鼠标位置为中心缩放
    const wx = (sx - this.view.x) / this.view.scale, wy = (sy - this.view.y) / this.view.scale;
    this.view.scale = ns;
    this.view.x = sx - wx * ns;
    this.view.y = sy - wy * ns;
    this.requestDraw();
    Utils.emitter.emit('view:change');
  },

  resetView() {
    this.view = { x: this.w / 2, y: this.h / 2, scale: 1 };
    this.requestDraw();
    Utils.emitter.emit('view:change');
  },

  /* 自适应画布：所有节点全屏展示 */
  fitView(extra) {
    const persons = GraphStore.visiblePersons();
    if (!persons.length) { this.resetView(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of persons) {
      const r = this.nodeRadius(p) + 30;
      if (p.x - r < minX) minX = p.x - r; if (p.x + r > maxX) maxX = p.x + r;
      if (p.y - r < minY) minY = p.y - r; if (p.y + r > maxY) maxY = p.y + r;
    }
    const bw = Math.max(maxX - minX, 50), bh = Math.max(maxY - minY, 50);
    const scale = Utils.clamp(Math.min(this.w / bw, this.h / bh) * 0.92, this.FIT_MIN, this.MAX_ZOOM);
    this.view.scale = scale;
    this.view.x = this.w / 2 - (minX + maxX) / 2 * scale;
    this.view.y = this.h / 2 - (minY + maxY) / 2 * scale;
    this.requestDraw();
    Utils.emitter.emit('view:change');
  },

  /* 让某个节点居中聚焦 */
  centerOn(wx, wy) {
    this.view.x = this.w / 2 - wx * this.view.scale;
    this.view.y = this.h / 2 - wy * this.view.scale;
    this.requestDraw();
    Utils.emitter.emit('view:change');
  },

  requestDraw() {
    if (this._drawPending) return;
    this._drawPending = true;
    requestAnimationFrame(() => { this._drawPending = false; this.draw(); });
  },

  /* ---------- 拓扑缓存：平行边偏移索引 ---------- */
  invalidateTopology() { this._parallelDirty = true; },

  _buildParallel() {
    this._parallel = new Map();
    const seen = new Map(); // pairKey → 已出现的边列表
    for (const r of GraphStore.relations) {
      const key = r.sourceId < r.targetId ? r.sourceId + '|' + r.targetId : r.targetId + '|' + r.sourceId;
      const arr = seen.get(key) || [];
      arr.push(r.id);
      seen.set(key, arr);
    }
    for (const [key, arr] of seen) {
      arr.forEach((id, i) => this._parallel.set(id, { index: i, count: arr.length, selfLoop: false }));
    }
    for (const r of GraphStore.relations) {
      if (r.sourceId === r.targetId) {
        const m = this._parallel.get(r.id) || { index: 0, count: 1 };
        m.selfLoop = true;
        this._parallel.set(r.id, m);
      }
    }
    this._parallelDirty = false;
  },

  /* ---------- 节点尺寸 ---------- */
  nodeRadius(p) {
    return (p.style && p.style.size) ? p.style.size : this.options.nodeSize;
  },

  /* ---------- 头像加载 ---------- */
  ensureAvatar(p) {
    let c = this._avatarCache.get(p.id);
    if (c && c.src === p.avatar) return c;
    c = { img: null, ok: false, src: p.avatar || '', tainted: false };
    this._avatarCache.set(p.id, c);
    if (!p.avatar) return c;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { c.ok = true; this.requestDraw(); };
    img.onerror = () => {
      // CORS 失败时降级为不带 crossOrigin 加载（画布可能被污染，导出时特殊处理）
      if (img.crossOrigin) {
        const img2 = new Image();
        img2.onload = () => { c.img = img2; c.ok = true; c.tainted = true; this.requestDraw(); };
        img2.src = p.avatar;
      }
    };
    img.src = p.avatar;
    c.img = img;
    return c;
  },

  /* ---------- 高亮/淡化上下文 ---------- */
  _highlightCtx() {
    // 人物固定聚焦优先级最高（单击锁定后不被悬浮覆盖）
    if (GraphStore.pinnedId && GraphStore.getPerson(GraphStore.pinnedId)) {
      const related = new Set([GraphStore.pinnedId]);
      for (const nb of GraphStore.neighborsOf(GraphStore.pinnedId)) related.add(nb.other.id);
      const hotEdges = new Set();
      for (const r of GraphStore.relations) {
        if (r.sourceId === GraphStore.pinnedId || r.targetId === GraphStore.pinnedId) hotEdges.add(r.id);
      }
      return { dim: true, related, hotEdges, mode: 'pinned' };
    }
    if (this.hoverPersonId && GraphStore.getPerson(this.hoverPersonId)) {
      const related = new Set([this.hoverPersonId]);
      for (const nb of GraphStore.neighborsOf(this.hoverPersonId)) related.add(nb.other.id);
      const hotEdges = new Set();
      for (const r of GraphStore.relations) {
        if (r.sourceId === this.hoverPersonId || r.targetId === this.hoverPersonId) hotEdges.add(r.id);
      }
      return { dim: true, related, hotEdges, mode: 'hover' };
    }
    if (GraphStore.focus.depth > 0 && GraphStore.focus.ids) {
      return { dim: true, related: GraphStore.focus.ids, hotEdges: null, mode: 'focus' };
    }
    if (GraphStore.highlight.ids && GraphStore.highlight.ids.size) {
      // 事件聚焦：高亮关联人物及其之间的连线，淡化其余
      const related = GraphStore.highlight.ids;
      const hotEdges = new Set();
      for (const r of GraphStore.relations) {
        if (related.has(r.sourceId) && related.has(r.targetId)) hotEdges.add(r.id);
      }
      return { dim: true, related, hotEdges, mode: 'highlight' };
    }
    return { dim: false, related: null, hotEdges: null, mode: null };
  },

  /* ============================================================
     场景绘制（实时画布与导出共用）
     opts: { transparent, noAvatar, noCull, forExport }
     ============================================================ */
  drawScene(ctx, view, w, h, opts) {
    opts = opts || {};
    const th = this.theme;
    const scale = view.scale;
    // 导出时文字/线宽随倍率同步放大，避免导出图放大查看时文字发糊（屏幕渲染保持固定字号）
    const fs = opts.forExport ? scale : 1;

    // 背景
    if (!opts.transparent) {
      ctx.fillStyle = th.bg;
      ctx.fillRect(0, 0, w, h);
      // 点阵网格
      if (!opts.forExport && scale >= 0.4) {
        const step = 42 * scale;
        if (w / step < 160 && h / step < 160) {
          ctx.fillStyle = th.dot;
          const ox = ((view.x % step) + step) % step, oy = ((view.y % step) + step) % step;
          for (let x = ox; x < w; x += step) {
            for (let y = oy; y < h; y += step) ctx.fillRect(x - 0.5, y - 0.5, 1.5, 1.5);
          }
        }
      }
    }

    if (this._parallelDirty) this._buildParallel();
    const hl = opts.forExport ? { dim: false, related: null, hotEdges: null } : this._highlightCtx();

    const margin = 120;
    let vx0, vy0, vx1, vy1;
    if (opts.noCull) { vx0 = -Infinity; vy0 = -Infinity; vx1 = Infinity; vy1 = Infinity; }
    else {
      const tl = this.screenToWorldRect(view, 0, 0, w, h);
      vx0 = tl.x0 - margin; vy0 = tl.y0 - margin; vx1 = tl.x1 + margin; vy1 = tl.y1 + margin;
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    /* ----- 关系边（按颜色/粗细/虚实/透明度分桶批量描边，大规模数据性能优化） ----- */
    const visibleEdges = [];
    for (const r of GraphStore.relations) {
      if (!GraphStore.isEdgeVisible(r)) continue;
      const s = GraphStore.getPerson(r.sourceId), t = GraphStore.getPerson(r.targetId);
      if (!s || !t) continue;
      visibleEdges.push({ r, s, t });
    }

    const edgeLabelList = [];
    const buckets = new Map(); // styleKey → {strokeStyle, lineWidth, dash, alpha, path}
    for (const { r, s, t } of visibleEdges) {
      const meta = this._parallel.get(r.id) || { index: 0, count: 1, selfLoop: false };
      const isHot = !hl.hotEdges || hl.hotEdges.has(r.id);
      const isSelected = GraphStore.selectedEdgeId === r.id;
      const isHover = this.hoverEdgeId === r.id;
      const touchesSel = GraphStore.selection.has(r.sourceId) || GraphStore.selection.has(r.targetId);
      let alpha = 1;
      if (hl.dim && !isHot) alpha = th.dimEdge;

      const st = r.style || {};
      const color = st.color || Utils.colorForType(r.relationType);
      // 线宽响应平缓：接近旧版细线风格（强度9≈2.2px），同时保留强度差
      let width = (st.width > 0 ? st.width : (0.9 + (r.strength || 0) * 0.15)) * this.options.edgeWidthMul;
      if (fs !== 1) width *= fs; // 导出时线宽随倍率放大
      const dash = true; // 全部关系线绘制虚线（统一细虚线风格）
      const arrow = st.arrow || this.options.showArrow;
      const hot = isSelected || isHover || touchesSel;
      if (hot) width *= 1.45;
      const strokeStyle = (isSelected || isHover) ? th.primary : color;

      if (meta.selfLoop) {
        // 自环
        const ang = -Math.PI / 4;
        const rr = this.nodeRadius(s);
        const cx = s.x + Math.cos(ang) * rr * 1.9, cy = s.y + Math.sin(ang) * rr * 1.9;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = width;
        if (dash) ctx.setLineDash([6, 5]); else ctx.setLineDash([]);
        ctx.arc(cx * scale + view.x, cy * scale + view.y, rr * 0.9 * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // 平滑曲线（平行边相互错开）
        let x1 = s.x, y1 = s.y, x2 = t.x, y2 = t.y;
        const dx = x2 - x1, dy = y2 - y1;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = (meta.count === 1) ? this.options.curvature : ((meta.index - (meta.count - 1) / 2) * 0.34);
        const mx = (x1 + x2) / 2 - dy / d * off * d;
        const my = (y1 + y2) / 2 + dx / d * off * d;
        const X1 = x1 * scale + view.x, Y1 = y1 * scale + view.y;
        const CX = mx * scale + view.x, CY = my * scale + view.y;
        const X2 = x2 * scale + view.x, Y2 = y2 * scale + view.y;

        // 裁剪：线段包围盒
        if (!opts.noCull) {
          const bx0 = Math.min(X1, X2, CX) - 20, bx1 = Math.max(X1, X2, CX) + 20;
          const by0 = Math.min(Y1, Y2, CY) - 20, by1 = Math.max(Y1, Y2, CY) + 20;
          if (bx1 < 0 || bx0 > w || by1 < 0 || by0 > h) continue;
        }

        const key = strokeStyle + '|' + width.toFixed(1) + '|' + (dash ? 1 : 0) + '|' + alpha;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { strokeStyle, lineWidth: width, dash, alpha, path: new Path2D() };
          buckets.set(key, bucket);
        }
        bucket.path.moveTo(X1, Y1);
        bucket.path.quadraticCurveTo(CX, CY, X2, Y2);

        // 箭头
        if (arrow) {
          const ang = Math.atan2(Y2 - CY, X2 - CX);
          const tr = this.nodeRadius(t) * scale;
          const ax = X2 - Math.cos(ang) * (tr + 2), ay = Y2 - Math.sin(ang) * (tr + 2);
          const as = Math.max(7, width * 3);
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.fillStyle = strokeStyle;
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - Math.cos(ang - 0.42) * as, ay - Math.sin(ang - 0.42) * as);
          ctx.lineTo(ax - Math.cos(ang + 0.42) * as, ay - Math.sin(ang + 0.42) * as);
          ctx.closePath();
          ctx.fill();
        }

        // 边标签：悬浮 / 选中 / 全局开启。
        // 高亮聚焦模式（固定人物/悬浮/事件聚焦）只标注"属于当前人物"的关系边，
        // 避免开启全局标签时把淡化关系（非当前人物）的标签也显示出来
        let showLabel = isSelected || isHover;
        if (!showLabel) {
          if (hl.dim && hl.hotEdges) showLabel = hl.hotEdges.has(r.id); // pinned/hover/highlight：仅高亮边
          else if (this.options.showEdgeLabels && visibleEdges.length <= 400) showLabel = true; // 全局开启（溯源聚焦时可见边已属于聚焦图）
        }
        if (showLabel) {
          edgeLabelList.push({ text: r.relationType, x: (X1 + CX * 2 + X2) / 4, y: (Y1 + CY * 2 + Y2) / 4, color, selected: isSelected || isHover });
        }
      }
    }
    // 批量描边
    for (const b of buckets.values()) {
      ctx.globalAlpha = b.alpha;
      ctx.strokeStyle = b.strokeStyle;
      ctx.lineWidth = b.lineWidth;
      if (b.dash) ctx.setLineDash([7, 5]); else ctx.setLineDash([]);
      ctx.stroke(b.path);
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.font = (11 * fs) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const lb of edgeLabelList) {
      const tw = ctx.measureText(lb.text).width;
      ctx.fillStyle = th.edgeTextBg;
      ctx.beginPath();
      const pad = 4 * fs, hw = tw / 2 + pad, hh = 9 * fs;
      if (ctx.roundRect) ctx.roundRect(lb.x - hw, lb.y - hh, hw * 2, hh * 2, 4);
      else ctx.rect(lb.x - hw, lb.y - hh, hw * 2, hh * 2);
      ctx.fill();
      ctx.fillStyle = lb.selected ? th.primary : th.edgeText;
      ctx.fillText(lb.text, lb.x, lb.y + 0.5);
    }

    /* ----- 人物节点 ----- */
    const fontLabel = `${this.options.labelSize * fs}px "Microsoft YaHei", sans-serif`;
    // 大规模数据 + 低缩放时隐藏姓名标签，保证交互流畅（悬浮/选中仍显示）
    const hideLabels = !opts.forExport && scale < 0.6 && GraphStore.persons.length > 500;
    for (const p of GraphStore.persons) {
      if (!GraphStore.isPersonVisible(p)) continue;
      const X = p.x * scale + view.x, Y = p.y * scale + view.y;
      const r = this.nodeRadius(p) * scale;
      if (!opts.noCull && (X + r < -60 || X - r > w + 60 || Y + r < -60 || Y - r > h + 120)) continue;

      const isSelected = GraphStore.selection.has(p.id);
      const isHover = this.hoverPersonId === p.id;
      const isSearch = GraphStore.searchHits.has(p.id);
      const isHL = hl.mode === 'highlight' && hl.related.has(p.id);
      const dimmed = hl.dim && !hl.related.has(p.id);
      const alpha = dimmed ? th.dimNode : 1;
      ctx.globalAlpha = alpha;

      const st = p.style || {};
      const rWorld = this.nodeRadius(p);
      const borderColor = st.border || (this.options.colorByGroup && p.group ? Utils.colorForGroup(p.group) : th.nodeBorder);
      const fill = st.fill || th.nodeFill;

      // 选中 / 搜索 / 事件聚焦光圈
      if (isSelected) {
        ctx.beginPath();
        ctx.strokeStyle = th.primary;
        ctx.lineWidth = 2.5 * fs;
        ctx.arc(X, Y, r + 4.5 * fs, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.25;
        ctx.beginPath(); ctx.fillStyle = th.primary; ctx.arc(X, Y, r + 9 * fs, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha;
      } else if (isHL) {
        ctx.beginPath();
        ctx.strokeStyle = th.search;
        ctx.lineWidth = 2.5 * fs;
        ctx.arc(X, Y, r + 5.5 * fs, 0, Math.PI * 2);
        ctx.stroke();
      } else if (isSearch) {
        ctx.beginPath();
        ctx.strokeStyle = th.search;
        ctx.lineWidth = 2 * fs;
        ctx.setLineDash([4 * fs, 3 * fs]);
        ctx.arc(X, Y, r + 4.5 * fs, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 节点主体
      ctx.beginPath();
      if (st.shape === 'rect') {
        const rw = r * 1.7, rh = r * 1.3;
        if (ctx.roundRect) ctx.roundRect(X - rw / 2, Y - rh / 2, rw, rh, Math.min(10, r * 0.4));
        else ctx.rect(X - rw / 2, Y - rh / 2, rw, rh);
      } else {
        ctx.arc(X, Y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = fill;
      if (isHover || isSelected) { ctx.shadowColor = 'rgba(63,126,247,.45)'; ctx.shadowBlur = 12 * fs; }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = Math.max(1.5, rWorld * 0.09) * (isHover ? 1.4 : 1) * fs;
      ctx.stroke();

      // 头像或首字
      const av = opts.noAvatar ? null : this.ensureAvatar(p);
      if (av && av.ok && av.img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(X, Y, r - 1.5, 0, Math.PI * 2);
        ctx.clip();
        const iw = av.img.naturalWidth || av.img.width, ih = av.img.naturalHeight || av.img.height;
        if (iw && ih) {
          const s2 = Math.max((r * 2) / iw, (r * 2) / ih);
          ctx.drawImage(av.img, X - iw * s2 / 2, Y - ih * s2 / 2, iw * s2, ih * s2);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = borderColor;
        ctx.globalAlpha = alpha * 0.75;
        ctx.font = `600 ${Math.max(11, r * 0.75)}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((p.name || '?').charAt(0), X, Y + 1);
        ctx.globalAlpha = alpha;
      }

      // 锁定标记
      if (p.isLock) {
        ctx.font = (10 * fs) + 'px sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('🔒', X + r * 0.55, Y - r * 0.55);
      }

      // 姓名标签
      if (!hideLabels || isSelected || isHover || isSearch || isHL) {
        ctx.font = fontLabel;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = st.textColor || th.nodeText;
        ctx.fillText(p.name || '未命名', X, Y + r + 4);
      }
      ctx.globalAlpha = 1;
    }

    /* ----- 连接模式预览线 ----- */
    if (this.connectFromId && !opts.forExport) {
      const s = GraphStore.getPerson(this.connectFromId);
      if (s) {
        const X1 = s.x * scale + view.x, Y1 = s.y * scale + view.y;
        const X2 = this.mouseWorld.x * scale + view.x, Y2 = this.mouseWorld.y * scale + view.y;
        ctx.beginPath();
        ctx.strokeStyle = th.primary;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.moveTo(X1, Y1);
        ctx.lineTo(X2, Y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    /* ----- 框选矩形 ----- */
    if (this.boxRect && !opts.forExport) {
      const b = this.boxRect;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(63,126,247,.08)';
      ctx.strokeStyle = 'rgba(63,126,247,.7)';
      ctx.lineWidth = 1;
      ctx.rect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.fill(); ctx.stroke();
    }
  },

  screenToWorldRect(view, x0, y0, x1, y1) {
    return {
      x0: (x0 - view.x) / view.scale, y0: (y0 - view.y) / view.scale,
      x1: (x1 - view.x) / view.scale, y1: (y1 - view.y) / view.scale
    };
  },

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawScene(ctx, this.view, this.w, this.h, {});
  },

  /* ---------- 命中检测 ---------- */
  pickNode(sx, sy) {
    const wpt = this.screenToWorld(sx, sy);
    for (let i = GraphStore.persons.length - 1; i >= 0; i--) {
      const p = GraphStore.persons[i];
      if (!GraphStore.isPersonVisible(p)) continue;
      const r = this.nodeRadius(p) + 4 / this.view.scale;
      const dx = wpt.x - p.x, dy = wpt.y - p.y;
      if (dx * dx + dy * dy <= r * r) return p;
    }
    return null;
  },

  pickEdge(sx, sy) {
    if (this._parallelDirty) this._buildParallel();
    const wpt = this.screenToWorld(sx, sy);
    const threshold = 7 / this.view.scale;
    // 大数据量时降低贝塞尔采样密度，保证悬浮响应速度
    const steps = GraphStore.relations.length > 2000 ? 7 : 14;
    let best = null, bestD = threshold;
    for (const r of GraphStore.relations) {
      if (!GraphStore.isEdgeVisible(r)) continue;
      const s = GraphStore.getPerson(r.sourceId), t = GraphStore.getPerson(r.targetId);
      if (!s || !t) continue;
      const meta = this._parallel.get(r.id) || { index: 0, count: 1, selfLoop: false };
      let d = Infinity;
      if (meta.selfLoop) {
        const ang = -Math.PI / 4, rr = this.nodeRadius(s);
        const cx = s.x + Math.cos(ang) * rr * 1.9, cy = s.y + Math.sin(ang) * rr * 1.9;
        d = Math.abs(Math.sqrt((wpt.x - cx) ** 2 + (wpt.y - cy) ** 2) - rr * 0.9);
      } else {
        const dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = (meta.count === 1) ? this.options.curvature : ((meta.index - (meta.count - 1) / 2) * 0.34);
        const mx = (s.x + t.x) / 2 - dy / dist * off * dist;
        const my = (s.y + t.y) / 2 + dx / dist * off * dist;
        // 二次贝塞尔采样
        for (let i = 0; i <= steps; i++) {
          const tt = i / steps, u = 1 - tt;
          const px = u * u * s.x + 2 * u * tt * mx + tt * tt * t.x;
          const py = u * u * s.y + 2 * u * tt * my + tt * tt * t.y;
          const dd = Math.sqrt((wpt.x - px) ** 2 + (wpt.y - py) ** 2);
          if (dd < d) d = dd;
        }
      }
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  },

  /* 可见节点包围盒（导出用） */
  bboxOfVisible() {
    const persons = GraphStore.visiblePersons();
    if (!persons.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of persons) {
      const r = this.nodeRadius(p) + 26;
      if (p.x - r < minX) minX = p.x - r; if (p.x + r > maxX) maxX = p.x + r;
      if (p.y - r < minY) minY = p.y - r; if (p.y + r > maxY) maxY = p.y + r;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
};
