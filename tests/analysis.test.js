'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.js');

const { Analysis } = load();

function persons(...ids) { return ids.map(id => ({ id, name: id })); }
function rel(a, b, type) { return { id: 'r_' + a + '_' + b, sourceId: a, targetId: b, relationType: type || '关联', strength: 1 }; }

test('最短路径：链式图正确回溯', () => {
  const P = persons('A', 'B', 'C', 'D');
  const R = [rel('A', 'B'), rel('B', 'C'), rel('C', 'D')];
  const res = Analysis.shortestPath(P, R, 'A', 'D');
  assert.equal(res.dist, 3);
  assert.deepEqual(Array.from(res.ids), ['A', 'B', 'C', 'D']);
  assert.equal(res.edges.length, 3);
});

test('最短路径：有捷径时走最短路', () => {
  const P = persons('A', 'B', 'C', 'D');
  const R = [rel('A', 'B'), rel('B', 'C'), rel('C', 'D'), rel('A', 'D')];
  const res = Analysis.shortestPath(P, R, 'A', 'D');
  assert.equal(res.dist, 1, 'A-D 直连应选 1 段');
  assert.deepEqual(Array.from(res.ids), ['A', 'D']);
});

test('最短路径：无路径返回 null / 自身返回 0 段', () => {
  const P = persons('A', 'B', 'C');
  const R = [rel('A', 'B')];
  assert.equal(Analysis.shortestPath(P, R, 'A', 'C'), null);
  assert.equal(Analysis.shortestPath(P, R, 'B', 'B').dist, 0);
});

test('度中心性：比值正确', () => {
  const P = persons('A', 'B', 'C', 'D');
  const R = [rel('A', 'B'), rel('A', 'C'), rel('B', 'C'), rel('C', 'D')];
  const deg = Analysis.degrees(P, R);
  assert.equal(deg.get('A').deg, 2);
  assert.equal(deg.get('C').deg, 3);
  assert.equal(deg.get('C').ratio, 1, 'C 度数最高');
  assert.equal(deg.get('A').ratio, 2 / 3);
});

test('介数中心性：链式图中间人值为 1、端点 0', () => {
  const P = persons('A', 'B', 'C', 'D');
  const R = [rel('A', 'B'), rel('B', 'C'), rel('C', 'D')];
  const bc = Analysis.betweenness(P, R);
  const byId = new Map(bc.map(x => [x.id, x]));
  // Brandes 有向累积 4 → 无向 ÷2 = 2（与 NetworkX 未归一化一致：normalized 2/3 × 3）
  assert.equal(byId.get('A').value, 0, '端点介数为 0');
  assert.equal(byId.get('B').value, 2, 'B 承载 A-C、A-D 两对（各 1）');
  assert.equal(byId.get('C').value, 2, 'C 承载 A-D、B-D 两对（各 1）');
  // 排序 B/C 在前
  assert.ok(bc[0].id === 'B' || bc[0].id === 'C');
});

test('核心人物榜单：排序与附注字段完整', () => {
  const P = persons('A', 'B', 'C', 'D', 'E');
  // A 为枢纽：连接 B、C、D、E
  const R = [rel('A', 'B'), rel('A', 'C'), rel('A', 'D'), rel('A', 'E'), rel('B', 'C')];
  const list = Analysis.topCentral(P, R, 10);
  assert.equal(list[0].id, 'A', '枢纽人物应排第一');
  assert.ok(list[0].deg >= 4);
  assert.equal(list.length, 5);
});
