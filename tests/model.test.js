'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.js');

const { Utils, GraphStore } = load();

test('normalizePerson 字段净化：非法 style/坐标', () => {
  const p = GraphStore.normalizePerson({
    style: { size: -5, fontSize: 'x', fill: 42, border: 'b'.repeat(300) },
    x: 'Infinity', y: '1e999', name: '  张三  '
  });
  assert.equal(p.style.size, 0);
  assert.equal(p.style.fontSize, 0);
  assert.equal(p.style.fill, '');
  assert.ok(p.style.border.length <= 200);
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
  assert.equal(p.name, '张三');

  const big = GraphStore.normalizePerson({ style: { size: 100000 } });
  assert.equal(big.style.size, 60);
});

test('normalizeRelation 字段净化', () => {
  const r = GraphStore.normalizeRelation({ sourceId: 1, targetId: 2, style: { width: -9, color: 7 } });
  assert.equal(r.style.width, 0);
  assert.equal(r.style.color, '');
  assert.equal(r.style.dash, false);
  assert.equal(r.strength, 0);
});

test('CRUD：重复 ID 拒绝 / 删除级联关系', () => {
  GraphStore.init();
  assert.ok(GraphStore.addPerson({ id: 'A', name: '甲' }, { silent: true }));
  assert.equal(GraphStore.addPerson({ id: 'A', name: '乙' }, { silent: true }), null);
  assert.ok(GraphStore.addPerson({ id: 'B', name: '丙' }, { silent: true }));
  assert.ok(GraphStore.addRelation({ id: 'R1', sourceId: 'A', targetId: 'B', relationType: '朋友' }, { silent: true }));
  assert.equal(GraphStore.addRelation({ id: 'R2', sourceId: 'A', targetId: 'X' }, { silent: true }), null);
  GraphStore.reindex();
  assert.equal(GraphStore.removePerson('A'), true);
  assert.equal(GraphStore.relations.length, 0);
  assert.equal(GraphStore.persons.length, 1);
});

test('removePersons 批量：单次事件 + 无效 id 不触发', () => {
  GraphStore.init();
  GraphStore.addPerson({ id: 'A', name: '甲' }, { silent: true });
  GraphStore.addPerson({ id: 'B', name: '乙' }, { silent: true });
  GraphStore.addPerson({ id: 'C', name: '丙' }, { silent: true });
  GraphStore.addRelation({ id: 'R1', sourceId: 'A', targetId: 'B' }, { silent: true });
  GraphStore.reindex();
  let emits = 0;
  Utils.emitter.on('graph:change', () => emits++);
  assert.equal(GraphStore.removePersons(['A', 'B', '不存在']), 2);
  assert.equal(emits, 1, '批量删除只触发一次事件');
  assert.equal(GraphStore.persons.length, 1);
  assert.equal(GraphStore.relations.length, 0);
  Utils.emitter.off('graph:change', Utils.emitter._m['graph:change'][0]);
});

test('撤销栈自适应：大图 8 步 / 小图 50 步', () => {
  GraphStore.init();
  for (let i = 0; i < 5200; i++) GraphStore.persons.push({ id: 'P' + i, name: 'n' + i });
  GraphStore.reindex();
  for (let i = 0; i < 12; i++) GraphStore.pushUndo('op' + i);
  assert.equal(GraphStore.undoStack.length, 8, '>5000 实体时上限 8');

  GraphStore.init();
  for (let i = 0; i < 12; i++) GraphStore.pushUndo('op' + i);
  assert.equal(GraphStore.undoStack.length, 12, '小图上限 50');
});

test('焦点状态：pinned 设置/清除', () => {
  GraphStore.init();
  GraphStore.addPerson({ id: 'A', name: '甲' }, { silent: true });
  GraphStore.addPerson({ id: 'B', name: '乙' }, { silent: true });
  GraphStore.addRelation({ sourceId: 'A', targetId: 'B', relationType: '朋友' }, { silent: true });
  GraphStore.reindex();
  assert.equal(GraphStore.pinnedId, null);
  GraphStore.setPinned('A');
  assert.equal(GraphStore.pinnedId, 'A');
  GraphStore.clearPinned();
  assert.equal(GraphStore.pinnedId, null);
});

test('搜索：姓名/别名/ID 命中', () => {
  GraphStore.init();
  GraphStore.addPerson({ id: 'P01', name: '刘备', alias: '玄德' }, { silent: true });
  GraphStore.reindex();
  assert.equal(GraphStore.search('玄德').length, 1);
  assert.equal(GraphStore.search('P01').length, 1);
  assert.equal(GraphStore.search('不存在的').length, 0);
});
