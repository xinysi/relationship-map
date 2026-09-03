'use strict';
/* ================= 本地存储层 =================
   PRD 3.7 工程管理 / 13 数据存储与版本机制
   所有数据 100% 本地离线存储（IndexedDB + localStorage）
------------------------------------------------ */
const ProjectStore = {
  DB_NAME: 'rgxw-db',
  STORE: 'projects',
  _db: null,
  _lsFallback: false,

  init() {
    return new Promise((resolve) => {
      if (!window.indexedDB) { this._lsFallback = true; return resolve(); }
      let req;
      try { req = indexedDB.open(this.DB_NAME, 1); }
      catch (e) { this._lsFallback = true; return resolve(); }
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(this.STORE)) db.createObjectStore(this.STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => { this._db = req.result; resolve(); };
      req.onerror = () => { this._lsFallback = true; resolve(); };
      // 与其它标签页版本冲突时不会触发 onsuccess/onerror，兜底切换到 localStorage，避免启动流程悬挂
      req.onblocked = () => { this._lsFallback = true; resolve(); };
    });
  },

  _tx(mode) { return this._db.transaction(this.STORE, mode).objectStore(this.STORE); },

  _req(store, method, ...args) {
    return new Promise((resolve, reject) => {
      try {
        const r = store[method].apply(store, args);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      } catch (e) { reject(e); }
    });
  },

  async listProjects() {
    if (this._lsFallback) return this._lsAll();
    try { return (await this._req(this._tx('readonly'), 'getAll')) || []; }
    catch (e) { return this._lsAll(); }
  },
  async getProject(id) {
    if (this._lsFallback) return this._lsAll()[id] || null;
    try { return await this._req(this._tx('readonly'), 'get', id) || null; }
    catch (e) { return this._lsAll()[id] || null; }
  },
  async saveProject(proj) {
    if (!proj.id) proj.id = Utils.uid('prj');
    proj.updatedAt = Date.now();
    if (this._lsFallback) { const all = this._lsAll(); all[proj.id] = proj; localStorage.setItem('rgxw_projects', JSON.stringify(all)); return proj.id; }
    try { await this._req(this._tx('readwrite'), 'put', proj); }
    catch (e) { const all = this._lsAll(); all[proj.id] = proj; localStorage.setItem('rgxw_projects', JSON.stringify(all)); }
    return proj.id;
  },
  async deleteProject(id) {
    if (this._lsFallback) { const all = this._lsAll(); delete all[id]; localStorage.setItem('rgxw_projects', JSON.stringify(all)); return; }
    try { await this._req(this._tx('readwrite'), 'delete', id); }
    catch (e) { const all = this._lsAll(); delete all[id]; localStorage.setItem('rgxw_projects', JSON.stringify(all)); }
  },

  _lsAll() {
    try { return JSON.parse(localStorage.getItem('rgxw_projects') || '{}'); }
    catch (e) { return {}; }
  },

  /* ---------- 设置（localStorage） ---------- */
  _settings: null,
  loadSettings() {
    if (!this._settings) {
      try { this._settings = JSON.parse(localStorage.getItem('rgxw_settings') || '{}'); }
      catch (e) { this._settings = {}; }
      this._settings = Object.assign({
        autosave: true, autosaveInterval: 30,   // PRD 13.2 默认30秒
        defaultLayout: 'force', theme: 'light',
        guideShown: false
      }, this._settings);
    }
    return this._settings;
  },
  saveSettings(patch) {
    Object.assign(this._settings, patch);
    try { localStorage.setItem('rgxw_settings', JSON.stringify(this._settings)); } catch (e) { /* 忽略 */ }
  },

  /* ---------- 上次会话（异常退出恢复，PRD 13.2） ---------- */
  getLastSession() {
    try { return JSON.parse(localStorage.getItem('rgxw_last_session') || 'null'); }
    catch (e) { return null; }
  },
  setLastSession(sess) {
    try {
      if (sess) localStorage.setItem('rgxw_last_session', JSON.stringify(sess));
      else localStorage.removeItem('rgxw_last_session');
    } catch (e) { /* 忽略 */ }
  }
};
