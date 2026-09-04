'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

/* 加载 I18n 字典（无 DOM 依赖，直接跑在宿主 VM 中） */
const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'js', 'i18n.js'), 'utf8');
const I18n = vm.runInNewContext(src + '\n; I18n', {});

test('I18n：trHtml 翻译文本节点与属性，未收录词条保留', () => {
  I18n.setLang('en');
  const html = '<div class="form-item"><label>添加人物</label><input placeholder="姓名"></div>' +
    '<button class="btn">确定</button><span>自定义内容乙</span>';
  const out = I18n.trHtml(html);
  assert.ok(out.includes('Add Person'), '文本节点翻译');
  assert.ok(out.includes('placeholder="Name"'), 'placeholder 属性翻译');
  assert.ok(out.includes('OK'), '按钮文本翻译');
  assert.ok(out.includes('自定义内容乙'), '未收录词条保留中文');
  assert.ok(out.includes('<div class="form-item">'), 'HTML 标签不受影响');
  assert.equal(I18n.trHtml(null), null);
  // 中文模式原样返回
  I18n.setLang('zh');
  assert.equal(I18n.trHtml(html), html);
});

test('I18n：字典结构完整（每个词条有英文值）', () => {
  const en = I18n.dict.en;
  assert.ok(en && Object.keys(en).length > 100, `词条数量 ${Object.keys(en).length} 应超过 100`);
  for (const [k, v] of Object.entries(en)) {
    assert.ok(k.trim().length > 0, `key 非空`);
    assert.ok(v && v.trim().length > 0, `词条 ${k} 有英文值`);
  }
});

test('I18n：index.html 每个 data-i18n 标记都有词条', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
  const missing = keys.filter(k => !I18n.dict.en[k]);
  assert.ok(keys.length >= 60, `标记数 ${keys.length} 应覆盖主要界面`);
  assert.deepEqual(missing, [], `缺失词条: ${missing.join(', ')}`);
});

test('I18n：tr 精确命中 / 中文分段兜底 / 未命中保持原文', () => {
  I18n.setLang('en');
  assert.equal(I18n.tr('主题切换'), 'Themes');
  assert.equal(I18n.tr('导入'), 'Import');
  // 中文段拼接式：数字/符号保留
  assert.equal(I18n.tr('已删除 3 个工程'), 'Deleted 3 projects');
  // 未收录词条保持原文
  assert.equal(I18n.tr('自定义中文内容甲'), '自定义中文内容甲');
  // 中文模式原样返回
  I18n.setLang('zh');
  assert.equal(I18n.tr('主题切换'), '主题切换');
  // 空值安全
  assert.equal(I18n.tr(null), null);
  assert.equal(I18n.tr(undefined), undefined);
});
