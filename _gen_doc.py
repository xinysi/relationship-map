# -*- coding: utf-8 -*-
"""将 sl/ 目录下的全部 Markdown 剧情文档生成内置示例 JS（一次性构建脚本）"""
import json, io, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

files = sorted(os.listdir('sl'))
# 总览放最前，其余按文件名排序（Grim Tales 01..27）
files.sort(key=lambda n: (0 if '总览' in n else 1, n))
docs = []
for name in files:
    if not name.endswith('.md'):
        continue
    with io.open('sl/' + name, 'r', encoding='utf-8') as f:
        docs.append({'name': name, 'text': f.read()})

header = u"""'use strict';
/* ================= 内置剧情文档示例（残酷谎言系列 · 全 27 部 + 总览） =================
   由 sl/ 目录下的原始 Markdown 文档生成（_gen_doc.py），用于演示
   剧情文档一键导入：人物 / 家族树 / 关系恩怨 / 时间线 / 登场速览全量解析
---------------------------------------------------------------- */
const GrimTalesDocs = """

with io.open('js/grimtales-doc.js', 'w', encoding='utf-8') as f:
    f.write(header)
    f.write(json.dumps(docs, ensure_ascii=False))
    f.write(u';\n')

print('written js/grimtales-doc.js, docs:', len(docs))
