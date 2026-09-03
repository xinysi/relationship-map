'use strict';
/* ================= 数据模型层 =================
   人物节点 / 关系边 结构定义见 PRD 第 10 章
   含：CRUD、撤销重做、筛选、关联溯源、搜索
------------------------------------------------ */
const GraphStore = {
  persons: [],
  relations: [],
  events: [],            // 时间线事件（PRD 二期·时间轴功能）
  pById: new Map(),
  rById: new Map(),

  selection: new Set(),      // 选中的人物 id 集合（支持批量框选）
  selectedEdgeId: null,

  // 多维度筛选条件（3.4.2）
  filter: { hiddenGroups: new Set(), hiddenTypes: new Set(), minStrength: 0 },
  // 关联溯源（3.4.3）：depth 0=关闭 1=一级 2=二级 999=全层级
  focus: { nodeId: null, depth: 0, ids: null },
  // 事件聚焦（点击时间轴事件 → 高亮关联人物）
  highlight: { ids: null, label: '' },
  // 人物固定聚焦（单击人物后持续显示其关联，再点击/ESC 恢复）
  pinnedId: null,
  // 搜索命中集合
  searchHits: new Set(),

  undoStack: [],
  redoStack: [],
  logEntries: [],
  dirty: false,
  projectName: '未命名工程',

  init() {
    this.persons = []; this.relations = []; this.events = [];
    this.pById = new Map(); this.rById = new Map();
    this.selection.clear(); this.selectedEdgeId = null;
    this.filter = { hiddenGroups: new Set(), hiddenTypes: new Set(), minStrength: 0 };
    this.focus = { nodeId: null, depth: 0, ids: null };
    this.highlight = { ids: null, label: '' };
    this.pinnedId = null;
    this.searchHits = new Set();
    this.undoStack = []; this.redoStack = [];
    this.logEntries = []; this.dirty = false;
    this.projectName = '未命名工程';
  },

  /* 清空画布内容但保留撤销栈（用于"替换导入"等场景，保证可撤销） */
  clearContent() {
    this.persons = []; this.relations = []; this.events = [];
    this.pById = new Map(); this.rById = new Map();
    this.selection.clear(); this.selectedEdgeId = null;
    this.filter = { hiddenGroups: new Set(), hiddenTypes: new Set(), minStrength: 0 };
    this.focus = { nodeId: null, depth: 0, ids: null };
    this.highlight = { ids: null, label: '' };
    this.pinnedId = null;
    this.searchHits.clear();
    this.dirty = true;
  },

  /* ---------- 撤销 / 重做（快照式，上限 50 步） ---------- */
  snapshot() {
    return {
      persons: JSON.parse(JSON.stringify(this.persons)),
      relations: JSON.parse(JSON.stringify(this.relations)),
      events: JSON.parse(JSON.stringify(this.events || [])),
      projectName: this.projectName
    };
  },
  pushUndo(label) {
    this.undoStack.push({ label: label || '操作', data: this.snapshot() });
    // 超大图时降低撤销深度，避免快照占用过多内存
    const maxDepth = (this.persons.length + this.relations.length) > 5000 ? 8 : 50;
    if (this.undoStack.length > maxDepth) this.undoStack.shift();
    this.redoStack.length = 0;
  },
  _restore(data) {
    this.persons = JSON.parse(JSON.stringify(data.persons));
    this.relations = JSON.parse(JSON.stringify(data.relations));
    this.events = JSON.parse(JSON.stringify(data.events || []));
    this.projectName = data.projectName || this.projectName;
    this.reindex();
    this.selection.clear(); this.selectedEdgeId = null;
    this.clearFocus(); this.clearHighlight(); this.searchHits.clear();
  },
  undo() {
    if (!this.undoStack.length) return false;
    const item = this.undoStack.pop();
    this.redoStack.push({ label: item.label, data: this.snapshot() });
    this._restore(item.data);
    this._markDirty();
    this.log('撤销：' + item.label);
    return true;
  },
  redo() {
    if (!this.redoStack.length) return false;
    const item = this.redoStack.pop();
    this.undoStack.push({ label: item.label, data: this.snapshot() });
    this._restore(item.data);
    this._markDirty();
    this.log('重做：' + item.label);
    return true;
  },

  /* ---------- 索引与查询 ---------- */
  reindex() {
    this.pById = new Map(); this.rById = new Map();
    for (const p of this.persons) this.pById.set(p.id, p);
    for (const r of this.relations) this.rById.set(r.id, r);
  },
  getPerson(id) { return this.pById.get(id) || null; },
  getRelation(id) { return this.rById.get(id) || null; },

  neighborsOf(id) {
    const out = [];
    for (const r of this.relations) {
      if (r.sourceId === id) out.push({ edge: r, other: this.pById.get(r.targetId) });
      else if (r.targetId === id) out.push({ edge: r, other: this.pById.get(r.sourceId) });
    }
    return out.filter(x => x.other);
  },

  /* ---------- 人物节点 CRUD ---------- */
  normalizePerson(data) {
    data = data || {};
    // 样式白名单 + 数值校验：防御项目/导入文件中的非法值（负半径会导致 canvas arc 抛异常，画布整体失效）
    const st = (data.style && typeof data.style === 'object' && !Array.isArray(data.style)) ? data.style : {};
    const size = Number(st.size), fontSize = Number(st.fontSize);
    const style = { shape: '', size: 0, fill: '', border: '', textColor: '', fontSize: 0 };
    if (/^(circle|rect)$/.test(String(st.shape || ''))) style.shape = String(st.shape);
    if (Number.isFinite(size) && size > 0) style.size = Math.min(size, 60);
    if (Number.isFinite(fontSize) && fontSize > 0) style.fontSize = Math.min(fontSize, 60);
    if (typeof st.fill === 'string') style.fill = st.fill.slice(0, 200);
    if (typeof st.border === 'string') style.border = st.border.slice(0, 200);
    if (typeof st.textColor === 'string') style.textColor = st.textColor.slice(0, 200);
    const nx = Number(data.x), ny = Number(data.y);
    const p = {
      id: String(data.id != null ? data.id : Utils.uid('P')),
      name: String(data.name || '未命名').trim() || '未命名',
      alias: String(data.alias || '').trim(),   // 英文名 / 别名 / 称号
      avatar: String(data.avatar || ''),
      intro: typeof data.intro === 'string' ? data.intro : String(data.intro || ''),
      tag: Array.isArray(data.tag) ? data.tag.slice() : Utils.parseTags(data.tag || ''),
      group: String(data.group || ''),
      gender: String(data.gender || ''),
      age: data.age != null ? String(data.age) : '',
      position: String(data.position || ''),
      x: Number.isFinite(nx) ? nx : 0,
      y: Number.isFinite(ny) ? ny : 0,
      style,
      isLock: !!data.isLock
    };
    return p;
  },
  addPerson(data, opts) {
    opts = opts || {};
    const p = this.normalizePerson(data);
    if (this.pById.has(p.id)) return null;
    this.persons.push(p); this.pById.set(p.id, p);
    if (!opts.silent) { this._markDirty(); this.emitChange(); }
    return p;
  },
  updatePerson(id, patch) {
    const p = this.pById.get(id);
    if (!p) return false;
    const allowed = ['name', 'alias', 'avatar', 'intro', 'tag', 'group', 'gender', 'age', 'position', 'x', 'y', 'style', 'isLock'];
    for (const k of allowed) if (k in patch) p[k] = patch[k];
    this._markDirty(); this.emitChange();
    return true;
  },
  /* 批量删除人物：一次过滤 + 一次重建索引 + 一次事件通知（PRD 11.2）
     单删除走同一路径，避免 O(k·(V+E)) 的连环重排 */
  removePersons(ids) {
    const set = new Set(ids || []);
    if (!set.size) return 0;
    let n = 0;
    this.persons = this.persons.filter(p => {
      if (set.has(p.id)) { n++; return false; }
      return true;
    });
    if (!n) return 0;
    // 同步清空所有关联关系（PRD 11.2）
    this.relations = this.relations.filter(r => !set.has(r.sourceId) && !set.has(r.targetId));
    this.reindex();
    for (const id of set) this.selection.delete(id);
    if (this.focus.nodeId && set.has(this.focus.nodeId)) this.focus = { nodeId: null, depth: 0, ids: null };
    this._markDirty(); this.emitChange();
    return n;
  },
  removePerson(id) {
    return this.removePersons([id]) > 0;
  },

  /* ---------- 关系边 CRUD ---------- */
  normalizeRelation(data) {
    data = data || {};
    const s = (data.style && typeof data.style === 'object' && !Array.isArray(data.style)) ? data.style : {};
    const nw = Number(s.width);
    return {
      id: String(data.id || Utils.uid('R')),
      sourceId: String(data.sourceId),
      targetId: String(data.targetId),
      relationType: String(data.relationType || '关联').trim() || '关联',
      desc: typeof data.desc === 'string' ? data.desc : String(data.desc || ''),
      strength: Utils.clamp(Math.round(Number(data.strength) || 0), 0, 10) || 0,
      time: String(data.time || ''),
      note: String(data.note || ''),
      style: {
        color: typeof s.color === 'string' ? s.color.slice(0, 200) : '',
        width: Number.isFinite(nw) && nw > 0 ? Math.min(nw, 20) : 0,
        dash: !!s.dash,
        arrow: !!s.arrow
      }
    };
  },
  addRelation(data, opts) {
    opts = opts || {};
    if (!this.pById.has(data.sourceId) || !this.pById.has(data.targetId)) return null;
    const r = this.normalizeRelation(data);
    this.relations.push(r); this.rById.set(r.id, r);
    if (!opts.silent) { this._markDirty(); this.emitChange(); }
    return r;
  },
  updateRelation(id, patch) {
    const r = this.rById.get(id);
    if (!r) return false;
    for (const k of ['sourceId', 'targetId', 'relationType', 'desc', 'strength', 'time', 'note', 'style']) {
      if (k in patch) r[k] = patch[k];
    }
    this._markDirty(); this.emitChange();
    return true;
  },
  removeRelation(id) {
    const i = this.relations.findIndex(r => r.id === id);
    if (i < 0) return false;
    this.relations.splice(i, 1);
    this.rById.delete(id);
    if (this.selectedEdgeId === id) this.selectedEdgeId = null;
    this._markDirty(); this.emitChange();
    return true;
  },

  /* ---------- 选中状态 ---------- */
  setSelection(ids, additive) {
    if (!additive) this.selection.clear();
    for (const id of ids || []) if (this.pById.has(id)) this.selection.add(id);
    this.emitChange();
  },
  toggleSelect(id) {
    if (this.selection.has(id)) this.selection.delete(id); else this.selection.add(id);
    this.emitChange();
  },
  clearSelection() {
    if (this.selection.size || this.selectedEdgeId) {
      this.selection.clear(); this.selectedEdgeId = null;
      this.emitChange();
    }
  },
  selectEdge(id) {
    this.selectedEdgeId = id;
    this.emitChange();
  },

  /* ---------- 搜索（姓名/别名/ID/标签/身份） ---------- */
  search(keyword) {
    this.searchHits.clear();
    const q = String(keyword || '').trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    for (const p of this.persons) {
      const hay = [p.name, p.alias, p.id, p.position, (p.tag || []).join(' ')].join(' ').toLowerCase();
      if (hay.includes(q)) { hits.push(p); this.searchHits.add(p.id); }
    }
    this.emitChange();
    return hits;
  },
  clearSearch() {
    if (this.searchHits.size) {
      this.searchHits.clear();
      this.emitChange();
    }
  },

  /* ---------- 筛选 ---------- */
  setFilter(patch) {
    if ('hiddenGroups' in patch) this.filter.hiddenGroups = patch.hiddenGroups;
    if ('hiddenTypes' in patch) this.filter.hiddenTypes = patch.hiddenTypes;
    if ('minStrength' in patch) this.filter.minStrength = patch.minStrength;
    this.emitChange();
  },
  clearFilter() {
    this.filter.hiddenGroups.clear(); this.filter.hiddenTypes.clear();
    this.filter.minStrength = 0;
    this.emitChange();
  },
  hasActiveFilter() {
    return this.filter.hiddenGroups.size > 0 || this.filter.hiddenTypes.size > 0 || this.filter.minStrength > 0;
  },
  isGroupHidden(g) { return g && this.filter.hiddenGroups.has(g); },
  isTypeHidden(t) { return t && this.filter.hiddenTypes.has(t); },

  isPersonVisible(p) {
    if (!p) return false;
    if (this.focus.depth > 0 && this.focus.ids && !this.focus.ids.has(p.id)) return false;
    if (this.isGroupHidden(p.group)) return false;
    return true;
  },
  isEdgeVisible(e) {
    const s = this.pById.get(e.sourceId), t = this.pById.get(e.targetId);
    if (!s || !t) return false;
    if (!this.isPersonVisible(s) || !this.isPersonVisible(t)) return false;
    if (this.isTypeHidden(e.relationType)) return false;
    if (this.filter.minStrength > 0 && (e.strength || 0) < this.filter.minStrength) return false;
    return true;
  },
  visiblePersons() { return this.persons.filter(p => this.isPersonVisible(p)); },
  visibleRelations() { return this.relations.filter(r => this.isEdgeVisible(r)); },

  /* ---------- 关联溯源 ---------- */
  focusOn(nodeId, depth) {
    const ids = new Set([nodeId]);
    if (depth > 0) {
      // BFS 逐层扩散
      let frontier = [nodeId];
      const visited = new Set([nodeId]);
      let d = 0;
      while (frontier.length && d < depth) {
        const next = [];
        for (const cur of frontier) {
          for (const nb of this.neighborsOf(cur)) {
            if (!visited.has(nb.other.id)) { visited.add(nb.other.id); next.push(nb.other.id); ids.add(nb.other.id); }
          }
        }
        frontier = next; d++;
        if (depth >= 999) { /* 全层级时由 visited 收敛自动停止 */ if (!next.length) break; }
      }
    }
    this.focus = { nodeId, depth, ids };
    this.emitChange();
  },
  clearFocus() {
    if (this.focus.depth > 0 || this.focus.nodeId) {
      this.focus = { nodeId: null, depth: 0, ids: null };
      this.emitChange();
    }
  },

  /* ---------- 时间线事件（PRD 二期·时间轴功能） ---------- */
  normalizeEvent(d) {
    return {
      id: d.id || Utils.uid('E'),
      title: String(d.title || '未命名事件').trim() || '未命名事件',
      time: String(d.time || '').trim(),
      order: Number(d.order) || 0,
      era: String(d.era || '').trim(),          // 时期 / 篇章（分组展示）
      desc: String(d.desc || '').trim(),
      persons: Array.isArray(d.persons) ? d.persons.map(n => String(n).trim()).filter(Boolean) : []
    };
  },
  addEvent(data, opts) {
    opts = opts || {};
    const e = this.normalizeEvent(data);
    this.events.push(e);
    if (!opts.silent) { this._markDirty(); this.emitChange(); }
    return e;
  },
  /* 按人物姓名解析事件关联的人物节点（含别名、·分段前缀匹配、直接 ID） */
  resolveEventPersons(e) {
    const ids = new Set();
    if (!e || !e.persons || !e.persons.length) return ids;
    for (const pname of e.persons) {
      const byId = this.pById.get(pname);
      if (byId) { ids.add(byId.id); continue; }
      const key = pname.toLowerCase();
      let hit = null;
      for (const p of this.persons) {
        if (p.name.toLowerCase() === key || (p.alias || '').toLowerCase() === key) { hit = p; break; }
      }
      if (!hit) {
        const seg = pname.split('·')[0];
        for (const p of this.persons) {
          const pseg = p.name.split('·')[0];
          if (pseg === seg || pseg === pname || p.name.includes(pname)) { hit = p; break; }
        }
      }
      if (hit) ids.add(hit.id);
    }
    return ids;
  },
  /* ---------- 人物固定聚焦：单击人物持续显示其关联，再点击/ESC 恢复 ---------- */
  setPinned(id) {
    this.pinnedId = id; // null = 恢复
    this.emitChange();
  },
  clearPinned() {
    if (this.pinnedId) { this.pinnedId = null; this.emitChange(); }
  },

  /* 事件聚焦：高亮关联人物，淡化其余（不改筛选） */
  setHighlight(ids, label) {
    this.highlight = { ids, label: label || '' };
    this.emitChange();
  },
  clearHighlight() {
    if (this.highlight.ids) {
      this.highlight = { ids: null, label: '' };
      this.emitChange();
    }
  },

  /* ---------- 统计 ---------- */
  groups() {
    const m = new Map();
    for (const p of this.persons) { const g = p.group || '未分组'; m.set(g, (m.get(g) || 0) + 1); }
    return m;
  },
  relTypes() {
    const m = new Map();
    for (const r of this.relations) { m.set(r.relationType, (m.get(r.relationType) || 0) + 1); }
    return m;
  },
  isEmpty() { return this.persons.length === 0; },

  /* ---------- 操作日志（4.3 安全性需求） ---------- */
  log(text) {
    this.logEntries.unshift({ t: Date.now(), text });
    if (this.logEntries.length > 300) this.logEntries.length = 300;
  },

  _markDirty() { this.dirty = true; },
  emitChange() { Utils.emitter.emit('graph:change'); }
};

/* 重命名工程 */
GraphStore.rename = function (name) {
  this.projectName = String(name || '未命名工程').trim() || '未命名工程';
  this.dirty = true;
  this.emitChange();
};
