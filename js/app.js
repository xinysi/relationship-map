'use strict';
/* ================= 应用主控制层 =================
   界面交互 / 画布操作 / 弹窗系统 / 工程管理 / 快捷键
------------------------------------------------ */
const App = {
  currentProjectId: null,
  currentTheme: 'light',
  boxSelectMode: false,
  connectMode: false,
  connectFirst: null,
  pathModeFrom: null,
  _autosaveTimer: null,
  _saving: false,

  /* ============================================================
     启动
     ============================================================ */
  async boot() {
    await ProjectStore.init();
    const settings = ProjectStore.loadSettings();
    this.currentTheme = settings.theme || 'light';

    Renderer.init(document.getElementById('canvas'));
    Renderer.setThemeName(this.currentTheme);
    document.body.dataset.theme = this.currentTheme;

    this.bindUI();
    this.bindCanvas();
    this.bindShortcuts();
    this.bindStoreEvents();

    this.applyAutosave();
    this.updateAll();

    // 异常退出恢复（PRD 13.2）
    const last = ProjectStore.getLastSession();
    if (last && last.id) {
      const proj = await ProjectStore.getProject(last.id);
      if (proj && proj.data) {
        const ok = await this.confirm({
          title: '恢复工程', message: `检测到上次未正常关闭的工程《${proj.name}》，是否恢复？`,
          okText: '恢复', cancelText: '新建空白工程'
        });
        if (ok) { this.loadProjectById(last.id); return; }
      }
    }
    if (!settings.guideShown) this.showGuide();
  },

  bindStoreEvents() {
    Utils.emitter.on('graph:change', () => this.updateAll());
    Utils.emitter.on('view:change', () => this.updateStatus());
    Utils.emitter.on('toast', (t) => this.toast(t.text, t.type));
  },

  /* ============================================================
     通用 UI：Toast / 弹窗 / 确认 / 输入
     ============================================================ */
  toast(text, type) {
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.innerHTML = `<span>${Utils.escapeHtml(text)}</span><span class="t-close">✕</span>`;
    el.querySelector('.t-close').onclick = () => el.remove();
    root.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, type === 'error' ? 6000 : 3400);
  },

  /* 弹窗框架：支持 ESC / 点击遮罩关闭 / 标题栏拖拽 */
  openModal({ title, bodyHTML, footerHTML, width, onMount, persistent }) {
    const root = document.getElementById('modalRoot');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal" ${width ? `style="width:${width}px"` : ''}>
        <div class="modal-header"><h3>${Utils.escapeHtml(title)}</h3><button class="modal-close">✕</button></div>
        <div class="modal-body"></div>
        ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
      </div>`;
    root.appendChild(mask);
    const modal = mask.querySelector('.modal');
    const body = modal.querySelector('.modal-body');
    body.innerHTML = bodyHTML || '';

    const close = () => { mask.remove(); };
    mask.querySelector('.modal-close').onclick = close;
    if (!persistent) mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(); });

    // 标题栏拖拽移动弹窗位置
    const header = modal.querySelector('.modal-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.modal-close')) return;
      const rect = modal.getBoundingClientRect();
      const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
      modal.style.position = 'fixed';
      modal.style.margin = '0';
      modal.style.left = rect.left + 'px'; modal.style.top = rect.top + 'px';
      const move = (ev) => {
        modal.style.left = Utils.clamp(ev.clientX - ox, -rect.width + 80, window.innerWidth - 80) + 'px';
        modal.style.top = Utils.clamp(ev.clientY - oy, 0, window.innerHeight - 40) + 'px';
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });

    if (onMount) onMount(body, close);
    const firstInput = body.querySelector('input,select,textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 60);
    return { close, body, modal };
  },

  /* 顶层弹窗数量（供 ESC 判断） */
  modalCount() { return document.querySelectorAll('#modalRoot .modal-mask').length; },
  closeTopModal() {
    const masks = document.querySelectorAll('#modalRoot .modal-mask');
    if (masks.length) { masks[masks.length - 1].remove(); return true; }
    return false;
  },

  confirm({ title, message, okText, cancelText, danger }) {
    return new Promise((resolve) => {
      const m = this.openModal({
        title: title || '确认操作',
        bodyHTML: `<div style="font-size:14px;line-height:1.8">${Utils.escapeHtml(message)}</div>`,
        footerHTML: `<button class="btn" data-act="cancel">${Utils.escapeHtml(cancelText || '取消')}</button>
                     <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${Utils.escapeHtml(okText || '确定')}</button>`
      });
      m.body.parentElement.querySelector('[data-act=cancel]').onclick = () => { m.close(); resolve(false); };
      m.body.parentElement.querySelector('[data-act=ok]').onclick = () => { m.close(); resolve(true); };
      // ESC / 遮罩关闭视为取消
      const obs = new MutationObserver(() => {
        if (!document.body.contains(m.modal)) { obs.disconnect(); resolve(false); }
      });
      obs.observe(document.getElementById('modalRoot'), { childList: true });
    });
  },

  prompt({ title, label, value, okText }) {
    return new Promise((resolve) => {
      const m = this.openModal({
        title: title || '输入',
        bodyHTML: `<div class="form-item"><label>${Utils.escapeHtml(label || '')}</label>
          <input type="text" id="_promptInput" value="${Utils.escapeHtml(value || '')}"></div>`,
        footerHTML: `<button class="btn" data-act="cancel">取消</button><button class="btn primary" data-act="ok">确定</button>`
      });
      const input = m.body.querySelector('#_promptInput');
      const done = (val) => { m.close(); resolve(val); };
      m.body.parentElement.querySelector('[data-act=cancel]').onclick = () => done(null);
      m.body.parentElement.querySelector('[data-act=ok]').onclick = () => done(input.value.trim());
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value.trim()); });
      const obs = new MutationObserver(() => {
        if (!document.body.contains(m.modal)) { obs.disconnect(); resolve(null); }
      });
      obs.observe(document.getElementById('modalRoot'), { childList: true });
    });
  },

  showProgressModal(title) {
    const m = this.openModal({
      title, persistent: true,
      bodyHTML: `<div class="progress-wrap"><div class="progress-bar"><div class="progress-inner" style="width:0%"></div></div>
        <div class="progress-text">准备中…</div></div>`
    });
    return {
      update(t, text) {
        m.body.querySelector('.progress-inner').style.width = Math.round(Utils.clamp(t, 0, 1) * 100) + '%';
        if (text) m.body.querySelector('.progress-text').textContent = text;
      },
      close: m.close
    };
  },

  /* ============================================================
     左侧菜单 & 顶部按钮
     ============================================================ */
  bindUI() {
    // 左侧命令
    document.querySelectorAll('#sidebar .nav-item[data-cmd]').forEach(btn => {
      btn.addEventListener('click', () => this.dispatch(btn.dataset.cmd));
    });
    // 顶部按钮
    document.getElementById('btnUndo').onclick = () => this.doUndo();
    document.getElementById('btnRedo').onclick = () => this.doRedo();
    document.getElementById('btnImport').onclick = () => this.openImportModal();
    document.getElementById('btnExport').onclick = () => this.openExportModal();
    document.getElementById('btnSave').onclick = () => this.saveCurrentProject(false);
    document.getElementById('btnProjects').onclick = () => this.openProjectManager();
    document.getElementById('btnSettings').onclick = () => this.openSettings();
    document.getElementById('btnFullscreen').onclick = () => this.toggleFullscreen();
    document.getElementById('rpCollapse').onclick = () => this.togglePanelCollapse();
    document.getElementById('floatRestorePanel').onclick = () => this.togglePanelCollapse();
    document.getElementById('floatExitFullscreen').onclick = () => this.toggleFullscreen();
    document.getElementById('projName').onclick = async () => {
      const name = await this.prompt({ title: '重命名工程', label: '工程名称', value: GraphStore.projectName });
      if (name) { GraphStore.rename(name); this.currentProjectId = null; /* 重命名后需另存 */ this.updateAll(); }
    };

    // 搜索
    const si = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    const clearBtn = document.getElementById('searchClear');
    si.addEventListener('input', Utils.debounce(() => {
      const q = si.value.trim();
      clearBtn.classList.toggle('hidden', !q);
      if (!q) { results.classList.add('hidden'); GraphStore.clearSearch(); return; }
      const hits = GraphStore.search(q);
      this.renderSearchResults(hits, q);
    }, 180));
    si.addEventListener('focus', () => { if (si.value.trim()) this.renderSearchResults(null, si.value.trim()); });
    si.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const hits = GraphStore.search(si.value);
        if (hits.length) { this.selectAndFocus(hits[0].id); results.classList.add('hidden'); }
        else this.toast('未找到匹配的人物', 'warn');
      } else if (e.key === 'Escape') {
        si.value = ''; GraphStore.clearSearch(); results.classList.add('hidden');
        clearBtn.classList.add('hidden'); si.blur();
      }
      e.stopPropagation();
    });
    clearBtn.onclick = () => {
      si.value = ''; GraphStore.clearSearch();
      results.classList.add('hidden'); clearBtn.classList.add('hidden');
    };
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('#searchWrap')) results.classList.add('hidden');
    });

    // 右侧面板 Tab
    document.querySelectorAll('.rp-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.rp-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-detail').classList.toggle('hidden', tab.dataset.tab !== 'detail');
        document.getElementById('tab-filter').classList.toggle('hidden', tab.dataset.tab !== 'filter');
        document.getElementById('tab-timeline').classList.toggle('hidden', tab.dataset.tab !== 'timeline');
        if (tab.dataset.tab === 'filter') this.renderFilterPanel();
        if (tab.dataset.tab === 'timeline') this.renderTimeline();
      });
    });

    // 时间轴工具
    document.getElementById('tlFilter').addEventListener('input', Utils.debounce(() => this.renderTimeline(), 200));
    document.getElementById('btnClearHighlight').onclick = () => {
      GraphStore.clearHighlight();
      this.updateFocusBar();
      this.toast('已清除事件聚焦', 'info');
    };

    // 筛选
    document.getElementById('filterStrength').addEventListener('input', (e) => {
      const v = Number(e.target.value);
      document.getElementById('filterStrengthVal').textContent = v === 0 ? '全部' : `≥ ${v}`;
      GraphStore.setFilter({ minStrength: v });
    });
    document.getElementById('btnClearFilter').onclick = () => {
      GraphStore.clearFilter();
      this.renderFilterPanel();
      this.toast('已清空全部筛选条件，恢复完整视图', 'success');
    };

    // 溯源/聚焦退出
    document.getElementById('btnExitFocus').onclick = () => {
      GraphStore.clearFocus();
      GraphStore.clearHighlight();
      this.updateFocusBar();
      this.renderTimeline();
    };

    // 欢迎页
    document.getElementById('wImport').onclick = () => this.openImportModal();
    document.getElementById('wSample').onclick = () => this.loadSample();
    document.getElementById('wAdd').onclick = () => this.openPersonModal();
    document.getElementById('wOpen').onclick = () => this.openProjectManager();
  },

  /* ============================================================
     画布全屏 / 右侧面板折叠
     ============================================================ */
  toggleFullscreen() {
    const fs = !document.body.classList.contains('canvas-fullscreen');
    document.body.classList.toggle('canvas-fullscreen', fs);
    this.updateFloatBtns();
    Renderer.resize();
    Renderer.fitView();
    this.toast(fs ? '已进入画布全屏（可折叠右侧面板，ESC 退出）' : '已退出画布全屏', 'info');
  },
  togglePanelCollapse() {
    const c = !document.body.classList.contains('panel-collapsed');
    document.body.classList.toggle('panel-collapsed', c);
    this.updateFloatBtns();
    Renderer.resize();
    Renderer.fitView();
  },
  /* 浮动按钮随全屏/折叠状态显隐 */
  updateFloatBtns() {
    const fs = document.body.classList.contains('canvas-fullscreen');
    const c = document.body.classList.contains('panel-collapsed');
    document.getElementById('canvasFloat').classList.toggle('hidden', !fs && !c);
    document.getElementById('floatRestorePanel').classList.toggle('hidden', !c);
    document.getElementById('floatExitFullscreen').classList.toggle('hidden', !fs);
  },

  dispatch(cmd) {
    const canvas = document.getElementById('canvas');
    switch (cmd) {
      case 'newProject': this.newProject(); break;
      case 'openProjectFile': this.openProjectFilePicker(); break;
      case 'saveProject': this.saveCurrentProject(false); break;
      case 'projectList': this.openProjectManager(); break;
      case 'import': this.openImportModal(); break;
      case 'llmExtract': this.openLlmModal(); break;
      case 'template': this.openTemplateModal(); break;
      case 'export': this.openExportModal(); break;
      case 'addPerson': this.openPersonModal(); break;
      case 'addRelation': this.enterConnectMode(); break;
      case 'batchEdit': this.openBatchEditModal(); break;
      case 'layout-force': this.relayout('force'); break;
      case 'layout-circular': this.relayout('circular'); break;
      case 'layout-tree': this.relayout('tree'); break;
      case 'layout-grid': this.relayout('grid'); break;
      case 'layout-grouped': this.relayout('grouped'); break;
      case 'layout-community': this.relayout('community'); break;
      case 'layout-radial': this.relayout('radial'); break;
      case 'zoomIn': Renderer.zoomAt(Renderer.w / 2, Renderer.h / 2, 1.2); break;
      case 'zoomOut': Renderer.zoomAt(Renderer.w / 2, Renderer.h / 2, 1 / 1.2); break;
      case 'resetView': Renderer.resetView(); break;
      case 'fitView': Renderer.fitView(); break;
      case 'toggleBoxSelect':
        this.boxSelectMode = !this.boxSelectMode;
        document.getElementById('navBoxSelect').classList.toggle('active', this.boxSelectMode);
        this.toast(this.boxSelectMode ? '框选模式已开启：在空白处拖拽进行批量框选' : '框选模式已关闭', 'info');
        break;
      case 'themes': this.openThemesModal(); break;
      case 'styleSettings': this.openStyleModal(); break;
      case 'shortcuts': this.openShortcutsModal(); break;
      case 'guide': this.showGuide(); break;
      case 'about': this.openAboutModal(); break;
    }
  },

  /* ============================================================
     示例数据
     ============================================================ */
  async loadSample() {
    // 先快照旧工程再清空：init() 会重置撤销栈，需先保留引用，保证"加载示例数据"可撤销
    const undo = GraphStore.undoStack, redo = GraphStore.redoStack;
    GraphStore.pushUndo('加载示例数据');
    GraphStore.init();
    GraphStore.undoStack = undo; GraphStore.redoStack = redo;
    GraphStore.projectName = SampleData.name;
    for (const p of SampleData.persons) GraphStore.addPerson(p, { silent: true });
    for (const r of SampleData.relations) GraphStore.addRelation(r, { silent: true });
    GraphStore.dirty = true;
    GraphStore.log('加载内置示例数据（三国人物关系）');
    GraphStore.emitChange();
    await this.relayout('force', true);
    this.toast('示例数据加载完成，可自由拖拽、缩放、编辑体验', 'success');
  },

  /* ============================================================
     时间轴面板（事件按时期分组展示，点击聚焦关联人物）
     ============================================================ */
  renderTimeline() {
    const list = document.getElementById('timelineList');
    if (!list) return;
    const events = GraphStore.events || [];
    if (!events.length) {
      list.innerHTML = '<div class="empty-tip">暂无时间线事件<br>导入含时间线的剧情文档或<br>在模板「时间线事件表」中填写</div>';
      return;
    }
    const kw = (document.getElementById('tlFilter').value || '').trim().toLowerCase();
    // 分组（保持导入顺序），排序：有 order 的按 order，否则按导入顺序
    const groups = new Map();
    events.forEach((e, i) => {
      if (kw && !((e.title + e.era + e.desc + e.time).toLowerCase().includes(kw))) return;
      const era = e.era || '未分类事件';
      if (!groups.has(era)) groups.set(era, []);
      groups.get(era).push({ e, i });
    });
    if (!groups.size) {
      list.innerHTML = `<div class="empty-tip">没有匹配"${Utils.escapeHtml(kw)}"的事件</div>`;
      return;
    }
    let html = '';
    for (const [era, items] of groups) {
      html += `<div class="tl-era">${Utils.escapeHtml(era)}<span class="cnt">${items.length} 条</span></div>`;
      const sorted = items.slice().sort((a, b) => (a.e.order || 9999) - (b.e.order || 9999));
      for (const { e } of sorted) {
        const hlActive = GraphStore.highlight.label === e.title;
        const personNames = (e.persons || []).map(n => {
          const p = GraphStore.getPerson(n);
          return p ? p.name : n;
        });
        html += `
          <div class="tl-item ${hlActive ? 'hl-active' : ''}" data-idx="${events.indexOf(e)}">
            <div class="tl-head">
              ${e.order ? `<span class="tl-order">#${e.order}</span>` : ''}
              <span class="tl-title">${Utils.escapeHtml(e.title)}</span>
              ${e.time ? `<span class="tl-time">${Utils.escapeHtml(e.time)}</span>` : ''}
            </div>
            ${e.desc ? `<div class="tl-desc">${Utils.escapeHtml(e.desc)}</div>` : ''}
            ${personNames.length ? `<div class="tl-persons">${personNames.slice(0, 8).map(p => `<span class="dt-tag">${Utils.escapeHtml(p)}</span>`).join('')}${personNames.length > 8 ? `<span class="dt-tag">+${personNames.length - 8}</span>` : ''}</div>` : ''}
          </div>`;
      }
    }
    list.innerHTML = html;
    list.querySelectorAll('.tl-item').forEach(el => {
      el.onclick = () => this.focusEvent(events[Number(el.dataset.idx)]);
    });
  },

  /* 点击事件 → 高亮画布中关联的人物 */
  focusEvent(ev) {
    const ids = GraphStore.resolveEventPersons(ev);
    if (!ids.size) {
      GraphStore.clearHighlight();
      this.updateFocusBar();
      this.toast(`事件《${ev.title}》未匹配到画布中的人物`, 'warn');
      this.renderTimeline();
      return;
    }
    GraphStore.clearPinned(); // 事件聚焦会覆盖人物固定聚焦
    GraphStore.clearFocus();
    GraphStore.setSelection([]);
    GraphStore.setHighlight(ids, ev.title);
    // 居中到关联人物
    let cx = 0, cy = 0, n = 0;
    for (const id of ids) {
      const p = GraphStore.getPerson(id);
      if (p) { cx += p.x; cy += p.y; n++; }
    }
    if (n) Renderer.centerOn(cx / n, cy / n);
    this.updateFocusBar();
    this.renderTimeline();
    this.toast(`已聚焦事件《${ev.title}》：高亮 ${ids.size} 位关联人物`, 'success');
  },

  /* ============================================================
     布局
     ============================================================ */
  async relayout(name, silent) {
    if (GraphStore.isEmpty()) { this.toast('当前画布为空，请先导入或添加人物', 'warn'); return; }
    let progress = null;
    if (!silent && GraphStore.persons.length > 60) progress = this.showProgressModal('自动布局计算中');
    try {
      GraphStore.pushUndo('切换' + ({ force: '力导向', circular: '环形', tree: '层级树状', grid: '网格', grouped: '分簇', community: '自动分簇', radial: '放射状' }[name] || '') + '布局');
      await Layouts.apply(name, (t) => { Renderer.requestDraw(); if (progress) { progress.update(t, '力导向布局迭代计算中… ' + Math.round(t * 100) + '%'); } });
      Renderer.fitView();
      GraphStore.dirty = true;
      GraphStore.log('重新布局：' + name);
      GraphStore.emitChange();
    } finally {
      if (progress) progress.close();
    }
  },

  /* ============================================================
     画布交互
     ============================================================ */
  bindCanvas() {
    const canvas = document.getElementById('canvas');
    const tooltip = document.getElementById('tooltip');
    let mode = null; // 'pan' | 'drag' | 'box'
    let startX = 0, startY = 0, lastX = 0, lastY = 0;
    let dragMoved = false;
    let panStart = null;
    let dragSnapshotPushed = false;

    const rect = () => canvas.getBoundingClientRect();
    const pos = (e) => { const r = rect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    const hideCtxMenu = () => document.getElementById('ctxMenu').classList.add('hidden');
    const hideTooltip = () => tooltip.classList.add('hidden');

    canvas.addEventListener('mousedown', (e) => {
      hideCtxMenu();
      const p = pos(e);
      startX = lastX = p.x; startY = lastY = p.y;
      dragMoved = false; dragSnapshotPushed = false;

      if (e.button === 1) { mode = 'pan'; panStart = { x: Renderer.view.x, y: Renderer.view.y }; e.preventDefault(); return; }
      if (e.button !== 0) return;

      const node = Renderer.pickNode(p.x, p.y);

      // 添加关系模式
      if (this.connectMode) {
        if (node) this.handleConnectClick(node);
        e.preventDefault();
        return;
      }

      if (node) {
        // 最短路径查询模式：点击目标人物
        if (this.pathModeFrom) { this.finishPathQuery(node.id); e.preventDefault(); return; }
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          GraphStore.toggleSelect(node.id);
          // Ctrl 单选同样固定显示；多选不固定，避免干扰批量操作
          if (GraphStore.selection.size === 1) GraphStore.setPinned(node.id);
        } else {
          // 单击人物：固定显示其关联（淡化其余）；再次单击同一人物恢复
          const pinNow = GraphStore.pinnedId !== node.id;
          GraphStore.setPinned(pinNow ? node.id : null);
          if (pinNow) this.toast(`已固定显示【${node.name}】的关联，再次点击该人物或按 ESC 恢复`, 'info');
          GraphStore.setSelection([node.id]);
          mode = 'drag';
        }
        GraphStore.selectEdge(null);
      } else {
        const edge = Renderer.pickEdge(p.x, p.y);
        if (edge) {
          GraphStore.clearSelection();
          GraphStore.selectEdge(edge.id);
        } else {
          GraphStore.clearPinned();
          GraphStore.selectEdge(null);
          if (e.shiftKey || this.boxSelectMode) {
            mode = 'box';
            Renderer.boxRect = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
          } else {
            mode = 'pan';
            panStart = { x: Renderer.view.x, y: Renderer.view.y };
            canvas.style.cursor = 'grabbing';
          }
        }
      }
      Renderer.requestDraw();
    });

    canvas.addEventListener('mousemove', (e) => {
      const p = pos(e);
      const dx = p.x - startX, dy = p.y - startY;
      Renderer.mouseWorld = Renderer.screenToWorld(p.x, p.y);

      if (mode === 'pan' && panStart) {
        Renderer.view.x = panStart.x + (p.x - startX);
        Renderer.view.y = panStart.y + (p.y - startY);
        Renderer.requestDraw();
        hideTooltip();
        return;
      }
      if (mode === 'drag') {
        if (!dragMoved && Math.abs(dx) + Math.abs(dy) > 3) {
          dragMoved = true;
          // 记录拖拽前状态用于撤销
          if (!dragSnapshotPushed) { GraphStore.pushUndo('拖拽节点'); dragSnapshotPushed = true; }
        }
        if (dragMoved) {
          const w = Renderer.screenToWorld(p.x, p.y);
          const wPrev = Renderer.screenToWorld(lastX, lastY);
          const ddx = w.x - wPrev.x, ddy = w.y - wPrev.y;
          for (const id of GraphStore.selection) {
            const node = GraphStore.getPerson(id);
            if (node && !node.isLock) { node.x += ddx; node.y += ddy; }
          }
          Renderer.requestDraw();
          hideTooltip();
        }
        lastX = p.x; lastY = p.y;
        return;
      }
      if (mode === 'box') {
        Renderer.boxRect.x1 = p.x; Renderer.boxRect.y1 = p.y;
        Renderer.requestDraw();
        return;
      }

      // 悬浮检测
      lastX = p.x; lastY = p.y;
      const node = Renderer.pickNode(p.x, p.y);
      const edge = node ? null : Renderer.pickEdge(p.x, p.y);
      const prevHoverP = Renderer.hoverPersonId, prevHoverE = Renderer.hoverEdgeId;
      Renderer.hoverPersonId = node ? node.id : null;
      Renderer.hoverEdgeId = edge ? edge.id : null;
      if (prevHoverP !== Renderer.hoverPersonId || prevHoverE !== Renderer.hoverEdgeId) Renderer.requestDraw();

      // 光标
      if (this.connectMode) canvas.style.cursor = node ? 'crosshair' : 'default';
      else canvas.style.cursor = node ? 'move' : (edge ? 'pointer' : 'default');

      // 悬浮信息卡
      if (node) this.showNodeTooltip(node, p, tooltip);
      else if (edge) this.showEdgeTooltip(edge, p, tooltip);
      else hideTooltip();
    });

    canvas.addEventListener('mouseup', (e) => {
      if (mode === 'box' && Renderer.boxRect) {
        const b = Renderer.boxRect;
        const ids = [];
        const w0 = Renderer.screenToWorld(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1));
        const w1 = Renderer.screenToWorld(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
        for (const p of GraphStore.persons) {
          if (p.x >= w0.x && p.x <= w1.x && p.y >= w0.y && p.y <= w1.y) ids.push(p.id);
        }
        GraphStore.setSelection(ids, e.ctrlKey || e.metaKey);
        if (ids.length > 1) this.toast(`已框选 ${ids.length} 个人物，可进行批量编辑`, 'info');
      }
      if (mode === 'drag' && dragMoved) {
        GraphStore.dirty = true;
        GraphStore.log('拖拽节点调整位置');
        GraphStore.emitChange();
      }
      if (mode === 'pan') canvas.style.cursor = 'default';
      mode = null; panStart = null;
      Renderer.boxRect = null;
      Renderer.requestDraw();
    });

    canvas.addEventListener('mouseleave', () => {
      Renderer.hoverPersonId = null; Renderer.hoverEdgeId = null;
      hideTooltip();
      Renderer.requestDraw();
    });

    canvas.addEventListener('dblclick', (e) => {
      const p = pos(e);
      const node = Renderer.pickNode(p.x, p.y);
      if (node) { GraphStore.setPinned(node.id); this.openPersonModal(node); return; }
      const edge = Renderer.pickEdge(p.x, p.y);
      if (edge) { this.openRelationModal(edge); return; }
      // 双击空白处：在此位置快速添加人物
      const w = Renderer.screenToWorld(p.x, p.y);
      this.openPersonModal(null, { x: w.x, y: w.y });
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(e);
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      Renderer.zoomAt(p.x, p.y, factor);
    }, { passive: false });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const p = pos(e);
      const node = Renderer.pickNode(p.x, p.y);
      if (node) {
        if (!GraphStore.selection.has(node.id)) GraphStore.setSelection([node.id]);
        GraphStore.selectEdge(null);
        this.showCtxMenu(p.x, p.y, this.buildNodeMenu(node));
      } else {
        const edge = Renderer.pickEdge(p.x, p.y);
        if (edge) {
          GraphStore.clearSelection(); GraphStore.selectEdge(edge.id);
          this.showCtxMenu(p.x, p.y, this.buildEdgeMenu(edge));
        } else {
          this.showCtxMenu(p.x, p.y, this.buildCanvasMenu(p));
        }
      }
    });

    window.addEventListener('resize', Utils.debounce(() => { Renderer.resize(); }, 120));
  },

  /* ---------- 悬浮信息卡 ---------- */
  showNodeTooltip(p, pos, tooltip) {
    const groupColor = Utils.colorForGroup(p.group);
    let html = `<div class="tt-name">${Utils.escapeHtml(p.name)}</div>`;
    if (p.alias) html += `<div class="tt-group">${Utils.escapeHtml(p.alias)}</div>`;
    if (p.group || p.position) html += `<div class="tt-group">${Utils.escapeHtml([p.group, p.position].filter(Boolean).join(' · '))}</div>`;
    if (p.gender || p.age) html += `<div class="tt-sub">${Utils.escapeHtml([p.gender, p.age ? p.age + '岁' : ''].filter(Boolean).join(' / '))}</div>`;
    if ((p.tag || []).length) html += `<div class="tt-tags">${p.tag.map(t => `<span class="dt-tag">${Utils.escapeHtml(t)}</span>`).join('')}</div>`;
    if (p.intro) html += `<div class="tt-intro">${Utils.escapeHtml(p.intro)}</div>`;
    const rels = GraphStore.neighborsOf(p.id);
    html += `<div class="tt-sub" style="margin-top:5px;border-top:1px dashed var(--border);padding-top:5px">关联关系：${rels.length} 条
      ${rels.slice(0, 4).map(r => `<br>· ${Utils.escapeHtml(r.edge.relationType)} → ${Utils.escapeHtml(r.other.name)}`).join('')}
      ${rels.length > 4 ? '<br>…' : ''}</div>`;
    tooltip.innerHTML = html;
    tooltip.style.borderColor = groupColor;
    this.placeTooltip(pos, tooltip);
  },
  showEdgeTooltip(edge, pos, tooltip) {
    const s = GraphStore.getPerson(edge.sourceId), t = GraphStore.getPerson(edge.targetId);
    if (!s || !t) return;
    let html = `<div class="tt-name" style="font-size:13px">${Utils.escapeHtml(edge.relationType)}</div>`;
    html += `<div class="tt-group">${Utils.escapeHtml(s.name)} ⟶ ${Utils.escapeHtml(t.name)}</div>`;
    if (edge.desc) html += `<div class="tt-sub">${Utils.escapeHtml(edge.desc)}</div>`;
    const extras = [];
    if (edge.strength) extras.push(`强度 ${edge.strength}/10`);
    if (edge.time) extras.push(`时间：${Utils.escapeHtml(edge.time)}`);
    if (edge.note) extras.push(`备注：${Utils.escapeHtml(edge.note)}`);
    if (extras.length) html += `<div class="tt-sub" style="margin-top:4px">${extras.join('<br>')}</div>`;
    tooltip.innerHTML = html;
    tooltip.style.borderColor = 'var(--primary)';
    this.placeTooltip(pos, tooltip);
  },
  placeTooltip(pos, tooltip) {
    tooltip.classList.remove('hidden');
    const tw = tooltip.offsetWidth, thh = tooltip.offsetHeight;
    let x = pos.x + 16, y = pos.y + 16;
    if (x + tw > Renderer.w - 8) x = pos.x - tw - 16;
    if (y + thh > Renderer.h - 8) y = pos.y - thh - 16;
    tooltip.style.left = Math.max(4, x) + 'px';
    tooltip.style.top = Math.max(4, y) + 'px';
  },

  /* ---------- 右键菜单 ---------- */
  showCtxMenu(x, y, items) {
    const menu = document.getElementById('ctxMenu');
    menu.innerHTML = items.map((it, i) => {
      if (it.sep) return '<div class="cm-sep"></div>';
      if (it.label2) return `<div class="cm-label">${Utils.escapeHtml(it.label2)}</div>`;
      return `<button class="cm-item ${it.danger ? 'danger' : ''}" data-i="${i}">${Utils.escapeHtml(it.label)}</button>`;
    }).join('');
    menu.classList.remove('hidden');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, Renderer.w - mw - 6) + 'px';
    menu.style.top = Math.min(y, Renderer.h - mh - 6) + 'px';
    menu.querySelectorAll('.cm-item').forEach(btn => {
      btn.onclick = () => {
        menu.classList.add('hidden');
        const it = items[Number(btn.dataset.i)];
        if (it && it.action) it.action();
      };
    });
  },
  buildNodeMenu(p) {
    const items = [];
    items.push({ label: '✏️ 编辑人物', action: () => this.openPersonModal(p) });
    items.push({ label: '🔗 从此添加关系', action: () => this.enterConnectMode(p.id) });
    items.push({ label: '🔍 查找与某人的最短路径', action: () => this.enterPathMode(p.id) });
    items.push({ sep: true });
    items.push({ label2: '关联溯源' });
    items.push({ label: '展开一级关联', action: () => this.applyFocus(p.id, 1) });
    items.push({ label: '展开二级关联', action: () => this.applyFocus(p.id, 2) });
    items.push({ label: '展开全层级关联', action: () => this.applyFocus(p.id, 999) });
    items.push({ sep: true });
    items.push({ label: p.isLock ? '🔓 解锁节点位置' : '📌 锁定节点位置', action: () => { GraphStore.pushUndo('锁定/解锁节点'); GraphStore.updatePerson(p.id, { isLock: !p.isLock }); this.toast(p.isLock ? '节点已解锁，可自由拖拽' : '节点已锁定固定位置', 'success'); } });
    items.push({ label: '🎯 定位居中', action: () => Renderer.centerOn(p.x, p.y) });
    items.push({ sep: true });
    items.push({ label: '🗑 删除人物', danger: true, action: () => this.deleteSelection([p.id]) });
    return items;
  },
  buildEdgeMenu(r) {
    return [
      { label: '✏️ 编辑关系', action: () => this.openRelationModal(r) },
      { label: '🎯 选中并定位', action: () => { const s = GraphStore.getPerson(r.sourceId); if (s) Renderer.centerOn(s.x, s.y); } },
      { sep: true },
      { label: '🗑 删除关系', danger: true, action: () => this.deleteSelection([], r.id) }
    ];
  },
  buildCanvasMenu(p) {
    const w = Renderer.screenToWorld(p.x, p.y);
    return [
      { label: '👤 在此添加人物', action: () => this.openPersonModal(null, { x: w.x, y: w.y }) },
      { label: '🔗 添加关系', action: () => this.enterConnectMode() },
      { sep: true },
      { label: '🥇 核心人物分析', action: () => this.openCentralModal() },
      { sep: true },
      { label: '🖼 自适应画布', action: () => Renderer.fitView() },
      { label: '🎯 重置视图', action: () => Renderer.resetView() }
    ];
  },

  /* ---------- 最短路径查询模式 ---------- */
  enterPathMode(fromId) {
    this.pathModeFrom = fromId;
    const p = GraphStore.getPerson(fromId);
    const hint = document.getElementById('modeHint');
    hint.classList.remove('hidden');
    hint.textContent = `最短路径模式：已选【${p ? p.name : ''}】，请点击目标人物（ESC 取消）`;
    document.getElementById('canvas').style.cursor = 'crosshair';
  },
  exitPathMode() {
    this.pathModeFrom = null;
    document.getElementById('modeHint').classList.add('hidden');
    document.getElementById('canvas').style.cursor = 'default';
  },
  finishPathQuery(toId) {
    const from = this.pathModeFrom;
    const fromName = GraphStore.getPerson(from) ? GraphStore.getPerson(from).name : '';
    this.exitPathMode();
    const res = Analysis.shortestPath(GraphStore.persons, GraphStore.relations, from, toId);
    if (!res) { this.toast(`【${fromName}】与目标人物之间没有可通达的关系路径`, 'warn'); return; }
    if (!res.dist) { this.toast('目标与起点是同一人', 'info'); return; }
    GraphStore.clearPinned();
    GraphStore.clearFocus();
    GraphStore.setSelection([]);
    GraphStore.setHighlight(new Set(res.ids), `路径 ${fromName} → ${GraphStore.getPerson(toId) ? GraphStore.getPerson(toId).name : ''}`);
    this.updateFocusBar();
    const summary = res.ids.map((id, i) =>
      (i === 0 ? '' : ` → [${res.edges[i - 1].relationType}] `) + (GraphStore.getPerson(id) ? GraphStore.getPerson(id).name : id)).join('');
    this.toast(`最短路径 ${res.dist} 段：${summary}`, 'success');
    const mid = GraphStore.getPerson(res.ids[Math.ceil(res.ids.length / 2) - 1]);
    if (mid) Renderer.centerOn(mid.x, mid.y);
  },

  /* ---------- 核心人物分析（介数中心性榜单） ---------- */
  openCentralModal() {
    if (GraphStore.relations.length < 2) { this.toast('关系数据过少，无法分析', 'warn'); return; }
    const list = Analysis.topCentral(GraphStore.persons, GraphStore.relations, 10);
    const m = this.openModal({
      title: '🥇 核心人物分析',
      width: 520,
      bodyHTML: `
        <div class="form-hint">按「介数中心性」排序——值越高，说明更多人之间的往来必须经过 TA（桥梁人物）。点击人物可达定位。</div>
        <div class="proj-list" style="margin-top:12px">
          ${list.map((x, i) => {
            const p = GraphStore.getPerson(x.id);
            return `
            <div class="proj-item" data-id="${Utils.escapeHtml(x.id)}" style="cursor:pointer">
              <span style="width:30px;text-align:center;font-weight:700;color:${i < 3 ? 'var(--primary)' : 'var(--sub)'}">${i + 1}</span>
              <div class="proj-info">
                <div class="proj-name-t">${Utils.escapeHtml(p ? p.name : x.id)}${p && p.group ? ` <span class="dt-tag">${Utils.escapeHtml(p.group)}</span>` : ''}</div>
                <div class="proj-meta">关系 ${x.deg} 条 · 介数 ${x.value.toFixed(1)} · 排名 ${x.rank}</div>
              </div>
            </div>`;
          }).join('')}
        </div>`,
      footerHTML: `<button class="btn" data-act="close">关闭</button>`
    });
    m.body.parentElement.querySelector('[data-act=close]').onclick = m.close;
    m.body.querySelectorAll('.proj-item').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.id;
        GraphStore.setSelection([id]);
        const p = GraphStore.getPerson(id);
        if (p) Renderer.centerOn(p.x, p.y);
        m.close();
      };
    });
  },

  /* ---------- 添加关系模式 ---------- */
  enterConnectMode(presetId) {
    if (GraphStore.persons.length < 2) { this.toast('画布中至少需要两个人物才能建立关系，请先添加人物', 'warn'); return; }
    this.connectMode = true;
    this.connectFirst = presetId || null;
    Renderer.connectFromId = this.connectFirst;
    const hint = document.getElementById('modeHint');
    hint.classList.remove('hidden');
    this.updateConnectHint();
    document.getElementById('canvas').style.cursor = 'crosshair';
  },
  updateConnectHint() {
    const hint = document.getElementById('modeHint');
    if (!this.connectMode) { hint.classList.add('hidden'); return; }
    if (!this.connectFirst) hint.textContent = '添加关系模式：请点击第一个人物（ESC 取消）';
    else {
      const p = GraphStore.getPerson(this.connectFirst);
      hint.textContent = `已选【${p ? p.name : ''}】，请点击第二个人物建立关系（ESC 取消）`;
    }
  },
  handleConnectClick(node) {
    if (!this.connectFirst) {
      this.connectFirst = node.id;
      Renderer.connectFromId = node.id;
      this.updateConnectHint();
      return;
    }
    if (this.connectFirst === node.id) { this.toast('不能与自身建立关系，请点击其他人物', 'warn'); return; }
    const src = GraphStore.getPerson(this.connectFirst);
    this.exitConnectMode();
    this.openRelationModal(null, { sourceId: src.id, targetId: node.id });
  },
  exitConnectMode() {
    this.connectMode = false;
    this.connectFirst = null;
    Renderer.connectFromId = null;
    document.getElementById('modeHint').classList.add('hidden');
    document.getElementById('canvas').style.cursor = 'default';
    Renderer.requestDraw();
  },

  /* ---------- 溯源 ---------- */
  applyFocus(nodeId, depth) {
    GraphStore.clearPinned(); // 溯源聚焦会覆盖人物固定聚焦
    GraphStore.focusOn(nodeId, depth);
    const p = GraphStore.getPerson(nodeId);
    Renderer.centerOn(p.x, p.y);
    this.updateFocusBar();
    const names = { 1: '一级', 2: '二级', 999: '全层级' };
    this.toast(`已展开【${p.name}】的${names[depth]}关联，共 ${GraphStore.focus.ids.size} 个人物可见`, 'success');
  },
  updateFocusBar() {
    const bar = document.getElementById('focusBar');
    if (GraphStore.focus.depth > 0) {
      const names = { 1: '一级', 2: '二级', 999: '全层级' };
      const p = GraphStore.getPerson(GraphStore.focus.nodeId);
      document.getElementById('focusText').textContent =
        `关联溯源中：【${p ? p.name : ''}】${names[GraphStore.focus.depth] || ''}关联（可见 ${GraphStore.focus.ids.size} 人）`;
      document.getElementById('btnExitFocus').textContent = '退出溯源';
      bar.classList.remove('hidden');
    } else if (GraphStore.highlight.ids && GraphStore.highlight.ids.size) {
      document.getElementById('focusText').textContent =
        `事件聚焦中：《${GraphStore.highlight.label}》（高亮 ${GraphStore.highlight.ids.size} 位关联人物）`;
      document.getElementById('btnExitFocus').textContent = '退出聚焦';
      bar.classList.remove('hidden');
    } else bar.classList.add('hidden');
  },

  /* ============================================================
     搜索结果
     ============================================================ */
  renderSearchResults(hits, q) {
    const box = document.getElementById('searchResults');
    if (!q) { box.classList.add('hidden'); return; }
    if (!hits) hits = GraphStore.search(q);
    if (!hits.length) {
      box.innerHTML = `<div class="sr-empty">未找到匹配"${Utils.escapeHtml(q)}"的人物</div>`;
    } else {
      box.innerHTML = hits.slice(0, 30).map(p => `
        <button class="sr-item" data-id="${Utils.escapeHtml(p.id)}">
          <span class="dot" style="background:${Utils.colorForGroup(p.group)}"></span>
          <span>${Utils.escapeHtml(p.name)}</span>
          <span class="sr-sub">${Utils.escapeHtml([p.group, p.position].filter(Boolean).join(' · ') || p.id)}</span>
        </button>`).join('');
      box.querySelectorAll('.sr-item').forEach(btn => {
        btn.onclick = () => { this.selectAndFocus(btn.dataset.id); box.classList.add('hidden'); };
      });
    }
    box.classList.remove('hidden');
  },
  selectAndFocus(id) {
    const p = GraphStore.getPerson(id);
    if (!p) return;
    GraphStore.setPinned(id); // 搜索点选同样固定显示其关联
    GraphStore.setSelection([id]);
    GraphStore.selectEdge(null);
    Renderer.centerOn(p.x, p.y);
    this.renderDetailPanel();
  },

  /* ============================================================
     右侧详情面板
     ============================================================ */
  renderDetailPanel() {
    const box = document.getElementById('tab-detail');
    if (GraphStore.selectedEdgeId) {
      const r = GraphStore.getRelation(GraphStore.selectedEdgeId);
      if (r) { box.innerHTML = this.edgeDetailHTML(r); this.bindDetailEvents(box); return; }
    }
    if (GraphStore.selection.size === 1) {
      const p = GraphStore.getPerson([...GraphStore.selection][0]);
      if (p) { box.innerHTML = this.personDetailHTML(p); this.bindDetailEvents(box); return; }
    }
    if (GraphStore.selection.size > 1) {
      box.innerHTML = `
        <div class="dt-name">已选中 ${GraphStore.selection.size} 个人物</div>
        <div class="empty-tip" style="padding:10px">可统一修改分组、标签、样式，或批量删除</div>
        <div class="dt-btns">
          <button class="btn primary" data-act="batch">批量编辑</button>
          <button class="btn danger-ghost" data-act="batchDel">批量删除</button>
        </div>`;
      box.querySelector('[data-act=batch]').onclick = () => this.openBatchEditModal();
      box.querySelector('[data-act=batchDel]').onclick = () => this.deleteSelection([...GraphStore.selection]);
      return;
    }
    box.innerHTML = '<div class="empty-tip">单击节点或关系线<br>查看 / 编辑详细信息</div>';
  },

  personDetailHTML(p) {
    const color = Utils.colorForGroup(p.group);
    const rels = GraphStore.neighborsOf(p.id);
    let html = `
      <div class="dt-avatar" style="background:${color}">${p.avatar ? '' : Utils.escapeHtml((p.name || '?').charAt(0))}${p.avatar ? `<img src="${Utils.escapeHtml(p.avatar)}" onerror="this.remove()">` : ''}</div>
      <div class="dt-name">${Utils.escapeHtml(p.name)} ${p.isLock ? '🔒' : ''}</div>
      ${p.alias ? `<div class="dt-group">${Utils.escapeHtml(p.alias)}</div>` : (p.group ? '' : '<div style="height:12px"></div>')}
      ${p.group && p.alias ? `<div class="dt-group" style="margin-top:-8px">${Utils.escapeHtml(p.group)}</div>` : (p.group ? `<div class="dt-group">${Utils.escapeHtml(p.group)}</div>` : '')}
      <div class="dt-field"><div class="f-label">人物ID</div><div class="f-value">${Utils.escapeHtml(p.id)}</div></div>
      ${p.position ? `<div class="dt-field"><div class="f-label">身份职位</div><div class="f-value">${Utils.escapeHtml(p.position)}</div></div>` : ''}
      ${p.gender ? `<div class="dt-field"><div class="f-label">性别</div><div class="f-value">${Utils.escapeHtml(p.gender)}</div></div>` : ''}
      ${p.age ? `<div class="dt-field"><div class="f-label">年龄</div><div class="f-value">${Utils.escapeHtml(p.age)}</div></div>` : ''}
      ${(p.tag || []).length ? `<div class="dt-field"><div class="f-label">标签</div></div><div class="dt-tags">${p.tag.map(t => `<span class="dt-tag">${Utils.escapeHtml(t)}</span>`).join('')}</div>` : ''}
      ${p.intro ? `<div class="dt-field"><div class="f-label">简介</div><div class="f-value">${Utils.escapeHtml(p.intro)}</div></div>` : ''}
      <div class="dt-section-title">关联关系（${rels.length}）</div>
      ${rels.length ? rels.map(r => `
        <div class="dt-rel-item" data-rel="${r.edge.id}" data-other="${r.other.id}">
          <span class="dt-rel-type">${Utils.escapeHtml(r.edge.relationType)}</span>
          <span class="dt-rel-name">${Utils.escapeHtml(r.other.name)}</span>
        </div>`).join('') : '<div class="empty-tip" style="padding:8px">暂无关联关系</div>'}
      <div class="dt-btns">
        <button class="btn primary" data-act="edit">编辑人物</button>
        <button class="btn" data-act="addRel">添加关系</button>
        <button class="btn" data-act="focus1">一级溯源</button>
        <button class="btn" data-act="focus2">二级溯源</button>
        <button class="btn" data-act="focusAll">全层级溯源</button>
        <button class="btn" data-act="lock">${p.isLock ? '解锁位置' : '锁定位置'}</button>
        <button class="btn danger-ghost block" data-act="del" style="grid-column:1/3">删除人物</button>
      </div>`;
    return html;
  },
  edgeDetailHTML(r) {
    const s = GraphStore.getPerson(r.sourceId), t = GraphStore.getPerson(r.targetId);
    let html = `
      <div class="dt-name" style="font-size:15px">🔗 ${Utils.escapeHtml(r.relationType)}</div>
      <div class="dt-group">${s ? Utils.escapeHtml(s.name) : '?'} ⟶ ${t ? Utils.escapeHtml(t.name) : '?'}</div>
      <div class="dt-field"><div class="f-label">关系强度</div><div class="f-value">${r.strength ? r.strength + ' / 10' : '未设置'}</div></div>
      ${r.time ? `<div class="dt-field"><div class="f-label">关系时间</div><div class="f-value">${Utils.escapeHtml(r.time)}</div></div>` : ''}
      ${r.desc ? `<div class="dt-field"><div class="f-label">关系描述</div><div class="f-value">${Utils.escapeHtml(r.desc)}</div></div>` : ''}
      ${r.note ? `<div class="dt-field"><div class="f-label">备注</div><div class="f-value">${Utils.escapeHtml(r.note)}</div></div>` : ''}
      <div class="dt-btns">
        <button class="btn primary" data-act="edit">编辑关系</button>
        <button class="btn danger-ghost" data-act="del">删除关系</button>
      </div>`;
    return html;
  },
  bindDetailEvents(box) {
    box.querySelectorAll('.dt-rel-item').forEach(el => {
      el.onclick = () => {
        GraphStore.selectEdge(el.dataset.rel);
        const other = GraphStore.getPerson(el.dataset.other);
        if (other) Renderer.centerOn(other.x, other.y);
      };
    });
    const sel = [...GraphStore.selection][0];
    const p = sel ? GraphStore.getPerson(sel) : null;
    const r = GraphStore.selectedEdgeId ? GraphStore.getRelation(GraphStore.selectedEdgeId) : null;
    const on = (act, fn) => { const el = box.querySelector(`[data-act=${act}]`); if (el) el.onclick = fn; };
    if (p) {
      on('edit', () => this.openPersonModal(p));
      on('addRel', () => this.enterConnectMode(p.id));
      on('focus1', () => this.applyFocus(p.id, 1));
      on('focus2', () => this.applyFocus(p.id, 2));
      on('focusAll', () => this.applyFocus(p.id, 999));
      on('lock', () => { GraphStore.pushUndo('锁定/解锁节点'); GraphStore.updatePerson(p.id, { isLock: !p.isLock }); });
      on('del', () => this.deleteSelection([p.id]));
    }
    if (r) {
      on('edit', () => this.openRelationModal(r));
      on('del', () => this.deleteSelection([], r.id));
    }
  },

  /* ---------- 筛选面板 ---------- */
  renderFilterPanel() {
    const groups = GraphStore.groups();
    const types = GraphStore.relTypes();
    const gBox = document.getElementById('filterGroups');
    const tBox = document.getElementById('filterTypes');

    if (!groups.size) gBox.innerHTML = '<div class="empty-tip" style="padding:8px">暂无分组数据</div>';
    else {
      gBox.innerHTML = [...groups.entries()].map(([g, c]) => `
        <label><input type="checkbox" data-group="${Utils.escapeHtml(g)}" ${GraphStore.isGroupHidden(g) ? '' : 'checked'}>
          <span>${Utils.escapeHtml(g)}</span><span class="cnt">${c}</span></label>`).join('');
      gBox.querySelectorAll('input[data-group]').forEach(cb => {
        cb.onchange = () => {
          const g = cb.dataset.group;
          if (cb.checked) GraphStore.filter.hiddenGroups.delete(g);
          else GraphStore.filter.hiddenGroups.add(g);
          GraphStore.emitChange();
        };
      });
    }
    if (!types.size) tBox.innerHTML = '<div class="empty-tip" style="padding:8px">暂无关系数据</div>';
    else {
      tBox.innerHTML = [...types.entries()].map(([t, c]) => `
        <label><input type="checkbox" data-type="${Utils.escapeHtml(t)}" ${GraphStore.isTypeHidden(t) ? '' : 'checked'}>
          <span>${Utils.escapeHtml(t)}</span><span class="cnt">${c}</span></label>`).join('');
      tBox.querySelectorAll('input[data-type]').forEach(cb => {
        cb.onchange = () => {
          const t = cb.dataset.type;
          if (cb.checked) GraphStore.filter.hiddenTypes.delete(t);
          else GraphStore.filter.hiddenTypes.add(t);
          GraphStore.emitChange();
        };
      });
    }
    document.getElementById('filterStrength').value = GraphStore.filter.minStrength;
    document.getElementById('filterStrengthVal').textContent =
      GraphStore.filter.minStrength === 0 ? '全部' : `≥ ${GraphStore.filter.minStrength}`;
  },

  /* ============================================================
     编辑弹窗
     ============================================================ */
  openPersonModal(existing, atPos) {
    const isEdit = !!existing;
    const p = existing || GraphStore.normalizePerson(Object.assign({ id: '', name: '' }, atPos ? { x: atPos.x, y: atPos.y } : {}));
    const groups = [...GraphStore.groups().keys()].filter(g => g !== '未分组');
    const types = [...GraphStore.relTypes().keys()];
    const m = this.openModal({
      title: isEdit ? '编辑人物' : '新增人物',
      width: 520,
      bodyHTML: `
        <div class="form-row">
          <div class="form-item"><label>人物姓名<span class="req">*</span></label>
            <input type="text" id="pf-name" value="${Utils.escapeHtml(p.name === '未命名' ? '' : p.name)}" placeholder="请输入人物姓名"></div>
          <div class="form-item"><label>人物ID<span class="req">*</span></label>
            <input type="text" id="pf-id" value="${Utils.escapeHtml(p.id)}" ${isEdit ? 'readonly style="opacity:.6"' : 'placeholder="唯一标识，如 P001"'}></div>
        </div>
        <div class="form-item"><label>英文名 / 别名</label>
          <input type="text" id="pf-alias" value="${Utils.escapeHtml(p.alias || '')}" placeholder="如：Anna Gray / 继承人"></div>
        <div class="form-row">
          <div class="form-item"><label>归属分组</label><input type="text" id="pf-group" list="groupList" value="${Utils.escapeHtml(p.group)}" placeholder="如：蜀汉">
            <datalist id="groupList">${groups.map(g => `<option value="${Utils.escapeHtml(g)}">`).join('')}</datalist></div>
          <div class="form-item"><label>身份职位</label><input type="text" id="pf-position" value="${Utils.escapeHtml(p.position)}"></div>
        </div>
        <div class="form-row">
          <div class="form-item"><label>性别</label>
            <select id="pf-gender"><option value=""></option><option ${p.gender === '男' ? 'selected' : ''}>男</option><option ${p.gender === '女' ? 'selected' : ''}>女</option><option ${p.gender && p.gender !== '男' && p.gender !== '女' ? 'selected' : ''}>${Utils.escapeHtml(p.gender || '其他')}</option></select></div>
          <div class="form-item"><label>年龄</label><input type="number" id="pf-age" value="${Utils.escapeHtml(p.age)}"></div>
          <div class="form-item"><label>人物标签（逗号分隔）</label><input type="text" id="pf-tag" value="${Utils.escapeHtml((p.tag || []).join('、'))}" placeholder="如：主公、仁德"></div>
        </div>
        <div class="form-item"><label>头像URL / 本地路径</label><input type="text" id="pf-avatar" value="${Utils.escapeHtml(p.avatar)}" placeholder="http://… 或本地图片路径"></div>
        <div class="form-item"><label>人物简介</label><textarea id="pf-intro">${Utils.escapeHtml(p.intro)}</textarea></div>
        <div class="dt-section-title">节点样式</div>
        <div class="form-row">
          <div class="form-item"><label>形状</label>
            <select id="pf-shape"><option value="">跟随全局</option><option value="circle" ${p.style.shape === 'circle' ? 'selected' : ''}>圆形</option><option value="rect" ${p.style.shape === 'rect' ? 'selected' : ''}>圆角矩形</option></select></div>
          <div class="form-item"><label>大小</label><div class="range-row"><input type="range" id="pf-size" min="14" max="60" value="${p.style.size || Renderer.options.nodeSize}"><span class="rv" id="pf-sizeV">${p.style.size || Renderer.options.nodeSize}</span></div></div>
        </div>
        <div class="form-row">
          <div class="form-item"><label>填充颜色</label><div class="color-row"><input type="color" id="pf-fill" value="${p.style.fill || '#ffffff'}"><span class="use-auto" id="pf-fillAuto">使用默认</span></div></div>
          <div class="form-item"><label>边框颜色</label><div class="color-row"><input type="color" id="pf-border" value="${p.style.border || Utils.colorForGroup(p.group)}"><span class="use-auto" id="pf-borderAuto">按分组自动</span></div></div>
        </div>
        ${isEdit ? '<label class="form-check" style="margin-top:6px"><input type="checkbox" id="pf-lock" ' + (p.isLock ? 'checked' : '') + '> 锁定节点位置（防止拖拽误移动）</label>' : ''}
      `,
      footerHTML: `${isEdit ? '<button class="btn danger-ghost" data-act="del" style="margin-right:auto">删除人物</button>' : ''}
        <button class="btn" data-act="cancel">取消</button><button class="btn primary" data-act="ok">保存</button>`
    });

    const q = (id) => m.body.querySelector('#' + id);
    q('pf-size').addEventListener('input', (e) => { q('pf-sizeV').textContent = e.target.value; });
    q('pf-fillAuto').onclick = () => { q('pf-fill').value = '#ffffff'; };
    q('pf-borderAuto').onclick = () => { q('pf-border').value = Utils.colorForGroup(q('pf-group').value.trim()); };
    q('pf-group').addEventListener('change', () => { q('pf-borderAuto').click(); });

    m.body.parentElement.querySelector('[data-act=cancel]').onclick = m.close;
    const delBtn = m.body.parentElement.querySelector('[data-act=del]');
    if (delBtn) delBtn.onclick = async () => { m.close(); await this.deleteSelection([p.id]); };
    m.body.parentElement.querySelector('[data-act=ok]').onclick = () => {
      const name = q('pf-name').value.trim();
      const id = q('pf-id').value.trim() || Utils.uid('P');
      if (!name) { this.toast('请输入人物姓名', 'warn'); return; }
      if (!isEdit && GraphStore.getPerson(id)) { this.toast(`检测到重复人物ID：${id}，请修改唯一标识后重新保存`, 'error'); return; }
      const patch = {
        id, name,
        alias: q('pf-alias').value.trim(),
        group: q('pf-group').value.trim(),
        position: q('pf-position').value.trim(),
        gender: q('pf-gender').value,
        age: q('pf-age').value,
        tag: Utils.parseTags(q('pf-tag').value),
        avatar: q('pf-avatar').value.trim(),
        intro: q('pf-intro').value.trim(),
        style: {
          shape: q('pf-shape').value,
          size: Number(q('pf-size').value) === Renderer.options.nodeSize ? 0 : Number(q('pf-size').value),
          fill: q('pf-fill').value === '#ffffff' ? '' : q('pf-fill').value,
          border: q('pf-border').value === Utils.colorForGroup(q('pf-group').value.trim()) ? '' : q('pf-border').value,
          textColor: '', fontSize: 0
        }
      };
      GraphStore.pushUndo(isEdit ? '编辑人物' : '新增人物');
      if (isEdit) {
        // 人物ID 修改：需同步更新所有关联关系的端点引用
        if (id !== p.id) {
          if (GraphStore.getPerson(id)) { this.toast(`检测到重复人物ID：${id}，请修改唯一标识后重新保存`, 'error'); return; }
          for (const r of GraphStore.relations) {
            if (r.sourceId === p.id) r.sourceId = id;
            if (r.targetId === p.id) r.targetId = id;
          }
          p.id = id;
          GraphStore.reindex();
        }
        patch.isLock = q('pf-lock').checked;
        delete patch.id;
        GraphStore.updatePerson(p.id, patch);
        this.toast('人物信息已更新', 'success');
      } else {
        if (atPos) { patch.x = atPos.x; patch.y = atPos.y; }
        const np = GraphStore.addPerson(patch);
        GraphStore.setSelection([np.id]);
        this.toast(`人物【${name}】已添加`, 'success');
      }
      GraphStore.log((isEdit ? '编辑人物：' : '新增人物：') + name);
      m.close();
    };
  },

  openRelationModal(existing, preset) {
    const isEdit = !!existing;
    const r = existing || GraphStore.normalizeRelation(Object.assign({
      sourceId: preset.sourceId, targetId: preset.targetId, relationType: '', strength: 5
    }, {}));
    const persons = GraphStore.persons.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    const types = [...GraphStore.relTypes().keys()];
    const optList = (selected) => persons.map(p =>
      `<option value="${Utils.escapeHtml(p.id)}" ${p.id === selected ? 'selected' : ''}>${Utils.escapeHtml(p.name)}（${Utils.escapeHtml(p.id)}）</option>`).join('');
    const typeDatalist = types.map(t => `<option value="${Utils.escapeHtml(t)}">`).join('');

    const m = this.openModal({
      title: isEdit ? '编辑关系' : '新增关系',
      width: 500,
      bodyHTML: `
        <div class="form-row">
          <div class="form-item"><label>起始人物<span class="req">*</span></label><select id="rf-source" ${isEdit ? 'disabled' : ''}>${optList(r.sourceId)}</select></div>
          <div class="form-item"><label>目标人物<span class="req">*</span></label><select id="rf-target" ${isEdit ? 'disabled' : ''}>${optList(r.targetId)}</select></div>
        </div>
        <div class="form-row">
          <div class="form-item"><label>关系类型<span class="req">*</span></label>
            <input type="text" id="rf-type" list="typeList" value="${Utils.escapeHtml(r.relationType === '关联' ? '' : r.relationType)}" placeholder="如：亲属 / 同事 / 师徒 / 敌对">
            <datalist id="typeList">${typeDatalist}</datalist></div>
          <div class="form-item"><label>关系时间</label><input type="text" id="rf-time" value="${Utils.escapeHtml(r.time)}" placeholder="如：2024-01"></div>
        </div>
        <div class="form-item"><label>关系强度：${r.strength || 0} / 10</label>
          <div class="range-row"><input type="range" id="rf-strength" min="1" max="10" value="${r.strength || 5}"><span class="rv" id="rf-strengthV">${r.strength || 5}</span></div>
          <div class="form-hint">强度越高连线越粗、颜色越深，可用于筛选核心关系</div></div>
        <div class="form-item"><label>关系描述</label><textarea id="rf-desc">${Utils.escapeHtml(r.desc)}</textarea></div>
        <div class="form-item"><label>备注</label><input type="text" id="rf-note" value="${Utils.escapeHtml(r.note)}"></div>
        <div class="dt-section-title">线条样式</div>
        <div class="form-row">
          <div class="form-item"><label>线条颜色</label><div class="color-row"><input type="color" id="rf-color" value="${r.style.color || Utils.colorForType(r.relationType)}"><span class="use-auto" id="rf-colorAuto">按类型自动</span></div></div>
          <div class="form-item"><label>线条粗细（0=按强度自动）</label><div class="range-row"><input type="range" id="rf-width" min="0" max="8" value="${r.style.width || 0}"><span class="rv" id="rf-widthV">${r.style.width || 0}</span></div></div>
        </div>
        <div class="form-row">
          <label class="form-check"><input type="checkbox" id="rf-dash" ${r.style.dash ? 'checked' : ''}> 虚线</label>
          <label class="form-check"><input type="checkbox" id="rf-arrow" ${r.style.arrow ? 'checked' : ''}> 箭头</label>
        </div>
      `,
      footerHTML: `${isEdit ? '<button class="btn danger-ghost" data-act="del" style="margin-right:auto">删除关系</button>' : ''}
        <button class="btn" data-act="cancel">取消</button><button class="btn primary" data-act="ok">保存</button>`
    });

    const q = (id) => m.body.querySelector('#' + id);
    q('rf-strength').addEventListener('input', (e) => {
      q('rf-strengthV').textContent = e.target.value;
      q('rf-strength').parentElement.parentElement.querySelector('label').textContent = `关系强度：${e.target.value} / 10`;
    });
    q('rf-width').addEventListener('input', (e) => { q('rf-widthV').textContent = e.target.value; });
    q('rf-colorAuto').onclick = () => { q('rf-color').value = Utils.colorForType(q('rf-type').value.trim() || r.relationType); };
    q('rf-type').addEventListener('change', () => q('rf-colorAuto').click());

    m.body.parentElement.querySelector('[data-act=cancel]').onclick = m.close;
    const delBtn = m.body.parentElement.querySelector('[data-act=del]');
    if (delBtn) delBtn.onclick = async () => { m.close(); await this.deleteSelection([], r.id); };
    m.body.parentElement.querySelector('[data-act=ok]').onclick = () => {
      const type = q('rf-type').value.trim();
      if (!type) { this.toast('请输入关系类型', 'warn'); return; }
      if (q('rf-source').value === q('rf-target').value) { this.toast('起始人物与目标人物不能相同', 'warn'); return; }
      const patch = {
        relationType: type,
        desc: q('rf-desc').value.trim(),
        strength: Number(q('rf-strength').value),
        time: q('rf-time').value.trim(),
        note: q('rf-note').value.trim(),
        style: {
          color: q('rf-color').value === Utils.colorForType(type) ? '' : q('rf-color').value,
          width: Number(q('rf-width').value),
          dash: q('rf-dash').checked,
          arrow: q('rf-arrow').checked
        }
      };
      GraphStore.pushUndo(isEdit ? '编辑关系' : '新增关系');
      if (isEdit) {
        GraphStore.updateRelation(r.id, patch);
        this.toast('关系已更新', 'success');
      } else {
        patch.sourceId = q('rf-source').value;
        patch.targetId = q('rf-target').value;
        const nr = GraphStore.addRelation(patch);
        if (nr) GraphStore.selectEdge(nr.id);
        this.toast(`关系【${type}】已建立`, 'success');
      }
      GraphStore.log((isEdit ? '编辑关系：' : '新增关系：') + type);
      m.close();
    };
  },

  /* ---------- 批量编辑（3.3.3） ---------- */
  openBatchEditModal() {
    const ids = [...GraphStore.selection];
    if (!ids.length) { this.toast('请先框选或按住 Ctrl 单击选中多个节点', 'warn'); return; }
    const groups = [...GraphStore.groups().keys()].filter(g => g !== '未分组');
    const m = this.openModal({
      title: `批量编辑（已选 ${ids.length} 个人物）`,
      width: 460,
      bodyHTML: `
        <div class="form-item"><label>统一设置分组（留空则不修改）</label>
          <input type="text" id="bf-group" list="bfGroupList" placeholder="输入或选择分组名">
          <datalist id="bfGroupList">${groups.map(g => `<option value="${Utils.escapeHtml(g)}">`).join('')}</datalist></div>
        <div class="form-item"><label>追加标签（逗号分隔，留空则不修改）</label>
          <input type="text" id="bf-tags" placeholder="如：核心人物"></div>
        <div class="form-row">
          <div class="form-item"><label>节点填充颜色</label><div class="color-row"><input type="color" id="bf-fill" value="#5b8ff9"><label class="form-check"><input type="checkbox" id="bf-fillOn"> 应用</label></div></div>
          <div class="form-item"><label>节点大小</label><div class="range-row"><input type="range" id="bf-size" min="14" max="60" value="22"><label class="form-check"><input type="checkbox" id="bf-sizeOn"> 应用</label></div></div>
        </div>
        <div class="form-hint" style="margin-bottom:10px">提示：不勾选「应用」的样式项不会被修改</div>
      `,
      footerHTML: `<button class="btn danger-ghost" data-act="del" style="margin-right:auto">批量删除选中</button>
        <button class="btn" data-act="cancel">取消</button><button class="btn primary" data-act="ok">应用修改</button>`
    });
    m.body.parentElement.querySelector('[data-act=cancel]').onclick = m.close;
    m.body.parentElement.querySelector('[data-act=del]').onclick = async () => {
      m.close();
      await this.deleteSelection(ids);
    };
    m.body.parentElement.querySelector('[data-act=ok]').onclick = () => {
      const q = (id) => m.body.querySelector('#' + id);
      GraphStore.pushUndo('批量编辑');
      let changed = 0;
      for (const id of ids) {
        const p = GraphStore.getPerson(id);
        if (!p) continue;
        const patch = {};
        const g = q('bf-group').value.trim();
        if (g) patch.group = g;
        const tags = Utils.parseTags(q('bf-tags').value);
        if (tags.length) patch.tag = [...new Set([...(p.tag || []), ...tags])];
        if (q('bf-fillOn').checked) patch.style = Object.assign({}, p.style, { fill: q('bf-fill').value });
        if (q('bf-sizeOn').checked) patch.style = Object.assign({}, patch.style || p.style, { size: Number(q('bf-size').value) });
        if (Object.keys(patch).length) { GraphStore.updatePerson(id, patch); changed++; }
      }
      GraphStore.log(`批量编辑 ${changed} 个人物`);
      this.toast(`已批量修改 ${changed} 个人物`, 'success');
      m.close();
    };
  },

  /* ---------- 删除（含二次确认，PRD 5.2 / 11.2） ---------- */
  async deleteSelection(personIds, edgeId) {
    const ids = personIds || [...GraphStore.selection];
    const hasEdge = !!edgeId || GraphStore.selectedEdgeId;
    if (!ids.length && !hasEdge) { this.toast(DataIO.MSG.NO_SELECT, 'warn'); return; }

    if (ids.length) {
      const withRels = ids.some(id => GraphStore.neighborsOf(id).length > 0);
      let msg;
      if (ids.length === 1) {
        msg = withRels ? DataIO.MSG.DEL_PERSON : `确认删除人物【${GraphStore.getPerson(ids[0])?.name || ''}】？`;
      } else {
        msg = withRels ? `删除选中的 ${ids.length} 个人物将同步清空所有关联关系，是否确认删除？` : `确认删除选中的 ${ids.length} 个人物？`;
      }
      const ok = await this.confirm({ title: '删除确认', message: msg, danger: true, okText: '删除' });
      if (!ok) return;
      GraphStore.pushUndo(ids.length > 1 ? `批量删除 ${ids.length} 个人物` : '删除人物');
      GraphStore.removePersons(ids);
      GraphStore.log(`删除人物 ${ids.length} 个`);
      this.toast(`已删除 ${ids.length} 个人物及其关联关系（可 Ctrl+Z 撤销）`, 'success');
    } else if (hasEdge) {
      const eid = edgeId || GraphStore.selectedEdgeId;
      const r = GraphStore.getRelation(eid);
      const ok = await this.confirm({
        title: '删除确认',
        message: `确认删除关系【${r ? r.relationType : ''}】？`,
        danger: true, okText: '删除'
      });
      if (!ok) return;
      GraphStore.pushUndo('删除关系');
      GraphStore.removeRelation(eid);
      GraphStore.log('删除关系');
      this.toast('关系已删除（可 Ctrl+Z 撤销）', 'success');
    }
  },

  /* ============================================================
     AI 智能提取（LLM）
     ============================================================ */
  openLlmModal() {
    const cfg = LlmExtract.settings();
    const m = this.openModal({
      title: '🤖 AI 智能提取 · 文本 → 人物关系网',
      width: 640,
      bodyHTML: `
        ${cfg.llmKey ? '' : `<div class="form-hint" style="color:var(--err);margin-bottom:8px">⚠ 尚未配置 AI 服务（系统设置 → AI 服务）。<a href="javascript:void(0)" id="llmGoCfg" style="color:var(--primary)">前往设置</a></div>`}
        <div class="form-item"><label>粘贴任意小说 / 剧本文本（约 1.5 万字内）</label>
          <textarea id="llmText" rows="10" placeholder="粘贴正文，AI 将自动抽取人物、关系与事件…" style="width:100%;resize:vertical"></textarea></div>
        <div class="form-hint" style="margin-bottom:10px">⚠ 隐私提示：文本将发送至你配置的第三方 AI 服务（当前：${Utils.escapeHtml(cfg.llmModel)}）用于提取，发送前请确认内容可接受。</div>
        <div id="llmProgress" class="hidden">
          <div class="progress-wrap"><div class="progress-bar"><div class="progress-inner"></div></div><div class="progress-text">准备中…</div></div>
        </div>
        <div id="llmResult"></div>`,
      footerHTML: `<button class="btn" data-act="cancel">关闭</button><button class="btn primary" data-act="run">🤖 开始提取</button>`
    });
    m.body.parentElement.querySelector('[data-act=cancel]').onclick = m.close;
    const goCfg = m.body.querySelector('#llmGoCfg');
    if (goCfg) goCfg.onclick = () => { m.close(); this.openSettings(); };
    m.body.parentElement.querySelector('[data-act=run]').onclick = async () => {
      const text = m.body.querySelector('#llmText').value;
      const bar = m.body.querySelector('#llmProgress');
      const inner = bar.querySelector('.progress-inner');
      const tlabel = bar.querySelector('.progress-text');
      const result = m.body.querySelector('#llmResult');
      bar.classList.remove('hidden');
      result.innerHTML = '';
      try {
        const res = await LlmExtract.extract(text, (t, msg) => {
          inner.style.width = Math.round(t * 100) + '%';
          if (msg) tlabel.textContent = msg;
        });
        // 校验引用完整性
        const ids = new Set(res.persons.map(p => p.id));
        const orphan = res.relations.filter(r => !ids.has(r.sourceId) || !ids.has(r.targetId)).length;
        result.innerHTML = `
          <div class="dt-section-title">提取结果（待应用）</div>
          <div class="result-summary">
            <div class="rs-card ok"><div class="num">${res.persons.length}</div><div class="lbl">人物</div></div>
            <div class="rs-card ok"><div class="num">${res.relations.length}</div><div class="lbl">关系</div></div>
            <div class="rs-card ok"><div class="num">${res.events.length}</div><div class="lbl">事件</div></div>
            <div class="rs-card ${orphan ? 'bad' : 'ok'}"><div class="num">${orphan}</div><div class="lbl">无效关系引用</div></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
            <select id="llmMode" style="flex:none">
              <option value="replace">替换当前画布</option>
              <option value="append">追加到当前画布</option>
            </select>
            <button class="btn primary" data-act="apply">应用提取结果</button>
          </div>`;
        result.querySelector('[data-act=apply]').onclick = async () => {
          const mode = result.querySelector('#llmMode').value;
          // 构造内存 JSON 文件复用 DataIO.parseFiles 的追加管线：
          // 追加模式下自动完成「ID 去重 + 按姓名/别名合并 + 关系端点重映射」，
          // 与导入 MD/CSV 追加行为一致，避免重复 ID 导致人物丢失/覆盖
          const file = new File([JSON.stringify({ persons: res.persons, relations: res.relations, events: res.events })], 'ai-extract.json', { type: 'application/json' });
          let parsed;
          try {
            parsed = await DataIO.parseFiles([file], { mode }, () => {});
          } catch (e) {
            this.toast(e.message || '应用失败', 'error');
            return;
          }
          const applied = DataIO.applyImport(parsed, mode);
          const errs = (parsed.errors || []).filter(e => e.level !== 'info').length;
          this.toast(`已应用：人物 ${applied.persons} · 关系 ${applied.relations}${applied.events ? ' · 事件 ' + applied.events : ''}${errs ? `（${errs} 条跳过/警告）` : ''}`, 'success');
          m.close();
        };
      } catch (e) {
        bar.classList.add('hidden');
        result.innerHTML = `<div class="form-hint" style="color:var(--err)">提取失败：${Utils.escapeHtml(e.message || String(e))}</div>`;
      }
    };
  },

  /* ============================================================
     导入
     ============================================================ */
  openImportModal() {
    const m = this.openModal({
      title: '一键导入 · 自动生成关系网',
      width: 560,
      bodyHTML: `
        <div class="form-item">
          <label>支持格式：Excel（.xlsx / .xls）、CSV、JSON、Markdown 剧情文档（.md），可多选文件（如人物表.csv + 关系表.csv）</label>
          <div id="importDrop" style="border:2px dashed var(--border);border-radius:10px;padding:30px;text-align:center;cursor:pointer;transition:border-color .15s">
            <div style="font-size:34px">📥</div>
            <div style="margin:8px 0 4px;font-weight:600">点击选择文件，或将文件拖拽到此处</div>
            <div class="form-hint">Markdown 剧情文档可自动解析人物条目、ASCII 家族树、关系恩怨（×/↔）、时间线与登场速览表</div>
          </div>
          <input type="file" id="importFile" multiple accept=".xlsx,.xls,.csv,.json,.txt,.md,.markdown" style="display:none">
        </div>
        <div class="form-row">
          <div class="form-item"><label>导入方式</label>
            <select id="importMode"><option value="replace">替换当前画布</option><option value="append">追加到当前画布</option></select></div>
          <div class="form-item"><label>容错导入</label>
            <div style="height:34px;display:flex;align-items:center"><label class="form-check"><input type="checkbox" id="importTolerant" checked disabled> 错误数据跳过，正确数据正常导入</label></div></div>
        </div>
        <div id="importProgress" class="hidden">
          <div class="progress-wrap"><div class="progress-bar"><div class="progress-inner"></div></div><div class="progress-text">准备中…</div></div>
        </div>
        <div id="importResult"></div>
        <div class="form-hint" style="margin-top:10px">首次使用？<a href="javascript:void(0)" id="tplLink" style="color:var(--primary)">下载标准导入模板</a>，按模板填写数据即可避免格式错误</div>
      `,
      footerHTML: `<button class="btn" data-act="close">关闭</button>`
    });
    m.body.parentElement.querySelector('[data-act=close]').onclick = m.close;

    const drop = m.body.querySelector('#importDrop');
    const fileInput = m.body.querySelector('#importFile');
    const progressBox = m.body.querySelector('#importProgress');
    const resultBox = m.body.querySelector('#importResult');
    m.body.querySelector('#tplLink').onclick = () => this.openTemplateModal();

    drop.onclick = () => fileInput.click();
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--primary)'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = 'var(--border)'; });
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.style.borderColor = 'var(--border)';
      if (e.dataTransfer.files.length) {
        // 立即拷贝文件列表：runImport 中的确认弹窗会让出主线程，此后 input.value 重置会使原 FileList 失效
        this.runImport(Array.from(e.dataTransfer.files), m, progressBox, resultBox);
      }
    });
    fileInput.onchange = () => {
      if (fileInput.files.length) {
        const files = Array.from(fileInput.files);
        this.runImport(files, m, progressBox, resultBox);
      }
      fileInput.value = '';
    };
  },

  async runImport(files, modal, progressBox, resultBox) {
    // 空画布直接替换；有内容且为替换模式时确认
    const mode = modal.body.querySelector('#importMode').value;
    if (mode === 'replace' && !GraphStore.isEmpty()) {
      const ok = await this.confirm({
        title: '导入确认',
        message: '选择"替换当前画布"将清空当前已加载的人物与关系数据，是否继续？',
        danger: true, okText: '继续导入'
      });
      if (!ok) return;
    }
    progressBox.classList.remove('hidden');
    resultBox.innerHTML = '';
    const bar = progressBox.querySelector('.progress-inner');
    const text = progressBox.querySelector('.progress-text');

    try {
      const parsed = await DataIO.parseFiles(files, { mode }, (t, msg) => {
        bar.style.width = Math.round(t * 60) + '%';
        text.textContent = msg || '正在解析并校验数据… ' + Math.round(t * 100) + '%';
      });
      bar.style.width = '70%'; text.textContent = '正在写入画布…';
      await Utils.nextFrame();

      const applied = DataIO.applyImport(parsed, mode);
      bar.style.width = '80%'; text.textContent = '正在自动布局…';

      // 自动布局
      const settings = ProjectStore.loadSettings();
      await Layouts.apply(settings.defaultLayout || 'force');
      Renderer.fitView();
      bar.style.width = '100%'; text.textContent = '导入完成';
      GraphStore.dirty = true;
      GraphStore.emitChange();

      const allNotes = parsed.errors || [];
      const errs = allNotes.filter(e => e.level !== 'info');   // 真实异常（error/warn）
      const infos = allNotes.filter(e => e.level === 'info');  // 解析统计 / 提示（不视为异常）
      const errItems = errs.map(e => `
        <div class="error-item ${e.level === 'warn' ? 'warn' : ''}">
          <span class="e-tag">${e.level === 'warn' ? '警告' : '错误'}</span>
          <span style="flex:none;color:var(--sub)">[${Utils.escapeHtml(e.table)} 第${e.row}行]</span>
          <span class="e-msg">${Utils.escapeHtml(e.msg)}</span>
        </div>`).join('');

      resultBox.innerHTML = `
        <div class="dt-section-title">导入结果</div>
        <div class="result-summary">
          <div class="rs-card ok"><div class="num">${applied.persons}</div><div class="lbl">人物导入成功</div></div>
          <div class="rs-card ok"><div class="num">${applied.relations}</div><div class="lbl">关系导入成功</div></div>
          ${applied.events ? `<div class="rs-card ok"><div class="num">${applied.events}</div><div class="lbl">时间线事件</div></div>` : ''}
          <div class="rs-card ${errs.length ? 'bad' : ''}"><div class="num">${errs.length}</div><div class="lbl">异常 / 跳过</div></div>
        </div>
        ${infos.length ? `<div class="form-hint" style="margin-top:8px">${infos.slice(0, 5).map(i => Utils.escapeHtml(i.msg)).join('<br>')}${infos.length > 5 ? '<br>…' : ''}</div>` : ''}
        ${errs.length ? `
          <div class="error-list">${errItems}</div>
          <div style="margin-top:10px;text-align:right">
            <button class="btn sm" id="btnErrorLog">导出错误日志</button>
          </div>` : ''}
      `;
      if (errs.length) {
        resultBox.querySelector('#btnErrorLog').onclick = () => {
          // 复用 DataIO 的 CSV 转义（含公式注入防护）
          const aoa = [['级别', '数据表', '行号', '说明']];
          for (const e of errs) aoa.push([e.level === 'warn' ? '警告' : '错误', e.table, e.row, e.msg]);
          Utils.download('导入错误日志.csv', DataIO._csvFromAoa(aoa), 'text/csv');
        };
        this.toast(`导入完成：${applied.persons} 人物 / ${applied.relations} 关系，${errs.length} 条异常已跳过，详情见导入窗口`, errs.length ? 'warn' : 'success');
      } else {
        this.toast(`导入成功！已自动生成 ${applied.persons} 个人物、${applied.relations} 条关系的动态关系网`, 'success');
      }
      GraphStore.log(`导入文件：${parsed.fileName}（人物 ${applied.persons}，关系 ${applied.relations}，异常 ${errs.length}）`);
    } catch (e) {
      progressBox.classList.add('hidden');
      this.toast(e.message || DataIO.MSG.BROKEN, 'error');
    }
  },

  openTemplateModal() {
    const m = this.openModal({
      title: '下载标准导入模板',
      bodyHTML: `
        <div style="line-height:1.8;font-size:13px">
          模板包含「人物信息表」「关系信息表」「时间线事件表」三张表单：<br>
          · 人物信息表必填：<b>人物ID</b>、<b>人物姓名</b>；选填：英文名/别名、头像、简介、标签、性别、年龄、身份职位、归属分组<br>
          · 关系信息表必填：<b>起始人物ID</b>、<b>目标人物ID</b>、<b>关系类型</b>；选填：关系描述、关系强度（1-10）、关系时间、备注<br>
          · 时间线事件表必填：<b>事件名称</b>；选填：时间/年代、排序序号、时期/篇章、事件说明、关联人物（按姓名）
        </div>`,
      footerHTML: `
        <button class="btn" data-act="csv">CSV 模板</button>
        <button class="btn" data-act="json">JSON 模板</button>
        <button class="btn primary" data-act="xlsx">Excel 模板（推荐）</button>`
    });
    m.body.parentElement.querySelector('[data-act=xlsx]').onclick = () => { DataIO.downloadTemplate('xlsx'); this.toast('Excel 模板已下载', 'success'); };
    m.body.parentElement.querySelector('[data-act=csv]').onclick = () => { DataIO.downloadTemplate('csv'); this.toast('CSV 模板已下载（两张表）', 'success'); };
    m.body.parentElement.querySelector('[data-act=json]').onclick = () => { DataIO.downloadTemplate('json'); this.toast('JSON 模板已下载', 'success'); };
  },

  /* ============================================================
     导出
     ============================================================ */
  openExportModal() {
    const m = this.openModal({
      title: '导出中心',
      width: 560,
      bodyHTML: `
        <div class="dt-section-title" style="border:none;margin-top:0;padding-top:0">可视化成果导出（无水印）</div>
        <div class="form-item" style="max-width:280px"><label>图片分辨率（PNG / JPG / PDF 适用）</label>
          <select id="expScale"><option value="1">标准 1×（适合屏幕查看）</option><option value="2" selected>高清 2×（推荐）</option><option value="3">超清 3×（适合打印）</option></select>
          <div class="form-hint">SVG 矢量图无限缩放，不依赖分辨率</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn" data-act="png">PNG 图片</button>
          <button class="btn" data-act="jpg">JPG 图片</button>
          <button class="btn" data-act="pngt">透明底 PNG</button>
          <button class="btn primary" data-act="pdf">PDF 文件</button>
          <button class="btn" data-act="svg">SVG 矢量图</button>
          <label class="form-check" style="margin:0"><input type="checkbox" id="expEdgeLabels"> 含边标签</label>
        </div>
        <div class="dt-section-title">源数据导出（可二次修改 / 存档 / 复用）</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-act="json">JSON</button>
          <button class="btn" data-act="csv">CSV（两张表）</button>
          <button class="btn" data-act="xlsx">Excel</button>
        </div>
        <div class="dt-section-title">分享发布（单文件，对方双击即看）</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn" data-act="share">📤 只读分享页（单文件 HTML）</button>
          <span class="form-hint" style="margin:0">含交互：缩放 / 悬浮 / 点击聚焦 / 时间轴</span>
        </div>
        <div class="dt-section-title">工程文件（包含节点位置 / 样式 / 布局信息，可恢复编辑状态）</div>
        <div class="form-row" style="align-items:flex-end">
          <div class="form-item"><label>加密密码（可选，留空则不加密）</label>
            <input type="password" id="expPwd" placeholder="自定义密码锁定重要工程"></div>
          <div class="form-item"><label>&nbsp;</label>
            <button class="btn primary" data-act="project">保存工程文件</button></div>
        </div>
      `
    });
    const q = (s) => m.body.querySelector(s);
    const scale = () => Number(q('#expScale').value);
    const imgGuard = () => {
      if (GraphStore.isEmpty()) { this.toast(DataIO.MSG.EMPTY_EXPORT, 'warn'); return false; }
      return true;
    };
    m.body.parentElement.querySelector('[data-act=png]').onclick = async () => { if (imgGuard()) { const r = await DataIO.exportImage('png', scale()); if (r && r.ok) this.toast(`PNG 已导出（${r.w}×${r.h}）`, 'success'); } };
    m.body.parentElement.querySelector('[data-act=jpg]').onclick = async () => { if (imgGuard()) { const r = await DataIO.exportImage('jpg', scale()); if (r && r.ok) this.toast(`JPG 已导出（${r.w}×${r.h}）`, 'success'); } };
    m.body.parentElement.querySelector('[data-act=pngt]').onclick = async () => { if (imgGuard()) { const r = await DataIO.exportImage('png-transparent', scale()); if (r && r.ok) this.toast(`透明底 PNG 已导出（${r.w}×${r.h}）`, 'success'); } };
    m.body.parentElement.querySelector('[data-act=pdf]').onclick = () => { if (imgGuard()) { const r = DataIO.exportPDF(scale()); if (r && r.ok) this.toast('PDF 文件已导出', 'success'); } };
    m.body.parentElement.querySelector('[data-act=svg]').onclick = () => {
      if (imgGuard()) {
        const r = DataIO.exportDataSVG({ labels: q('#expEdgeLabels').checked });
        if (r && r.ok) this.toast(`SVG 矢量图已导出（${r.w}×${r.h}，可无限缩放${r.labels ? ' · 含边标签' : ''}）`, 'success');
      }
    };
    m.body.parentElement.querySelector('[data-act=json]').onclick = () => { if (imgGuard()) { DataIO.exportDataJSON(); this.toast('JSON 源数据已导出', 'success'); } };
    m.body.parentElement.querySelector('[data-act=csv]').onclick = () => { if (imgGuard()) { DataIO.exportDataCSV(); this.toast('CSV 源数据已导出（两张表）', 'success'); } };
    m.body.parentElement.querySelector('[data-act=xlsx]').onclick = () => { if (imgGuard()) { const r = DataIO.exportDataXLSX(); if (r && r.ok) this.toast('Excel 源数据已导出', 'success'); } };
    m.body.parentElement.querySelector('[data-act=share]').onclick = () => {
      if (imgGuard()) {
        const html = SharePage.build();
        Utils.download(`${GraphStore.projectName}-分享页.html`, new Blob([html], { type: 'text/html;charset=utf-8' }), 'text/html');
        GraphStore.log('导出只读分享页');
        this.toast('只读分享页已导出（单文件，可直接发送给他人）', 'success');
      }
    };
    m.body.parentElement.querySelector('[data-act=project]').onclick = async () => {
      const pwd = q('#expPwd').value;
      try {
        const data = DataIO.buildProjectData();
        let out = data, ext = 'rgxw.json';
        if (pwd) {
          try { out = await DataIO.encryptProject(data, pwd); ext = 'rgxw'; }
          catch (e) { this.toast(e.message, 'warn'); return; }
        }
        Utils.download(`${GraphStore.projectName}.${ext}`, JSON.stringify(out, null, 2), 'application/json');
        GraphStore.log('导出工程文件' + (pwd ? '（已加密）' : ''));
        this.toast('工程文件已导出' + (pwd ? '（已密码加密，打开需输入密码）' : ''), 'success');
      } catch (e) {
        this.toast(DataIO.MSG.SAVE_FAIL, 'error');
      }
    };
  },

  /* ============================================================
     工程管理（3.7）
     ============================================================ */
  async saveCurrentProject(silent) {
    if (GraphStore.isEmpty() && !this.currentProjectId) {
      this.toast('当前画布为空，无需保存', 'warn'); return;
    }
    const data = DataIO.buildProjectData();
    let preview = '';
    try {
      const res = DataIO.renderToCanvas(Math.min(0.5, 280 / Math.max(1, Renderer.bboxOfVisible() ? Renderer.bboxOfVisible().w : 280)), false);
      if (res && res.canvas) {
        const t = document.createElement('canvas');
        t.width = 280; t.height = 210;
        const ctx = t.getContext('2d');
        const s = Math.min(280 / res.canvas.width, 210 / res.canvas.height);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 280, 210);
        ctx.drawImage(res.canvas, (280 - res.canvas.width * s) / 2, (210 - res.canvas.height * s) / 2, res.canvas.width * s, res.canvas.height * s);
        preview = t.toDataURL('image/jpeg', 0.6);
      }
    } catch (e) { /* 预览失败不影响保存 */ }

    try {
      this.currentProjectId = await ProjectStore.saveProject({
        id: this.currentProjectId, name: GraphStore.projectName,
        data, preview,
        stats: { persons: GraphStore.persons.length, relations: GraphStore.relations.length }
      });
      GraphStore.dirty = false;
      ProjectStore.setLastSession({ id: this.currentProjectId, name: GraphStore.projectName, time: Date.now() });
      document.getElementById('sbSave').textContent = '已保存 ' + Utils.formatTime(Date.now()).slice(11);
      if (!silent) { this.toast(`工程《${GraphStore.projectName}》已保存到本地工程列表`, 'success'); GraphStore.log('手动保存工程'); }
    } catch (e) {
      this.toast(DataIO.MSG.SAVE_FAIL, 'error');
    }
  },

  async openProjectManager() {
    const list = await ProjectStore.listProjects();
    const sorted = list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const m = this.openModal({
      title: '工程列表',
      width: 600,
      bodyHTML: `
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
          <button class="btn primary sm" data-act="new">＋ 新建空白工程</button>
          <button class="btn sm" data-act="openfile">📂 打开工程文件</button>
          <button class="btn sm" data-act="savecur">💾 保存当前工程</button>
          <span style="flex:1"></span>
          <label class="form-check" style="margin:0"><input type="checkbox" id="projSelAll"> 全选</label>
          <button class="btn danger-ghost sm" id="btnProjBatchDel" disabled>🗑 删除选中</button>
        </div>
        <div class="proj-list" id="projList"></div>`,
      footerHTML: `<button class="btn" data-act="close">关闭</button>`
    });
    m.body.parentElement.querySelector('[data-act=close]').onclick = m.close;
    m.body.parentElement.querySelector('[data-act=new]').onclick = async () => { m.close(); await this.newProject(); };
    m.body.parentElement.querySelector('[data-act=openfile]').onclick = () => { m.close(); this.openProjectFilePicker(); };
    m.body.parentElement.querySelector('[data-act=savecur]').onclick = async () => { await this.saveCurrentProject(true); m.close(); this.openProjectManager(); this.toast('当前工程已保存', 'success'); };

    const listBox = m.body.querySelector('#projList');
    if (!sorted.length) {
      listBox.innerHTML = '<div class="proj-empty">暂无已保存工程<br>导入数据或添加人物后，点击「保存当前工程」即可</div>';
    } else {
      listBox.innerHTML = sorted.map(pr => `
        <div class="proj-item" data-id="${pr.id}">
          <label class="proj-check" title="选择该工程"><input type="checkbox" class="projSel" data-id="${pr.id}"></label>
          ${pr.preview ? `<img class="proj-thumb" src="${Utils.escapeHtml(pr.preview)}">` : `<div class="proj-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--sub)">🕸</div>`}
          <div class="proj-info">
            <div class="proj-name-t">${Utils.escapeHtml(pr.name)} ${this.currentProjectId === pr.id ? '<span class="dt-tag" style="font-size:10px">当前</span>' : ''}</div>
            <div class="proj-meta">${Utils.formatTime(pr.updatedAt || Date.now())} · 人物 ${pr.stats ? pr.stats.persons : '?'} · 关系 ${pr.stats ? pr.stats.relations : '?'}</div>
          </div>
          <div class="proj-acts">
            <button class="btn primary sm" data-act="open">打开</button>
            <button class="btn sm" data-act="rename">重命名</button>
            <button class="btn danger-ghost sm" data-act="del">删除</button>
          </div>
        </div>`).join('');
      listBox.querySelectorAll('.proj-item').forEach(item => {
        const id = item.dataset.id;
        item.querySelector('[data-act=open]').onclick = async () => { m.close(); await this.loadProjectById(id); };
        item.querySelector('[data-act=rename]').onclick = async () => {
          const pr = await ProjectStore.getProject(id);
          const name = await this.prompt({ title: '重命名工程', label: '工程名称', value: pr.name });
          if (name) { pr.name = name; await ProjectStore.saveProject(pr); m.close(); this.openProjectManager(); }
        };
        item.querySelector('[data-act=del]').onclick = async () => {
          const pr = await ProjectStore.getProject(id);
          const ok = await this.confirm({ title: '删除确认', message: `确认删除工程《${pr.name}》？该操作不可恢复。`, danger: true, okText: '删除' });
          if (ok) {
            await ProjectStore.deleteProject(id);
            if (this.currentProjectId === id) this.currentProjectId = null;
            m.close(); this.openProjectManager();
            this.toast('工程已删除', 'success');
          }
        };
      });

      // ---------- 批量选择删除 ----------
      const selAll = m.body.querySelector('#projSelAll');
      const batchDel = m.body.querySelector('#btnProjBatchDel');
      const selCheckboxes = listBox.querySelectorAll('.projSel');
      const refreshBatchBtn = () => {
        const n = listBox.querySelectorAll('.projSel:checked').length;
        batchDel.disabled = !n;
        batchDel.textContent = n ? `🗑 删除选中 (${n})` : '🗑 删除选中';
      };
      selCheckboxes.forEach(cb => cb.addEventListener('change', refreshBatchBtn));
      selAll.addEventListener('change', () => {
        selCheckboxes.forEach(cb => { cb.checked = selAll.checked; });
        refreshBatchBtn();
      });
      batchDel.onclick = async () => {
        const ids = [...listBox.querySelectorAll('.projSel:checked')].map(cb => cb.dataset.id);
        if (!ids.length) return;
        const ok = await this.confirm({
          title: '批量删除确认',
          message: `确定删除选中的 ${ids.length} 个工程？该操作不可恢复。`,
          danger: true, okText: '删除'
        });
        if (!ok) return;
        for (const id of ids) {
          try { await ProjectStore.deleteProject(id); } catch (e) { /* 单个失败不阻断批量 */ }
          if (this.currentProjectId === id) this.currentProjectId = null;
        }
        m.close(); this.openProjectManager();
        this.toast(`已删除 ${ids.length} 个工程`, 'success');
      };
    }
  },

  async loadProjectById(id) {
    const pr = await ProjectStore.getProject(id);
    if (!pr || !pr.data) { this.toast('工程数据读取失败，可能已被删除', 'error'); return; }
    try {
      const res = DataIO.applyProject(pr.data);
      this.currentProjectId = id;
      this.currentTheme = res.theme || this.currentTheme;
      document.body.dataset.theme = this.currentTheme;
      Renderer.setThemeName(this.currentTheme);
      ProjectStore.saveSettings({ theme: this.currentTheme });
      ProjectStore.setLastSession({ id, name: pr.name, time: Date.now() });
      this.updateAll();
      Renderer.requestDraw();
      this.toast(`工程《${pr.name}》已打开，编辑状态已恢复`, 'success');
    } catch (e) {
      this.toast(DataIO.MSG.PROJECT_BROKEN, 'error');
    }
  },

  openProjectFilePicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.rgxw,.rgxw.json,.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        let obj;
        try { obj = await DataIO.readProjectFile(file); }
        catch (e) {
          if (e.needPassword) {
            const pwd = await this.prompt({ title: '工程已加密', label: '请输入工程密码', value: '' });
            if (!pwd) return;
            obj = await DataIO.readProjectFile(file, pwd);
          } else throw e;
        }
        const res = DataIO.applyProject(obj);
        this.currentProjectId = null;
        this.currentTheme = res.theme || 'light';
        document.body.dataset.theme = this.currentTheme;
        Renderer.setThemeName(this.currentTheme);
        this.updateAll();
        this.toast(`工程《${GraphStore.projectName}》已打开`, 'success');
      } catch (e) {
        if (e && e.wrongPassword) this.toast('密码错误，无法解密工程文件', 'error');
        else this.toast(e.message || DataIO.MSG.PROJECT_BROKEN, 'error');
      }
    };
    input.click();
  },

  async newProject() {
    if (!GraphStore.isEmpty()) {
      const ok = await this.confirm({
        title: '新建工程',
        message: '当前工程尚未保存，新建将清空画布内容（可先 Ctrl+S 保存）。是否继续？',
        danger: true, okText: '新建'
      });
      if (!ok) return;
    }
    GraphStore.init();
    this.currentProjectId = null;
    Renderer.resetView();
    this.updateAll();
    this.toast('已新建空白工程，可导入数据或手动添加人物', 'success');
  },

  /* ---------- 自动保存（PRD 13.2：默认30秒，10-300s可调） ---------- */
  applyAutosave() {
    if (this._autosaveTimer) clearInterval(this._autosaveTimer);
    const s = ProjectStore.loadSettings();
    if (!s.autosave) { document.getElementById('sbSave').textContent = '自动保存已关闭'; return; }
    const interval = Utils.clamp(s.autosaveInterval || 30, 10, 300) * 1000;
    this._autosaveTimer = setInterval(async () => {
      if (this._saving) return; // 防止慢速保存与下一轮定时叠加
      if (GraphStore.dirty && !GraphStore.isEmpty()) {
        this._saving = true;
        try { await this.saveCurrentProject(true); }
        finally { this._saving = false; }
      }
    }, interval);
  },

  /* ============================================================
     主题 / 全局样式 / 设置
     ============================================================ */
  openThemesModal() {
    // 主题列表直接从画布主题表派生（THEMES 带 name/group），新增主题只需改 Renderer.THEMES 一处
    const GROUP_ORDER = [['classic', '经典'], ['nature', '自然'], ['warm', '暖阳'], ['cool', '冷调'],
      ['pink', '粉紫'], ['redgold', '炽金'], ['retro', '复古'], ['trendy', '潮流'],
      ['chinese', '国风'], ['dessert', '甜品'], ['scifi', '科幻'], ['gothic', '暗黑']];
    const entries = Object.entries(Renderer.THEMES);
    const cardHTML = (id, t) => `
        <div class="theme-card ${this.currentTheme === id ? 'active' : ''}" data-theme="${id}">
          <div class="theme-preview" style="background:${t.bg}">
            <i style="width:16px;height:16px;background:${t.primary};left:22%;top:38%"></i>
            <i style="width:12px;height:12px;background:${t.primary};left:52%;top:22%;opacity:.7"></i>
            <i style="width:14px;height:14px;background:${t.primary};left:64%;top:55%;opacity:.8"></i>
          </div>
          <div class="t-name">${t.name}</div>
        </div>`;
    const bodyHTML = GROUP_ORDER.map(([gid, gname]) => {
      const items = entries.filter(([id, t]) => (t.group || 'classic') === gid);
      if (!items.length) return '';
      return `<div class="theme-group"><div class="theme-group-title">${gname}</div>
        <div class="theme-grid">${items.map(([id, t]) => cardHTML(id, t)).join('')}</div></div>`;
    }).join('');
    const names = Object.fromEntries(entries);
    const m = this.openModal({ title: '主题切换', bodyHTML });
    m.body.querySelectorAll('.theme-card').forEach(card => {
      card.onclick = () => {
        this.currentTheme = card.dataset.theme;
        document.body.dataset.theme = this.currentTheme;
        Renderer.setThemeName(this.currentTheme);
        ProjectStore.saveSettings({ theme: this.currentTheme });
        GraphStore.dirty = true;
        m.close();
        this.toast(`已切换至${names[this.currentTheme].name}`, 'success');
      };
    });
  },

  openStyleModal() {
    const o = Renderer.options;
    const m = this.openModal({
      title: '全局样式设置',
      width: 520,
      bodyHTML: `
        <div class="style-grid">
          <div class="form-item"><label>节点默认大小</label>
            <div class="range-row"><input type="range" id="st-nodeSize" min="14" max="48" value="${o.nodeSize}"><span class="rv">${o.nodeSize}</span></div></div>
          <div class="form-item"><label>节点文字大小</label>
            <div class="range-row"><input type="range" id="st-labelSize" min="10" max="20" value="${o.labelSize}"><span class="rv">${o.labelSize}</span></div></div>
          <div class="form-item"><label>关系线弯曲度</label>
            <div class="range-row"><input type="range" id="st-curvature" min="0" max="30" value="${Math.round(o.curvature * 100)}"><span class="rv">${Math.round(o.curvature * 100)}%</span></div></div>
          <div class="form-item"><label>关系线粗细倍率</label>
            <div class="range-row"><input type="range" id="st-edgeWidth" min="5" max="30" value="${Math.round(o.edgeWidthMul * 10)}"><span class="rv">${o.edgeWidthMul.toFixed(1)}×</span></div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
          <label class="form-check"><input type="checkbox" id="st-arrow" ${o.showArrow ? 'checked' : ''}> 关系线显示箭头</label>
          <label class="form-check"><input type="checkbox" id="st-edgeLabels" ${o.showEdgeLabels ? 'checked' : ''}> 显示关系标签</label>
          <label class="form-check"><input type="checkbox" id="st-byGroup" ${o.colorByGroup ? 'checked' : ''}> 按分组自动配色</label>
        </div>
        <div class="form-hint" style="margin-top:8px">以上为全局默认样式；单个节点 / 关系线可在其编辑弹窗中单独自定义，将覆盖全局设置</div>`,
      footerHTML: `<button class="btn" data-act="reset">恢复默认</button><button class="btn primary" data-act="ok">应用</button>`
    });
    const q = (s) => m.body.querySelector(s);
    m.body.parentElement.querySelector('[data-act=reset]').onclick = () => {
      Renderer.options = { nodeSize: 22, labelSize: 13, curvature: 0.12, showArrow: false, showEdgeLabels: false, edgeWidthMul: 1, colorByGroup: true };
      GraphStore.emitChange();
      m.close();
      this.toast('已恢复默认样式', 'success');
    };
    m.body.parentElement.querySelector('[data-act=ok]').onclick = () => {
      Renderer.options = {
        nodeSize: Number(q('#st-nodeSize').value),
        labelSize: Number(q('#st-labelSize').value),
        curvature: Number(q('#st-curvature').value) / 100,
        edgeWidthMul: Number(q('#st-edgeWidth').value) / 10,
        showArrow: q('#st-arrow').checked,
        showEdgeLabels: q('#st-edgeLabels').checked,
        colorByGroup: q('#st-byGroup').checked
      };
      GraphStore.dirty = true;
      GraphStore.emitChange();
      m.close();
      this.toast('全局样式已应用', 'success');
    };
  },

  openSettings() {
    const s = ProjectStore.loadSettings();
    const m = this.openModal({
      title: '系统设置',
      width: 540,
      bodyHTML: `
        <div class="dt-section-title" style="border:none;margin-top:0;padding-top:0">自动保存</div>
        <label class="form-check"><input type="checkbox" id="set-autosave" ${s.autosave ? 'checked' : ''}> 开启自动保存（定时备份工程数据，防止数据丢失）</label>
        <div class="form-item" style="margin-top:10px"><label>自动保存间隔（10 - 300 秒）</label>
          <div class="range-row"><input type="range" id="set-interval" min="10" max="300" step="5" value="${Utils.clamp(s.autosaveInterval || 30, 10, 300)}"><span class="rv" id="set-intervalV">${Utils.clamp(s.autosaveInterval || 30, 10, 300)}s</span></div></div>

        <div class="dt-section-title">导入默认布局</div>
        <div class="form-item"><select id="set-layout">
          <option value="force" ${s.defaultLayout === 'force' ? 'selected' : ''}>力导向布局（默认）</option>
          <option value="circular" ${s.defaultLayout === 'circular' ? 'selected' : ''}>环形布局</option>
          <option value="tree" ${s.defaultLayout === 'tree' ? 'selected' : ''}>层级树状布局</option>
          <option value="grid" ${s.defaultLayout === 'grid' ? 'selected' : ''}>网格布局</option>
          <option value="grouped" ${s.defaultLayout === 'grouped' ? 'selected' : ''}>分簇布局</option>
          <option value="community" ${s.defaultLayout === 'community' ? 'selected' : ''}>自动分簇（社区发现）</option>
          <option value="radial" ${s.defaultLayout === 'radial' ? 'selected' : ''}>放射状布局</option>
        </select></div>

        <div class="dt-section-title">操作日志（最近 300 条）</div>
        <div class="error-list" style="max-height:180px">
          ${GraphStore.logEntries.length ? GraphStore.logEntries.map(l =>
            `<div class="error-item"><span style="flex:none;color:var(--sub)">${Utils.formatTime(l.t)}</span><span class="e-msg">${Utils.escapeHtml(l.text)}</span></div>`).join('')
          : '<div class="error-item"><span class="e-msg">暂无操作记录</span></div>'}
        </div>
        <div class="dt-section-title">AI 服务（智能提取功能，可选配置）</div>
        <div class="form-hint" style="margin-bottom:8px">OpenAI 兼容接口；密钥仅保存在本机浏览器。⚠ 使用智能提取会把文本发送至该服务。</div>
        <div class="form-row">
          <div class="form-item" style="flex:2"><label>服务地址 Base URL</label>
            <input type="text" id="set-llmBase" value="${Utils.escapeHtml(s.llmBase || '')}" placeholder="https://api.deepseek.com/v1"></div>
          <div class="form-item"><label>模型名</label>
            <input type="text" id="set-llmModel" value="${Utils.escapeHtml(s.llmModel || '')}" placeholder="deepseek-chat"></div>
        </div>
        <div class="form-row">
          <div class="form-item" style="flex:2"><label>API 密钥</label>
            <input type="password" id="set-llmKey" value="${Utils.escapeHtml(s.llmKey || '')}" placeholder="sk-…"></div>
          <div class="form-item" style="align-self:flex-end"><button class="btn sm" id="btnTestLlm">测试连接</button></div>
        </div>
        <div class="form-hint" style="margin-top:8px">所有数据 100% 本地离线存储，不上传云端；工程文件支持自定义密码加密</div>`,
      footerHTML: `<button class="btn" data-act="close">关闭</button><button class="btn primary" data-act="ok">保存设置</button>`
    });
    m.body.parentElement.querySelector('[data-act=close]').onclick = m.close;
    m.body.querySelector('#set-interval').addEventListener('input', (e) => {
      m.body.querySelector('#set-intervalV').textContent = e.target.value + 's';
    });
    m.body.querySelector('#btnTestLlm').onclick = async () => {
      const base = m.body.querySelector('#set-llmBase').value.trim().replace(/\/+$/, '');
      const model = m.body.querySelector('#set-llmModel').value.trim();
      const key = m.body.querySelector('#set-llmKey').value.trim();
      if (!base || !model || !key) { this.toast('请先填写服务地址、模型与密钥', 'warn'); return; }
      const btn = m.body.querySelector('#btnTestLlm');
      btn.disabled = true; btn.textContent = '测试中…';
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        const resp = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({ model, temperature: 0, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (resp.ok) this.toast('连接成功 ✓（模型可用）', 'success');
        else this.toast(`连接失败：HTTP ${resp.status}，请检查地址/密钥/模型名`, 'error');
      } catch (e) {
        this.toast('连接失败：' + (e.message || '网络错误') + '（部分服务不允许浏览器直连，需 CORS 支持）', 'error');
      }
      btn.disabled = false; btn.textContent = '测试连接';
    };
    m.body.parentElement.querySelector('[data-act=ok]').onclick = () => {
      ProjectStore.saveSettings({
        autosave: m.body.querySelector('#set-autosave').checked,
        autosaveInterval: Number(m.body.querySelector('#set-interval').value),
        defaultLayout: m.body.querySelector('#set-layout').value,
        llmBase: m.body.querySelector('#set-llmBase').value.trim(),
        llmModel: m.body.querySelector('#set-llmModel').value.trim(),
        llmKey: m.body.querySelector('#set-llmKey').value.trim()
      });
      this.applyAutosave();
      m.close();
      this.toast('设置已保存', 'success');
    };
  },

  /* ============================================================
     快捷键 / 引导 / 关于
     ============================================================ */
  bindShortcuts() {
    document.addEventListener('keydown', (e) => {
      const inInput = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      const ctrl = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        if (this.modalCount() > 0) { this.closeTopModal(); return; }
        hideCtxMenuSafe();
        // 全屏模式下 ESC 优先退出全屏
        if (document.body.classList.contains('canvas-fullscreen')) { this.toggleFullscreen(); return; }
        if (this.pathModeFrom) { this.exitPathMode(); return; }
        if (this.connectMode) { this.exitConnectMode(); return; }
        if (document.activeElement === document.getElementById('searchInput')) return; // 由输入框自行处理
        if (GraphStore.pinnedId) { GraphStore.clearPinned(); return; }
        if (GraphStore.selection.size || GraphStore.selectedEdgeId) { GraphStore.clearSelection(); Renderer.requestDraw(); return; }
        if (GraphStore.focus.depth > 0) { GraphStore.clearFocus(); this.updateFocusBar(); return; }
        if (GraphStore.highlight.ids) { GraphStore.clearHighlight(); this.updateFocusBar(); this.renderTimeline(); return; }
        if (GraphStore.hasActiveFilter()) { GraphStore.clearFilter(); this.renderFilterPanel(); this.toast('已清空筛选状态', 'info'); }
        return;
      }
      if (inInput) return;

      if (ctrl && e.shiftKey && (e.key === 'I' || e.key === 'i')) { e.preventDefault(); this.openImportModal(); return; }
      if (ctrl && e.shiftKey && (e.key === 'E' || e.key === 'e')) { e.preventDefault(); this.openExportModal(); return; }
      if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); this.doUndo(); return; }
      if (ctrl && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) { e.preventDefault(); this.doRedo(); return; }
      if (ctrl && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.saveCurrentProject(false); return; }
      if (ctrl && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); this.openProjectFilePicker(); return; }
      if (ctrl && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); this.newProject(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelection();
        return;
      }
      if (e.key === 'f' || e.key === 'F') { if (!ctrl) { Renderer.fitView(); } }
    });
    function hideCtxMenuSafe() { document.getElementById('ctxMenu').classList.add('hidden'); }
  },
  doUndo() {
    if (GraphStore.undo()) { this.toast('已撤销', 'info'); this.updateAll(); }
    else this.toast('没有可撤销的操作', 'info');
  },
  doRedo() {
    if (GraphStore.redo()) { this.toast('已重做', 'info'); this.updateAll(); }
    else this.toast('没有可重做的操作', 'info');
  },

  openShortcutsModal() {
    const rows = [
      ['Ctrl + N', '新建空白工程'],
      ['Ctrl + O', '打开工程文件'],
      ['Ctrl + S', '保存当前工程'],
      ['Ctrl + Z', '撤销上一步操作'],
      ['Ctrl + Y', '重做已撤销操作'],
      ['Ctrl + Shift + I', '快速打开数据导入窗口'],
      ['Ctrl + Shift + E', '快速导出当前关系网'],
      ['Ctrl + 滚轮 / 滚轮', '画布缩放（0.5× - 3×）'],
      ['ESC', '关闭弹窗 / 取消选中 / 清空筛选'],
      ['Delete', '删除选中节点 / 关系线条'],
      ['鼠标左键拖拽空白处', '画布平移'],
      ['Shift + 拖拽空白处', '批量框选节点'],
      ['双击节点 / 关系线', '打开编辑弹窗'],
      ['双击画布空白处', '在该位置新增人物'],
      ['鼠标悬浮', '高亮人物信息与关联关系'],
      ['右键', '打开上下文菜单（溯源 / 锁定 / 删除）']
    ];
    this.openModal({
      title: '快捷键与操作说明',
      width: 480,
      bodyHTML: `<table class="shortcut-table">${rows.map(r =>
        `<tr><td><kbd>${r[0]}</kbd></td><td>${r[1]}</td></tr>`).join('')}</table>
        <div class="form-hint" style="margin-top:8px">注：浏览器环境下 Ctrl+N / Ctrl+Shift+I 可能被浏览器快捷键占用，桌面客户端中完全生效</div>`
    });
  },

  showGuide() {
    const steps = [
      { emoji: '👋', title: '欢迎使用人物关系网', text: '这是一款支持一键批量导入、自动生成动态可交互人物关系网的可视化工具，零基础即可快速上手。' },
      { emoji: '📥', title: '第一步：导入数据', text: '点击左侧「数据 → 导入数据」，支持 Excel / CSV / JSON 标准模板批量导入，系统自动校验、自动布局。建议先「下载模板」查看数据格式。' },
      { emoji: '🖱', title: '第二步：画布交互', text: '拖拽空白处平移画布，滚轮缩放（0.5-3倍）；拖拽节点调整位置；悬浮节点高亮其全部关联关系；双击节点打开编辑弹窗；右键节点可锁定、溯源、删除。' },
      { emoji: '🔍', title: '第三步：搜索与导出', text: '顶部搜索框支持姓名 / ID / 标签 / 身份检索并自动聚焦；右侧面板支持分组、关系类型、强度多维筛选；完成后可导出高清图片、PDF 与源数据。' }
    ];
    let idx = 0;
    const render = () => {
      document.querySelectorAll('.guide-mask').forEach(el => el.remove());
      const mask = document.createElement('div');
      mask.className = 'guide-mask';
      const s = steps[idx];
      mask.innerHTML = `
        <div class="guide-card">
          <div class="g-emoji">${s.emoji}</div>
          <div class="g-step">新手引导 ${idx + 1} / ${steps.length}</div>
          <h3>${s.title}</h3>
          <p>${s.text}</p>
          <div class="guide-foot">
            <span class="guide-skip">跳过引导</span>
            <div class="guide-dots">${steps.map((_, i) => `<span class="${i === idx ? 'on' : ''}"></span>`).join('')}</div>
            <button class="btn primary sm" data-act="next">${idx === steps.length - 1 ? '开始使用' : '下一步'}</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
      mask.querySelector('.guide-skip').onclick = finish;
      mask.querySelector('[data-act=next]').onclick = () => {
        if (idx === steps.length - 1) finish();
        else { idx++; render(); }
      };
    };
    const finish = () => {
      document.querySelectorAll('.guide-mask').forEach(el => el.remove());
      ProjectStore.saveSettings({ guideShown: true });
    };
    render();
  },

  openAboutModal() {
    this.openModal({
      title: '关于本软件',
      bodyHTML: `
        <div style="text-align:center;padding:6px 0 10px">
          <div style="font-size:40px">🕸</div>
          <div style="font-size:16px;font-weight:700;margin:6px 0">人物关系网可视化工具</div>
          <div style="color:var(--sub)">Version 1.0.0</div>
        </div>
        <div style="line-height:2;font-size:13px">
          一款轻量化、高可视化、易操作的动态人物关系网生成工具，主打「批量导入、自动生成、动态交互、自由编辑」。<br>
          · 支持一键导入 Excel / CSV / JSON 自动生成关系网<br>
          · 支持多布局算法（力导向 / 环形 / 树状 / 网格）<br>
          · 所有数据 100% 本地离线存储，不上传云端<br>
          · 支持工程文件密码加密、自动备份与恢复
        </div>`,
      footerHTML: `<button class="btn primary" data-act="close">知道了</button>`
    }).body.parentElement.querySelector('[data-act=close]').onclick = function () { this.closest('.modal-mask').remove(); };
  },

  /* ============================================================
     全局刷新
     ============================================================ */
  updateAll() {
    document.getElementById('projName').textContent = GraphStore.projectName;
    this.renderDetailPanel();
    this.updateStatus();
    this.updateFocusBar();
    document.getElementById('welcome').style.display = GraphStore.isEmpty() ? 'flex' : 'none';
    document.getElementById('navBatchEdit').style.opacity = GraphStore.selection.size >= 2 ? '1' : '.55';
    if (!document.getElementById('tab-timeline').classList.contains('hidden')) this.renderTimeline();
    Renderer.requestDraw();
  },

  updateStatus() {
    const vp = GraphStore.visiblePersons().length;
    const vr = GraphStore.visibleRelations().length;
    const evCount = (GraphStore.events || []).length;
    document.getElementById('sbStats').textContent =
      `节点 ${GraphStore.persons.length}${vp !== GraphStore.persons.length ? `（显示 ${vp}）` : ''} · 关系 ${GraphStore.relations.length}${vr !== GraphStore.relations.length ? `（显示 ${vr}）` : ''}${evCount ? ` · 事件 ${evCount}` : ''}`;
    document.getElementById('sbSelection').textContent =
      GraphStore.selection.size ? `已选中 ${GraphStore.selection.size} 个节点` : (GraphStore.selectedEdgeId ? '已选中 1 条关系' : '');
    const sbFilter = document.getElementById('sbFilter');
    const active = GraphStore.hasActiveFilter() || GraphStore.focus.depth > 0;
    sbFilter.classList.toggle('hidden', !active);
    if (GraphStore.focus.depth > 0) {
      const names = { 1: '一级溯源', 2: '二级溯源', 999: '全层级溯源' };
      sbFilter.textContent = names[GraphStore.focus.depth] || '溯源中';
    } else sbFilter.textContent = '筛选中';
    document.getElementById('sbZoom').textContent = Math.round(Renderer.view.scale * 100) + '%';
    const layoutNames = { force: '力导向', circular: '环形', tree: '树状', grid: '网格', grouped: '分簇', community: '自动分簇', radial: '放射状' };
    document.getElementById('sbLayout').textContent =
      GraphStore.isEmpty() ? '' : `布局：${layoutNames[ProjectStore.loadSettings().defaultLayout] || '力导向'}`;
  }
};

window.addEventListener('DOMContentLoaded', () => App.boot());
