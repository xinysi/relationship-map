'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.js');

const { Community, Layouts, GraphStore } = load();

/* 生成两个清晰社区：A 组内部全连接、B 组内部全连接，仅 2 条跨边 */
function twoCommunities() {
  const persons = [], relations = [];
  const A = 30, B = 20;
  for (let i = 0; i < A; i++) persons.push({ id: 'A' + i, name: '甲' + i });
  for (let i = 0; i < B; i++) persons.push({ id: 'B' + i, name: '乙' + i });
  let rid = 0;
  for (let i = 0; i < A; i++) for (let j = i + 1; j < A; j++) relations.push({ id: 'R' + (rid++), sourceId: 'A' + i, targetId: 'A' + j, relationType: '内部', strength: 3 });
  for (let i = 0; i < B; i++) for (let j = i + 1; j < B; j++) relations.push({ id: 'R' + (rid++), sourceId: 'B' + i, targetId: 'B' + j, relationType: '内部', strength: 3 });
  relations.push({ id: 'R' + (rid++), sourceId: 'A0', targetId: 'B0', relationType: '跨区', strength: 1 });
  relations.push({ id: 'R' + (rid++), sourceId: 'A1', targetId: 'B1', relationType: '跨区', strength: 1 });
  return { persons, relations };
}

test('Louvain：两个清晰社区被正确识别', () => {
  const { persons, relations } = twoCommunities();
  const comm = Community.detect(persons, relations);
  const a = new Set([...comm.values()].filter((_, i) => i < 30));
  const bb = new Set([...comm.values()].filter((_, i) => i >= 30));
  // A、B 各自聚为一团，且两团不同
  assert.equal(a.size, 1, 'A 组应聚为一个社区');
  assert.equal(bb.size, 1, 'B 组应聚为一个社区');
  assert.notEqual(comm.values().next().value, [...comm.values()].at(-1), '两社区应不同');
  // 0 号社区应为最大社区（A 组 30 人）
  assert.equal([...comm.values()].filter(v => v === 0).length, 30);
});

test('独立子社区识别（无关联节点自成社区组）', () => {
  const persons = [
    { id: 'X1', name: 'x1' }, { id: 'X2', name: 'x2' }, { id: 'X3', name: 'x3' },
    { id: 'Y1', name: 'y1' }, { id: 'Y2', name: 'y2' }
  ];
  const relations = [
    { sourceId: 'X1', targetId: 'X2', relationType: '朋友', strength: 5 },
    { sourceId: 'X2', targetId: 'X3', relationType: '朋友', strength: 5 },
    { sourceId: 'Y1', targetId: 'Y2', relationType: '朋友', strength: 5 }
  ];
  const comm = Community.detect(persons, relations);
  assert.equal(comm.get('X1'), comm.get('X2'));
  assert.equal(comm.get('X2'), comm.get('X3'));
  assert.equal(comm.get('Y1'), comm.get('Y2'));
  assert.notEqual(comm.get('X1'), comm.get('Y1'));
});

test('无关系图：全部同一社区且布局可用', async () => {
  const persons = [{ id: 'N1' }, { id: 'N2' }, { id: 'N3' }];
  const comm = Community.detect(persons, []);
  assert.equal([...new Set(comm.values())].length, 1);
  // 社区布局可运行
  GraphStore.init();
  for (const p of persons) GraphStore.addPerson(Object.assign({ name: 'n' }, p), { silent: true });
  GraphStore.reindex();
  await Layouts.apply('community', () => {});
  assert.ok(GraphStore.persons.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('社区检测性能冒烟：3000 节点 / 9000 边', () => {
  const n = 3000;
  const persons = [], relations = [];
  for (let i = 0; i < n; i++) persons.push({ id: 'P' + i, name: 'n' + i });
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const j = (i * 137 + k * 53 + Math.floor(Math.random() * 8)) % n;
      if (j !== i) relations.push({ sourceId: 'P' + i, targetId: 'P' + j, relationType: 't', strength: Math.ceil(Math.random() * 10) });
    }
  }
  const t0 = Date.now();
  const comm = Community.detect(persons, relations);
  const ms = Date.now() - t0;
  assert.equal(comm.size, n);
  assert.ok(ms < 5000, `社区检测 3000 节点应在 5s 内（实际 ${ms}ms）`);
});
