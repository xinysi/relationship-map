'use strict';
/* ================= AI 智能提取（LLM，OpenAI 兼容 API） =================
   任意小说/剧本文本 → LLM 结构化抽取（人物/关系/时间线事件）→ 复用导入管线应用。
   服务地址与密钥由用户在设置中配置，仅存本机；
   API 密钥使用 Web Crypto（AES-GCM 256 + PBKDF2 派生）加密后写入 localStorage，
   明文不落盘，同一明文仅存在于本次会话内存；
   注意：此功能会把文本发送到用户配置的第三方 AI 服务（数据出网）。
------------------------------------------------ */
const LlmExtract = {

  /* 常用服务预设：选择后自动填入服务地址与模型名（可再修改） */
  PRESETS: [
    { id: 'deepseek', name: 'DeepSeek（深寻）', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { id: 'openai', name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { id: 'zhipu', name: '智谱 GLM（大模型开放平台）', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { id: 'qwen', name: '通义千问（阿里云百炼）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { id: 'kimi', name: 'Kimi（月之暗面）', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' }
  ],
  presetById(id) {
    return this.PRESETS.find(p => p.id === id) || null;
  },
  DEFAULT: {
    llmBase: 'https://api.deepseek.com/v1',
    llmModel: 'deepseek-chat',
    llmKey: ''
  },

  /* ============ API 密钥加密存储 ============
     密钥不落盘：写入 localStorage 前用 Web Crypto 加密（AES-GCM 256，
     密钥由固定应用盐 + 每次保存随机盐经 PBKDF2(12万次) 派生；输出
     v1.<salt>.<iv>.<密文，均为 base64>）。
     加载时解密到内存 _memKey，刷新后重新解密；
     旧版本存下的明文 llmKey 首次加载时自动加密迁移并清空明文。
     说明：这是浏览器本地混淆级保护（密钥仍在本机），请勿在公共电脑保存。 */

  _memKey: '',
  _keyLoaded: false,

  _b64(buf) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  },
  _unb64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
  _cryptoOk() {
    return !!(globalThis.crypto && globalThis.crypto.subtle);
  },

  /* 固定应用盐 + 随机盐 → AES-GCM 密钥（随机盐随密文一起存，每次保存不同）
     注意：接口用于加密/解密同一密钥值，派生参数变化会导致旧密文失效 */
  async _deriveKey(salt) {
    if (!this._cryptoOk()) return null;
    const material = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode('rwgxw-llm-key-v1'), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  async _encryptKey(plain) {
    if (!plain || !this._cryptoOk()) return '';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this._deriveKey(salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
    return 'v1.' + this._b64(salt) + '.' + this._b64(iv) + '.' + this._b64(ct);
  },

  async _decryptKey(enc) {
    if (!enc || !this._cryptoOk()) return '';
    const parts = String(enc).split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') return '';
    try {
      const key = await this._deriveKey(this._unb64(parts[1]));
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this._unb64(parts[2]) }, key, this._unb64(parts[3])
      );
      return new TextDecoder().decode(pt);
    } catch (e) {
      return '';
    }
  },

  /* 解密/迁移密钥到内存；应用启动时调用一次即可 */
  async _loadKey() {
    if (this._keyLoaded) return;
    this._keyLoaded = true;
    const s = ProjectStore.loadSettings();
    if (s.llmKeyEnc) {
      this._memKey = await this._decryptKey(s.llmKeyEnc);
    } else if (s.llmKey) {
      // 旧版明文密钥 → 自动加密迁移（saveSettings 内会写入 llmKeyEnc 并清空明文）
      this._memKey = s.llmKey;
      try { await this.saveSettings({ llmKey: s.llmKey }); }
      catch (e) { /* 迁移失败不阻塞使用 */ }
    }
  },

  settings() {
    const s = ProjectStore.loadSettings();
    return Object.assign({}, this.DEFAULT, {
      llmBase: s.llmBase || this.DEFAULT.llmBase,
      llmModel: s.llmModel || this.DEFAULT.llmModel,
      llmKey: this._memKey || (s.llmKey || '')
    });
  },

  /* patch.llmKey 语义：
     未传 → 不修改密钥；
     非空字符串 → 加密后写入 llmKeyEnc（明文不落盘）；
     空字符串 → 清除已存密钥。
     非安全上下文（无 Web Crypto，如 file:// 直接打开）时才退回明文存储并提示。 */
  async saveSettings(patch) {
    patch = Object.assign({}, patch);
    if (patch.llmKey !== undefined) {
      const plain = String(patch.llmKey || '').trim();
      this._memKey = plain;
      patch.llmKey = '';
      if (plain) {
        if (this._cryptoOk()) {
          patch.llmKeyEnc = await this._encryptKey(plain);
        } else {
          if (!this._warnedNoCrypto) {
            this._warnedNoCrypto = true;
            console.warn('[LlmExtract] 当前页面环境不支持 Web Crypto（需 https 或 http://localhost）：API 密钥无法加密，仅保存明文。');
          }
          patch.llmKey = plain;
          patch.llmKeyEnc = '';
        }
      } else {
        patch.llmKeyEnc = '';
      }
    }
    ProjectStore.saveSettings(patch);
  },

  configured() {
    const s = this.settings();
    return !!s.llmBase && !!s.llmKey && !!s.llmModel;
  },

  /* 系统提示：给出严格 JSON 输出 schema 与抽取规则（字段与标准导入模板/Markdown 模板一致） */
  _buildSystemPrompt() {
    return `你是中文人物关系抽取助手。从用户提供的叙事文本中抽取人物、人物关系与剧情事件，仅输出一个 JSON 对象，禁止输出任何解释或 Markdown 代码块标记。
JSON 结构（字段与「标准导入模板」一致）：
{
  "persons": [{"id": "P1", "name": "人物名", "alias": "别名或英文名(可空)", "group": "家族/阵营(可空)", "intro": "一句话简介(可空)", "tag": "标签如'主角、队长'(可空)", "gender": "男|女|(可空)", "age": "年龄/生卒(可空)", "position": "身份职位(可空)"}],
  "relations": [{"sourceId": "P1", "targetId": "P2", "relationType": "关系类型", "desc": "关系描述(可空)", "strength": 7}],
  "events": [{"title": "事件名", "time": "时间/年代(可空)", "order": 1, "era": "时期/篇章(可空)", "description": "事件说明(可空)", "persons": ["P1","P2"]}]
}
规则：
1. 人物 id 统一用 P1、P2… 递增编号；同名人物必须合并为同一 id。
2. 一体两面人物（如「灰衣女士（伊莱扎·霍桑）」「杜陌（小陌）」「安（杜还）」）合并为同一个 id：name 用正文常见名，另一写法填入 alias。
3. group 优先使用文本中的家族/阵营名（如：霍桑家族、卡尔弗特家族、守夜会、幽庭镇民、灵体、动物、当代线、白水渡、镜城、灯局、镜社）；无明确阵营时可空。
4. relationType 仅从以下类型中选择：夫妻、恋人、养子、养兄妹、龙凤胎、双胞胎、祖孙、父子、父女、母子、母女、兄妹、姐妹、兄弟、同窗、师徒、敌对、联手、救赎、君臣、主仆、亲属、创造、依附、对手、关联；把握不准用「关联」。
5. strength 为 1-10 整数：至亲=9、手足=8、恋人/师徒=7、朋友/盟友=6、同事/认识=4-5；按文本语义推断。
6. events 按时间顺序输出重要剧情节点（最多 15 个）：time 填年代，era 填时期/篇章（如「第一章」「1893」），order 按时间先后自小到大；persons 引用人物 id；无法确定的可不输出事件。
7. 只抽取文本中真实出现的人物与关系，不要臆测；没有内容时输出 {"persons": [], "relations": [], "events": []}`;
  },

  /* 单次 chat/completions 请求，返回 {content, finishReason}；
     opts.noFormat 时去掉 response_format（兼容不支持该参数的服务） */
  async _chat(s, text, opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const messages = [
      { role: 'system', content: this._buildSystemPrompt() },
      { role: 'user', content: this._buildUserPrompt(text) }
    ];
    if (opts && opts.noFormat) {
      messages[0].content += '\n特别要求：只输出 JSON 对象本身，不要输出推理过程、解释、Markdown 代码块或任何附加文字。';
    }
    const req = {
      model: s.llmModel,
      temperature: 0.2,
      max_tokens: 8192,
      messages
    };
    if (!(opts && opts.noFormat)) req.response_format = { type: 'json_object' };
    let resp;
    try {
      resp = await fetch(s.llmBase.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + s.llmKey
        },
        body: JSON.stringify(req),
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('AI 请求超时（120 秒），请重试或换更小段文本');
      throw new Error('无法连接 AI 服务：' + (e.message || '网络错误') + '。请检查服务地址是否支持浏览器直连（CORS）');
    }
    clearTimeout(timer);
    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 160); } catch (e) { /* ignore */ }
      const hint = resp.status === 401 || resp.status === 403
        ? 'API 密钥无效或无权限'
        : resp.status === 404
          ? '服务地址或模型名不存在（检查服务地址是否包含 /v1，模型名是否正确）'
          : resp.status === 429
            ? '请求超限（账号额度或频率限制）'
            : resp.status >= 500
              ? 'AI 服务端异常，请稍后重试'
              : '请求被拒绝';
      throw new Error(`AI 服务返回错误（HTTP ${resp.status}）：${hint}${detail ? '（响应：' + detail + '）' : ''}`);
    }
    const data = await resp.json();
    const msg = (data && data.choices && data.choices[0] && data.choices[0].message) || {};
    let content = '';
    if (Array.isArray(msg.content)) {
      // 多模态格式：content 可能为 [{type:'text',text:...}] 数组
      content = msg.content.map(x => (typeof x === 'string' ? x : (x && x.text != null ? x.text : ''))).join('');
    } else if (msg.content != null) {
      content = String(msg.content);
    }
    // 推理型模型（deepseek-reasoner 等）会把正文写在 reasoning_content，content 为空
    const reasoning = String(msg.reasoning_content || '').replace(/\s+/g, ' ').slice(0, 300);
    return { content, finishReason: (data.choices && data.choices[0] && data.choices[0].finish_reason) || '', reasoning };
  },

  /* 用户消息：截断超长文本 */
  _buildUserPrompt(text) {
    const MAX = 15000;
    let t = String(text || '').trim();
    let truncated = false;
    if (t.length > MAX) { t = t.slice(0, MAX); truncated = true; }
    return t + (truncated ? `\n\n（注：原文过长已截断，仅提取以上内容）` : '');
  },

  /* 调用 OpenAI 兼容 chat/completions，返回提取结果 {persons, relations, events, raw, truncated} */
  async extract(text, onProgress) {
    await this._loadKey();
    const s = this.settings();
    if (!String(text || '').trim()) throw new Error('请输入需要解析的文本');
    if (!s.llmKey) throw new Error('尚未配置 AI 服务密钥，请先在「系统设置 → AI 服务」中填写');
    if (!s.llmBase || !s.llmModel) throw new Error('AI 服务地址或模型未配置，请检查设置');

    if (onProgress) onProgress(0.1, '正在请求 AI 服务…');
    const first = await this._chat(s, text, {});
    let content = first.content;
    let parsed = this.parseModelReply(content);
    if (!parsed) {
      // 空返回/解析失败：自动重试一次（去掉 response_format 兼容性限制，并强调纯 JSON 输出）
      if (onProgress) onProgress(0.7, '结果不完整，正在重试…');
      const second = await this._chat(s, text, { noFormat: true });
      parsed = this.parseModelReply(second.content);
      if (parsed) content = second.content;
      if (!parsed) {
        const head = String(content || '').replace(/\s+/g, ' ').slice(0, 80);
        const diag = `诊断：首次返回 ${first.content.length} 字符（finish=${first.finishReason || '无'}），重试返回 ${second.content.length} 字符（finish=${second.finishReason || '无'}）`;
        let hint = '';
        if (first.reasoning || second.reasoning) {
          const rc = (first.reasoning || second.reasoning).slice(0, 200);
          hint = `该模型返回的是"推理内容"而非正文（疑似推理型模型，如 deepseek-reasoner），请在设置中改用 chat 类模型（deepseek-chat 等）或缩短文本；推理片段：「${rc}…」`;
        } else if ((first.finishReason || '') === 'length' || (second.finishReason || '') === 'length') {
          hint = '模型输出被截断（finish=length）：文本过长或超出单次输出上限，请分段提取（每段建议 3000~8000 字）。';
        } else if (second.content.length === 0 && first.content.length === 0) {
          hint = '模型两条路径都返回空正文：请确认模型支持 JSON 输出并已正确配置服务地址/密钥；若为本地模型请确认已加载。';
        }
        throw new Error(`AI 返回内容无法解析为 JSON，请重试。${diag}。返回开头：「${head || '（空）'}…」。${hint}` || `AI 返回内容无法解析为 JSON，请重试。${diag}。返回开头：「${head || '（空）'}…」。若反复失败请换模型（确认支持 JSON 输出）或缩短文本`);
      }
    }
    if (onProgress) onProgress(0.85, '解析完成');
    // 每次提取使用唯一 ID 前缀：防止多次"追加"导入时 ID 互相冲突（LLMP1 撞 LLMP1）
    const token = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '_';
    // 字段规范化（适配本应用模型）
    const persons = [];
    const idMap = new Map(); // LLM id → 应用 id
    for (const p of parsed.persons || []) {
      if (!p || !p.name) continue;
      const id = token + String(p.id || ('P' + (persons.length + 1))).replace(/[^A-Za-z0-9_]/g, '');
      idMap.set(String(p.id), id);
      persons.push({
        id,
        name: String(p.name),
        alias: p.alias || '',
        group: p.group || '',
        intro: p.intro || '',
        gender: p.gender || '',
        position: p.position || ''
      });
    }
    const relations = [];
    for (const r of parsed.relations || []) {
      const sId = idMap.get(String(r.sourceId)), tId = idMap.get(String(r.targetId));
      if (!sId || !tId || sId === tId) continue;
      relations.push({
        sourceId: sId, targetId: tId,
        relationType: String(r.relationType || '关联'),
        desc: r.desc || '',
        strength: Utils.clamp(Math.round(Number(r.strength) || 5), 1, 10),
        time: r.time || '', note: r.note || ''
      });
    }
    const events = [];
    for (const e of parsed.events || []) {
      if (!e || !e.title) continue;
      events.push({
        title: String(e.title), time: e.time || '', era: e.era || '',
        desc: e.description || e.desc || '',
        persons: (e.persons || []).map(x => idMap.get(String(x))).filter(Boolean)
      });
    }
    if (onProgress) onProgress(1, '完成');
    return { persons, relations, events, raw: parsed };
  },

  /* 容错解析模型回复：字符串感知括号配对扫描，逐个候选对象尝试。
     处理：```json 围栏、前后废话、字符串内含 {} 干扰、JSON 后附加收尾句。
     返回首个可解析的顶层对象；全部失败返回 null。 */
  parseModelReply(content) {
    let text = String(content || '').trim();
    if (!text) return null;
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    for (let start = 0; start < text.length; start++) {
      if (text[start] !== '{') continue;
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try {
              const obj = JSON.parse(text.slice(start, i + 1));
              // 契约：顶层对象必须含抽取 schema 键（persons/relations/events），
              // 拒绝截断时偶然闭合的内层碎片（如单个 person 对象）
              if (obj && typeof obj === 'object' && !Array.isArray(obj) &&
                  ('persons' in obj || 'relations' in obj || 'events' in obj)) return obj;
            } catch (e) { /* 该候选失败，继续下一候选 */ }
            break;
          }
        }
      }
    }
    return null;
  }
};
