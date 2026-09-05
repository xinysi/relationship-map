'use strict';
/* ================= 数据导入 / 导出模块 =================
   PRD 3.1 一键导入 / 3.6 数据导出与备份 / 11 异常文案规范
------------------------------------------------ */
const DataIO = {

  /* ---------- PRD 11 章统一异常文案 ---------- */
  /* Markdown 剧情文档模板（模板自身即解析器可识别的示例） */
  MD_TEMPLATE: "# 《示例故事》剧情整理模板\n\n> 说明（导入前可删除本段）：本模板演示剧情文档的主要写法，可混合使用；模板本身可直接导入验证。\n> ① 主要角色：`- 姓名(英文)——简介`，或 `**名称**：简介`，或 `**A**、**B**：简介`\n> ② 家族树：代码块内 `├─ └─ │` 世系；`A → B` 子女链；`第一任妻子:X`、`养子:Y` 称谓自动识别\n> ③ 关系恩怨：`A × B` 夫妻 / `A ↔ B` 其他关系；叙述句 `A与B是恋人` 也自动识别\n> ④ 时间线：章节小节（`### 第X章 …`）、年代线、大事记、因果序表、登场速览表、待考清单自动转为时间线事件\n> 关系强度无需填写：解析器按类型自动分级，正文强语气词（宿敌/至爱/决裂）再 +1。\n>\n> 注意：①每个角色只在一行出现，禁止 `A　B` 并排；②角色括号内元信息用分号分隔；③纯叙述句请放进「详细剧情」或写成关系句（`A与B是…`），未结构化的独立段落会在日志中标注行号。\n\n## 主要角色\n\n- 主角（Hero）——故事主角，示例简介。\n- 安娜·格雷（Anna Gray）——格雷家次女，示例简介。\n- 盖尔·史密斯——示例人物。\n- 杰迪（Jedi）——示例：与赫尔曼是兄弟。\n\n## 家族树\n\n```\n格雷（祖父）\n ├─ 安娜·格雷\n └─ 路易莎·格雷 → 罗伯特·格雷\n```\n\n## 关系恩怨\n\n- 安娜·格雷 × 盖尔·史密斯（示例夫妻）\n- 杰迪 ↔ 赫尔曼（示例，兄弟反目）\n\n## 剧情梗概\n\n　　故事一句话概括，自动生成「剧情梗概」事件。\n\n## 详细剧情\n\n### 第一章 相遇\n\n安娜与盖尔是恋人；他们一同调查真相。\n\n### 第二章 对峙\n\n杰迪与赫尔曼本是挚友；杰迪杀死了赫尔曼。\n\n## 时间线（可选）\n\n- **1893-10-13**：示例精确日期事件，加粗日期自动转为时间线事件。\n- 1897 年 2 月，示例大事记叙述行。\n\n> 章节小节（### 第X章 …）会自动生成时间线事件，无需单独填写表格。",

  MSG: {
    BAD_FORMAT: '当前文件格式不支持，请上传Excel/CSV/JSON/Markdown格式文件',
    MISS_FIELD: '表格缺少【人物ID/人物姓名/关系类型】必填字段，请核对模板后重试',
    DUP_ID: (id) => `检测到重复人物ID：${id}，请修改唯一标识后重新导入`,
    TOO_LARGE: '文件数据量过大，将分批解析，请耐心等待',
    FILE_TOO_BIG: '单个文件超过 100MB，请拆分后再导入',
    BROKEN: '文件解析失败，文件损坏或内容为空，请更换文件重试',
    NO_SELECT: '请选择需要删除的节点/关系',
    EMPTY_EXPORT: '当前画布无内容，无法执行导出操作',
    DEL_PERSON: '删除该人物将同步清空所有关联关系，是否确认删除？',
    PROJECT_BROKEN: '工程文件损坏或版本不兼容，无法打开',
    SAVE_FAIL: '文件保存失败，请检查磁盘权限与存储空间'
  },

  /* ---------- 表头字段映射（中英文兼容） ---------- */
  PERSON_HEADERS: {
    id: ['人物id', '人物ID'.toLowerCase(), 'id', '编号', '唯一标识'],
    name: ['人物姓名', '姓名', 'name', '名称', '人物名称'],
    alias: ['英文名/别名', '英文名', '别名', 'alias', '英文别名', '称号'],
    avatar: ['头像', '头像url', '头像url/本地路径', 'avatar', '图片', '照片', '头像url/本地路径'.toLowerCase()],
    intro: ['人物简介', '简介', 'intro', '描述', '说明'],
    tag: ['人物标签', '标签', 'tag', 'tags'],
    group: ['归属分组', '分组', 'group', '阵营', '组织'],
    gender: ['性别', 'gender'],
    age: ['年龄', 'age'],
    position: ['身份职位', '身份', '职位', 'position', '职业', '身份/职位']
  },
  EVENT_HEADERS: {
    title: ['事件名称', '标题', '事件', 'event', '事件名'],
    time: ['时间/年代', '时间', '年代', 'time', '发生时间'],
    order: ['排序序号', '排序', '序号', '顺位', 'order'],
    era: ['时期/篇章', '时期', '篇章', '年代线', 'era', '分组'],
    desc: ['事件说明', '说明', 'desc', '描述', '详情'],
    persons: ['关联人物', '人物', 'persons', '涉及人物']
  },
  RELATION_HEADERS: {
    sourceId: ['起始人物id', '起始id', 'sourceid', 'source', 'from', '起点', '源人物id'],
    targetId: ['目标人物id', '目标id', 'targetid', 'target', 'to', '终点', '目标人物ID'.toLowerCase()],
    relationType: ['关系类型', 'relationtype', '关系', '类型'],
    desc: ['关系描述', '描述', 'desc', '说明'],
    strength: ['关系强度', '强度', 'strength'],
    time: ['关系时间', '时间', 'time'],
    note: ['备注', 'note', '备注说明']
  },

  _normHeader(h) {
    return String(h || '').trim().toLowerCase().replace(/\s+/g, '');
  },
  _matchField(header, map) {
    const h = this._normHeader(header);
    for (const field in map) if (map[field].map(this._normHeader).includes(h)) return field;
    return null;
  },
  /* 判断一张表是人物表还是关系表 */
  classifySheet(headers) {
    let personScore = 0, relationScore = 0, eventScore = 0;
    for (const h of headers) {
      if (this._matchField(h, this.PERSON_HEADERS)) personScore++;
      if (this._matchField(h, this.RELATION_HEADERS)) relationScore++;
      if (this._matchField(h, this.EVENT_HEADERS)) eventScore++;
    }
    if (eventScore >= 2 && eventScore > relationScore && eventScore > personScore) return 'event';
    if (personScore >= 1 && relationScore >= 2) return relationScore > personScore ? 'relation' : 'person';
    if (relationScore >= 2) return 'relation';
    if (personScore >= 1) return 'person';
    return null;
  },

  /* ============================================================
     CSV 解析（支持引号转义、逗号/分号/Tab 分隔、GBK 编码回退）
     ============================================================ */
  _detectDelim(line) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQ = !inQ;
      else if (!inQ && c in counts) counts[c]++;
    }
    let best = ',', bestN = 0;
    for (const d in counts) if (counts[d] > bestN) { bestN = counts[d]; best = d; }
    return best;
  },
  parseCSVText(text) {
    text = text.replace(/^\uFEFF/, '');
    if (!text.trim()) return [];
    const delim = this._detectDelim(text.split(/\r?\n/)[0] || '');
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  },

  async _readFileText(file) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('\uFFFD')) {
      try { text = new TextDecoder('gbk').decode(buf); } catch (e) { /* 保留 utf-8 */ }
    }
    return text;
  },

  /* ============================================================
     导入主流程
     files: FileList / File[]；opts: {mode}
     返回 {persons, relations, errors, fileName}
     ============================================================ */
  async parseFiles(files, opts, onProgress) {
    opts = opts || {};
    onProgress = onProgress || (() => {});
    const fileArr = Array.from(files || []);
    if (!fileArr.length) throw new Error(this.MSG.BAD_FORMAT);

    const allPersons = [], allRelations = [], allEvents = [], errors = [];
    const seenImportIds = new Set(); // 已见人物 ID，O(1) 判重替代数组 find
    const mdQueue = [];
    let totalRows = 0;

    for (let fi = 0; fi < fileArr.length; fi++) {
      const file = fileArr[fi];
      const base = (onProgress.length ? (fi / fileArr.length) : 0);
      const span = 1 / fileArr.length;
      const p2 = (t) => onProgress(base + t * span);
      p2(0.05);

      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (file.size > 100 * 1024 * 1024) throw new Error(this.MSG.FILE_TOO_BIG);
      let sheets = []; // [{name, rows:[[...]]}]

      try {
        if (ext === 'xlsx' || ext === 'xls') {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
          for (const sn of wb.SheetNames) {
            const ws = wb.Sheets[sn];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
            sheets.push({ name: sn, rows });
          }
        } else if (ext === 'csv' || ext === 'txt') {
          const text = await this._readFileText(file);
          sheets.push({ name: file.name, rows: this.parseCSVText(text) });
        } else if (ext === 'json') {
          const text = await this._readFileText(file);
          p2(0.4);
          let obj = null;
          try { obj = JSON.parse(text); } catch (e) { throw new Error(this.MSG.BROKEN); }
          const parsed = this._parseJSONData(obj, file.name);
          allPersons.push(...parsed.persons);
          allRelations.push(...parsed.relations);
          allEvents.push(...(parsed.events || []));
          errors.push(...parsed.errors);
          totalRows += parsed.persons.length + parsed.relations.length;
          p2(1);
          continue;
        } else if (ext === 'md' || ext === 'markdown') {
          // 剧情文档（Markdown）：先收集，最后多文档合并为一次解析（跨文档人物/ID 合并）
          const text = await this._readFileText(file);
          mdQueue.push({ name: file.name, text });
          p2(1);
          continue;
        } else {
          throw new Error(this.MSG.BAD_FORMAT);
        }
      } catch (e) {
        if (e && (e.message === this.MSG.BAD_FORMAT || e.message === this.MSG.BROKEN || e.message === this.MSG.FILE_TOO_BIG)) throw e;
        throw new Error(this.MSG.BROKEN);
      }

      if (!sheets.length || !sheets.some(s => s.rows.length)) {
        // 尝试继续，若最终无数据则报损坏
        continue;
      }

      p2(0.3);
      // 解析每张 sheet
      let parsedAny = false;
      for (const sheet of sheets) {
        if (!sheet.rows.length) continue;
        const headerRow = sheet.rows.find(r => r.some(c => String(c).trim() !== ''));
        if (!headerRow) continue;
        const kind = this.classifySheet(headerRow) ||
          (/人物|person/i.test(sheet.name) ? 'person' : /关系|relation/i.test(sheet.name) ? 'relation' : null);
        if (!kind) continue;
        parsedAny = true;
        const headerIdx = sheet.rows.indexOf(headerRow);
        const colMap = {};
        headerRow.forEach((h, i) => {
          const f = kind === 'person' ? this._matchField(h, this.PERSON_HEADERS) : this._matchField(h, this.RELATION_HEADERS);
          if (f && !(f in colMap)) colMap[f] = i;
        });

        const dataRows = sheet.rows.slice(headerIdx + 1);
        totalRows += dataRows.length;
        if (dataRows.length > 5000) Utils.emitter.emit('toast', { type: 'warn', text: this.MSG.TOO_LARGE });

        await Utils.chunked(dataRows, (row, ri) => {
          const lineNo = headerIdx + ri + 2; // 1-based 含表头
          const get = (f) => (colMap[f] != null ? String(row[colMap[f]] == null ? '' : row[colMap[f]]).trim() : '');
          if (kind === 'person') {
            const id = get('id'), name = get('name');
            if (!id) { errors.push({ row: lineNo, table: '人物信息表', level: 'error', msg: '缺少必填字段【人物ID】' }); return; }
            if (!name) { errors.push({ row: lineNo, table: '人物信息表', level: 'error', msg: `人物【${id}】缺少必填字段【人物姓名】` }); return; }
            if (seenImportIds.has(id)) { errors.push({ row: lineNo, table: '人物信息表', level: 'error', msg: this.MSG.DUP_ID(id) }); return; }
            seenImportIds.add(id);
            allPersons.push(this._objToPerson({
              id, name, alias: get('alias'), avatar: get('avatar'), intro: get('intro'), tag: get('tag'),
              group: get('group'), gender: get('gender'), age: get('age'), position: get('position')
            }));
          } else if (kind === 'event') {
            const title = get('title');
            if (!title) { errors.push({ row: lineNo, table: '时间线事件表', level: 'error', msg: '缺少必填字段【事件名称】' }); return; }
            allEvents.push(this._objToEvent({
              title, time: get('time'), order: get('order'), era: get('era'), desc: get('desc'), persons: get('persons')
            }));
          } else {
            const sourceId = get('sourceId'), targetId = get('targetId'), type = get('relationType');
            if (!sourceId || !targetId || !type) {
              errors.push({ row: lineNo, table: '关系信息表', level: 'error', msg: '缺少必填字段【起始人物ID/目标人物ID/关系类型】' });
              return;
            }
            const strengthRaw = get('strength');
            let strength = 0;
            if (strengthRaw !== '') {
              const num = Number(strengthRaw);
              if (isNaN(num)) { errors.push({ row: lineNo, table: '关系信息表', level: 'warn', msg: `关系【${type}】强度"${strengthRaw}"非数字，已忽略强度` }); }
              else strength = Utils.clamp(Math.round(num), 1, 10);
            }
            allRelations.push(this._objToRelation({
              sourceId, targetId, relationType: type, desc: get('desc'),
              strength, time: get('time'), note: get('note')
            }));
          }
        }, (t) => p2(0.3 + t * 0.65), 1000);
      }
      p2(1);
      if (!parsedAny && sheets.some(s => s.rows.length > 0)) {
        errors.push({ row: 1, table: file.name, level: 'error', msg: this.MSG.MISS_FIELD });
      }
    }

    /* ---------- Markdown 剧情文档（多文档合并解析，跨文档人物自动合并） ---------- */
    if (mdQueue.length) {
      onProgress(0.2);
      // 总览/一览类文档优先解析：先建立全系列人物表，后续各篇的亲属/恩怨指代匹配更完整，
      // 避免解析结果随文件选择顺序漂移（其余文档保持用户选择顺序，使用稳定排序）
      const OVERVIEW_RE = /总览|一览|速览|汇总|概述|概览|综合|族谱|家谱/;
      const overviewRank = (d) =>
        (OVERVIEW_RE.test(d.name) ? 4 : 0) +
        (OVERVIEW_RE.test(String(d.text || '').slice(0, 300)) ? 2 : 0);
      mdQueue.sort((a, b) => overviewRank(b) - overviewRank(a));
      const combined = mdQueue.map(d => d.text).join('\n\n');
      const parsed = this.parseMarkdown(combined, mdQueue.map(d => d.name).join(' + '));
      allPersons.push(...parsed.persons);
      allRelations.push(...parsed.relations);
      allEvents.push(...parsed.events);
      // 解析统计/提示信息与真实错误分离：level=info 不参与"异常/跳过"计数展示
      errors.push(...parsed.errors, ...(parsed.infos || []).map(m => ({ row: '-', table: '剧情文档', level: 'info', msg: m })));
      totalRows += parsed.persons.length + parsed.relations.length + parsed.events.length;
      onProgress(0.9);
      await Utils.nextFrame();
    }

    if (totalRows === 0 && !allPersons.length && !allRelations.length && !allEvents.length) {
      const realErr = errors.find(e => e.level !== 'info');
      throw new Error(realErr ? realErr.msg : this.MSG.BROKEN);
    }

    /* ---------- 全局校验 ---------- */
    onProgress(0.95);
    await Utils.nextFrame();
    // 追加模式下与现有画布比对重复 ID
    const existing = new Set(opts.mode === 'append' ? GraphStore.persons.map(p => p.id) : []);
    const finalPersons = [], seen = new Set();
    for (const p of allPersons) {
      if (seen.has(p.id)) continue;
      if (existing.has(p.id)) {
        errors.push({ row: '-', table: '人物信息表', level: 'error', msg: this.MSG.DUP_ID(p.id) + '（与当前画布重复，已跳过）' });
        continue;
      }
      seen.add(p.id); finalPersons.push(p);
    }
    // 追加模式：同名/同段名/同别名人物与现有画布合并，避免跨文档重复节点
    const idMap = new Map();
    if (opts.mode === 'append') {
      for (let i = finalPersons.length - 1; i >= 0; i--) {
        const p = finalPersons[i];
        let hit = null;
        const key = p.name.toLowerCase();
        for (const ep of GraphStore.persons) {
          if (ep.name.toLowerCase() === key || ((ep.alias || '').toLowerCase() === key && key)) { hit = ep; break; }
        }
        if (!hit) {
          const seg = p.name.split('·')[0];
          for (const ep of GraphStore.persons) {
            if (!/[（(]/.test(ep.name) && ep.name.split('·')[0] === seg) { hit = ep; break; }
          }
        }
        if (hit) {
          idMap.set(p.id, hit.id);
          // 名字升级：短名（安娜）→ 全名（安娜·格雷）
          if (p.name.includes(hit.name) && p.name.length > hit.name.length) hit.name = p.name;
          if (!hit.alias && p.alias) hit.alias = p.alias;
          if ((!hit.intro || hit.intro.length < p.intro.length) && p.intro) hit.intro = p.intro;
          if (!hit.group && p.group) hit.group = p.group;
          if (!hit.avatar && p.avatar) hit.avatar = p.avatar;
          finalPersons.splice(i, 1);
        }
      }
      for (const r of allRelations) {
        if (idMap.has(r.sourceId)) r.sourceId = idMap.get(r.sourceId);
        if (idMap.has(r.targetId)) r.targetId = idMap.get(r.targetId);
      }
      for (const ev of allEvents) {
        ev.persons = (ev.persons || []).map(n => idMap.has(n) ? idMap.get(n) : n);
      }
    }
    const knownIds = new Set([...finalPersons.map(p => p.id), ...(opts.mode === 'append' ? GraphStore.persons.map(p => p.id) : [])]);
    let finalRelations = [];
    for (const r of allRelations) {
      if (!knownIds.has(r.sourceId) || !knownIds.has(r.targetId)) {
        errors.push({
          row: '-', table: '关系信息表', level: 'error',
          msg: `关系【${r.relationType}】关联的人物ID不存在（${!knownIds.has(r.sourceId) ? r.sourceId : r.targetId}），已跳过`
        });
        continue;
      }
      finalRelations.push(r);
    }
    // 追加模式：与现有画布中同对人物的同类关系去重，避免重复连线
    if (opts.mode === 'append') {
      const normType = (t) => /^(亲子|父子|父女|母子|母女|养子|养女)$/.test(t) ? '亲子' : (t === '配偶' ? '夫妻' : t);
      const existingKeys = new Set(GraphStore.relations.map(r => [r.sourceId, r.targetId].sort().join('|') + '|' + normType(r.relationType)));
      const batchKeys = new Set();
      finalRelations = finalRelations.filter(r => {
        const key = [r.sourceId, r.targetId].sort().join('|') + '|' + normType(r.relationType);
        if (existingKeys.has(key) || batchKeys.has(key)) return false;
        batchKeys.add(key);
        return true;
      });
    }

    onProgress(1);
    return {
      persons: finalPersons,
      relations: finalRelations,
      events: allEvents,
      errors,
      fileName: fileArr.map(f => f.name).join(', ')
    };
  },

  _parseJSONData(obj, fileName) {
    const errors = [];
    let persons = [], relations = [], events = [];
    if (Array.isArray(obj)) persons = obj;
    else if (obj && typeof obj === 'object') {
      const P = obj.persons || obj['人物'] || obj.people || obj.nodes || [];
      const R = obj.relations || obj['关系'] || obj.relationships || obj.edges || obj.links || [];
      const E = obj.events || obj['事件'] || obj.timeline || [];
      events = E;
      // 兼容工程文件直接导入
      if (!P.length && !R.length && (obj.data && (obj.data.persons || obj.data['人物']))) {
        persons = obj.data.persons || []; relations = obj.data.relations || [];
        events = obj.data.events || [];
      } else { persons = P; relations = R; }
    } else throw new Error(this.MSG.BROKEN);

    const outP = [], outR = [], outE = [];
    const seen = new Set();
    persons.forEach((raw, i) => {
      const m = this._mapKeys(raw, this.PERSON_HEADERS_JSON());
      const lineNo = i + 1;
      if (!m.id) { errors.push({ row: lineNo, table: '人物信息表', level: 'error', msg: '缺少必填字段【人物ID】' }); return; }
      if (!m.name) { errors.push({ row: lineNo, table: '人物信息表', level: 'error', msg: `人物【${m.id}】缺少必填字段【人物姓名】` }); return; }
      if (seen.has(m.id)) { errors.push({ row: lineNo, table: '人物信息表', level: 'error', msg: this.MSG.DUP_ID(m.id) }); return; }
      seen.add(m.id);
      outP.push(this._objToPerson(m));
    });
    relations.forEach((raw, i) => {
      const m = this._mapKeys(raw, this.RELATION_HEADERS_JSON());
      const lineNo = i + 1;
      if (!m.sourceId || !m.targetId || !m.relationType) {
        errors.push({ row: lineNo, table: '关系信息表', level: 'error', msg: '缺少必填字段【起始人物ID/目标人物ID/关系类型】' });
        return;
      }
      outR.push(this._objToRelation(m));
    });
    (Array.isArray(events) ? events : []).forEach((raw, i) => {
      const m = this._mapKeys(raw, this.EVENT_HEADERS);
      const lineNo = i + 1;
      if (!m.title) {
        errors.push({ row: lineNo, table: '时间线事件表', level: 'error', msg: '缺少必填字段【事件名称】' });
        return;
      }
      outE.push(this._objToEvent(m));
    });
    return { persons: outP, relations: outR, events: outE, errors };
  },

  _PERSON_JSON_KEYS: null,
  PERSON_HEADERS_JSON() {
    if (!this._PERSON_JSON_KEYS) {
      this._PERSON_JSON_KEYS = {};
      const alias = {
        id: ['人物ID', 'id', 'ID', '编号'], name: ['人物姓名', '姓名', 'name', '名称'],
        alias: ['英文名/别名', '英文名', '别名', 'alias', 'aliases'],
        avatar: ['头像', '头像URL', '头像URL/本地路径', 'avatar', '图片', 'photo'], intro: ['人物简介', '简介', 'intro', 'desc'],
        tag: ['人物标签', '标签', 'tag', 'tags'], group: ['归属分组', '分组', 'group'],
        gender: ['性别', 'gender'], age: ['年龄', 'age'], position: ['身份职位', '身份', '职位', 'position']
      };
      for (const f in alias) this._PERSON_JSON_KEYS[f] = alias[f];
    }
    return this._PERSON_JSON_KEYS;
  },
  RELATION_HEADERS_JSON() {
    return {
      sourceId: ['起始人物ID', 'sourceId', 'source', 'from', '起点'],
      targetId: ['目标人物ID', 'targetId', 'target', 'to', '终点'],
      relationType: ['关系类型', 'relationType', '关系', 'type'],
      desc: ['关系描述', 'desc', '描述'], strength: ['关系强度', 'strength', '强度'],
      time: ['关系时间', 'time', '时间'], note: ['备注', 'note']
    };
  },
  _mapKeys(raw, map) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const k of Object.keys(raw)) {
      const f = this._matchField(k, map) || (k in map ? k : null);
      if (f && out[f] === undefined) out[f] = raw[k];
    }
    return out;
  },

  _objToPerson(m) {
    return {
      id: String(m.id).trim(),
      name: String(m.name).trim(),
      alias: String(m.alias || '').trim(),
      avatar: String(m.avatar || '').trim(),
      intro: String(m.intro || '').trim(),
      tag: Utils.parseTags(m.tag),
      group: String(m.group || '').trim(),
      gender: String(m.gender || '').trim(),
      age: m.age != null ? String(m.age).trim() : '',
      position: String(m.position || '').trim()
    };
  },
  _objToRelation(m) {
    const num = Number(m.strength);
    return {
      sourceId: String(m.sourceId).trim(),
      targetId: String(m.targetId).trim(),
      relationType: String(m.relationType).trim() || '关联',
      desc: String(m.desc || '').trim(),
      // 0 = 未设置（解析自 Markdown/未填写的导入，不 clamp 到 1，否则所有关系强度统一变成 1）
      strength: isNaN(num) ? 0 : Utils.clamp(Math.round(num), 0, 10),
      time: String(m.time || '').trim(),
      note: String(m.note || '').trim()
    };
  },

  /* ============================================================
     Markdown 剧情文档解析（.md / .markdown）
     覆盖剧情梳理文档的典型结构：
     ① 主要角色/人物条目（含英文名括注、——描述）
     ② ASCII 家族世系树（├─ └─ →）
     ③ 关系恩怨条目（A × B / A ↔ B / A → B + 部数出处 + 生下子女）
     ④ 时间线条目（年代线 / 大事记 / 章节剧情）
     ⑤ 表格（因果序表 / 各部登场速览表）
     ⑥ 待考矛盾清单
     ============================================================ */
  parseMarkdown(text, fileName) {
    const persons = [], relations = [], events = [], errors = [], infos = [];
    const lines = String(text || '').split(/\r?\n/);
    const seen = new Map();               // 人名 → person
    let docTitle = '', defaultGroup = '';
    let group = '', subsection = '', sectionRaw = '', inSynopsis = false;
    // 每次解析使用唯一 ID 前缀：顺序 ID 在跨导入时会与画布中已有 MD### 冲突
    const callToken = 'md' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '_';
    let inCode = false, codeBuf = [];
    let chapterPending = null, introEvent = null;
    let skipped = 0, seq = 0;
    const skippedLines = [];

    /* ---- 基础工具 ---- */
    const stripMd = s => String(s || '').replace(/\*\*/g, '').replace(/`/g, '').trim();
    const cleanText = s => stripMd(s).replace(/^[—–-\s]+|[—–-\s]+$/g, '').trim();
    const NON_GROUP_HEAD = /主要角色|剧情梗概|详细剧情|备注|奖励章节/;
    const GENERIC_NAME = /^(双胞胎|姐妹|兄弟|众人|一家|全家|两人|彼此|双方|三人组|四人组|众人|两位|众人|她们|他们|独立舞台)$/;
    const stripMetaParens = s => s.replace(/[（(][^）)]*(?:第[\d\s、,，~～]+部|图鉴|世纪|年代|约\s*\d+|早夭|夭折|已故|亡故|CE|典藏)[^）)]*[）)]/g, '').trim();

    const findOrCreate = (nameRaw, opts) => {
      opts = opts || {};
      // 别名归一（去重）："小陌、小陌" → "小陌"
      const normalize = s => s ? [...new Set(String(s).split(/[、,，/；;]+/).map(x => x.trim()).filter(Boolean))].join('、') : '';
      let s = cleanText(nameRaw);
      // 人名清洗：剥离引号；全角斜杠分隔的别名（"恶魔"（Demon）／父亲 → 恶魔 / 别名Demon、父亲）
      s = s.replace(/["“”„«»「」『』]/g, '').trim();
      let extraAlias = '';
      const slashParts = s.split(/[／/]/).map(x => x.trim()).filter(Boolean);
      if (slashParts.length >= 2) {
        s = slashParts[0];
        extraAlias = slashParts.slice(1).join('、');
      }
      let alias = extraAlias;
      const en = s.match(/[（(]\s*([A-Za-z][A-Za-z0-9 .·''-]*)\s*[）)]\s*$/);
      if (en) { alias = alias ? alias + '、' + en[1].trim() : en[1].trim(); s = s.slice(0, en.index).trim(); }
      s = stripMetaParens(s).replace(/[。；;]/g, '').trim();
      // 括号别名（两种写法）："（别名：小陌）"与"（小陌）"→ 名"杜陌"、别名"小陌"
      let am = s.match(/[（(](别名[:：]\s*([^）)]+))[）)]\s*$/);
      if (am) {
        alias = (alias ? alias + '、' : '') + am[2].trim();
        s = s.slice(0, s.lastIndexOf(am[0])).trim();
        if (!s) return null;
      } else {
        am = s.match(/[（(]([\u4e00-\u9fff]{1,4})[）)]\s*$/);
        if (am) {
          alias = (alias ? alias + '、' : '') + am[1];
          s = s.slice(0, s.lastIndexOf(am[0])).trim();
          if (!s) return null;
        }
      }
      if (!s || s.length > 24 || GENERIC_NAME.test(s)) return null;
      if (opts.nameOnly) return { name: s, alias };
      let p = seen.get(s);
      if (!p) {
        const seg = s.split('·')[0];
        if (seg) {
          for (const [k, v] of seen) {
            if (k.split('·')[0] === seg && !/[（(]/.test(k)) { p = v; break; }
          }
        }
      }
      if (!p && (alias || opts.alias)) {
        // 别名分词合并：如"格雷"的别名"Gray，另处称约翰/John"指向已有人物"约翰·格雷"
        const kinWord = /^(父亲|母亲|爸爸|妈妈|女儿|儿子|姐妹|兄弟|姐姐|妹妹|哥哥|弟弟|父|母|哥|姐|妹|弟)$/;
        const tokens = String(alias || opts.alias || '').split(/[，,、/／\s|：:]+/)
          .map(x => x.replace(/["“”]/g, '').trim()).filter(x => x.length >= 2 && !kinWord.test(x));
        for (const tk of tokens) {
          for (const [k, v] of seen) {
            if (k.split('·')[0] === tk) { p = v; break; }
          }
          if (!p) {
            // 别名串匹配：已有条目的别名中含该 token 也视为同一人
            for (const v of seen.values()) {
              if ((v.alias || '').split(/[、,，/／\s|：:]/).includes(tk)) { p = v; break; }
            }
          }
          if (p) break;
        }
      }
      if (p) {
        // 合并：补全更完整的姓名 / 别名 / 简介
        if (s.includes(p.name) && s.length > p.name.length) {
          p.name = s; seen.set(s, p);
        }
        if (!p.alias && (alias || opts.alias)) p.alias = normalize(p.alias || (alias || opts.alias));
        if (!p.intro && opts.intro) p.intro = opts.intro;
        return p;
      }
      seq++;
      p = {
        id: callToken + seq,
        name: s, alias: normalize(alias || (opts.alias || '')),
        intro: opts.intro || '',
        group: opts.group || group || defaultGroup,
        tag: opts.tag || []
      };
      seen.set(s, p);
      persons.push(p);
      return p;
    };

    /* ---- 关系类型识别 ---- */
    const REL_KW = [
      ['夫妻', /成婚|结婚|结为夫妻|丈夫|妻子|配偶|婚姻|嫁入|迎娶|她的未婚夫|未婚夫|订婚/],
      ['恋人', /恋人|定情|相恋|情侣|爱恋|初恋/],
      ['养子', /养子|养女|收养/],
      ['养兄妹', /养兄|养妹|养姐|养弟/],
      ['龙凤胎', /龙凤胎/],
      ['双胞胎', /双胞胎(?!女儿|儿子)/],
      ['祖孙', /祖孙|孙女|孙子|曾孙|高祖父|曾祖父|高祖/],
      ['父子', /父子/], ['父女', /父女/], ['母子', /母子/], ['母女', /母女/],
      ['兄妹', /兄妹|姐弟|弟妹|姐弟关系/], ['姐妹', /姐妹(?!会)/], ['兄弟', /兄弟(?!会)/],
      ['同窗', /同窗|同学|挚友|好友|密友|总角之好/],
      ['师徒', /师徒|师从|弟子|导师/],
      ['敌对', /敌对|宿敌|死敌|仇怨|世仇|决裂|对抗|击败|打败|挫败|阻止|夺舍|企图|复仇|报复|陷害|教唆|胁迫|杀害|毒杀|刺杀|恨|迫害/],
      ['联手', /联手|并肩|合作|同盟|结盟|协助|相助|搭档/],
      ['救赎', /救赎|拯救|救活|救下|洗冤|宽恕|治愈/],
      ['君臣', /君臣/], ['主仆', /主仆|仆人|侍从|护卫|管家/],
      ['亲属', /亲戚|亲属|远亲|后裔|血脉|同族|侄|外甥|姨妈|姑妈|叔|伯/],
      ['创造', /制造的人造人|人造人|造物/],
      ['依附', /附身|附体/],
      ['对手', /对手|情敌/]
    ];
    const detectRelType = (text, isCouple) => {
      // 按关键词在文本中最早出现位置判定（如"父子决裂。企图..." → 父子优先于敌对）
      let best = null, bestIdx = Infinity;
      for (const [t, re] of REL_KW) {
        re.lastIndex = 0;
        const m = re.exec(text);
        if (m && m.index < bestIdx) { best = t; bestIdx = m.index; }
      }
      if (best) return best;
      return isCouple ? '夫妻' : '关联';
    };

    /* ---- 子女提取（"生下X、Y" / "：女儿X"等明确生育表述，避免误匹配叙述文本） ---- */
    const extractChildren = (desc) => {
      const out = [];
      const patterns = [
        /(?:^|[，,;；。：:\s])(?:生下|育有|生有|诞下|产下)\s*([^。；;，,]{2,50})/g,
        /(?:^|[：:])\s*(?:女儿|儿子|龙凤胎|双胞胎|孪生|子|孙|嗣)[\s:：]*([^。；;，,]{2,50})/g
      ];
      for (const re of patterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(desc))) {
          for (let nm of m[1].split(/[、和与]/)) {
            nm = stripMetaParens(cleanText(nm));
            const en2 = nm.match(/[（(][^）)]*[）)]\s*$/);
            if (en2) nm = nm.slice(0, en2.index).trim();
            if (nm && nm.length <= 12 && !GENERIC_NAME.test(nm) && !/等|见各部|文本|注/.test(nm)) out.push(nm);
          }
        }
      }
      return [...new Set(out)];
    };

    const addRelation = (aRaw, bRaw, text, opts) => {
      opts = opts || {};
      const a = findOrCreate(aRaw, opts);
      const b = findOrCreate(bRaw, opts);
      if (!a || !b || a.id === b.id) return null;
      const times = (text.match(/第[\d\s、,，~～]+部/g) || []).join('、');
      // × 为配偶记法（"配偶与下一辈"），直接判定为夫妻
      const type = opts.type || (opts.isCouple ? '夫妻' : detectRelType(text, false));
      const rel = { sourceId: a.id, targetId: b.id, relationType: type, desc: cleanText(text).slice(0, 200), strength: 0, time: times };
      relations.push(rel);
      // 子女提取：由夫妇双方建立亲子关系
      if (!opts.noChild) {
        for (const cn of extractChildren(text)) {
          const c = findOrCreate(cn, {});
          if (c && c.id !== a.id && c.id !== b.id) {
            relations.push({ sourceId: a.id, targetId: c.id, relationType: '亲子', desc: (a.name + '与' + b.name + '的子女'), strength: 0, time: times });
            if (b && !opts.singleParent) relations.push({ sourceId: b.id, targetId: c.id, relationType: '亲子', desc: (a.name + '与' + b.name + '的子女'), strength: 0, time: times });
          }
        }
      }
      return rel;
    };

    /* ---- ASCII 家族树解析 ---- */
    const parseNodeText = (txt) => {
      // 返回 {label, name, note} —— label 如 "第一任妻子"/"养子"，note 为括注补充说明
      let s = cleanText(txt);
      let label = '';
      const lm = s.match(/^([^:：]{1,8})[:：]\s*(.+)$/);
      if (lm && /妻子|丈夫|夫|妻|养子|养女|儿子|女儿|继承人|家长|族|家/.test(lm[1])) {
        label = lm[1]; s = lm[2].trim();
      }
      const en = s.match(/[（(]\s*([A-Za-z][A-Za-z0-9 .·''-]*)\s*[）)]\s*$/);
      let alias = '';
      if (en) { alias = en[1].trim(); s = s.slice(0, en.index).trim(); }
      // 括注：元信息（部数/图鉴等）丢弃，描述性内容（如"理查德之父"）转入 note
      let note = '';
      s = s.replace(/[（(]([^）)]*)[）)]/g, (all, inner) => {
        if (/[（(]/.test(inner)) return all;
        if (/(?:第\s*\d+\s*部|图鉴|世纪|年代|约\s*\d+|早夭|夭折|已故|CE|典藏)/.test(inner)) return '';
        note = inner.trim();
        return '';
      });
      return { label, name: s.trim(), alias, note };
    };
    const parseTreeBlock = (codeText) => {
      const tLines = codeText.split(/\r?\n/);
      let stack = [];
      for (const raw of tLines) {
        const line = raw.replace(/\t/g, '    ');
        if (!line.trim()) continue;
        const idx = line.search(/[├└]─/);
        if (idx < 0) {
          const txt = cleanText(line.replace(/[│├└─]/g, ' '));
          if (!txt || /…{2,}|\.{3,}|文本未/.test(txt)) continue;
          // 根行 / 链式行（含 → 的整行按链处理）
          if (txt.includes('→')) { parseChainLine(txt); stack = []; continue; }
          const p = parseNodeText(txt);
          const person = p.name && !GENERIC_NAME.test(p.name) ? findOrCreate(p.name, { alias: p.alias, intro: p.label ? p.label : '' }) : null;
          stack = person ? [person] : [];
          continue;
        }
        const level = Math.max(1, Math.round(idx / 4) + 1);
        const txt = cleanText(line.slice(idx + 2));
        if (!txt || /…{2,}/.test(txt) && !/[\u4e00-\u9fa5]{2,}/.test(txt.replace(/[…]/g, ''))) continue;
        const parent = stack[level - 1] || stack[stack.length - 1] || null;
        const node = makeTreeNode(txt, parent);
        stack[level] = node;
        stack.length = level + 1;
      }
    };
    const makeTreeNode = (txt, parent) => {
      // 单节点（可能带 → 子女链）；过滤省略号注释段
      const segs = txt.split('→').map(s => cleanText(s))
        .filter(s => s && !/^…/.test(s) && !/见各部|文本未/.test(s));
      const head = parseNodeText(segs[0] || '');
      // 树头多名字（如"伊丽莎白、詹姆斯"）拆为同辈多人
      let headNames = [head];
      if (!head.label && /[、]/.test(head.name)) {
        const parts = head.name.split(/[、]/).map(x => stripMetaParens(cleanText(x))).filter(x => x && !GENERIC_NAME.test(x) && x.length <= 14);
        if (parts.length > 1) headNames = parts.map(x => ({ label: '', name: x, alias: '', note: head.note }));
      }
      const headPersons = [];
      for (const hn of headNames) {
        const person = hn.name && !GENERIC_NAME.test(hn.name)
          ? findOrCreate(hn.name, { alias: hn.alias, intro: hn.note || '' }) : null;
        if (person && parent && parent.id !== person.id) {
          const type = /妻|嫁|夫/.test(hn.label) ? '夫妻' : /养子|养女|收养/.test(hn.label) ? '养子' : '亲子';
          relations.push({
            sourceId: parent.id, targetId: person.id, relationType: type,
            desc: (hn.label ? hn.label + '：' : '家族世系：') + person.name + (hn.note ? '（' + hn.note + '）' : ''),
            strength: 0, time: ''
          });
        }
        if (person) headPersons.push(person);
      }
      const person = headPersons[0] || null;
      // 其余段：配偶名下子女 / 链式后代
      let chainFrom = person;
      const spouseHead = /妻|嫁|夫/.test(head.label);
      for (let i = 1; i < segs.length; i++) {
        const seg = segs[i];
        // 形如 "双胞胎女儿:伊芙琳、多萝西(早夭)" 或 "(抱回的"儿子")爱德华" 或 "安娜、路易莎、娜塔莉亚"
        let label = '', namesPart = seg, hasLabel = false;
        const lm = seg.match(/^([^:：]{1,10})[:：]\s*(.+)$/);
        if (lm && !/[（(]/.test(lm[1])) { label = lm[1]; namesPart = lm[2]; hasLabel = true; }
        const pm = namesPart.match(/^[（(]([^）)]{1,14})[）)]\s*(.+)$/);
        if (pm) { label = label || pm[1]; namesPart = pm[2]; hasLabel = true; }
        const kids = namesPart.split(/[、，,]/).map(x => stripMetaParens(cleanText(x))).filter(x => x && !GENERIC_NAME.test(x) && x.length <= 14);
        if (!kids.length) continue;
        const relType = /妻|嫁/.test(label) ? '夫妻'
          : /孙女|孙子/.test(label) ? '祖孙'
          : /养|嗣/.test(label) ? '养子'
          : /女/.test(label) ? '母女'
          : /儿|子/.test(label) ? '父子'
          : '亲子';
        let lastKid = null;
        for (const kn of kids) {
          let knAlias = '', knName = kn;
          const en3 = kn.match(/[（(]\s*([A-Za-z][^）)]*)\s*[）)]\s*$/);
          if (en3) { knAlias = en3[1]; knName = kn.slice(0, en3.index).trim(); }
          const kid = findOrCreate(knName, { alias: knAlias });
          if (!kid || !chainFrom || kid.id === chainFrom.id) continue;
          relations.push({
            sourceId: chainFrom.id, targetId: kid.id, relationType: relType,
            desc: (label ? label + '：' : '家族世系：') + kid.name,
            strength: 0, time: ''
          });
          // 树上层节点（父系）同样建立亲子关系，构成完整家族树
          if (spouseHead && parent && parent.id !== chainFrom.id && parent.id !== kid.id) {
            relations.push({
              sourceId: parent.id, targetId: kid.id, relationType: '亲子',
              desc: parent.name + '与' + chainFrom.name + '的子女',
              strength: 0, time: ''
            });
          }
          lastKid = kid;
        }
        // 仅当本段为单个名字（链式后代）时推进挂靠点；同辈子女组不推进
        if (lastKid && kids.length === 1) chainFrom = lastKid;
      }
      return person;
    };
    const parseChainLine = (txt) => {
      // 根级链式行：麦克斯韦家:查尔斯 →(抱回的"儿子")爱德华 →……→ 凯瑟琳(爱德华的孙女)
      const segs = txt.split('→').map(s => cleanText(s)).filter(s => s && !/^…+$/.test(s) && !/见各部|文本/.test(s));
      let prev = null;
      for (const seg of segs) {
        const node = makeTreeNode(seg, prev);
        if (node) prev = node;
      }
    };

    /* ---- 表格解析 ---- */
    const parseTableBlock = (rows) => {
      if (rows.length < 2) { skipped += rows.length; return; }
      const header = rows[0].map(c => stripMd(c).trim());
      const body = rows.slice(1);
      if (header.includes('顺位')) {
        for (const r of body) {
          const order = Number(stripMd(r[0])) || 0;
          const title = stripMd(r[1] || '');
          if (!title) continue;
          events.push({ id: '', title: title, time: '', order, era: subsection || '因果序', desc: stripMd(r[2] || ''), persons: [] });
        }
      } else if (header.some(h2 => /登场人物/.test(stripMd(h2)))) {
        // 登场速览表（表头含"主要登场人物"）：每部/卷一条卷目事件，不建人
        for (const r of body) {
          const m = stripMd(r[0]).match(/^(\d+)\s*(.*)$/);
          const num = m ? m[1] : '', nm = m ? m[2] : stripMd(r[0]);
          if (!nm) continue;
          events.push({
            id: '', title: `第${num ? num + '部' : ''}《${nm}》`, time: '', order: Number(num) || 0,
            era: '各部登场速览',
            desc: `主要登场人物：${stripMd(r[1] || '')}${r[2] ? '；与主线的关系：' + stripMd(r[2]) : ''}`,
            persons: []
          });
        }
      } else if (header.some(h2 => /姓名|人物|名字|角色/.test(stripMd(h2)))) {
        // 通用人物表：首列为姓名，其余列并入简介（走 findOrCreate 自动分配 ID 与合并）
        for (const r of body) {
          const nm = stripMd(r[0] || '').trim();
          if (!nm || nm.length > 20) continue;
          const desc2 = header.slice(1).map((h2, i3) => {
            const v = stripMd(r[i3 + 1] || '');
            return v ? h2 + '：' + v : '';
          }).filter(Boolean).join('；');
          findOrCreate(nm, { group: group || defaultGroup, intro: desc2 });
        }
      } else skipped += body.length;
    };

    /* ---- 时间线 / 章节事件条目 ---- */
    const isEventCtx = () => /时间线|年代线|大事记|因果序|待考|矛盾|家族与阵营|登场速览|速查|备注|奖励章节|章节|玩法/.test(subsection + group + sectionRaw);
    const addEventBullet = (raw) => {
      const text = stripMd(raw);
      if (!text) return;
      let title = '', rest = '';
      const bm = text.match(/^\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/);
      if (bm) { title = bm[1].trim(); rest = (bm[2] || '').trim(); }
      else {
        const cm = text.match(/^([^：:]{2,30})[:：]\s*(.+)$/);
        if (cm) { title = cm[1].trim(); rest = cm[2].trim(); }
      }
      if (!title) { title = text.split(/[，,;；。]/)[0].slice(0, 24); rest = text; }
      // 标题即时间（如"2003年"）且存在描述 → 用描述首句作标题，避免标题与时间重复
      if (rest && /^(约\s*)?[\d一二三两]{1,4}\s*年(代)?$|^(中世纪|远古|当代|现代|早期|晚期)$/.test(title)) {
        const t2 = rest.split(/[，,。;；]/)[0].trim();
        if (t2 && t2.length > title.length) title = t2.slice(0, 24);
      }
      if (/^(备注|注)[:：]/.test(text)) return;
      let time = '';
      if (/年|世纪|代$/.test(title) && title.length <= 20) time = title;
      if (!time) {
        const ym = rest.match(/(约\s*)?\d{1,4}\s*年(?:代)?(?:\s*[–—-]\s*(约\s*)?\d{1,4}\s*年)?|\d+\s*世纪|中世纪|远古|当代/);
        if (ym) time = ym[0];
      }
      events.push({ id: '', title: title.slice(0, 40), time, order: 0, era: (subsection || (/备注|奖励章节/.test(sectionRaw) ? sectionRaw : group)) || '时间线', desc: text, persons: [] });
    };

    /* ================= 主循环 ================= */
    let tableBuf = [];
    const flushTable = () => {
      if (tableBuf.length) { parseTableBlock(tableBuf); tableBuf = []; }
    };

    for (let li = 0; li < lines.length; li++) {
      const rawLine = lines[li];
      const line = rawLine.trim();

      /* 代码块（家族树） */
      if (/^```/.test(line)) {
        if (inCode) { parseTreeBlock(codeBuf.join('\n')); codeBuf = []; inCode = false; }
        else { flushTable(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(rawLine); continue; }

      /* 空行 / 表格缓冲 */
      if (!line) { flushTable(); if (chapterPending && !chapterPending.desc) { /* 继续等待 */ } continue; }

      /* 标题 */
      const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        flushTable();
        const level = hMatch[1].length;
        const h = cleanText(hMatch[2]);
        if (level === 1) {
          docTitle = h;
          defaultGroup = h.replace(/[《》【】]/g, '').split(/[:：]/)[0].slice(0, 20) || '剧情文档';
          group = '';
          // 多文档合并解析时以一级标题作为文档边界：重置梗概/章节上下文，
          // 保证每篇文档的"剧情梗概"事件独立生成，不被上一文档的状态遮挡
          inSynopsis = false;
          introEvent = null;
          continue;
        }
        if (level <= 2) {
          const cleaned = h.replace(/^[一二三四五六七八九十\d]+[、.．]\s*/, '').replace(/[（(].*?[）)]$/g, '').trim();
          sectionRaw = h;
          inSynopsis = /剧情梗概/.test(h);
          // 非分组性标题（主要角色/剧情等）沿用文档级分组
          group = NON_GROUP_HEAD.test(h) ? defaultGroup : (cleaned || defaultGroup);
          subsection = '';
          // 结局 / 尾声 / 奖励章节 等叙事小节 → 直接生成事件（后续段落填充描述）
          if (/^(结局|尾声|奖励章节|番外)/.test(h)) {
            const ev = { id: '', title: h, time: '', order: 0, era: (defaultGroup || '剧情文档') + ' · 章节', desc: '', persons: [] };
            events.push(ev);
            chapterPending = ev;
          } else {
            chapterPending = null;
          }
        } else {
          subsection = h.replace(/^[一二三四五六七八九十\d]+(?:\.\d+)?[、.．]\s*/, '').trim();
          // 三级标题若为家族/阵营子节，优先作为人物分组（时间线/大事记/待考等小节不参与）
          if (subsection && !/时间线|年代线|大事记|因果序|待考|备注|奖励章节/.test(subsection) && !/详细剧情|剧情章节/.test(sectionRaw)) {
            group = subsection;
          }
          chapterPending = null;
          // 详细剧情章节 → 事件
          if (/详细剧情|剧情章节/.test(sectionRaw) && subsection) {
            const ev = { id: '', title: subsection.replace(/^[一二三四五六七八九十]+[、.．]\s*/, ''), time: '', order: 0, era: (defaultGroup || '剧情文档') + ' · 章节', desc: '', persons: [] };
            events.push(ev);
            chapterPending = ev;
          } else if (/奖励章节|备注/.test(subsection)) {
            chapterPending = null;
          }
        }
        continue;
      }

      /* 表格行 */
      if (/^\|/.test(line)) {
        if (/^\|[\s:|-]+\|?$/.test(line)) continue; // 分隔行
        tableBuf.push(line.split('|').slice(1, -1).map(c => c.trim()));
        continue;
      }
      flushTable();

      /* 引用行：填充章节描述 */
      if (/^>\s?/.test(line)) {
        if (chapterPending && !chapterPending.desc) {
          chapterPending.desc = cleanText(line.replace(/^>\s?/, '')).slice(0, 160);
        }
        continue;
      }

      /* 普通段落 */
      if (!/^[-*•]\s|^\d+[.、)]\s/.test(line)) {
        if (chapterPending && !chapterPending.desc) {
          chapterPending.desc = cleanText(line).slice(0, 160);
          continue;
        }
        if (inSynopsis && !introEvent && line.length > 30) {
          introEvent = { id: '', title: '剧情梗概', time: '', order: -1, era: '剧情梗概', desc: cleanText(line).slice(0, 400), persons: [] };
          events.push(introEvent);
        }
        continue;
      }

      /* ---------- 列表条目 ---------- */
      const itemText = line.replace(/^[-*•]\s+/, '').replace(/^\d+[.、)]\s+/, '').trim();
      if (!itemText) continue;

      // ① 时间线/阵营/待考上下文 → 事件
      if (isEventCtx()) {
        addEventBullet(itemText);
        continue;
      }

      // ② 关系条目：A × B / A ↔ B（支持多人链 安娜 ↔ 路易莎 ↔ 娜塔莉亚）
      if (/[×↔]/.test(itemText)) {
        // 括号深度感知：找到深度为 0 的第一个冒号位置
        const findTopColon = (s2) => {
          let depth = 0;
          for (let ci = 0; ci < s2.length; ci++) {
            const ch = s2[ci];
            if (ch === '（' || ch === '(') depth++;
            else if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
            else if ((ch === '：' || ch === ':') && depth === 0) return ci;
          }
          return -1;
        };
        // 剔除内部 ID 链条注记（如"g10→h3 恋人"），避免被 → 分隔符误拆成畸形名字
        const itemTextClean = itemText.replace(/[（(][^）)]*[a-z]\d+\s*[→×↔]\s*[a-z]\d+[^）)]*[）)]/g, '').replace(/[a-z]\d+\s*[→×↔]\s*[a-z]\d+/g, '').replace(/[；;]\s*[；;]+/g, '；').trim();
        const pieces = itemTextClean.split(/([×↔→])/);
        const names = [], seps = [];
        for (let pi = 0; pi < pieces.length; pi++) {
          if (pieces[pi] === '×' || pieces[pi] === '↔' || pieces[pi] === '→') { seps.push(pieces[pi]); continue; }
          const seg2 = pieces[pi];
          if (!seg2.trim()) continue;
          const colonIdx = findTopColon(seg2);
          let nm = (colonIdx >= 0 ? seg2.slice(0, colonIdx) : seg2).trim();
          // 尾括注剥离（「盖尔·史密斯（示例夫妻）」→ 盖尔·史密斯），元信息/描述括注均不入名
          nm = nm.replace(/[（(][^）)]*[）)]s*$/, '').trim();
          names.push(nm);
        }
        for (let k2 = 0; k2 < seps.length; k2++) {
          if (!names[k2] || !names[k2 + 1]) continue;
          addRelation(names[k2], names[k2 + 1], itemText, { isCouple: seps[k2] === '×' });
        }
        continue;
      }

      // ③ 人物条目：**名称**：描述 / 名称(EN)——描述 / 名称：描述
      let pName = '', pIntro = '', pAlias = '';
      // ③a 多人并列条目（"**A**(注)、**B**(注)、C(注)：描述"）→ 拆分为多个人物
      {
        let depth = 0, topColon = -1;
        for (let ci = 0; ci < itemText.length; ci++) {
          const ch = itemText[ci];
          if (ch === '（' || ch === '(') depth++;
          else if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
          else if ((ch === '：' || ch === ':') && depth === 0) { topColon = ci; break; }
        }
        if (topColon > 0 && !/[×↔]/.test(itemText)) {
          const left = itemText.slice(0, topColon);
          const bolds = [...left.matchAll(/\*\*(.+?)\*\*/g)].map(m => m[1].trim()).filter(Boolean);
          if (bolds.length >= 2 && left.length <= 80) {
            const intro2 = cleanText(itemText.slice(topColon + 1)).slice(0, 300);
            for (const bn of bolds) {
              let nm2 = bn, al2 = '';
              const qual2 = nm2.match(/[（(]([^）)]*)[）)]\s*$/);
              if (qual2 && !/^[A-Za-z]/.test(qual2[1])) {
                const keep2 = qual2[1].replace(/第[\d\s、,，~～]+部|图鉴|典藏|CE|收藏/g, '').replace(/^[，,、;；\s]+|[，,、;；\s]+$/g, '').trim();
                nm2 = nm2.slice(0, qual2.index).trim();
                if (keep2) nm2 = nm2 + '(' + keep2 + ')';
              }
              const slash = nm2.split('/');
              if (slash.length === 2 && slash.every(x => x.trim().length >= 2)) { nm2 = slash[0].trim(); al2 = slash[1].trim(); }
              if (nm2 && nm2.length <= 16 && !GENERIC_NAME.test(nm2)) findOrCreate(nm2, { alias: al2, intro: intro2 });
            }
            continue;
          }
        }
      }
      const bold = itemText.match(/^\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/);
      if (bold) {
        pName = bold[1]; pIntro = (bold[2] || '').trim();
        // 加粗名后紧跟的别名写法："**杜陌**（别名：小陌）"
        const alOut = itemText.match(/^\*\*[^*]+\*\*\s*[（(]别名[:：]\s*([^）)]+)[）)]/);
        if (alOut) pAlias = (pAlias ? pAlias + '、' : '') + alOut[1].trim();
        // 元信息括号内含别名："**灰衣女士**（h3；…；别名：伊莱扎·霍桑）"
        {
          const alIdx = (pIntro || '').indexOf('别名');
          if (alIdx >= 0) {
            const mm = pIntro.slice(alIdx).match(/别名[:：]\s*([^，,；;)）]+)/);
            if (mm) {
              pAlias = (pAlias ? pAlias + '、' : '') + mm[1].trim();
              pIntro = (pIntro.slice(0, alIdx) + pIntro.slice(alIdx + mm[0].length)).replace(/[；;]\s*[；;]*/g, '；').replace(/^\s*[；;]\s*|;\s*$/g, '').trim();
            }
          }
        }
      } else {
        // 括号深度感知定位第一个 ——/—/：/: 分隔符，人名长度不受限
        let depth = 0, sepIdx = -1;
        for (let ci = 0; ci < itemText.length; ci++) {
          const ch = itemText[ci];
          if (ch === '（' || ch === '(') depth++;
          else if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
          else if (depth === 0 && (ch === '—' || ch === '：' || ch === ':')) { sepIdx = ci; break; }
        }
        if (sepIdx > 0 && !/^\d/.test(itemText)) {
          pName = itemText.slice(0, sepIdx);
          pIntro = itemText.slice(sepIdx + (itemText[sepIdx + 1] === '—' ? 2 : 1)).trim();
        }
      }
      if (pName) {
        // 括注处理：剥离部数/图鉴等元信息，保留地域/称号限定词（如"斯通韦尔"、"伯爵"）
        let qual = pName.match(/[（(]([^）)]*)[）)]\s*$/);
        // 元信息内「别名：X」→ 直接作为别名（如"（h3；…；别名：伊莱扎·霍桑）"）
        if (qual && /别名[:：]/.test(qual[1])) {
          const alM = qual[1].match(/别名[:：]\s*([^；,，）)]+)/);
          if (alM) {
            pAlias = (pAlias ? pAlias + '、' : '') + alM[1].trim();
            pName = pName.replace(/；?\s*别名[:：][^；,，）)]+/, '').trim();
            pName = pName.replace(/[；;]\s*$/, '').trim();
            qual = pName.match(/[（(]([^）)]*)[）)]\s*$/);
          }
        }
        let cleaned = cleanText(pName).replace(/[（(][^）)]*[）)]\s*$/, '').trim();
        let keep = '';
        if (qual) {
          if (/^[A-Za-z]/.test(qual[1])) {
            pAlias = pAlias || qual[1].trim();
          } else {
            // 仅保留短限定词（如"斯通韦尔"、"伯爵"、"白夫人"），长描述性括注丢弃
            keep = qual[1].replace(/第[\d\s、,，~～]+部|图鉴|典藏|CE|收藏/g, '')
              .replace(/^[，,、;；\s]+|[，,、;；\s]+$/g, '').trim();
            if (keep.length > 6 || /[文本未给出名字角，]/.test(keep)) keep = '';
          }
        }
        if (keep) cleaned = cleaned + '(' + keep + ')';
        const en = cleaned.match(/[（(]\s*([A-Za-z][A-Za-z0-9 .·''-]*)\s*[）)]\s*$/);
        if (en) { pAlias = pAlias || en[1].trim(); cleaned = cleaned.slice(0, en.index).trim(); }
        // 并列多人名（"克莱尔、罗德尼" / "萨拉(Sarah)、凯特"）拆分为独立人物
        if (/[、]/.test(cleaned) && cleaned.length <= 30) {
          const parts = cleaned.split(/[、]/).map(x => cleanText(x)).filter(Boolean);
          const parsedParts = [];
          for (let part of parts) {
            let partAlias = '';
            const en2 = part.match(/[（(]\s*([A-Za-z][^）)]*)\s*[）)]\s*$/);
            if (en2) { partAlias = en2[1].trim(); part = part.slice(0, en2.index).trim(); }
            else {
              const q2 = part.match(/[（(]([^）)]*)[）)]\s*$/);
              if (q2) {
                const keep3 = q2[1].replace(/第[\d\s、,，~～]+部|图鉴|典藏|CE|收藏/g, '').replace(/^[，,、;；\s]+|[，,、;；\s]+$/g, '').trim();
                part = part.slice(0, q2.index).trim();
                if (keep3 && keep3.length <= 6 && !/[文本未给出名字角，]/.test(keep3)) part = part + '(' + keep3 + ')';
              }
            }
            part = part.replace(/["“”]/g, '').trim();
            if (part && part.length <= 16 && !GENERIC_NAME.test(part)) parsedParts.push({ name: part, alias: partAlias });
          }
          if (parsedParts.length > 1) {
            for (const it of parsedParts) findOrCreate(it.name, { alias: it.alias, intro: cleanText(pIntro).slice(0, 300) });
            continue;
          }
        }
        const p = findOrCreate(cleaned, { alias: pAlias, intro: cleanText(pIntro).slice(0, 300) });
        if (p) continue;
      }

      // ④ 无法识别 → 跳过计数（记录行号与原文便于定位）
      skipped++;
      skippedLines.push({ no: li + 1, text: cleanText(line).slice(0, 40) });
    }
    flushTable();
    if (inCode && codeBuf.length) parseTreeBlock(codeBuf.join('\n'));

    /* ---------- 后置处理 ---------- */
    // 事件关联人物：扫描事件文本中出现的已有人物名（长名优先，含"·"分段短名）
    {
      const cands = [];
      for (const p of persons) {
        cands.push({ name: p.name, idx: persons.indexOf(p) });
        const seg = p.name.split('·')[0];
        if (seg.length >= 2 && seg !== p.name && !/[（(]/.test(seg)) cands.push({ name: seg, idx: persons.indexOf(p) });
      }
      cands.sort((a, b) => b.name.length - a.name.length);
      for (const ev of events) {
        const ids = new Set();
        const hay = ev.title + '；' + ev.desc;
        for (const c of cands) {
          if (c.name.length >= 2 && hay.includes(c.name)) ids.add(persons[c.idx].id);
        }
        ev.persons = [...new Set([...(ev.persons || []), ...[...ids]])].slice(0, 14);
      }
    }
    // 占位名合并：各部对同一主角的称谓（女主角/主角/玩家角色/纯称谓名）合并为同一人物
    {
      const isPlaceholder = (nm) => /^(女主角|主角|玩家角色|侦探)$/.test(nm);
      const isKinOnly = (nm) => /^(姨妈|姑妈|叔叔|舅舅|伯伯|婶婶|堂兄|堂弟|表哥|表姐|表妹|外甥|外甥女|侄女|侄子)$/.test(nm);
      let proto = persons.find(p => isPlaceholder(p.name)) ||
                  persons.find(p => isKinOnly(p.name) && /女主角|侦探|玩家/.test(p.intro));
      if (proto) {
        const merges = persons.filter(p => p !== proto &&
          (isPlaceholder(p.name) || (isKinOnly(p.name) && /女主角|侦探|玩家|系列侦探/.test(p.intro))));
        for (const mp of merges) {
          if (!proto.alias && mp.alias) proto.alias = mp.alias;
          if (proto.intro.length < mp.intro.length && mp.intro) proto.intro = mp.intro;
          for (const r of relations) {
            if (r.sourceId === mp.id) r.sourceId = proto.id;
            if (r.targetId === mp.id) r.targetId = proto.id;
          }
          for (const e of events) e.persons = (e.persons || []).map(x => x === mp.id ? proto.id : x);
          for (const [k, v] of seen) if (v === mp) seen.set(k, proto);
          persons.splice(persons.indexOf(mp), 1);
        }
        // 清理合并后产生的自环
        for (let i = relations.length - 1; i >= 0; i--) {
          if (relations[i].sourceId === relations[i].targetId) relations.splice(i, 1);
        }
      }
    }
    // 人物简介亲属关系挖掘（”路易莎之妹” / “杰姬之父” / “安娜最亲爱的妹妹” / “主角妹妹”）
    {
      const KIN_WORDS = '双胞胎女儿|双胞胎儿子|高祖父|高祖母|曾祖父|曾祖母|外祖父|外祖母|祖父|祖母|爷爷|奶奶|姑婆|父亲|母亲|爸爸|妈妈|父|母|女儿|儿子|养女|养子|养父|养母|继父|继母|继女|继子|姐姐|妹妹|姐|妹|哥哥|弟弟|兄|弟|兄长|未婚夫|未婚妻|女友|男友|恋人|丈夫|妻子|夫人|妻|夫|侄女|侄子|外甥|外甥女|孙子|孙女|曾孙|曾孙女|姑妈|姑姑|叔叔|伯伯|舅舅|姨妈|姨母|嫂子|堂兄|堂弟|表哥|表弟|表姐|表妹|父母|子(?![\u4e00-\u9fa5])|女(?![\u4e00-\u9fa5])|帮手|保姆|管家|助手|搭档|顾问|司机|保镖|合伙人|学生|老师|师父|徒弟';
      const KIN_RULES = [
        [/^(父亲|母亲|爸爸|妈妈|父|母|养父|养母|继父|继母|父母)$/, '亲子', 'parentOf'],
        [/^(女儿|儿子|养女|养子|继女|继子|子|女|双胞胎女儿|双胞胎儿子)$/, '亲子', 'childOf'],
        [/^(姐姐|妹妹|姐|妹|姐妹)$/, '姐妹', 'pair'],
        [/^(哥哥|弟弟|兄|弟|兄长|兄弟)$/, '兄弟', 'pair'],
        [/^(未婚夫|未婚妻|女友|男友|恋人|丈夫|妻子|夫人|妻|夫)$/, '夫妻', 'pair'],
        [/^(高祖父|高祖母|曾祖父|曾祖母|外祖父|外祖母|祖父|祖母|爷爷|奶奶|姑婆|侄女|侄子|外甥|外甥女|孙子|孙女|曾孙|曾孙女|姑妈|姑姑|叔叔|伯伯|舅舅|姨妈|姨母|嫂子|堂兄|堂弟|表哥|表弟|表姐|表妹)$/, '亲属', 'pair'],
        [/^(保姆|管家|助手|搭档|顾问|司机|保镖|合伙人|学生|老师|师父|徒弟|帮手)$/, '关联', 'pair']
      ];
      const NAME_PART = '(?:(?!的|之|与)[\u4e00-\u9fa5·]){2,10}';
      const findRefAll = (nm) => {
        nm = String(nm || '').replace(/[““”]/g, '').trim();
        if (!nm) return [];
        let hit = seen.get(nm) || null;
        if (hit) return [hit];
        const seg = nm.split('·')[0];
        const segHits = [];
        for (const [k, v] of seen) {
          if (k.split('·')[0] === seg && !/[（(]/.test(k)) segHits.push(v);
        }
        if (segHits.length) return segHits.length === 1 ? segHits : [];
        if (nm.length >= 2) {
          const revHits = [];
          for (const [k, v] of seen) {
            if (k.includes(nm) && !/[（(]/.test(k)) revHits.push(v);
          }
          if (revHits.length === 1) return revHits;
        }
        const cands = persons.filter(pp => pp.name.length >= 2 && nm.includes(pp.name))
          .sort((a, b) => b.name.length - a.name.length);
        if (cands.length) return [cands[0]];
        // 别名匹配："劳拉" → 白夫人（别名 劳拉·曼斯菲尔德）
        const aliasExact = [], aliasSub = [];
        for (const pp of persons) {
          const al = (pp.alias || '').toLowerCase();
          if (!al) continue;
          if (al === nm.toLowerCase()) aliasExact.push(pp);
          else if (al.includes(nm) && nm.length >= 2) aliasSub.push(pp);
        }
        if (aliasExact.length === 1) return aliasExact;
        if (aliasSub.length === 1) return aliasSub;
        if (/主角/.test(nm)) {
          for (const pp of persons) if (pp.name.includes('主角')) return [pp];
        }
        // 复数称谓："麦克格雷姐弟" → 家族姓氏匹配的多个人物
        if (/姐弟|兄妹|姐妹|兄弟|夫妇|夫妻|父母|俩|三人|孩子们/.test(nm)) {
          const base = nm.replace(/姐弟|姐妹|兄弟|姐妹|夫妇|夫妻|父母|俩|三人|孩子们|的/g, '');
          if (base.length >= 2) {
            const fam = [];
            for (const pp of persons) {
              if (pp.name.includes(base) || (pp.alias || '').includes(base)) fam.push(pp);
            }
            if (fam.length > 1) return fam;
          }
        }
        return [];
      };
      const findRef = (nm) => findRefAll(nm)[0] || null;
      const relPushed = (a, b) => relations.some(r => (r.sourceId === a && r.targetId === b) || (r.sourceId === b && r.targetId === a));
      // 本篇主角识别（供亲属指代与占位名解析）
      const isPH = (nm) => /^(女主角|主角|玩家角色|侦探)(（[^）]*）|\([^)]*\))?$/.test(nm);
      const protagonist = persons.find(p => isPH(p.name)) ||
                          persons.find(p => /女主角|玩家角色/.test(p.intro)) ||
                          persons.find(p => /(?:^|[，,、；;])\s*主角/.test(p.intro || '')) ||
                          persons.find(p => /(?:^|[，,、；;])\s*(?:著名|私人)?侦探/.test(p.intro || '')) || null;
      // 兜底启发：被其他人物简介引用最多的人物视为主角
      if (!protagonist && persons.length >= 3) {
        const mention = new Map();
        for (const pp of persons) {
          const variants = [pp.name, ...(pp.name.split('·').filter(s2 => s2.length >= 2)), (pp.alias || '')].filter(Boolean);
          let cnt = 0;
          for (const other of persons) {
            if (other === pp || !other.intro) continue;
            for (const v of variants) if (other.intro.includes(v)) { cnt++; break; }
          }
          if (cnt > 0) mention.set(pp, cnt);
        }
        let best = null, bestC = 0;
        for (const [pp, c] of mention) if (c > bestC) { best = pp; bestC = c; }
        var hubProtagonist = best || null;
      } else {
        var hubProtagonist = null;
      }
      const protagonistFinal = protagonist || hubProtagonist;
      const resolveKinRefs = (nm) => {
        const refs = findRefAll(nm);
        if (!refs.length && protagonistFinal && /^(女主角|主角|玩家角色|侦探)$/.test(nm)) return [protagonistFinal];
        return refs;
      };
      // 主连接词匹配：X之/的(+修饰)(+亲爱的)(kin)
      for (const p of persons) {
        if (!p.intro) continue;
        const introKin = p.intro.replace(/["“”]/g, ''); // 去引号扫描（如 安娜的"毒舌顾问"）
        const re = new RegExp('(' + NAME_PART + ')[^。，；;，,]{0,14}?(?:之|的)(?:亲生|前任|第[一二三四五六七八九十]+任|前|新|旧|养|继|亡|生|孪生|双胞胎|双|大|亲)?(?:最|很|超|真)?(?:亲爱的?)?(' + KIN_WORDS + ')', 'g');
        let m;
        while ((m = re.exec(introKin))) {
          let refs = resolveKinRefs(m[1]);
          // 敌对语境守卫："曾陷害林晚秋之父"——句中含陷害/谋杀等动词时不做亲子推断
          if ((m[2] === '父' || m[2] === '母' || m[2] === '父亲' || m[2] === '母亲' || m[2] === '爸爸' || m[2] === '妈妈') &&
              /陷害|谋杀|杀害|暗杀|袭击|报仇|复仇|针对|嫁祸|栽赃/.test(introKin.slice(Math.max(0, m.index - 6), m.index + m[0].length + 6))) continue;
          // "路易莎与约翰之子" → 双亲各自建立亲子关系
          if (refs.length === 1 && /[与和]/.test(m[1])) {
            for (const pp of persons) {
              const seg0 = pp.name.split('·')[0];
              if (seg0.length >= 2 && seg0.length <= 6 && m[1].includes(seg0) && !refs.some(r2 => r2.id === pp.id)) refs.push(pp);
            }
          }
          if (!refs.length) continue;
          for (const ref of refs) {
            if (ref.id === p.id || relPushed(ref.id, p.id)) continue;
            for (const [kinRe, type, dir] of KIN_RULES) {
              if (!kinRe.test(m[2])) continue;
              if (dir === 'parentOf') {
                relations.push({ sourceId: p.id, targetId: ref.id, relationType: '亲子', desc: p.name + '是' + ref.name + '的' + m[2], strength: 0, time: '' });
              } else if (dir === 'childOf') {
                relations.push({ sourceId: ref.id, targetId: p.id, relationType: '亲子', desc: ref.name + '的' + m[2] + '：' + p.name, strength: 0, time: '' });
              } else {
                relations.push({ sourceId: ref.id, targetId: p.id, relationType: type, desc: ref.name + '与' + p.name + '（' + m[2] + '）', strength: 0, time: '' });
              }
              break;
            }
          }
        }
      }
      // 紧邻匹配：无”之/的”连接（”主角妹妹” / “布兰登最爱的女孩”等）——仅匹配真实人物名，杜绝垃圾跨度
      {
        const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameAlts = [];
        for (const p of persons) {
          nameAlts.push(escRe(p.name));
          for (const seg of p.name.split('·')) {
            if (seg.length >= 2 && seg !== p.name) nameAlts.push(escRe(seg));
          }
        }
        nameAlts.push('女主角', '主角', '玩家角色', '侦探');
        const uniqAlts = [...new Set(nameAlts)].sort((a, b) => b.length - a.length).filter(a => a.length >= 2);
        const re2 = new RegExp('(' + uniqAlts.join('|') + ')(?:亡|养|继|前)?(姐姐|妹妹|哥哥|弟弟|父|母|丈夫|妻子|未婚夫|未婚妻|父亲|母亲|女儿|儿子|侄女|侄子|外甥|外甥女|孙子|孙女|祖父|祖母|姑婆)', 'g');
        for (const p of persons) {
          if (!p.intro) continue;
          re2.lastIndex = 0;
          let m2;
          while ((m2 = re2.exec(p.intro))) {
            const refs = resolveKinRefs(m2[1]);
            if (!refs.length) continue;
              const kinRe = new RegExp('^' + m2[2] + '$');
              for (const [kinReR, type, dir] of KIN_RULES) {
                if (!kinReR.test(m2[2])) continue;
                for (const ref of refs) {
                  if (ref.id === p.id || relPushed(ref.id, p.id)) continue;
                  if (dir === 'parentOf') {
                    relations.push({ sourceId: p.id, targetId: ref.id, relationType: '亲子', desc: p.name + '是' + ref.name + '的' + m2[2], strength: 0, time: '' });
                  } else if (dir === 'childOf') {
                    relations.push({ sourceId: ref.id, targetId: p.id, relationType: '亲子', desc: ref.name + '的' + m2[2] + '：' + p.name, strength: 0, time: '' });
                  } else {
                    relations.push({ sourceId: ref.id, targetId: p.id, relationType: type, desc: ref.name + '与' + p.name + '（' + m2[2] + '）', strength: 0, time: '' });
                  }
                }
                break;
              }
            }
          }
        }
      // 纯称谓人物（”母亲”/”父亲”）与裸称谓简介（”侄女，父母双亡…”）→ 关联到本篇主角（isPH/protagonist 见上方定义）
      const isKinOnlyName = (nm) => /^(母亲|父亲|妈妈|爸爸)$/.test(nm);
      const bareKinRe = /^(?:小)?(高祖父|曾祖父|祖父|祖母|爷爷|奶奶|侄女|侄子|孙子|孙女|妹妹|姐姐|弟弟|哥哥|养女|养子|养兄|养妹|外甥|外甥女|姨妈|姑妈|叔叔|舅舅|伯伯|婶婶|父亲|母亲)\s*[，,、—–-]/;
      if (protagonistFinal) {
        for (const p of persons) {
          if (p === protagonistFinal) continue;
          if (isKinOnlyName(p.name) && !relPushed(p.id, protagonistFinal.id)) {
            relations.push({ sourceId: p.id, targetId: protagonistFinal.id, relationType: '亲子', desc: '剧情推断：' + p.name + '与' + protagonistFinal.name + '的家人关系', strength: 0, time: '' });
          } else if (bareKinRe.test((p.intro || '').trim()) && !relPushed(p.id, protagonistFinal.id)) {
            const kw = (p.intro.trim().match(bareKinRe))[1];
            relations.push({ sourceId: protagonistFinal.id, targetId: p.id, relationType: '亲属', desc: '剧情推断：' + protagonistFinal.name + '的' + kw + '——' + p.name, strength: 0, time: '' });
          } else if (/^[\u4e00-\u9fa5]{0,4}(养子|养女|养兄|养妹)/.test((p.intro || '').trim()) && !relPushed(p.id, protagonistFinal.id)) {
            relations.push({ sourceId: protagonistFinal.id, targetId: p.id, relationType: '亲属', desc: '剧情推断：' + protagonistFinal.name + '的养亲——' + p.name, strength: 0, time: '' });
          } else if (p.intro && p.intro.length <= 30 && /的(父亲|母亲|爸爸|妈妈)/.test(p.intro) && !relPushed(p.id, protagonistFinal.id)) {
            // "以新形态归来的父亲"等：简介前段出现"的父/母"称谓 → 推断为主角父母
            relations.push({ sourceId: p.id, targetId: protagonistFinal.id, relationType: '亲子', desc: '剧情推断：' + protagonistFinal.name + '的父/母——' + p.name, strength: 0, time: '' });
          }
        }
      }
    }
    // 人物简介子句级关系挖掘（"以仪式为名囚禁路易莎"→ 敌对 等，补全恩怨叙述中的关联）
    {
      const MINE_RULES = [
        [/深爱|暗恋|相爱|恋人|定情/, '恋人'],
        [/未婚夫|未婚妻|成婚|结婚|订婚|丈夫|妻子|夫妻/, '夫妻'],
        [/囚禁|绑架|掳走|杀害|谋杀|毒死|毒杀|杀死|追杀|袭击|陷害|诅咒|复仇|报复|夺取|夺走|密谋|反派|宿敌|死敌|敌对|操纵|利用|欺骗|蛊惑|教唆|胁迫|虐待|击败|打败|挫败|夺舍|献祭|放逐|驱逐|受害|祭品|控制/, '敌对'],
        [/协助|帮助|救下|救出|拯救|联手|并肩|同盟|相助|相救|保护|守护|托付|抚养|救赎|宽恕|引导|帮手|立约/, '联手'],
        [/化身|代理|分身|宿主|同伴/, '关联']
      ];
      // 已有关系对集合（避免重复建边）
      const pairSet = new Set();
      for (const r of relations) pairSet.add([r.sourceId, r.targetId].sort().join('|'));
      // 人物候选（长名优先，含别名与"·"分段≥3字；纯称谓别名除外，避免"父亲"等词误匹配）
      const cands = [];
      for (const p of persons) {
        cands.push(p);
        for (const seg of p.name.split('·')) {
          if (seg.length >= 3 && seg !== p.name && !/^(母亲|父亲)$/.test(seg)) cands.push({ id: p.id, name: seg, _viaSeg: true });
        }
        if ((p.alias || '').length >= 2 && !/^(父亲|母亲|爸爸|妈妈|女儿|儿子|姐妹|兄弟|姐姐|妹妹|哥哥|弟弟)$/.test(p.alias)) {
          cands.push({ id: p.id, name: p.alias, _viaAlias: true });
        }
      }
      cands.sort((a, b) => b.name.length - a.name.length);
      for (const p of persons) {
        if (!p.intro) continue;
        for (const clause of p.intro.split(/[，。；;！？!?,]/)) {
          const text = clause.replace(/["“”]/g, '');
          if (!text || text.length > 80) continue;
          // 找到子句中的其他人物；最长匹配去重叠、按人物去重，多人时仅保留关键词紧邻者
          const matches = [];
          for (const c of cands) {
            if (c.id === p.id) continue;
            const idx = text.indexOf(c.name);
            if (idx >= 0) matches.push({ c, idx, end: idx + c.name.length });
          }
          if (!matches.length) continue;
          matches.sort((a, b) => b.c.name.length - a.c.name.length);
          const kept = [];
          for (const m2 of matches) {
            const overlap = kept.some(k => m2.idx < k.end && k.idx < m2.end);
            if (!overlap) kept.push(m2);
          }
          const seenIds = new Set();
          const uniq = [];
          for (const m2 of kept) {
            if (seenIds.has(m2.c.id)) continue;
            seenIds.add(m2.c.id);
            uniq.push(m2);
          }
          if (!uniq.length) continue;
          let targets = [];
          for (const [re, type] of MINE_RULES) {
            re.lastIndex = 0;
            const km = re.exec(text);
            if (!km) continue;
            const adjacent = uniq.filter(m3 => Math.abs(m3.idx - km.index) <= 3 + m3.c.name.length);
            if (adjacent.length) { targets = adjacent.map(a2 => ({ other: a2.c, nameIdx: a2.idx, type })); break; }
          }
          if (!targets.length && uniq.length === 1) {
            // 无命中关键词但唯一人物 → 关联
            targets = [{ other: uniq[0].c, nameIdx: uniq[0].idx, type: '关联' }];
          }
          for (const t of targets) {
            const pairKey = [p.id, t.other.id].sort().join('|');
            if (pairSet.has(pairKey)) continue;
            relations.push({ sourceId: p.id, targetId: t.other.id, relationType: t.type, desc: text.slice(0, 60), strength: 0, time: '' });
            pairSet.add(pairKey);
          }
        }
      }
    }
    // 关系去重（同对人物 + 同类亲属关系合并）
    const KIN = /^(亲子|父子|父女|母子|母女|养子|养女)$/;
    const seenRel = new Set();
    const deduped = [];
    for (const r of relations) {
      const pairKey = [r.sourceId, r.targetId].sort().join('|');
      const normType = r.relationType === '配偶' ? '夫妻' : r.relationType;
      const key = pairKey + '|' + (KIN.test(normType) ? '亲子' : normType);
      if (seenRel.has(key)) continue;
      seenRel.add(key);
      r.relationType = normType;
      deduped.push(r);
    }
    // 关系强度推断：Markdown 无强度字段，按关系类型分级（至亲>手足>师徒/对立>普通关联），
    // 描述中的强语气词再 +1，保证导入后的关系线有差异化粗细
    const DEFAULT_STRENGTH = {
      夫妻: 9, 恋人: 8, 父子: 9, 父女: 9, 母子: 9, 母女: 9, 亲子: 9,
      兄弟: 8, 姐妹: 8, 兄妹: 8, 龙凤胎: 9, 双胞胎: 9, 祖孙: 8, 养子: 7, 养兄妹: 7,
      师徒: 7, 同窗: 6, 君臣: 7, 主仆: 6, 对手: 6, 敌对: 7, 联手: 6, 救赎: 6,
      挚友: 6, 好友: 5, 朋友: 4, 仇人: 7, 死对头: 7, 闺蜜: 5, 盟友: 6, 搭档: 6, 同学: 5, 同事: 5, 结拜: 7, 未婚夫妻: 8, 亲戚: 4,
      亲属: 5, 创造: 6, 依附: 4
    };
    const STRONG_TEXT = /宿敌|死敌|世仇|决裂|至爱|深爱|至死不渝|生死之交|莫逆|挚友|恨/;
    for (const r of deduped) {
      if (!r.strength) {
        r.strength = Math.min(10, (DEFAULT_STRENGTH[r.relationType] || 3) + (STRONG_TEXT.test(r.desc || '') ? 1 : 0));
      }
    }
    /* ---- 叙述句式关系抽取：模板未覆盖的自然语句（如「A与B是恋人」「A杀死了B」） ---- */
    const narrExtract = (list) => {
      const STOP_WORDS = /^(他|她|它|我|咱|你|我们|你们|他们|她们|它们|两人|二人|众人|双方|彼此|一人|大家|谁|其|自己|本人|对方|各自|某|那人|此人|之中|其后|此时|那时|事后|原来|最后|随后|不久|最终)$/;
      const knownNames = new Set();
      for (const p of persons) {
        knownNames.add(p.name);
        if (p.alias) p.alias.split(/[、,，/／]/).forEach(a => { const t = a.trim(); if (t) knownNames.add(t); });
      }
      const relWordList = ['死对头', '未婚夫妻', '双胞胎', '龙凤胎', '养兄妹', '恋人', '挚友', '好友', '兄弟', '姐妹', '兄妹', '姐弟', '母子', '父子', '母女', '父女', '师徒', '师生', '朋友', '仇人', '敌人', '对手', '主仆', '君臣', '同窗', '同学', '同事', '搭档', '盟友', '结拜', '亲戚', '亲属', '闺蜜', '祖孙', '养子', '夫妻'];
      const verb2type = {
        杀害: '敌对', 杀死: '敌对', 谋杀: '敌对', 暗杀: '敌对', 毒害: '敌对', 毒杀: '敌对', 刺杀: '敌对',
        背叛: '敌对', 欺骗: '敌对', 抛弃: '敌对', 出卖: '敌对', 诬陷: '敌对', 暗算: '敌对', 陷害: '敌对',
        绑架: '敌对', 囚禁: '敌对', 驱逐: '敌对', 袭击: '敌对', 举报: '敌对', 报仇: '敌对', 复仇: '敌对',
        救下: '救赎', 拯救: '救赎', 救活: '救赎', 救治: '救赎', 宽恕: '救赎', 治愈: '救赎', 解救: '救赎',
        爱上: '恋人', 爱着: '恋人', 暗恋: '恋人', 追求: '恋人', 爱慕: '恋人', 相爱: '恋人',
        迎娶: '夫妻', 娶了: '夫妻', 嫁给: '夫妻', 成婚: '夫妻', 结婚: '夫妻', 订婚: '夫妻',
        收养: '养子', 收留: '养子', 抚养: '养子', 收为: '养子', 认作: '养子',
        拜入: '师徒', 拜师: '师徒', 拜为: '师徒', 师从: '师徒', 教授: '师徒', 教导: '师徒', 收徒: '师徒',
        效忠: '主仆', 忠于: '主仆', 跟随: '主仆', 侍奉: '主仆', 辅佐: '主仆', 护卫: '主仆',
        协助: '联手', 相助: '联手', 合作: '联手', 结盟: '联手', 并肩: '联手', 支持: '联手', 营救: '联手',
        结识: '同窗', 初遇: '同窗', 邂逅: '同窗'
      };
      const verbs = Object.keys(verb2type).sort((a, b) => b.length - a.length);
      const cleanN = (s2) => stripMetaParens(cleanText(s2)).replace(/[“”"「」『』]/g, '').replace(/[（(][^）)]*[）)]\s*$/, '').trim();
      const checkName = (n2) => {
        n2 = cleanN(n2);
        if (!n2 || n2.length < 2 || n2.length > 10) return null;
        if (STOP_WORDS.test(n2) || GENERIC_NAME.test(n2)) return null;
        if (/^(你|我|他|她|它|这|那|其|彼|谁|某|一|两|三|各|每|本|该|此)/.test(n2) && n2.length <= 3) return null;
        return n2;
      };
      const getByName = (n2, strict) => {
        const c = cleanN(n2);
        if (knownNames.has(c)) return findOrCreate(c, {});
        // 简称匹配：首段相等或全名包含简称（最长段相等优先；多候选且长度接近视为歧义，放弃）
        let best = null, segHits = [];
        for (const k of knownNames) {
          const seg = k.split('·')[0];
          if (seg === c) segHits.push(k);
          else if (c.length >= 2 && k.includes(c)) segHits.push(k);
        }
        if (segHits.length === 1) return findOrCreate(segHits[0], {});
        if (segHits.length > 1) {
          segHits.sort((a, b) => a.length - b.length);
          if (segHits.length === 2 && segHits[0].length <= segHits[1].length - 3) return findOrCreate(segHits[0], {});
          return null; // 歧义（老/小加百利、格雷等），不猜测
        }
        if (strict) {
          // 前导状语剥离重试（「尽管莫琳与埃米特本是挚友」中的「尽管」）
          for (let cut = 1; cut <= Math.min(4, c.length - 2); cut++) {
            const sub = c.slice(cut);
            if (knownNames.has(sub)) return findOrCreate(sub, {});
          }
        }
        const ok = checkName(c);
        return ok ? findOrCreate(ok, {}) : null;
      };
      const addNarr = (xRaw, yRaw, type, strict) => {
        const a = getByName(xRaw, strict), b = getByName(yRaw, strict);
        if (!a || !b || a.id === b.id) return;
        const key = [a.id, b.id].sort().join('|') + '|' + type;
        if (list.some(r => r.sourceId !== r.targetId && [r.sourceId, r.targetId].sort().join('|') + '|' + r.relationType === key)) return;
        list.push({ sourceId: a.id, targetId: b.id, relationType: type, desc: cleanN(xRaw) + '与' + cleanN(yRaw), strength: 0, time: '' });
      };
      // 已有模板人物时严格匹配熟人名；纯叙述文档（无人物表）才启用启发式建人，降低误报
      const strict = knownNames.size > 0;
      const relRe = new RegExp('^([^\\s，,。；;！!？?：:]{1,16}?)(?:与|和|跟|同)([^\\s，,。；;！!？?：:]{1,16}?)(?:(?:本|曾|原|向|素|乃|确|恰|均|皆|亦|都|也|还|仍|本|就|只|刚|才|终|果)?是|为|皆为|互为|成了|成为|结为|结成|是一对)?(' + relWordList.join('|') + ')(?:关系|一对|两家)?(?:[。；;！!？?，,]|$)');
      const verbRe = new RegExp('^([^\\s，,。；;！!？?：:]{1,16}?)(?:' + verbs.map(v => v + '(?:了)?').join('|') + ')([^\\s，,。；;！!？?：:]{1,16}?)(?:[。；;！!？?，,]|$)');
      // 方位句：「A:…B之妻/之妹/之母…」（A 是 B 的 X）与「…P的恋人…」前置式
      const POS_WORD2TYPE = {
        之母: '亲子', 之父: '亲子', 之妻: '夫妻', 之夫: '夫妻', 之女: '亲子', 之子: '亲子',
        之妹: '姐妹', 之姐: '姐妹', 之弟: '兄弟', 之兄: '兄弟',
        之养女: '养子', 之养子: '养子', 之侄女: '亲属', 之侄: '亲属',
        之孙: '祖孙', 之孙女: '祖孙', 之曾祖: '祖孙', 之祖母: '祖孙', 之祖父: '祖孙',
        之继女: '养子', 之继子: '养子', 之曾孙: '祖孙'
      };
      const relReSub = new RegExp('(?:^|[，。；;：:])' + '([^\\s，,。；;！!？?：:]{1,16}?)(?:与|和|跟|同)([^\\s，,。；;！!？?：:]{1,16}?)(?:(?:本|曾|原|向|素|乃|确|恰|均|皆|亦|都|也|还|仍|本|就|只|刚|才|终|果)?是|为|皆为|互为|成了|成为|结为|结成|是一对)?(' + relWordList.join('|') + ')(?:关系|一对|两家)?(?=[，。；;！!？?、]|$)');
      const verbReSub = new RegExp('(?:^|[，。；;：:])' + '([^\\s，,。；;！!？?：:]{1,16}?)(?:' + verbs.map(v => v + '(?:了)?').join('|') + ')([^\\s，,。；;！!？?：:]{1,16}?)(?=[，。；;！!？?、]|$)');
      const posKe = Object.keys(POS_WORD2TYPE).sort((a, b) => b.length - a.length);
      const posRe = new RegExp('^([^\\s，,。；;！!？?：:]{1,24}?)[：:]([^\\s。；;！!？?：:]{0,30}?)(' + posKe.join('|') + ')(?:[，。；;！!？?、]|$)');
      const posLooseRe = new RegExp('([\\u4e00-\\u9fa5·]{2,16}?)(?:的)(恋人|挚友|闺蜜|未婚妻|未婚夫|妻子|丈夫|女儿|儿子|母亲|父亲|妹妹|姐姐|弟弟|哥哥|盟友|远亲|族亲|后裔)(?:[，。；;！!？?、]|$)');
      const POS_LOOSE2TYPE = { 恋人: '恋人', 挚友: '同窗', 闺蜜: '姐妹', 未婚妻: '夫妻', 未婚夫: '夫妻', 妻子: '夫妻', 丈夫: '夫妻', 女儿: '亲子', 儿子: '亲子', 母亲: '亲子', 父亲: '亲子', 妹妹: '姐妹', 姐姐: '姐妹', 弟弟: '兄弟', 哥哥: '兄弟', 盟友: '联手', 远亲: '亲属', 族亲: '亲属', 后裔: '亲属' };
      const PAS_S2TYPE = {
        教唆: '敌对', 杀害: '敌对', 绑架: '敌对', 欺骗: '敌对', 陷害: '敌对', 囚禁: '敌对',
        驱逐: '敌对', 抛弃: '敌对', 利用: '敌对', 操纵: '敌对', 附身: '依附', 夺舍: '依附',
        拯救: '救赎', 营救: '救赎', 收养: '养子', 抚养: '养子', 收留: '养子'
      };
      const pasRe = new RegExp('被([\\u4e00-\\u9fa5·A-Za-z]{2,12}?)(?:所)?(' + Object.keys(PAS_S2TYPE).sort((a, b) => b.length - a.length).map(v => v + '(?:了)?').join('|') + ')');
      const addDir = (fromRaw, toRaw, type, strict2) => {
        // fromRaw 是"之X"句中的 C（关系的所属人），toRaw 是句中主体人物
        const a = getByName(fromRaw, strict2), b = getByName(toRaw, strict2);
        if (!a || !b || a.id === b.id) return;
        const key = [a.id, b.id].sort().join('|') + '|' + type;
        if (list.some(r => r.sourceId !== r.targetId && [r.sourceId, r.targetId].sort().join('|') + '|' + r.relationType === key)) return;
        list.push({ sourceId: a.id, targetId: b.id, relationType: type, desc: fromRaw + (type === '夫妻' ? '的伴侣' : '的亲属'), strength: 0, time: '' });
      };
      let codeOn = false;
      for (const rawLine of lines) {
        let line = stripMd(rawLine).trim();
        if (/^```/.test(line)) { codeOn = !codeOn; continue; }
        if (codeOn || !line) continue;
        if (/^[#|>!]/.test(line)) continue;
        // 列表项（- **人物**: …）剥离前缀后参与句式分析，总览类文档人物段落大多如此
        line = line.replace(/^[-*·•]+[ \t]+/, '').replace(/^\d+[.、]\s*/, '');
        if (!line || line.length > 160) continue;
        // 整行锚定的句式仅用于短行（≤60）；方位/前置/被动为子串模式，长行也可命中
        const isLong = line.length > 60;
        let m = isLong ? null : relRe.exec(line);
        if (m) { addNarr(m[1], m[2], m[3], strict); continue; }
        const m2 = isLong ? null : verbRe.exec(line);
        if (m2) {
          const seg = line.slice(m2[1].length);
          const v = verbs.find(vv => seg.indexOf(vv) === 0);
          if (v) addNarr(m2[1], m2[2], verb2type[v], strict);
          continue;
        }
        // 子串叙述句（仅熟人模式）：「……A与B是恋人……」「……A杀死了B……」与「……少年时同窗……」
        if (strict) {
          const ms = relReSub.exec(line);
          if (ms) { addNarr(ms[1], ms[2], ms[3], strict); continue; }
          const ms2 = verbReSub.exec(line);
          if (ms2) {
            const seg = line.slice(ms2.index + ms2[1].length);
            const v = verbs.find(vv => seg.indexOf(vv) === 0);
            if (v) addNarr(ms2[1], ms2[2], verb2type[v], strict);
            continue;
          }
        }
        // 方位句：行首为人物 A，句中"B之X" → A 与 B 的关系
        let head = null;
        const ci = line.search(/[：:]/);
        if (ci > 0) { const hr = line.slice(0, ci).replace(/^[*s]+|[*s]+$/g, ''); if (/[一-龥]/.test(hr)) head = cleanN(hr); }
        const mp = posRe.exec(line);
        if (mp) {
          const type = POS_WORD2TYPE[mp[3]];
          const headName = cleanN(mp[1]);
          if (headName) {
            for (const nm of mp[2].split(/[、，,]/)) {
              const nn = cleanN(nm);
              if (nn) addDir(nn, headName, type, false);
            }
          }
          continue;
        }
        // 前置式：「P的恋人 / 盟友…」——行首人物 A 是 P 的 X，与 P 建立关系
        const ml2 = posLooseRe.exec(line);
        if (ml2 && head) {
          addDir(ml2[1], head, POS_LOOSE2TYPE[ml2[2]], false);
          continue;
        }
        // 被动式：被 P 教唆/绑架… → P 与行首人物的关系
        const mp2 = pasRe.exec(line);
        if (mp2 && !this) console.log(JSON.stringify({head, l: line.slice(0,42), m: mp2.slice(0,3)}));
        if (mp2) {
          if (head) addNarr(mp2[1], head, PAS_S2TYPE[mp2[2]] || '敌对', false);
        }
      }
    };
    narrExtract(deduped);

    if (skipped) {
      const detail = skippedLines.slice(0, 3).map(s2 => `第${s2.no}行"${s2.text}…"`).join('、');
      infos.push(`${fileName}：${skipped} 行叙述性内容未结构化（${detail}${skipped > 3 ? '等' : ''}）`);
    }
    infos.push(`${fileName}：解析出人物 ${persons.length}、关系 ${deduped.length}、时间线事件 ${events.length}`);

    return {
      persons,
      relations: deduped.filter(r => r && r.sourceId && r.targetId).map(r => this._objToRelation(r)),
      events: events.map(e => this._objToEvent(e)),
      errors,
      infos,
      fileName: fileName || 'Markdown 文档'
    };
  },

  _objToEvent(m) {
    return {
      id: m.id || '',
      title: String(m.title || '未命名事件').trim() || '未命名事件',
      time: String(m.time || '').trim(),
      order: Number(m.order) || 0,
      era: String(m.era || '').trim(),
      desc: String(m.desc || '').trim(),
      persons: Array.isArray(m.persons) ? m.persons : Utils.parseTags(m.persons || '')
    };
  },

  /* 将解析结果应用到画布（返回是否成功） */
  applyImport(parsed, mode) {
    GraphStore.pushUndo(mode === 'append' ? '追加导入数据' : '导入数据');
    if (mode !== 'append') GraphStore.clearContent();
    let np = 0, nr = 0, ne = 0;
    for (const p of parsed.persons) { if (GraphStore.addPerson(p, { silent: true })) np++; }
    for (const r of parsed.relations) { if (GraphStore.addRelation(r, { silent: true })) nr++; }
    for (const ev of (parsed.events || [])) {
      const e = GraphStore.normalizeEvent(ev);
      if (e.title && e.title !== '未命名事件') { GraphStore.addEvent(e, { silent: true }); ne++; }
    }
    GraphStore.dirty = true;
    GraphStore.log(`导入数据：新增人物 ${np} 个，关系 ${nr} 条${ne ? `，事件 ${ne} 条` : ''}（${parsed.fileName}）`);
    GraphStore.emitChange();
    return { persons: np, relations: nr, events: ne };
  },

  /* ============================================================
     导出
     ============================================================ */

  /* 渲染关系网到离屏画布
     倍率策略：优先满足用户倍率，仅当超出「面积预算(90MP) → 单边 16384」时等比降档（保持纵横比），
     避免超大 canvas 内存溢出；scaled=true 表示实际倍率低于用户选择，用于导出提示 */
  renderToCanvas(scale, transparent, opts) {
    if (GraphStore.isEmpty()) { return { error: this.MSG.EMPTY_EXPORT }; }
    const bbox = Renderer.bboxOfVisible();
    if (!bbox) return { error: this.MSG.EMPTY_EXPORT };
    const pad = 40;
    const rawW = bbox.w + pad * 2, rawH = bbox.h + pad * 2;
    let s = scale || 1;
    if (rawW * s * rawH * s > 90e6) s *= Math.sqrt(90e6 / (rawW * rawH * s * s));
    const maxSide = Math.max(rawW, rawH) * s;
    if (maxSide > 16384) s *= 16384 / maxSide;
    const w = Math.ceil(rawW * s), h = Math.ceil(rawH * s);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    // 让 bbox 左上角对齐 (pad,pad)
    const view = { x: pad * s - bbox.x * s, y: pad * s - bbox.y * s, scale: s };
    Renderer.drawScene(ctx, view, w, h, { transparent, noCull: true, forExport: true, noAvatar: !!(opts && opts.noAvatar) });
    return { canvas: cv, w, h, scale: s, scaled: s < (scale || 1) - 1e-9 };
  },

  /* 导出 PNG/JPG：用 toBlob 生成 Blob 后走对象 URL 下载，避免超大 base64 字符串占用内存 */
  async exportImage(fmt, scale) {
    let res;
    try { res = this.renderToCanvas(scale, fmt === 'png-transparent'); }
    catch (e) { return { error: '导出失败：头像图片跨域受限，请尝试导出其他格式或更换头像来源' }; }
    if (res.error) return res;
    const mime = fmt === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = fmt === 'jpg' ? 'jpg' : 'png';
    const toBlob = (cv) => new Promise((resolve, reject) => {
      try { cv.toBlob(b => b ? resolve(b) : reject(new Error('toBlob 返回空')), mime, 0.95); }
      catch (e) { reject(e); }
    });
    let blob;
    try { blob = await toBlob(res.canvas); }
    catch (e) {
      // 画布被跨域头像污染：去头像重绘（污染画布调用 toBlob 会抛 SecurityError）
      const res2 = this.renderToCanvas(scale, fmt === 'png-transparent', { noAvatar: true });
      if (res2.error) return res2;
      blob = await toBlob(res2.canvas);
      Utils.emitter.emit('toast', { type: 'warn', text: '部分外链头像因跨域限制未能包含在导出图中' });
    }
    if (!blob) return { error: this.MSG.SAVE_FAIL };
    Utils.download(`${GraphStore.projectName}-人物关系网.${ext}`, blob);
    GraphStore.log(`导出图片：${ext.toUpperCase()}（${res.w}×${res.h}）`);
    if (res.scaled) {
      Utils.emitter.emit('toast', { type: 'info', text: `图幅较大，已按实际 ${res.scale.toFixed(2)}× 导出（原选 ${scale}×）` });
    }
    return { ok: true, w: res.w, h: res.h };
  },

  /* ---------- SVG 矢量导出（无限缩放；渲染逻辑与画布一致，含平行边/箭头/标签）
     opts.labels：是否包含关系标签（默认 false——避免标签墙拥挤，影响信息密度） ---------- */
  exportDataSVG(opts) {
    const doc = this._svgDocument(opts);
    if (!doc) return { error: this.MSG.EMPTY_EXPORT };
    Utils.download(`${GraphStore.projectName}-人物关系网.svg`, new Blob([doc.svg], { type: 'image/svg+xml;charset=utf-8' }), 'image/svg+xml');
    GraphStore.log(`导出 SVG 矢量图（${doc.edges} 边 / ${doc.persons} 节点${doc.labels ? ' · 含关系标签' : ''}）`);
    return { ok: true, w: doc.w, h: doc.h };
  },

  /* SVG 文档生成（纯逻辑，供导出与测试复用） */
  _svgDocument(opts) {
    if (GraphStore.isEmpty()) return null;
    const bbox = Renderer.bboxOfVisible();
    if (!bbox) return null;
    const withLabels = !!(opts && opts.labels);
    const pad = 40;
    const x0 = bbox.x - pad, y0 = bbox.y - pad;
    const w = bbox.w + pad * 2, h = bbox.h + pad * 2;
    const th = Renderer.theme;
    const esc = Utils.escapeHtml;
    const layout = Renderer.layoutOf(Renderer._themeId || 'light');
    const f = (v) => (+v).toFixed(2);
    const parts = [];

    if (Renderer._parallelDirty) Renderer._buildParallel();
    const visEdges = [];
    const vis = GraphStore.persons.filter(p => GraphStore.isPersonVisible(p));
    for (const r of GraphStore.relations) {
      if (!GraphStore.isEdgeVisible(r)) continue;
      const s = GraphStore.getPerson(r.sourceId), t = GraphStore.getPerson(r.targetId);
      if (!s || !t) continue;
      visEdges.push({ r, s, t });
    }

    // ---- 导出坐标快照 + 标签重叠松弛 ----
    // 密集布局（如分簇 52px 间距）下标签互相压盖：在导出快照中把碰撞节点沿连线局部撑开，
    // 不回写画布数据，保证 SVG 信息可读（n ≤ 800 时启用，避免 O(n²) 超时）
    const nodeFs = Renderer.options.labelSize;
    const textW = (s) => {
      let wpx = 0, fs2 = nodeFs;
      for (const ch of String(s)) wpx += /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? fs2 : fs2 * 0.58;
      return Math.max(fs2, wpx);
    };
    const coords = new Map(vis.map(p => [p.id, { x: p.x, y: p.y }]));
    const rects = vis.map(p => ({ r: Renderer.nodeRadius(p), tw: textW(p.name || '未命名') }));
    const labelRect = (i) => {
      const c = coords.get(vis[i].id), q = rects[i];
      return { x: c.x - q.tw / 2, y: c.y + q.r + 3, w: q.tw, h: nodeFs * 1.5 };
    };
    const rectNodeCircle = (rc, j) => {
      const cj = coords.get(vis[j].id), rj = rects[j];
      const cx = Math.max(rc.x, Math.min(cj.x, rc.x + rc.w));
      const cy = Math.max(rc.y, Math.min(cj.y, rc.y + rc.h));
      return Math.hypot(cj.x - cx, cj.y - cy) < rj.r + 2;
    };
    const rectsInter = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    if (vis.length > 1 && vis.length <= 800) {
      const STEP = 2.5;
      for (let iter = 0; iter < 40; iter++) {
        let any = false;
        for (let i = 0; i < vis.length; i++) {
          const ci = coords.get(vis[i].id), ri = labelRect(i);
          for (let j = i + 1; j < vis.length; j++) {
            const cj = coords.get(vis[j].id);
            const rj = labelRect(j);
            if (Math.abs(ci.x - cj.x) > (ri.w + rj.w) / 2 + 12) continue;
            if (rectsInter(ri, rj) || rectNodeCircle(ri, j) || rectNodeCircle(rj, i)) {
              const dx = cj.x - ci.x, dy = cj.y - ci.y;
              const d = Math.hypot(dx, dy) || 0.01;
              const ux = dx / d, uy = dy / d;
              ci.x -= ux * STEP; ci.y -= uy * STEP;
              cj.x += ux * STEP; cj.y += uy * STEP;
              any = true;
            }
          }
        }
        if (!any) break;
      }
    }

    // 关系边：与画布一致的平行偏移 / 宽度公式 / 虚线（坐标取导出快照）
    for (const { r, s, t } of visEdges) {
      const cs = coords.get(s.id), ct = coords.get(t.id);
      if (!cs || !ct) continue;
      const meta = Renderer._parallel.get(r.id) || { index: 0, count: 1, selfLoop: false };
      const st = r.style || {};
      const color = st.color || Utils.colorForType(r.relationType);
      const width = (st.width > 0 ? st.width : (0.9 + (r.strength || 0) * 0.15)) * Renderer.options.edgeWidthMul;
      const rr = Renderer.nodeRadius(s);
      let d;
      if (meta.selfLoop) {
        const ang = -Math.PI / 4;
        const cx = cs.x + Math.cos(ang) * rr * 1.9, cy = cs.y + Math.sin(ang) * rr * 1.9;
        const rad = Math.max(6, rr * 0.9);
        d = `M ${f(cx + rad)} ${f(cy)} A ${f(rad)} ${f(rad)} 0 1 1 ${f(cx - rad)} ${f(cy)} A ${f(rad)} ${f(rad)} 0 1 1 ${f(cx + rad)} ${f(cy)}`;
      } else {
        const dx = ct.x - cs.x, dy = ct.y - cs.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = (meta.count === 1)
          ? (layout.edge === 'straight' ? 0 : Renderer.options.curvature)
          : ((meta.index - (meta.count - 1) / 2) * 0.34);
        const mx = (cs.x + ct.x) / 2 - dy / dist * off * dist;
        const my = (cs.y + ct.y) / 2 + dx / dist * off * dist;
        d = `M ${f(cs.x)} ${f(cs.y)} Q ${f(mx)} ${f(my)} ${f(ct.x)} ${f(ct.y)}`;
      }
      parts.push(`<path d="${d}" fill="none" stroke="${esc(color)}" stroke-width="${f(width)}" stroke-dasharray="7 5" stroke-linecap="round"/>`);
      // 箭头（终点切线方向）
      if (st.arrow || Renderer.options.showArrow) {
        let ang;
        if (meta.selfLoop) {
          const cx = cs.x + Math.cos(-Math.PI / 4) * rr * 1.9, cy = cs.y + Math.sin(-Math.PI / 4) * rr * 1.9;
          ang = Math.atan2(cs.y - cy, cs.x - cx);
        } else {
          const dx = ct.x - cs.x, dy = ct.y - cs.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const off = (meta.count === 1)
            ? (layout.edge === 'straight' ? 0 : Renderer.options.curvature)
            : ((meta.index - (meta.count - 1) / 2) * 0.34);
          const mx = (cs.x + ct.x) / 2 - dy / dist * off * dist;
          const my = (cs.y + ct.y) / 2 + dx / dist * off * dist;
          ang = Math.atan2(ct.y - my, ct.x - mx);
        }
        const tr = Renderer.nodeRadius(t);
        const ax = ct.x - Math.cos(ang) * (tr + 2), ay = ct.y - Math.sin(ang) * (tr + 2);
        const as = Math.max(7, width * 3);
        parts.push(`<polygon points="${f(ax)},${f(ay)} ${f(ax - Math.cos(ang - 0.42) * as)},${f(ay - Math.sin(ang - 0.42) * as)} ${f(ax - Math.cos(ang + 0.42) * as)},${f(ay - Math.sin(ang + 0.42) * as)}" fill="${esc(color)}"/>`);
      }
    }

    // 边标签（默认关闭：标签墙会严重挤压信息；导出中心可勾选开启，且边数 ≤ 400）
    if (withLabels && visEdges.length <= 400) {
      const fs = Renderer.options.labelSize * 0.85;
      for (const { r, s, t } of visEdges) {
        const cs = coords.get(s.id), ct = coords.get(t.id);
        if (!cs || !ct) continue;
        const meta = Renderer._parallel.get(r.id) || { index: 0, count: 1, selfLoop: false };
        const st = r.style || {};
        const color = st.color || Utils.colorForType(r.relationType);
        let px, py;
        if (meta.selfLoop) {
          px = cs.x + 40; py = cs.y - 40;
        } else {
          const dx = ct.x - cs.x, dy = ct.y - cs.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const off = (meta.count === 1) ? Renderer.options.curvature : ((meta.index - (meta.count - 1) / 2) * 0.34);
          const mx = (cs.x + ct.x) / 2 - dy / dist * off * dist;
          const my = (cs.y + ct.y) / 2 + dx / dist * off * dist;
          px = (cs.x + 2 * mx + ct.x) / 4; py = (cs.y + 2 * my + ct.y) / 4;
        }
        const text = esc(r.relationType);
        const tw = (r.relationType || '').length * fs * 1.05 + 8;
        parts.push(`<rect x="${f(px - tw / 2)}" y="${f(py - fs * 0.75)}" width="${f(tw)}" height="${f(fs * 1.5)}" rx="4" fill="${esc(th.edgeTextBg)}"/>`);
        parts.push(`<text x="${f(px)}" y="${f(py + fs * 0.35)}" font-size="${f(fs)}" fill="${esc(st.color ? color : th.edgeText)}" text-anchor="middle">${text}</text>`);
      }
    }

    // 人物节点：形状 + 名称（矢量文字永远清晰；松弛后固定下方锚点，不再互相压盖）
    const fs = nodeFs;
    for (const p of vis) {
      const c = coords.get(p.id);
      const st = p.style || {};
      const r = Renderer.nodeRadius(p);
      const border = st.border || (Renderer.options.colorByGroup && p.group ? Utils.colorForGroup(p.group) : th.nodeBorder);
      const fill = st.fill || th.nodeFill;
      const shape = st.shape || layout.shape;
      if (shape === 'rect') {
        const rw = r * 1.7, rh = r * 1.3;
        parts.push(`<rect x="${f(c.x - rw / 2)}" y="${f(c.y - rh / 2)}" width="${f(rw)}" height="${f(rh)}" rx="${f(Math.min(10, r * 0.4))}" fill="${esc(fill)}" stroke="${esc(border)}" stroke-width="${f(Math.max(1.5, r * 0.09))}"/>`);
      } else if (shape === 'hex') {
        const k = r * 1.15;
        const pts = Array.from({ length: 6 }, (_, i) => {
          const a = Math.PI / 3 * i + Math.PI / 6;
          return `${f(c.x + Math.cos(a) * k)},${f(c.y + Math.sin(a) * k)}`;
        }).join(' ');
        parts.push(`<polygon points="${pts}" fill="${esc(fill)}" stroke="${esc(border)}" stroke-width="${f(Math.max(1.5, r * 0.09))}" stroke-linejoin="round"/>`);
      } else if (shape === 'diamond') {
        const k = r * 1.3;
        parts.push(`<polygon points="${f(c.x)},${f(c.y - k)} ${f(c.x + k)},${f(c.y)} ${f(c.x)},${f(c.y + k)} ${f(c.x - k)},${f(c.y)}" fill="${esc(fill)}" stroke="${esc(border)}" stroke-width="${f(Math.max(1.5, r * 0.09))}" stroke-linejoin="round"/>`);
      } else {
        parts.push(`<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(r)}" fill="${esc(fill)}" stroke="${esc(border)}" stroke-width="${f(Math.max(1.5, r * 0.09))}"/>`);
      }
      const name = p.name || '未命名';
      // 圆内首字（与画布一致：无头像节点在中心绘制名字首字）
      const charFs = Math.max(11, r * 0.75);
      parts.push(`<text x="${f(c.x)}" y="${f(c.y + charFs * 0.35)}" font-size="${f(charFs)}" font-weight="600" fill="${esc(border)}" opacity="0.75" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif">${esc(name.charAt(0))}</text>`);
      const tx = c.x, ty = c.y + r + 3;
      parts.push(`<text x="${f(tx)}" y="${f(ty + fs * 0.9)}" font-size="${f(fs)}" fill="${esc(st.textColor || th.nodeText)}" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif">${esc(name)}</text>`);
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(y0)} ${f(w)} ${f(h)}" width="${Math.round(w)}" height="${Math.round(h)}" role="img" aria-label="${esc(GraphStore.projectName)}">` +
      `<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}" fill="${esc(th.bg)}"/>` +
      parts.join('') +
      `</svg>`;
    return { svg, w: Math.round(w), h: Math.round(h), edges: visEdges.length, persons: GraphStore.persons.length, labels: withLabels };
  },

  /* 极简 PDF 生成器：嵌入 JPEG（DCTDecode），无需第三方库 */
  buildPdfFromCanvas(canvas) {
    const jpegB64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    const jpeg = Utils.b64ToBytes(jpegB64);
    const wPx = canvas.width, hPx = canvas.height;
    const w = +(wPx * 0.75).toFixed(2), h = +(hPx * 0.75).toFixed(2);

    const chunks = [];
    let offset = 0;
    const offsets = [];
    const push = (data) => {
      let bytes;
      if (typeof data === 'string') {
        bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xff;
      } else bytes = data;
      chunks.push(bytes); offset += bytes.length;
    };
    const beginObj = (n) => { offsets[n] = offset; push(`${n} 0 obj\n`); };

    push('%PDF-1.4\n');
    beginObj(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    beginObj(2); push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    beginObj(3); push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im1 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n`);
    beginObj(4); push(`<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg); push('\nendstream\nendobj\n');
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im1 Do Q`;
    beginObj(5); push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    const xrefPos = offset;
    let xref = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    push(xref);

    return new Blob(chunks, { type: 'application/pdf' });
  },

  exportPDF(scale) {
    let res;
    try { res = this.renderToCanvas(scale, false); }
    catch (e) { return { error: '导出失败：头像图片跨域受限，请更换头像来源后重试' }; }
    if (res.error) return res;
    const blob = this.buildPdfFromCanvas(res.canvas);
    Utils.download(`${GraphStore.projectName}-人物关系网.pdf`, blob);
    GraphStore.log('导出 PDF 文件');
    return { ok: true };
  },

  _csvCell(v) {
    let s = String(v == null ? '' : v);
    // 防公式注入（CWE-1236）：仅对可能构成公式的形态加 ' 前缀 --
    // = @ 开头必防；+ - 开头仅在随后跟字母/数字（如 "-2+3"、"-CONCAT(...)"）时防，
    // 避免误伤"-"（行号占位）这类普通文本
    if (/^[=@\t\r]/.test(s) || /^[+\-][A-Za-z0-9(]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  },
  _csvFromAoa(aoa) {
    return '\uFEFF' + aoa.map(row => row.map(this._csvCell).join(',')).join('\r\n');
  },

  /* XLSX 列宽设置（模板 / 数据导出共用，避免 Excel 打开时列宽过窄） */
  _setColWidths(ws, widths) {
    ws['!cols'] = widths.map(wch => ({ wch }));
  },

  exportDataJSON() {
    const data = {
      app: 'rgxw-data', version: 2, exportedAt: new Date().toISOString(),
      persons: GraphStore.persons.map(p => ({
        '人物ID': p.id, '人物姓名': p.name, '英文名/别名': p.alias || '', '头像': p.avatar, '人物简介': p.intro,
        '人物标签': (p.tag || []).join('、'), '归属分组': p.group, '性别': p.gender, '年龄': p.age, '身份职位': p.position
      })),
      relations: GraphStore.relations.map(r => ({
        '起始人物ID': r.sourceId, '目标人物ID': r.targetId, '关系类型': r.relationType,
        '关系描述': r.desc, '关系强度': r.strength, '关系时间': r.time, '备注': r.note
      })),
      events: (GraphStore.events || []).map(e => ({
        '事件名称': e.title, '时间/年代': e.time, '排序序号': e.order, '时期/篇章': e.era,
        '事件说明': e.desc, '关联人物': (e.persons || []).join('、')
      }))
    };
    Utils.download(`${GraphStore.projectName}-源数据.json`, JSON.stringify(data, null, 2), 'application/json');
    GraphStore.log('导出源数据 JSON');
    return { ok: true };
  },

  _personsAoa() {
    const pAoa = [['人物ID', '人物姓名', '英文名/别名', '头像URL/本地路径', '人物简介', '人物标签', '性别', '年龄', '身份职位', '归属分组']];
    for (const p of GraphStore.persons) {
      pAoa.push([p.id, p.name, p.alias || '', p.avatar, p.intro, (p.tag || []).join('、'), p.gender, p.age, p.position, p.group]);
    }
    return pAoa;
  },
  _relationsAoa() {
    const rAoa = [['起始人物ID', '目标人物ID', '关系类型', '关系描述', '关系强度', '关系时间', '备注']];
    for (const r of GraphStore.relations) {
      rAoa.push([r.sourceId, r.targetId, r.relationType, r.desc, r.strength, r.time, r.note]);
    }
    return rAoa;
  },
  _eventsAoa() {
    const eAoa = [['事件名称', '时间/年代', '排序序号', '时期/篇章', '事件说明', '关联人物']];
    for (const e of (GraphStore.events || [])) {
      eAoa.push([e.title, e.time, e.order, e.era, e.desc, (e.persons || []).join('、')]);
    }
    return eAoa;
  },
  exportDataCSV() {
    if (GraphStore.isEmpty()) return { error: this.MSG.EMPTY_EXPORT };
    Utils.download('人物信息表.csv', this._csvFromAoa(this._personsAoa()), 'text/csv');
    setTimeout(() => Utils.download('关系信息表.csv', this._csvFromAoa(this._relationsAoa()), 'text/csv'), 350);
    if ((GraphStore.events || []).length) {
      setTimeout(() => Utils.download('时间线事件表.csv', this._csvFromAoa(this._eventsAoa()), 'text/csv'), 700);
    }
    GraphStore.log('导出源数据 CSV');
    return { ok: true };
  },
  exportDataXLSX() {
    if (GraphStore.isEmpty()) return { error: this.MSG.EMPTY_EXPORT };
    const wb = XLSX.utils.book_new();
    const pWs = XLSX.utils.aoa_to_sheet(this._personsAoa());
    this._setColWidths(pWs, [10, 12, 14, 18, 32, 16, 6, 6, 12, 12]);
    XLSX.utils.book_append_sheet(wb, pWs, '人物信息表');
    const rWs = XLSX.utils.aoa_to_sheet(this._relationsAoa());
    this._setColWidths(rWs, [12, 12, 10, 30, 8, 12, 16]);
    XLSX.utils.book_append_sheet(wb, rWs, '关系信息表');
    if ((GraphStore.events || []).length) {
      const eWs = XLSX.utils.aoa_to_sheet(this._eventsAoa());
      this._setColWidths(eWs, [18, 14, 8, 12, 32, 20]);
      XLSX.utils.book_append_sheet(wb, eWs, '时间线事件表');
    }
    try { XLSX.writeFile(wb, `${GraphStore.projectName}-源数据.xlsx`); }
    catch (e) { return { error: this.MSG.SAVE_FAIL }; }
    GraphStore.log('导出源数据 Excel');
    return { ok: true };
  },

  /* ---------- 标准导入模板下载（3.1.1，含时间线事件表） ---------- */
  downloadTemplate(kind) {
    const pHead = ['人物ID', '人物姓名', '英文名/别名', '头像URL/本地路径', '人物简介', '人物标签', '性别', '年龄', '身份职位', '归属分组'];
    const pRow1 = ['P001', '张三', 'John Smith', '', '示例人物简介', '主角、队长', '男', '28', '队长', '红队'];
    const pRow2 = ['P002', '李四', 'Lee', '', '示例人物简介', '成员', '女', '25', '分析员', '蓝队'];
    const rHead = ['起始人物ID', '目标人物ID', '关系类型', '关系描述', '关系强度', '关系时间', '备注'];
    const rRow1 = ['P001', 'P002', '同事', '示例关系描述', '8', '2024-01', '强度1-10'];
    const rRow2 = ['P002', 'P001', '好友', '示例关系描述', '6', '2023-06', ''];
    const eHead = ['事件名称', '时间/年代', '排序序号', '时期/篇章', '事件说明', '关联人物'];
    const eRow1 = ['家族迁入古堡', '当代', '1', '第一章', '布兰登一家搬入格雷古堡后怪事频发', '张三、李四'];
    const eRow2 = ['地牢仪式败露', '当代', '2', '第二章', '地牢中黑魔法仪式正在进行', '张三'];

    if (kind === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const pWs = XLSX.utils.aoa_to_sheet([pHead, pRow1, pRow2]);
      this._setColWidths(pWs, [10, 12, 14, 18, 32, 16, 6, 6, 12, 12]);
      const rWs = XLSX.utils.aoa_to_sheet([rHead, rRow1, rRow2]);
      this._setColWidths(rWs, [12, 12, 10, 30, 8, 12, 16]);
      const eWs = XLSX.utils.aoa_to_sheet([eHead, eRow1, eRow2]);
      this._setColWidths(eWs, [18, 14, 8, 12, 32, 20]);
      XLSX.utils.book_append_sheet(wb, pWs, '人物信息表');
      XLSX.utils.book_append_sheet(wb, rWs, '关系信息表');
      XLSX.utils.book_append_sheet(wb, eWs, '时间线事件表');
      XLSX.writeFile(wb, '人物关系网-标准导入模板.xlsx');
    } else if (kind === 'csv') {
      Utils.download('人物信息表.csv', this._csvFromAoa([pHead, pRow1, pRow2]), 'text/csv');
      setTimeout(() => Utils.download('关系信息表.csv', this._csvFromAoa([rHead, rRow1, rRow2]), 'text/csv'), 350);
      setTimeout(() => Utils.download('时间线事件表.csv', this._csvFromAoa([eHead, eRow1, eRow2]), 'text/csv'), 700);
    } else if (kind === 'md') {
      // 优先使用仓库内的 sample/Markdown剧情模板.md（可随仓库分发、可直接修改），失败回退内置字符串
      fetch('sample/Markdown剧情模板.md')
        .then(r => (r.ok ? r.text() : Promise.reject(new Error('not ok'))))
        .then(txt => Utils.download('人物关系网-Markdown剧情模板.md', txt, 'text/markdown'))
        .catch(() => Utils.download('人物关系网-Markdown剧情模板.md', this.MD_TEMPLATE, 'text/markdown'));
    } else {
      const tpl = {
        persons: [{ '人物ID': 'P001', '人物姓名': '张三', '英文名/别名': 'John Smith', '头像URL/本地路径': '', '人物简介': '示例人物简介', '人物标签': '主角、队长', '性别': '男', '年龄': '28', '身份职位': '队长', '归属分组': '红队' },
                  { '人物ID': 'P002', '人物姓名': '李四', '英文名/别名': 'Lee', '头像URL/本地路径': '', '人物简介': '示例人物简介', '人物标签': '成员', '性别': '女', '年龄': '25', '身份职位': '分析员', '归属分组': '蓝队' }],
        relations: [{ '起始人物ID': 'P001', '目标人物ID': 'P002', '关系类型': '同事', '关系描述': '示例关系描述', '关系强度': 8, '关系时间': '2024-01', '备注': '强度1-10' }],
        events: [{ '事件名称': '家族迁入古堡', '时间/年代': '当代', '排序序号': 1, '时期/篇章': '第一章', '事件说明': '布兰登一家搬入古堡', '关联人物': '张三、李四' }]
      };
      Utils.download('人物关系网-标准导入模板.json', JSON.stringify(tpl, null, 2), 'application/json');
    }
    return { ok: true };
  },

  /* ============================================================
     主题导入/导出（自定义主题 JSON，供用户间分享）
     ============================================================ */
  serializeThemes(ids) {
    const list = ids && ids.length ? ids.map(id => Renderer.THEMES[id]).filter(Boolean)
      : Object.values(Renderer.THEMES);
    return JSON.stringify({ app: 'rgxw-theme', version: 1, themes: list }, null, 2);
  },

  parseThemeFile(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { error: 'JSON 解析失败，请确认文件内容完整' }; }
    const list = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.themes) ? obj.themes : null);
    if (!list) return { error: '未找到 themes 数组（应为 rgxw-theme 导出文件）' };
    const HEX = /^#[0-9a-fA-F]{3,8}$/;
    const ok = [], bad = [];
    for (const t of list) {
      const e = this.validateTheme(t);
      if (e) bad.push(`${t && t.name ? t.name : '?'}：${e}`);
      else ok.push(t);
    }
    return { ok, bad };
  },

  validateTheme(t) {
    const HEX = /^#[0-9a-fA-F]{3,8}$/;
    if (!t || typeof t !== 'object') return '主题为空';
    const id = String(t.id || '');
    if (!/^[a-z0-9]{1,24}$/.test(id)) return 'ID 需为 1-24 位小写字母/数字（如 mytheme01）';
    const name = String(t.name || '').trim();
    if (!name || name.length > 30) return '名称需为 1-30 字符';
    for (const k of ['bg', 'nodeFill', 'nodeBorder', 'nodeText', 'subText', 'edge', 'edgeText', 'primary', 'search']) {
      if (!HEX.test(String(t[k] || ''))) return `字段 ${k} 需为 #RRGGBB 颜色`;
    }
    return null;
  },

  /* ============================================================
     工程文件（.rgxw / .rgxw.json，支持自定义密码加密）
     ============================================================ */
  buildProjectData() {
    return {
      app: 'rgxw', version: 2, name: GraphStore.projectName,
      savedAt: new Date().toISOString(),
      theme: App.currentTheme,
      options: Utils.deepClone(Renderer.options),
      view: Utils.deepClone(Renderer.view),
      persons: JSON.parse(JSON.stringify(GraphStore.persons)),
      relations: JSON.parse(JSON.stringify(GraphStore.relations)),
      events: JSON.parse(JSON.stringify(GraphStore.events || [])),
      log: GraphStore.logEntries.slice(0, 100)
    };
  },

  async encryptProject(obj, password) {
    if (!window.crypto || !crypto.subtle) throw new Error('当前浏览器不支持加密，请改用不带密码保存');
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, keyMat,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return {
      app: 'rgxw-encrypted', v: 1, hint: '该工程文件已加密，打开需输入密码',
      salt: Utils.bytesToB64(salt), iv: Utils.bytesToB64(iv), data: Utils.bytesToB64(new Uint8Array(ct))
    };
  },

  async decryptProject(obj, password) {
    const enc = new TextEncoder(), dec = new TextDecoder();
    const salt = Utils.b64ToBytes(obj.salt), iv = Utils.b64ToBytes(obj.iv);
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, keyMat,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, Utils.b64ToBytes(obj.data));
    return JSON.parse(dec.decode(plain));
  },

  /* 读取工程文件（自动识别加密），password 可选 */
  async readProjectFile(file, password) {
    let text;
    try { text = await file.text(); } catch (e) { throw new Error(this.MSG.PROJECT_BROKEN); }
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error(this.MSG.PROJECT_BROKEN); }
    if (obj && obj.app === 'rgxw-encrypted') {
      if (!password) { const err = new Error('NEED_PASSWORD'); err.needPassword = true; err.encryptedObj = obj; throw err; }
      try { obj = await this.decryptProject(obj, password); }
      catch (e) { const err = new Error('WRONG_PASSWORD'); err.wrongPassword = true; throw err; }
    }
    if (!obj || (obj.app !== 'rgxw' && obj.app !== 'rgxw-data')) throw new Error(this.MSG.PROJECT_BROKEN);
    return obj;
  },

  /* 将工程数据应用到画布 */
  applyProject(obj) {
    GraphStore.pushUndo('打开工程');
    GraphStore.clearContent();
    GraphStore.projectName = obj.name || '未命名工程';
    const persons = (obj.persons || obj['人物'] || []).map(p => GraphStore.normalizePerson(p));
    const relations = (obj.relations || obj['关系'] || []).map(r => GraphStore.normalizeRelation(r));
    const events = (obj.events || obj['事件'] || []).map(e => GraphStore.normalizeEvent(e));
    GraphStore.persons = persons;
    GraphStore.relations = relations;
    GraphStore.events = events;
    GraphStore.reindex();
    // 字段白名单 + 数值校验：防工程文件中的非法值（含 __proto__ 键）污染全局配置
    if (obj.options && typeof obj.options === 'object' && !Array.isArray(obj.options)) {
      const o = obj.options, d = Renderer.options;
      const num = (v, def, min, max) => { const n = Number(v); return Number.isFinite(n) ? Utils.clamp(n, min, max) : def; };
      Renderer.options = {
        nodeSize: num(o.nodeSize, d.nodeSize, 14, 60),
        labelSize: num(o.labelSize, d.labelSize, 10, 20),
        curvature: num(o.curvature, d.curvature, 0, 0.5),
        showArrow: !!o.showArrow,
        showEdgeLabels: !!o.showEdgeLabels,
        edgeWidthMul: num(o.edgeWidthMul, d.edgeWidthMul, 0.5, 3),
        colorByGroup: o.colorByGroup !== false
      };
    }
    if (obj.view && Number.isFinite(Number(obj.view.scale)) && Number(obj.view.scale) > 0) {
      const vx = Number(obj.view.x), vy = Number(obj.view.y), vs = Number(obj.view.scale);
      Renderer.view = {
        x: Number.isFinite(vx) ? vx : Renderer.view.x,
        y: Number.isFinite(vy) ? vy : Renderer.view.y,
        scale: Utils.clamp(vs, Renderer.FIT_MIN, Renderer.MAX_ZOOM)
      };
    }
    GraphStore.logEntries = Array.isArray(obj.log) ? obj.log : [];
    GraphStore.dirty = false;
    GraphStore.log(`打开工程：${GraphStore.projectName}`);
    GraphStore.emitChange();
    return { theme: obj.theme || 'light' };
  }
};
