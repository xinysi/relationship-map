'use strict';
/* 测试加载器：把浏览器全局式脚本拼接到 VM 沙箱中执行，导出业务对象供单测使用。
   与浏览器加载顺序一致（utils → sample-data → model → layout → renderer → io）。 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'js');

const FILES = [
  'utils.js',
  'sample-data.js',
  'model.js',
  'community.js',
  'analysis.js',
  'layout.js',
  'renderer.js',
  'io.js',
  'storage.js',
  'share.js',
  'llm.js'
];

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  TextDecoder,
  TextEncoder,
  File,
  Blob,
  URL,
  URLSearchParams,
  atob,
  btoa,
  AbortController,
  // Web Crypto（Node 内置）：llm.js 密钥加密路径需要
  crypto: globalThis.crypto,
  // 动态转发宿主全局 fetch（测试可 stub 全局 fetch 模拟 AI 服务响应）
  fetch: (url, opts) => globalThis.fetch(url, opts),
  // renderer/io 只在函数体引用浏览器全局，沙箱不需要真正 implement；
  // document/window/Image/canvas 由各测试按需 stub
};

let cached = null;

function load() {
  if (cached) return cached;
  const code = FILES
    .map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8'))
    .join('\n;\n');
  const wrapper =
    `(function () {\n${code}\n;\n` +
    `return { Utils, GraphStore, Layouts, Renderer, DataIO, SampleData, Community, Analysis, ProjectStore, SharePage, LlmExtract };\n})()`;
  const mod = vm.runInNewContext(wrapper, sandbox, { filename: 'bundle.js', timeout: 30000 });
  cached = mod;
  return mod;
}

module.exports = { load, FILES };
