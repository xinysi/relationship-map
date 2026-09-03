'use strict';
/* ================= 通用工具函数 ================= */
const Utils = {
  _seq: 0,
  uid(prefix) {
    this._seq = (this._seq + 1) % 46656;
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + this._seq.toString(36);
  },
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  deepClone(obj) { return JSON.parse(JSON.stringify(obj)); },

  debounce(fn, ms) {
    let t = null;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  },

  escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  formatTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—'; // 时间戳损坏时回退，避免显示 NaN-NaN-NaN
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },

  /* 将字符串按常见分隔符拆分为标签数组 */
  parseTags(str) {
    if (Array.isArray(str)) return str.map(s => String(s).trim()).filter(Boolean);
    if (!str) return [];
    return String(str).split(/[,，、;；|\t/]+/).map(s => s.trim()).filter(Boolean);
  },

  /* 字符串稳定哈希 → 用于自动配色 */
  hashStr(str) {
    let h = 5381;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  },

  /* 触发浏览器下载 */
  download(filename, data, mime) {
    let url;
    if (data instanceof Blob) url = URL.createObjectURL(data);
    else {
      const blob = new Blob([data], { type: (mime || 'application/octet-stream') + ';charset=utf-8' });
      url = URL.createObjectURL(blob);
    }
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  b64ToBytes(b64) {
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
  bytesToB64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  },

  nextFrame() {
    // 兜底：标签页不可见时 requestAnimationFrame 可能被暂停，导致分批解析卡死
    return new Promise(r => {
      let done = false;
      const fin = () => { if (!done) { done = true; r(); } };
      if (typeof document === 'undefined' || document.hidden) { setTimeout(fin, 16); return; }
      requestAnimationFrame(fin);
      setTimeout(fin, 200);
    });
  },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  /* 简单事件总线 */
  emitter: {
    _m: {},
    on(ev, cb) { (this._m[ev] = this._m[ev] || []).push(cb); return cb; },
    off(ev, cb) { const a = this._m[ev]; if (a) { const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); } },
    emit(ev, ...args) { (this._m[ev] || []).slice().forEach(cb => { try { cb(...args); } catch (e) { console.error(e); } }); }
  },

  /* 分块异步遍历，避免大批量数据阻塞 UI（支持超大文件分批解析） */
  async chunked(items, fn, onProgress, chunkSize) {
    chunkSize = chunkSize || 800;
    for (let i = 0; i < items.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, items.length);
      for (let j = i; j < end; j++) fn(items[j], j);
      if (onProgress) onProgress(end / items.length);
      if (end < items.length) await Utils.nextFrame();
    }
  }
};

/* 分组自动配色（低饱和） */
Utils.GROUP_PALETTE = ['#5b8ff9', '#5ad8a6', '#f6bd16', '#e8684a', '#6dc8ec', '#9270ca', '#ff9d4d', '#269a99', '#ff99c3', '#7e6bf2', '#a0d911', '#f08bb4'];
/* 关系类型自动配色 */
Utils.TYPE_PALETTE = ['#7f9fd8', '#d89aa2', '#8fbd9a', '#d0b078', '#a794d4', '#79b8cc', '#cc8fae', '#9aad7f', '#c78f6b', '#8b9fd0'];

Utils.colorForGroup = function (g) {
  if (!g) return '#5b8ff9';
  return Utils.GROUP_PALETTE[Utils.hashStr(g) % Utils.GROUP_PALETTE.length];
};
Utils.colorForType = function (t) {
  if (!t) return '#8ea7d8';
  return Utils.TYPE_PALETTE[Utils.hashStr(t) % Utils.TYPE_PALETTE.length];
};
