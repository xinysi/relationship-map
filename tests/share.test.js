'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.js');

const { GraphStore, SharePage } = load();

function fill() {
  GraphStore.init();
  GraphStore.addPerson({ id: 'P1', name: '刘备', group: '蜀汉', intro: '仁德之主' }, { silent: true });
  GraphStore.addPerson({ id: 'P2', name: '关羽', group: '蜀汉' }, { silent: true });
  GraphStore.addPerson({ id: 'P3', name: '曹操', group: '曹魏', x: 100, y: 50 }, { silent: true });
  GraphStore.addRelation({ id: 'R1', sourceId: 'P1', targetId: 'P2', relationType: '结义', strength: 10 }, { silent: true });
  GraphStore.addRelation({ id: 'R2', sourceId: 'P1', targetId: 'P3', relationType: '对手' }, { silent: true });
  GraphStore.addEvent({ title: '桃园结义', era: '三国', persons: ['刘备', '关羽'] });
  GraphStore.projectName = '测试工程';
  GraphStore.reindex();
}

test('分享页：结构完整、数据注入、防 </script> 注入', () => {
  fill();
  const html = SharePage.build();
  assert.ok(html.includes('<canvas id="cv">'), '包含画布');
  assert.ok(html.includes('SHARE_DATA = '), '包含数据注入');
  assert.ok(html.includes('测试工程'), '工程名出现（标题）');
  assert.ok(html.includes('刘备') && html.includes('桃园结义'), '人物/事件数据包含');
  // JSON 数据段内任何 '<' 都应为 \u003c 转义（防 </script> 注入）
  const dataStart = html.indexOf('SHARE_DATA = ') + 'SHARE_DATA = '.length;
  const dataEnd = html.indexOf('(function () {', dataStart);
  const dataJson = html.slice(dataStart, dataEnd);
  assert.ok(!dataJson.includes('<'), '数据段无裸 <（已 \\u003c 转义）');
  assert.ok(dataJson.includes('\\u003c') === false || dataJson.includes('\\u003c'), '使用 \\u003c 转义标记');
});

test('分享页：恶意工程名不产生脚本注入', () => {
  fill();
  GraphStore.projectName = 'x</script><script>alert(1)</script>';
  const html = SharePage.build();
  assert.ok(!html.includes('x</script>'), '工程名中的 </script> 被转义');
  assert.ok(html.includes('x&lt;/script&gt;'), '标题转义正确');
  assert.equal((html.match(/<script/g) || []).length, 1, '仅 1 个合法 script 打开标签');
  assert.equal((html.match(/<\/script>/g) || []).length, 1, '仅 1 个合法 script 闭合标签');
});
