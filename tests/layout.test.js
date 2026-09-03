'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.js');

const { GraphStore, Layouts, Utils } = load();

function tinyGraph(n = 24, edgesPerNode = 2) {
  GraphStore.init();
  const persons = [], relations = [];
  for (let i = 0; i < n; i++) {
    persons.push({ id: 'P' + i, name: '人' + i, group: '组' + (i % 4), x: 0, y: 0, style: {}, isLock: false });
    GraphStore.addPerson(persons[i], { silent: true });
  }
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < edgesPerNode; k++) {
      const j = (i * 31 + k * 7 + 5) % n;
      if (j !== i) relations.push({ id: 'R' + i + '_' + k, sourceId: 'P' + i, targetId: 'P' + j, relationType: '关联', style: {} });
    }
  }
  GraphStore.persons = persons;
  GraphStore.relations = relations;
  GraphStore.reindex();
  return { persons, relations };
}

const finite = (persons) => persons.every(p => Number.isFinite(p.x) && Number.isFinite(p.y));

test('6 种布局均可运行且坐标有限', async () => {
  for (const name of ['force', 'circular', 'tree', 'grid', 'grouped', 'radial']) {
    const { persons } = tinyGraph();
    await Layouts.apply(name, () => {});
    assert.ok(finite(persons), `${name} 布局坐标必须是有限数字`);
  }
});

test('布局结果非全零（产生有效排布）', async () => {
  const { persons } = tinyGraph(30);
  await Layouts.apply('grid', () => {});
  const span = Math.max(...persons.map(p => Math.abs(p.x))) + Math.max(...persons.map(p => Math.abs(p.y)));
  assert.ok(span > 100, `grid 布局应有可见跨度，实际 ${span}`);
});

test('树布局：深层链 5000 不爆栈', async () => {
  const n = 5000;
  const persons = [], relations = [];
  for (let i = 0; i < n; i++) {
    persons.push({ id: 'P' + i, name: 'n' + i, x: 0, y: 0, style: {}, isLock: false });
  }
  for (let i = 0; i < n - 1; i++) relations.push({ id: 'R' + i, sourceId: 'P' + i, targetId: 'P' + (i + 1), relationType: '关联', style: {} });
  GraphStore.init();
  GraphStore.persons = persons;
  GraphStore.relations = relations;
  GraphStore.reindex();
  await Layouts.apply('tree', () => {});
  assert.ok(finite(persons), '深链树布局完成且坐标有限');
});

test('力导向收敛（能量下降不崩溃）', async () => {
  const { persons, relations } = tinyGraph(40, 3);
  await Layouts.apply('force', () => {});
  assert.ok(finite(persons));
  // 节点不应重合过多：最近邻距离抽样均值 > 10
  const p = persons.slice(0, 20);
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    let nd = Infinity;
    for (let j = 0; j < p.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
      if (d < nd) nd = d;
    }
    sum += nd;
  }
  assert.ok(sum / p.length > 10, `节点平均最近邻间距 ${(sum / p.length).toFixed(1)} > 10`);
});
