'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers/load.js');

const { GraphStore, DataIO } = load();
const FIXTURE = path.join(__dirname, 'fixtures', 'story.md');
const mdFile = () => new File([fs.readFileSync(FIXTURE, 'utf8')], 'story.md', { type: 'text/markdown' });

test('CSV _csvCell：公式注入防护 + 常规转义', () => {
  assert.equal(DataIO._csvCell('-'), '-', '行号占位不加前缀');
  assert.equal(DataIO._csvCell('-2+3'), "'-2+3");
  assert.equal(DataIO._csvCell('=1+1'), "'=1+1");
  assert.equal(DataIO._csvCell('@cmd'), "'@cmd");
  assert.equal(DataIO._csvCell('普通'), '普通');
  assert.equal(DataIO._csvCell('a,b'), '"a,b"');
  assert.equal(DataIO._csvCell('x"y'), '"x""y"');
});

test('parseCSVText：引号/转义/分隔符', () => {
  const rows = DataIO.parseCSVText('a,b,c\n"x,y",z,"q""q"\n');
  assert.equal(rows.length, 2);
  // Array.from 转为宿主 realm 数组（沙箱数组原型不同，deepStrictEqual 会比较原型）
  assert.deepEqual(Array.from(rows[1]), ['x,y', 'z', 'q"q']);
});

test('Markdown fixture 解析：人物/关系/事件与强度推断', async () => {
  const parsed = await DataIO.parseFiles([mdFile()], { mode: 'replace' }, () => {});
  // 阿尔法、贝塔、伽马、梅太太 等
  assert.ok(parsed.persons.length >= 3, `人物数 ${parsed.persons.length}`);
  assert.ok(parsed.relations.length >= 3, `关系数 ${parsed.relations.length}`);
  assert.ok(parsed.events.length >= 1, '含剧情梗概事件');
  // 强度按类型推断：夫妻=9、敌对=7、关联/联手=6，全部已设置（>0）
  const byType = Object.fromEntries(parsed.relations.map(r => [r.relationType, r.strength]));
  if (byType['夫妻'] !== undefined) assert.equal(byType['夫妻'], 9);
  if (byType['敌对'] !== undefined) assert.equal(byType['敌对'], 7);
  assert.ok(parsed.relations.every(r => r.strength > 0), 'md 关系全部有推断强度');
  // 一致性
  const ids = new Set(parsed.persons.map(p => p.id));
  assert.ok(parsed.relations.every(r => ids.has(r.sourceId) && ids.has(r.targetId)), '无孤儿关系');
  // info 级别分离
  assert.ok(parsed.errors.some(e => e.level === 'info'), '统计信息为 info 级别');
  assert.ok(parsed.errors.every(e => e.level !== 'warn' || e.msg.includes('未结构化')), '警告仅未结构化提示');
});

test('CSV 导入：去重 / 强度 / 错误行号 / 应用', async () => {
  const people = '人物ID,人物姓名,归属分组\nP1,张三,红队\nP2,李四,蓝队\nP1,张三重复,红队\n';
  const rels = '起始人物ID,目标人物ID,关系类型,关系强度\nP1,P2,朋友,8\nP9,P2,朋友,5\n';
  const parsed = await DataIO.parseFiles([
    new File([people], '人物表.csv', { type: 'text/csv' }),
    new File([rels], '关系表.csv', { type: 'text/csv' })
  ], { mode: 'replace' }, () => {});
  assert.equal(parsed.persons.length, 2);
  assert.ok(parsed.errors.some(e => e.msg.includes('重复人物ID') && e.row === 4));
  assert.equal(parsed.relations.length, 1, '关系引用不存在的 ID 被跳过');
  assert.equal(parsed.relations[0].strength, 8);
  const applied = DataIO.applyImport(parsed, 'replace');
  assert.deepEqual([applied.persons, applied.relations], [2, 1]);
  assert.equal(GraphStore.persons.length, 2);
});

test('JSON 导入：中英键兼容', async () => {
  const json = JSON.stringify({
    persons: [
      { 人物ID: 'J1', 人物姓名: '甲' },
      { id: 'J2', name: '乙' }
    ],
    relations: [{ sourceId: 'J1', targetId: 'J2', relationType: '同事', strength: 6 }]
  });
  const parsed = await DataIO.parseFiles([new File([json], 'data.json', { type: 'application/json' })], { mode: 'replace' }, () => {});
  assert.equal(parsed.persons.length, 2);
  assert.equal(parsed.relations[0].strength, 6);
});

test('SVG 矢量文档：默认无标签墙 + 选项生效 + XSS 转义', () => {
  const { SampleData, Renderer } = load();
  GraphStore.init();
  for (const p of SampleData.persons) GraphStore.addPerson(p, { silent: true });
  for (const r of SampleData.relations) GraphStore.addRelation(r, { silent: true });
  GraphStore.reindex();
  Renderer.theme = Renderer.THEMES.light;
  const doc = DataIO._svgDocument();
  assert.ok(doc && doc.svg.startsWith('<?xml'));
  assert.equal((doc.svg.match(/<circle/g) || []).length, GraphStore.persons.length, '每节点一个 circle');
  assert.ok(doc.svg.includes('<path'), '关系边为 path');
  assert.ok(doc.svg.includes('<text'), '含节点名文字');
  // 默认不导出边标签（避免标签墙拥挤），勾选后包含
  assert.equal((doc.svg.match(/rx="4"/g) || []).length, 0, '默认无边标签');
  const docL = DataIO._svgDocument({ labels: true });
  assert.ok((docL.svg.match(/rx="4"/g) || []).length > 0, '勾选后包含边标签');
  // XSS 防护：特殊字符转义
  GraphStore.persons[0].name = '甲<&>乙';
  const doc2 = DataIO._svgDocument();
  assert.ok(doc2.svg.includes('甲&lt;&amp;&gt;乙'), '特殊字符转义');
  assert.ok(!doc2.svg.includes('<&>'), '无未转义注入');
});

test('CSV 未填强度保持 0（未设置）', async () => {
  const parsed = await DataIO.parseFiles([
    new File(['人物ID,人物姓名\nC1,甲\n'], 'p.csv', { type: 'text/csv' }),
    new File(['起始人物ID,目标人物ID,关系类型\nC1,C1,自关联\n'], 'r.csv', { type: 'text/csv' })
  ], { mode: 'replace' }, () => {});
  assert.equal(parsed.relations[0].strength, 0);
});
