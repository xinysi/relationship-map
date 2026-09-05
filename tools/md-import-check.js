#!/usr/bin/env node
/**
 * md导入检测.js —— 通用 Markdown 剧情文档导入检测器
 * 用法: node md导入检测.js <文件.md> [--strict]
 * 输出: 人物条目/树节点/关系/时间线 统计 + 未结构化与格式问题定位清单。
 * 零依赖, Node >= 12。
 */
'use strict';
const fs = require('fs');

const file = process.argv[2];
const STRICT = process.argv.includes('--strict');
if (!file) { console.log('用法: node md导入检测.js <文件.md>'); process.exit(0); }
const text = fs.readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);

const stats = { person: 0, tree: 0, relation: 0, timeline: 0, table: 0 };
const issues = [];           // {line, type, msg}
const names = new Set();
let inCode = false, inTable = false, tableCols = -1;

const isDateLike = s => /^[\d仟零一二三四五六七八九十]+/.test(s.replace('约', '').trim());

function addIssue(n, type, msg) { issues.push({ line: n, type, msg }); }

for (let i = 0; i < lines.length; i++) {
  const ln = lines[i], n = i + 1, t = ln.trim();
  if (!t) { continue; }

  // 代码块（家族树）
  if (/^```/.test(t)) {
    if (!inCode) { inCode = true; }
    else { inCode = false; }
    continue;
  }
  if (inCode) {
    stats.tree++;
    if (/\u3000/.test(t)) addIssue(n, '树块', '含全角空格(疑似一行多人黏连): ' + t.slice(0, 50));
    const namesIn = t.match(/[^\s│├└─├┤┬┴┼┌┐└┘\u3000()（）：:；;·0-9一-龥]{2,}?/g);
    // 简化: 检查一个树行里出现多个"(注释)"对或两个以上名字形态
    const parenPairs = (t.match(/\([^)]*\)/g) || []).length;
    const seg = t.replace(/^[\s│├└─]+/, '');
    const m = seg.match(/^[^()\u3000]+/);
    if (m && m[0].trim()) names.add(m[0].trim());
    else if (!/…|\.{2,}/.test(seg)) addIssue(n, '树块', '行首未识别名字: ' + t.slice(0, 40));
    if (parenPairs > 1) addIssue(n, '树块', '一行多个括号注释(可能多人/注释过长): ' + t.slice(0, 50));
    if (/[,，]/.test(seg)) addIssue(n, '树块', '注释内使用逗号: ' + t.slice(0, 50));
    continue;
  }

  // 表格
  if (/^\|/.test(t)) {
    const cols = t.split('|').length - 2;
    if (/^\|[\s\-:]+\|[\s\-:]+\|/.test(t)) continue; // 分隔行
    if (tableCols < 0) { tableCols = cols; stats.table++; }
    else if (cols === tableCols) stats.table++;
    else addIssue(n, '表格', '列数不一致(' + cols + '≠' + tableCols + '): ' + t.slice(0, 40));
    continue;
  }
  if (tableCols > 0 && !/^\|/.test(t)) tableCols = -1;

  // 标题 / 引用 / 横线
  if (/^#{1,4}\s/.test(t) || /^>/.test(t) || /^-{3,}$|^\*{3,}$/.test(t)) continue;

  // 时间线(优先判定): - **年代**:… / - 年份叙述 / - 日期事件
  let tm = t.match(/^- \*\*(\d{4}[^*]*?)\*\*\s*[:：]?\s*(.*)$/);
  if (tm) { stats.timeline++; continue; }
  tm = t.match(/^- (\d{4} ?年[^:：]*[，,:：].*)$/);
  if (tm) { stats.timeline++; continue; }
  tm = t.match(/^- (\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?.*)$/);
  if (tm) { stats.timeline++; continue; }
  // 人物条目: - **名字**（…）: …
  let m;
  if ((m = t.match(/^- \*\*([^*]+)\*\*\s*（?([^）)]*)\)?\s*[:：]?\s*(.*)$/))) {
    const name = m[1].trim(), meta = m[2] || '', desc = m[3] || '';
    if (!name) { addIssue(n, '人物', '空名字条目'); continue; }
    names.add(name.split('|')[0].trim());
    stats.person++;
    if (name.includes('|')) addIssue(n, '人物', '名字含"|"别名(视解析器而定): ' + name);
    if (name.includes('（') || name.includes(')')) addIssue(n, '人物', '名字内含括号: ' + name);
    if (meta.includes(',')) addIssue(n, '人物', '括号元信息含逗号(可能被切分): ' + meta.slice(0, 30));
    if (!meta && !desc) addIssue(n, '人物', '条目无说明: ' + name);
    continue;
  }
  // 变体: **名字**（注意没有 "- " 前缀）
  if ((m = t.match(/^\*\*([^*]+)\*\*\s*（?([^）)]*)\)?\s*[:：]?\s*(.*)$/))) {
    const name = m[1].trim();
    if (name.includes('与') && /家族|阵营|会/.test(name)) { /* 家族阵营条目, 计为人物但提示 */ }
    names.add(name.split('|')[0].trim());
    stats.person++;
    if (/、|\s/.test(name)) addIssue(n, '人物', '条目名含顿号/空格(疑似多人): ' + name.slice(0, 30));
    continue;
  }

  // 关系: A ×/↔/→ B
  if ((m = t.match(/^- ([^×↔→]{1,40}?)\s*(×|↔|→)\s*([^:：]{1,40}?)\s*[:：]?\s*(.*)$/))) {
    const a = m[1].trim(), b = m[3].trim(), type = m[4] || '';
    if (!a || !b) { addIssue(n, '关系', '关系两端为空: ' + t.slice(0, 40)); continue; }
    stats.relation++;
    if (!type) addIssue(n, '关系', '关系无说明(建议"X → Y:关系(类型)"): ' + t.slice(0, 40));
    continue;
  }

  // 时间线: **年代**:事件 或 年份叙述行
  if ((m = t.match(/^- \*\*([^*]+)\*\*\s*[:：]?\s*(.*)$/))) {
    if (isDateLike(m[1])) { stats.timeline++; continue; }
    addIssue(n, '时间线', '加粗内容非日期("' + m[1].slice(0, 18) + '"): ' + t.slice(0, 40));
    continue;
  }
  if ((m = t.match(/^- (\d{4} ?年[^:：]*[，,:：].*)$/)) || (m = t.match(/^- (\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?.*)$/))) {
    stats.timeline++;
    continue;
  }
  // 列表中的编号行或普通列表(无日期无关系的 - 行)
  if (/^- /.test(t)) {
    addIssue(n, '未结构化', '列表行未识别(建议套入条目/关系/时间线格式): ' + t.slice(0, 48));
    continue;
  }
  // 剩余普通段落
  addIssue(n, '未结构化', '叙述性内容未结构化: ' + t.slice(0, 48));
}

// 汇总
const byType = {};
for (const it of issues) byType[it.type] = (byType[it.type] || 0) + 1;
console.log('========== 导入检测报告 ==========');
console.log('文件: ' + file);
console.log('人物条目: ' + stats.person + ' ｜ 家族树节点: ' + stats.tree + ' ｜ 关系: ' + stats.relation + ' ｜ 时间线: ' + stats.timeline + ' ｜ 表格行: ' + stats.table);
console.log('去重后出现的人物名(近似): ' + names.size);
console.log('异常: ' + issues.length + ' 处' + (issues.length ? '（' + Object.entries(byType).map(([k, v]) => k + ' ' + v).join('，') + '）' : ''));
if (issues.length) {
  console.log('---- 异常清单(前 30 条) ----');
  issues.slice(0, 30).forEach(it => console.log('  L' + it.line + ' [' + it.type + '] ' + it.msg));
  if (issues.length > 30) console.log('  … 共 ' + issues.length + ' 条');
}
console.log('=================================');
