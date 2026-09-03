'use strict';
/* ================= AI 智能提取（LLM，OpenAI 兼容 API） =================
   任意小说/剧本文本 → LLM 结构化抽取（人物/关系/时间线事件）→ 复用导入管线应用。
   服务地址与密钥由用户在设置中配置，仅存本机；
   注意：此功能会把文本发送到用户配置的第三方 AI 服务（数据出网）。
------------------------------------------------ */
const LlmExtract = {

  DEFAULT: {
    llmBase: 'https://api.deepseek.com/v1',
    llmModel: 'deepseek-chat',
    llmKey: ''
  },

  settings() {
    const s = ProjectStore.loadSettings();
    return Object.assign({}, this.DEFAULT, {
      llmBase: s.llmBase || this.DEFAULT.llmBase,
      llmModel: s.llmModel || this.DEFAULT.llmModel,
      llmKey: s.llmKey || ''
    });
  },

  saveSettings(patch) {
    ProjectStore.saveSettings(patch);
  },

  configured() {
    const s = this.settings();
    return !!s.llmBase && !!s.llmKey && !!s.llmModel;
  },

  /* 系统提示：给出严格 JSON 输出 schema 与抽取规则 */
  _buildSystemPrompt() {
    return `你是中文人物关系抽取助手。从用户提供的叙事文本中抽取人物、人物关系与剧情事件，仅输出一个 JSON 对象，禁止输出任何解释或 Markdown 代码块标记。
JSON 结构：
{
  "persons": [{"id": "P1", "name": "人物名", "alias": "别名或英文名(可空)", "group": "所属阵营/家族(可空)", "intro": "一句话简介(可空)", "gender": "男|女|(可空)"}],
  "relations": [{"sourceId": "P1", "targetId": "P2", "relationType": "关系类型", "desc": "关系描述(可空)", "strength": 7}],
  "events": [{"title": "事件名", "time": "时代/年份(可空)", "description": "事件说明(可空)", "persons": ["P1","P2"]}]
}
规则：
1. 人物 id 统一用 P1、P2… 递增编号；同名人物必须合并为同一 id。
2. 关系只使用 sourceId/targetId 引用人物 id，且必须指向 persons 中存在的 id；关系类型从以下中选择：夫妻、父子、母女、兄弟、姐妹、亲子、恋人、朋友、敌人、好友、对手、同事、师徒、君臣、主仆、盟友、亲属、祖孙、宿敌、战友、亲戚、领导、下属、同窗、雇佣、顾客、陌生人（无关系不输出）。
3. strength 为 1-10 整数：至亲=9、手足=8、恋人/师徒=7、朋友/盟友=6、同事/认识=4-5；按文本语义推断。
4. 事件按时间顺序输出重要剧情节点（最多 15 个），persons 引用人物 id；无法确定的可不输出事件。
5. 只抽取文本中真实出现的人物与关系，不要臆测；没有内容时输出 {"persons": [], "relations": [], "events": []}`;
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
    const s = this.settings();
    if (!String(text || '').trim()) throw new Error('请输入需要解析的文本');
    if (!s.llmKey) throw new Error('尚未配置 AI 服务密钥，请先在「系统设置 → AI 服务」中填写');
    if (!s.llmBase || !s.llmModel) throw new Error('AI 服务地址或模型未配置，请检查设置');

    if (onProgress) onProgress(0.1, '正在请求 AI 服务…');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    let resp;
    try {
      resp = await fetch(s.llmBase.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + s.llmKey
        },
        body: JSON.stringify({
          model: s.llmModel,
          temperature: 0.2,
          max_tokens: 8192,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: this._buildSystemPrompt() },
            { role: 'user', content: this._buildUserPrompt(text) }
          ]
        }),
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
      throw new Error(`AI 服务返回错误（HTTP ${resp.status}）${detail ? '：' + detail : '。请检查密钥/模型名是否正确'}`);
    }
    if (onProgress) onProgress(0.6, '正在解析 AI 返回结果…');
    const data = await resp.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    const parsed = this.parseModelReply(content);
    if (!parsed) {
      const head = String(content || '').replace(/\s+/g, ' ').slice(0, 80);
      throw new Error(`AI 返回内容无法解析为 JSON，请重试。（返回开头：「${head}…」；若反复失败请换模型或缩短文本）`);
    }
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
