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
  ProjectStore.loadSettings().llmKey = '';
  LlmExtract.saveSettings({ llmKey: '' });
  await assert.rejects(LlmExtract.extract('一些文本'), /尚未配置 AI 服务密钥/);
});

test('settings 默认值与合并', () => {
  LlmExtract.saveSettings({ llmKey: '' });
  const s = LlmExtract.settings();
  assert.equal(s.llmBase, 'https://api.deepseek.com/v1');
  assert.equal(s.llmModel, 'deepseek-chat');
  assert.equal(s.llmKey, '');
  assert.equal(LlmExtract.configured(), false);
  LlmExtract.saveSettings({ llmKey: 'sk-test' });
  assert.equal(LlmExtract.configured(), true);
});
