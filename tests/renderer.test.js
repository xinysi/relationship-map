'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.js');

const { GraphStore, Renderer, Utils } = load();

function graph() {
  GraphStore.init();
  GraphStore.addPerson({ id: 'A', name: '甲' }, { silent: true });
  GraphStore.addPerson({ id: 'B', name: '乙' }, { silent: true });
  GraphStore.addPerson({ id: 'C', name: '丙' }, { silent: true });
  GraphStore.addRelation({ id: 'R1', sourceId: 'A', targetId: 'B', relationType: '朋友' }, { silent: true });
  GraphStore.addRelation({ id: 'R2', sourceId: 'A', targetId: 'C', relationType: '敌人' }, { silent: true });
  GraphStore.reindex();
}

test('80 套主题且名称/分组完整', () => {
  const keys = Object.keys(Renderer.THEMES);
  assert.equal(keys.length, 80);
  for (const k of keys) {
    assert.ok(Renderer.THEMES[k].name, `主题 ${k} 有名称`);
    assert.ok(Renderer.THEMES[k].group, `主题 ${k} 有分组`);
  }
  assert.equal(Renderer.THEMES.violet.name, '罗兰紫');
  assert.equal(Renderer.THEMES.mint.name, '薄荷青');
  assert.equal(Renderer.THEMES.night.name, '星夜紫');
  assert.equal(Renderer.THEMES.coral.name, '珊瑚橘');
  assert.equal(Renderer.THEMES.cyber.name, '赛博');
  assert.equal(Renderer.THEMES.macaron.group, 'dessert');
  assert.equal(Renderer.THEMES.chromium.group, 'metal');
  assert.equal(Renderer.THEMES.persia.group, 'weave');
});

test('画布版式：16 组均有 layout 且呈现形式互不相同', () => {
  const groups = new Set(Object.values(Renderer.THEMES).map(t => t.group));
  assert.equal(Object.keys(Renderer.LAYOUTS).length, groups.size);
  const shapes = ['circle', 'rect', 'hex', 'diamond'];
  const bgs = ['dots', 'grid', 'gradient', 'plain'];
  const fxs = ['none', 'soft', 'glow', 'double'];
  const combos = new Set();
  for (const [g, l] of Object.entries(Renderer.LAYOUTS)) {
    assert.ok(shapes.includes(l.shape), `组 ${g} shape 有效`);
    assert.ok(l.edge === 'curve' || l.edge === 'straight', `组 ${g} edge 有效`);
    assert.ok(bgs.includes(l.bg), `组 ${g} bg 有效`);
    assert.ok(fxs.includes(l.fx), `组 ${g} fx 有效`);
    const combo = `${l.shape}|${l.edge}|${l.bg}|${l.fx}`;
    assert.ok(!combos.has(combo), `组 ${g} 版式与现有重复: ${combo}`);
    combos.add(combo);
  }
  assert.equal(combos.size, Object.keys(Renderer.LAYOUTS).length, '版式组合全部唯一');
  for (const id of Object.keys(Renderer.THEMES)) assert.ok(Renderer.layoutOf(id), `主题 ${id} 有版式`);
  assert.equal(Renderer.layoutOf('cyber').shape, 'hex');
  assert.equal(Renderer.layoutOf('chinese').edge, 'curve');
  assert.equal(Renderer.layoutOf('retro').edge, 'straight');
  assert.equal(Renderer.layoutOf('simple').shape, 'circle');
  assert.equal(Renderer.layoutOf('unknown').shape, 'circle');
});

test('_highlightCtx：pinned 优先于 hover', () => {
  graph();
  Renderer.hoverPersonId = 'B'; // 假设悬浮 B
  GraphStore.setPinned('A');
  const ctx = Renderer._highlightCtx();
  assert.equal(ctx.mode, 'pinned');
  assert.ok(ctx.related.has('A') && ctx.related.has('B') && ctx.related.has('C'));
  assert.equal(ctx.hotEdges.size, 2, 'A 的两条边都高亮');
  GraphStore.clearPinned();
  const ctx2 = Renderer._highlightCtx();
  assert.equal(ctx2.mode, 'hover');
  Renderer.hoverPersonId = null;
});

test('nodeRadius：样式尺寸优先 / 上限 60', () => {
  graph();
  assert.equal(Renderer.nodeRadius({ style: {} }), Renderer.options.nodeSize);
  GraphStore.persons[0].style = { size: 44 };
  assert.equal(Renderer.nodeRadius(GraphStore.persons[0]), 44);
});

test('导出转义：info 级别不混入错误统计', async () => {
  const { DataIO } = require('./helpers/load.js').load();
  const parsed = await DataIO.parseFiles([
    new File(['# 测试\n## 剧情梗概\n> 简洁梗概一句话。\n## 主要角色\n- **测试者（Tester）**——测试角色\n'], 't.md', { type: 'text/markdown' })
  ], { mode: 'replace' }, () => {});
  const errs = parsed.errors.filter(e => e.level !== 'info');
  assert.equal(errs.length, 0, '纯 markdown 无真实错误');
});
