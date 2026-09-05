'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.js');

const { LlmExtract, ProjectStore } = load();

test('parseModelReply：纯 JSON / 代码块包裹 / 前后废话均可解析', () => {
  const obj = { persons: [{ id: 'P1', name: '甲' }] };
  const pure = JSON.stringify(obj);
  // 沙箱 realm 对象与宿主跨原型，用 stringify 比较
  const same = (v) => JSON.stringify(v) === JSON.stringify(obj);
  assert.ok(same(LlmExtract.parseModelReply(pure)));
  const fenced = '```json\n' + pure + '\n```';
  assert.ok(same(LlmExtract.parseModelReply(fenced)));
  const noisy = '以下是抽取结果：\n' + pure + '\n希望对您有帮助！';
  assert.ok(same(LlmExtract.parseModelReply(noisy)));
  const markdownLang = '```JSON\n' + pure + '```';
  assert.ok(same(LlmExtract.parseModelReply(markdownLang)));
});

test('parseModelReply：非法输入返回 null', () => {
  assert.equal(LlmExtract.parseModelReply(''), null);
  assert.equal(LlmExtract.parseModelReply('抱歉，我无法回答。'), null);
  assert.equal(LlmExtract.parseModelReply('{broken json'), null);
});

test('parseModelReply：JSON 数组/非对象拒绝', () => {
  assert.equal(LlmExtract.parseModelReply('[1,2,3]'), null, '顶层数组不接受');
  assert.equal(LlmExtract.parseModelReply('"str"'), null);
});

test('parseModelReply：字符串内含大括号不干扰边界定位', () => {
  const content = '{ "desc": "他大喊：{ 冲啊！ } 然后结束。", "persons": [{"id":"P1","name":"甲"}] } 以上是全部结果。';
  const r = LlmExtract.parseModelReply(content);
  assert.ok(r && r.persons && r.persons[0].name === '甲');
});

test('parseModelReply：首个候选失败时尝试后续候选', () => {
  // 先输出叙述（含不完整对象）再输出真正 JSON：新算法逐个候选尝试
  const content = '模型先给了个半成品：{"persons": [{"id":"P1" 然后停止。\n最终结果：{"persons":[{"id":"P1","name":"甲"}]}';
  const r = LlmExtract.parseModelReply(content);
  assert.ok(r && r.persons && r.persons[0].name === '甲', '应跳过坏候选取到完整对象');
});

test('parseModelReply：截断（括号未闭合）返回 null', () => {
  assert.equal(LlmExtract.parseModelReply('{"persons": [{"id":"P1","name":"甲"}'), null);
});

test('extract 前的配置检查与空文本提示', async () => {
  await assert.rejects(LlmExtract.extract(''), /请输入需要解析的文本/);
  // 未配置密钥
  await LlmExtract.saveSettings({ llmKey: '' });
  await assert.rejects(LlmExtract.extract('一些文本'), /尚未配置 AI 服务密钥/);
});

test('extract：多次提取人物 ID 前缀唯一（追加不冲突）', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ persons: [{ id: 'P1', name: '甲' }], relations: [], events: [] }) } }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  await LlmExtract.saveSettings({ llmKey: 'sk-x', llmBase: 'https://api.deepseek.com/v1', llmModel: 'deepseek-chat' });
  const a = await LlmExtract.extract('甲…');
  const b = await LlmExtract.extract('甲…');
  globalThis.fetch = orig;
  assert.notEqual(a.persons[0].id, b.persons[0].id, '两次提取 ID 不得相同');
  assert.ok(/^L[0-9a-z]+_/.test(a.persons[0].id), 'ID 带唯一前缀');
});

test('extract：首次空返回自动重试成功 / 数组 content 兼容', async () => {
  const orig = globalThis.fetch;
  const goodContent = JSON.stringify({ persons: [{ id: 'P1', name: '甲' }], relations: [], events: [] });
  let call = 0;
  globalThis.fetch = async () => {
    call++;
    if (call === 1) return new Response(JSON.stringify({ choices: [{ message: { content: '', finish_reason: 'length' } }] }), { status: 200 });
    // 第二次数组格式 content
    return new Response(JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: goodContent }] } }] }), { status: 200 });
  };
  await LlmExtract.saveSettings({ llmKey: 'sk-x', llmBase: 'https://api.deepseek.com/v1', llmModel: 'deepseek-chat' });
  const res = await LlmExtract.extract('文本');
  globalThis.fetch = orig;
  assert.equal(call, 2, '空返回后自动重试一次');
  assert.equal(res.persons[0].name, '甲');
});

test('extract：两次都空返回时抛出诊断信息', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '', finish_reason: 'length' } }] }), { status: 200 });
  await LlmExtract.saveSettings({ llmKey: 'sk-x', llmBase: 'https://api.deepseek.com/v1', llmModel: 'deepseek-chat' });
  await assert.rejects(LlmExtract.extract('文本'), (e) => {
    assert.ok(e.message.includes('诊断'), '含诊断信息');
    assert.ok(e.message.includes('首次返回 0 字符'), '含首次长度');
    return true;
  });
  globalThis.fetch = orig;
});

test('extract：HTTP 404 返回分类提示并带服务端响应', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Model Not Exist' } }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  await LlmExtract.saveSettings({ llmKey: 'sk-x', llmBase: 'https://api.deepseek.com/v1', llmModel: 'bad-model' });
  await assert.rejects(LlmExtract.extract('文本'), (e) => {
    assert.ok(e.message.includes('HTTP 404'), '含状态码');
    assert.ok(e.message.includes('模型名不存在'), '含分类提示');
    assert.ok(e.message.includes('Model Not Exist'), '含服务端响应内容');
    return true;
  });
  globalThis.fetch = orig;
  // 恢复默认模型，避免污染后续 settings 测试
  await LlmExtract.saveSettings({ llmModel: 'deepseek-chat', llmBase: 'https://api.deepseek.com/v1' });
});

test('服务预设：常用服务齐全且可按 id 查找', () => {
  const ids = LlmExtract.PRESETS.map(p => p.id);
  assert.deepEqual(Array.from(ids), ['deepseek', 'openai', 'zhipu', 'qwen', 'kimi']);
  for (const p of LlmExtract.PRESETS) {
    assert.ok(p.name && p.base.startsWith('https://') && p.model, `${p.id} 字段完整`);
  }
  assert.equal(LlmExtract.presetById('deepseek').base, 'https://api.deepseek.com/v1');
  assert.equal(LlmExtract.presetById('nope'), null);
});

test('settings 默认值与合并', async () => {
  await LlmExtract.saveSettings({ llmKey: '' });
  const s = LlmExtract.settings();
  assert.equal(s.llmBase, 'https://api.deepseek.com/v1');
  assert.equal(s.llmModel, 'deepseek-chat');
  assert.equal(s.llmKey, '');
  assert.equal(LlmExtract.configured(), false);
  await LlmExtract.saveSettings({ llmKey: 'sk-test' });
  assert.equal(LlmExtract.configured(), true);
});

/* ---------- API 密钥加密存储 ---------- */
test('密钥保存：存储无明文，仅存 AES-GCM 密文，重载可还原', async () => {
  await LlmExtract.saveSettings({ llmKey: '' });
  await LlmExtract.saveSettings({ llmKey: 'sk-abcdef123456' });
  const s = ProjectStore.loadSettings();
  assert.equal(s.llmKey, '', '存储中无明文密钥');
  assert.ok(/^v1.[A-Za-z0-9+/=]+.[A-Za-z0-9+/=]+.[A-Za-z0-9+/=]+$/.test(s.llmKeyEnc), '密文格式 v1.salt.iv.data');
  assert.ok(!JSON.stringify(s).includes('sk-abcdef123456'), '存储内容不含明文');
  // 模拟刷新：清内存态后重新加载
  LlmExtract._memKey = '';
  LlmExtract._keyLoaded = false;
  await LlmExtract._loadKey();
  assert.equal(LlmExtract._memKey, 'sk-abcdef123456', '重新加载后解密还原');
});

test('密钥迁移：旧版明文 llmKey 首次加载自动加密并清空明文', async () => {
  // 直接写入旧版明文（绕过 LlmExtract.saveSettings，模拟仅存明文的旧状态）
  ProjectStore.saveSettings({ llmKey: 'sk-legacy-99', llmKeyEnc: '' });
  LlmExtract._memKey = '';
  LlmExtract._keyLoaded = false;
  await LlmExtract._loadKey();
  assert.equal(LlmExtract._memKey, 'sk-legacy-99', '迁移后内存密钥正确');
  const s = ProjectStore.loadSettings();
  assert.equal(s.llmKey, '', '明文已清除');
  assert.ok(s.llmKeyEnc && s.llmKeyEnc.startsWith('v1.'), '已写入密文');
  assert.ok(!JSON.stringify(s).includes('sk-legacy-99'), '存储内容不含明文');
});

test('密钥清除与留空不修改', async () => {
  await LlmExtract.saveSettings({ llmKey: '' });
  assert.equal(LlmExtract.settings().llmKey, '');
  await LlmExtract.saveSettings({ llmKey: 'sk-keepme' });
  const encBefore = ProjectStore.loadSettings().llmKeyEnc;
  // 不传 llmKey（仅改模型）→ 密钥保持不变
  await LlmExtract.saveSettings({ llmModel: 'test-model' });
  const s1 = ProjectStore.loadSettings();
  assert.equal(s1.llmKeyEnc, encBefore, '未传 llmKey 时密钥不变');
  assert.equal(LlmExtract.settings().llmKey, 'sk-keepme', '内存密钥沿用');
  // 传空字符串 → 清除
  await LlmExtract.saveSettings({ llmKey: '' });
  assert.equal(ProjectStore.loadSettings().llmKeyEnc, '', '密文已清除');
  assert.equal(LlmExtract.settings().llmKey, '', '内存密钥已清除');
});
