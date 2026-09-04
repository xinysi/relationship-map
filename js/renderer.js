'use strict';
/* ================= Canvas 渲染引擎 =================
   动态画布绘制 / 命中检测 / 高亮淡化 / 视口裁剪
   支持导出时复用同一套绘制逻辑（drawScene）
------------------------------------------------ */
const Renderer = {
  canvas: null, ctx: null, dpr: 1, w: 0, h: 0,
  view: { x: 0, y: 0, scale: 1 },
  theme: null,
  options: { nodeSize: 22, labelSize: 13, curvature: 0.12, showArrow: false, showEdgeLabels: false, edgeWidthMul: 1, colorByGroup: true },
  MIN_ZOOM: 0.3, MAX_ZOOM: 3, FIT_MIN: 0.04,

  /* 交互态（由 App 驱动） */
  hoverPersonId: null, hoverEdgeId: null,
  connectFromId: null, mouseWorld: { x: 0, y: 0 },
  boxRect: null, // {x0,y0,x1,y1} 屏幕坐标

  _avatarCache: new Map(), // id → {img, ok, src, tainted}
  _parallel: new Map(), _parallelDirty: true,
  _drawPending: false,

  THEMES: {
    light:    { name: '浅色主题', group: 'classic', bg: '#f0f2f6', dot: '#dde3ec', nodeFill: '#ffffff', nodeBorder: '#3f7ef7', nodeText: '#2b3445', subText: '#7a8699', edge: '#b6c2d8', edgeText: '#4a5568', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#3f7ef7', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    dark:     { name: '深色主题', group: 'classic', bg: '#10141c', dot: '#222b3a', nodeFill: '#1f2937', nodeBorder: '#5b8ff7', nodeText: '#e4e9f2', subText: '#8b96ab', edge: '#3d4b66', edgeText: '#aab6cc', edgeTextBg: 'rgba(23,30,44,.95)', primary: '#5b8ff7', search: '#f59f24', dimNode: 0.16, dimEdge: 0.08 },
    simple:   { name: '简约主题', group: 'classic', bg: '#ffffff', dot: '#efefef', nodeFill: '#ffffff', nodeBorder: '#555555', nodeText: '#1f1f1f', subText: '#8a8a8a', edge: '#d0d0d0', edgeText: '#444', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#1f1f1f', search: '#e8890c', dimNode: 0.15, dimEdge: 0.06 },
    business: { name: '商务主题', group: 'classic', bg: '#0d1a30', dot: '#1d3050', nodeFill: '#16294a', nodeBorder: '#c9a05a', nodeText: '#e8edf6', subText: '#93a5c4', edge: '#3a5378', edgeText: '#c9d4e8', edgeTextBg: 'rgba(15,26,48,.95)', primary: '#c9a05a', search: '#e0a63f', dimNode: 0.16, dimEdge: 0.08 },
    forest:   { name: '森语绿', group: 'nature', bg: '#eef4ef', dot: '#cfe0d2', nodeFill: '#ffffff', nodeBorder: '#3aa76d', nodeText: '#2b3a2f', subText: '#748a7a', edge: '#b9cdbb', edgeText: '#4d6b56', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#3aa76d', search: '#e8961f', dimNode: 0.16, dimEdge: 0.07 },
    violet:   { name: '罗兰紫', group: 'pink', bg: '#f4f1fa', dot: '#dcd2ee', nodeFill: '#ffffff', nodeBorder: '#8b5cf6', nodeText: '#352d45', subText: '#857ba0', edge: '#c3b7e2', edgeText: '#5f5480', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#8b5cf6', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    ocean:    { name: '深海蓝', group: 'cool', bg: '#0a1a2b', dot: '#1d3a57', nodeFill: '#12283f', nodeBorder: '#4fa3d9', nodeText: '#dceaf5', subText: '#8aa7bd', edge: '#37597a', edgeText: '#a8c4dc', edgeTextBg: 'rgba(10,26,43,.95)', primary: '#4fa3d9', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 },
    sunset:   { name: '落日橙', group: 'warm', bg: '#fdf3ea', dot: '#f2ddcc', nodeFill: '#ffffff', nodeBorder: '#e8823a', nodeText: '#4a3527', subText: '#9c7f66', edge: '#e8d3bd', edgeText: '#7d5c3e', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#e8823a', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    sakura:   { name: '樱绯粉', group: 'pink', bg: '#fdf1f5', dot: '#f3d8e1', nodeFill: '#ffffff', nodeBorder: '#e06a8f', nodeText: '#4a2f3c', subText: '#a8838f', edge: '#ecc5d2', edgeText: '#8f5a6e', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#e06a8f', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    mint:     { name: '薄荷青', group: 'nature', bg: '#eef7f5', dot: '#d3e9e4', nodeFill: '#ffffff', nodeBorder: '#14b8a6', nodeText: '#1f3a36', subText: '#6f8d87', edge: '#b3dcd5', edgeText: '#407b72', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#14b8a6', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    night:    { name: '星夜紫', group: 'pink', bg: '#151022', dot: '#2a2244', nodeFill: '#241c3d', nodeBorder: '#a78bfa', nodeText: '#ece7f8', subText: '#9d92bd', edge: '#41365f', edgeText: '#c4bae4', edgeTextBg: 'rgba(21,16,34,.95)', primary: '#a78bfa', search: '#f59f24', dimNode: 0.16, dimEdge: 0.08 },
    gold:     { name: '鎏金黑', group: 'redgold', bg: '#17130c', dot: '#2a2214', nodeFill: '#221c11', nodeBorder: '#d4a94e', nodeText: '#f3ead8', subText: '#a89879', edge: '#4b3f2a', edgeText: '#d9c493', edgeTextBg: 'rgba(23,19,12,.95)', primary: '#d4a94e', search: '#e8961f', dimNode: 0.16, dimEdge: 0.08 },
    flame:    { name: '朱砂红', group: 'redgold', bg: '#fdf2f0', dot: '#f3d8d2', nodeFill: '#ffffff', nodeBorder: '#c94f4f', nodeText: '#442c2c', subText: '#9d807c', edge: '#e8c8c2', edgeText: '#8f514e', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#c94f4f', search: '#e8961f', dimNode: 0.16, dimEdge: 0.07 },
    pine:     { name: '松林墨', group: 'nature', bg: '#0f1a14', dot: '#1f3a2c', nodeFill: '#16281e', nodeBorder: '#58a670', nodeText: '#e0efe4', subText: '#87a68f', edge: '#315242', edgeText: '#a8c8b0', edgeTextBg: 'rgba(15,26,20,.95)', primary: '#58a670', search: '#e8961f', dimNode: 0.16, dimEdge: 0.08 },
    graphite: { name: '石墨灰', group: 'cool', bg: '#1a1c20', dot: '#2d3037', nodeFill: '#26282e', nodeBorder: '#9aa3b0', nodeText: '#e8eaee', subText: '#98a0ac', edge: '#3f444d', edgeText: '#b6bcc6', edgeTextBg: 'rgba(26,28,32,.95)', primary: '#9aa3b0', search: '#e8890c', dimNode: 0.16, dimEdge: 0.08 },
    sun:      { name: '蜂蜜黄', group: 'warm', bg: '#fdf8e8', dot: '#f2e6c0', nodeFill: '#ffffff', nodeBorder: '#d9a716', nodeText: '#443a1e', subText: '#9c8c5e', edge: '#e8dab2', edgeText: '#7d6b38', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#d9a716', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    coffee:   { name: '暮山棕', group: 'warm', bg: '#f6f1ea', dot: '#e4d8c8', nodeFill: '#ffffff', nodeBorder: '#8d6e63', nodeText: '#3d322b', subText: '#97897d', edge: '#dccfbd', edgeText: '#6d5a4c', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#8d6e63', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    wine:     { name: '勃艮第红', group: 'pink', bg: '#1d0f13', dot: '#3a2028', nodeFill: '#2a171c', nodeBorder: '#c96a7a', nodeText: '#f2e3e6', subText: '#a98d92', edge: '#4d3039', edgeText: '#d3aab2', edgeTextBg: 'rgba(29,15,19,.95)', primary: '#c96a7a', search: '#f59f24', dimNode: 0.16, dimEdge: 0.08 },
    indigo:   { name: '靛蓝', group: 'cool', bg: '#eef0fb', dot: '#d5daf2', nodeFill: '#ffffff', nodeBorder: '#4f46e5', nodeText: '#30324a', subText: '#7c81a8', edge: '#c0c6e8', edgeText: '#565b8a', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#4f46e5', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    lagoon:   { name: '碧波青', group: 'nature', bg: '#07211f', dot: '#14403b', nodeFill: '#0d2f2c', nodeBorder: '#3ecbab', nodeText: '#dcefe9', subText: '#8ab5aa', edge: '#2a544e', edgeText: '#a9d5c9', edgeTextBg: 'rgba(7,33,31,.95)', primary: '#3ecbab', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 },
    coral:    { name: '珊瑚橘', group: 'warm', bg: '#fdf1ec', dot: '#f6d9ca', nodeFill: '#ffffff', nodeBorder: '#ff6f52', nodeText: '#4a2e26', subText: '#9d7a6e', edge: '#f2cfc0', edgeText: '#8f5a47', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#ff6f52', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    lavender: { name: '雾紫', group: 'pink', bg: '#f5f4fa', dot: '#dcd7ec', nodeFill: '#ffffff', nodeBorder: '#a08fc8', nodeText: '#38334d', subText: '#8b84a5', edge: '#d4cce6', edgeText: '#6f6690', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#a08fc8', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    lime:     { name: '青柠绿', group: 'nature', bg: '#f7fbe9', dot: '#e4efc0', nodeFill: '#ffffff', nodeBorder: '#84cc16', nodeText: '#3a461f', subText: '#849368', edge: '#dce8b5', edgeText: '#67754a', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#84cc16', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    sky:      { name: '天青蓝', group: 'cool', bg: '#edf6fd', dot: '#cfe6f7', nodeFill: '#ffffff', nodeBorder: '#38a3e8', nodeText: '#24445e', subText: '#7291ab', edge: '#c2ddf2', edgeText: '#48708f', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#38a3e8', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    rose:     { name: '玫红', group: 'pink', bg: '#fdf0f3', dot: '#f6d3dc', nodeFill: '#ffffff', nodeBorder: '#d23f66', nodeText: '#47242f', subText: '#a07584', edge: '#f0c4d0', edgeText: '#99505f', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#d23f66', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    fire:     { name: '火橙', group: 'warm', bg: '#fdf1e8', dot: '#f6d9bd', nodeFill: '#ffffff', nodeBorder: '#f26622', nodeText: '#4a2c1a', subText: '#a3795a', edge: '#f0d4b8', edgeText: '#8a5a35', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#f26622', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    navy:     { name: '藏青蓝', group: 'cool', bg: '#f2f5fb', dot: '#d6def0', nodeFill: '#ffffff', nodeBorder: '#1e3a8a', nodeText: '#2b3450', subText: '#7c86a8', edge: '#ccd6ec', edgeText: '#4a5680', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#1e3a8a', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    plum:     { name: '梅子紫', group: 'pink', bg: '#f9f0f3', dot: '#ecd4dc', nodeFill: '#ffffff', nodeBorder: '#96395c', nodeText: '#452a38', subText: '#9c7a87', edge: '#e6cede', edgeText: '#8a5468', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#96395c', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    champagne:{ name: '香槟金', group: 'warm', bg: '#faf5ea', dot: '#eee2c8', nodeFill: '#ffffff', nodeBorder: '#c9a86a', nodeText: '#45392a', subText: '#9c8d76', edge: '#e6d9bc', edgeText: '#7d6a4a', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#c9a86a', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    sage:     { name: '鼠尾草', group: 'nature', bg: '#f1f4f1', dot: '#d8e2d9', nodeFill: '#ffffff', nodeBorder: '#78917e', nodeText: '#333f36', subText: '#7e8e82', edge: '#cbd9cd', edgeText: '#5a6f60', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#78917e', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    terracotta:{ name: '陶土红', group: 'warm', bg: '#fbf1ea', dot: '#eed4c4', nodeFill: '#ffffff', nodeBorder: '#b5623f', nodeText: '#44302a', subText: '#937d72', edge: '#e8cdb9', edgeText: '#7d5a45', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#b5623f', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    ember:    { name: '余烬红', group: 'redgold', bg: '#26100a', dot: '#4a241a', nodeFill: '#321711', nodeBorder: '#e2704a', nodeText: '#f5e7e1', subText: '#c09585', edge: '#5c3226', edgeText: '#e0a58c', edgeTextBg: 'rgba(38,16,10,.95)', primary: '#e2704a', search: '#e0a63f', dimNode: 0.16, dimEdge: 0.08 },
    cobalt:   { name: '钴蓝', group: 'cool', bg: '#0a1430', dot: '#1b2c5e', nodeFill: '#101d45', nodeBorder: '#3b6bf0', nodeText: '#e2e9fb', subText: '#92a2cf', edge: '#25396a', edgeText: '#b0c0ea', edgeTextBg: 'rgba(10,20,48,.95)', primary: '#3b6bf0', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 },
    fuchsia:  { name: '洋红', group: 'pink', bg: '#230512', dot: '#4a1229', nodeFill: '#320c1d', nodeBorder: '#db4b9b', nodeText: '#f8e2ee', subText: '#c896ae', edge: '#5e2040', edgeText: '#edaac9', edgeTextBg: 'rgba(35,5,18,.95)', primary: '#db4b9b', search: '#f59f24', dimNode: 0.16, dimEdge: 0.08 },
    emerald:  { name: '翡翠绿', group: 'nature', bg: '#061f14', dot: '#123d29', nodeFill: '#0c2b1d', nodeBorder: '#34d399', nodeText: '#ddf5ea', subText: '#8fc4a8', edge: '#1d5340', edgeText: '#a9e2c8', edgeTextBg: 'rgba(6,31,20,.95)', primary: '#34d399', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 },
    amber:    { name: '琥珀棕', group: 'warm', bg: '#241304', dot: '#4a2a10', nodeFill: '#331c0c', nodeBorder: '#e8a33d', nodeText: '#f6ead6', subText: '#c2a077', edge: '#5c3a1c', edgeText: '#e8c48a', edgeTextBg: 'rgba(36,19,4,.95)', primary: '#e8a33d', search: '#e8890c', dimNode: 0.16, dimEdge: 0.08 },
    obsidian: { name: '黑曜石', group: 'cool', bg: '#0c0c10', dot: '#23232c', nodeFill: '#15151d', nodeBorder: '#7fb5c9', nodeText: '#e6e9ec', subText: '#97a4ad', edge: '#33333f', edgeText: '#b0bdc7', edgeTextBg: 'rgba(12,12,16,.95)', primary: '#7fb5c9', search: '#e8890c', dimNode: 0.16, dimEdge: 0.08 },
    royal:    { name: '皇室紫', group: 'pink', bg: '#170f2e', dot: '#2f2358', nodeFill: '#1f163f', nodeBorder: '#9d6bff', nodeText: '#eae2fb', subText: '#9f92c8', edge: '#372d66', edgeText: '#c3b4ec', edgeTextBg: 'rgba(23,15,46,.95)', primary: '#9d6bff', search: '#f59f24', dimNode: 0.16, dimEdge: 0.08 },
    ink:      { name: '黛青', group: 'cool', bg: '#10181c', dot: '#25323a', nodeFill: '#172127', nodeBorder: '#5e8fa2', nodeText: '#e2ecef', subText: '#93a9b2', edge: '#2f444d', edgeText: '#b3c9d2', edgeTextBg: 'rgba(16,24,28,.95)', primary: '#5e8fa2', search: '#e8890c', dimNode: 0.16, dimEdge: 0.08 },
    velvet:   { name: '丝绒绿', group: 'nature', bg: '#171b0e', dot: '#333b1c', nodeFill: '#222a14', nodeBorder: '#9faf52', nodeText: '#ecf0d8', subText: '#a8b28a', edge: '#3f482a', edgeText: '#cdd7a8', edgeTextBg: 'rgba(23,27,14,.95)', primary: '#9faf52', search: '#e8890c', dimNode: 0.16, dimEdge: 0.08 },
    retro:    { name: '复古撞色', group: 'retro', bg: '#f6efe3', dot: '#e8d8bc', nodeFill: '#fdf8ee', nodeBorder: '#2a9d8f', nodeText: '#5a4a3a', subText: '#a08a70', edge: '#e8b96f', edgeText: '#8a6a3f', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#e76f51', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    vintage:  { name: '老电影', group: 'retro', bg: '#efe6d4', dot: '#ddd0b4', nodeFill: '#f7f1e3', nodeBorder: '#7a5c2e', nodeText: '#4a3c2c', subText: '#95836b', edge: '#cbb48e', edgeText: '#6d5a3f', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#a84a2e', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    pixel:    { name: '像素复古', group: 'retro', bg: '#f2ede2', dot: '#ddd4c2', nodeFill: '#fffdf5', nodeBorder: '#5a768a', nodeText: '#3f3f36', subText: '#8d8d7e', edge: '#b8c4b0', edgeText: '#6d7a68', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#c84f3f', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    sweetcool:{ name: '甜酷', group: 'trendy', bg: '#fdf3f6', dot: '#f3d8e3', nodeFill: '#ffffff', nodeBorder: '#1a1a2e', nodeText: '#33243a', subText: '#a07f92', edge: '#d8b6c8', edgeText: '#7f5a72', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#ff4f8f', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    y2k:      { name: '千禧年代', group: 'trendy', bg: '#f3f1fd', dot: '#dcd8f5', nodeFill: '#ffffff', nodeBorder: '#a05ff0', nodeText: '#3a3355', subText: '#8d84b3', edge: '#c3b4ee', edgeText: '#6d5fa0', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#ff5fb0', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    pop:      { name: '波普', group: 'trendy', bg: '#fef9c1', dot: '#f5e39b', nodeFill: '#ffffff', nodeBorder: '#2d6cff', nodeText: '#443d28', subText: '#9c8f6a', edge: '#ffd84d', edgeText: '#8a6f2e', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#ff4d8d', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    graffiti: { name: '涂鸦', group: 'trendy', bg: '#1a1a26', dot: '#2e2e44', nodeFill: '#24243a', nodeBorder: '#ffd23f', nodeText: '#efe8f8', subText: '#9d94b8', edge: '#4edbd0', edgeText: '#c8f2ee', edgeTextBg: 'rgba(26,26,38,.95)', primary: '#ff5fb0', search: '#ff9a3d', dimNode: 0.16, dimEdge: 0.08 },
    chinese:  { name: '中式', group: 'chinese', bg: '#f7f1e7', dot: '#e8dcc8', nodeFill: '#fdfaf3', nodeBorder: '#8c1f28', nodeText: '#3d3430', subText: '#97887a', edge: '#c9a86a', edgeText: '#6d5a3a', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#b8860b', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    inkwash:  { name: '水墨', group: 'chinese', bg: '#f4f4f2', dot: '#e4e4e0', nodeFill: '#ffffff', nodeBorder: '#2f2f2f', nodeText: '#23282b', subText: '#8a9094', edge: '#b8bfc2', edgeText: '#566068', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#4b6b72', search: '#e8890c', dimNode: 0.15, dimEdge: 0.06 },
    macaron:  { name: '马卡龙', group: 'dessert', bg: '#fdf6fa', dot: '#f6e3ef', nodeFill: '#ffffff', nodeBorder: '#8ec5e0', nodeText: '#3f445c', subText: '#9793ac', edge: '#f3b6d2', edgeText: '#8f5a78', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#ef86b4', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    candy:    { name: '糖果', group: 'dessert', bg: '#fdf7fb', dot: '#f5e0ee', nodeFill: '#ffffff', nodeBorder: '#58b8ff', nodeText: '#453a55', subText: '#9d8f9d', edge: '#ffd166', edgeText: '#8a6f3a', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#ff8fab', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    lemonade: { name: '柠檬苏打', group: 'dessert', bg: '#fbf8ec', dot: '#eee7c8', nodeFill: '#ffffff', nodeBorder: '#7fc8b8', nodeText: '#3f4a3f', subText: '#90987e', edge: '#f2d98c', edgeText: '#8a7540', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#f2a93b', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    cyber:    { name: '赛博', group: 'scifi', bg: '#0a0a14', dot: '#20203c', nodeFill: '#12122a', nodeBorder: '#00e5ff', nodeText: '#e6f6ff', subText: '#96a8cc', edge: '#7a3bff', edgeText: '#cfc0ff', edgeTextBg: 'rgba(10,10,20,.95)', primary: '#ff2ed1', search: '#ffd23f', dimNode: 0.16, dimEdge: 0.08 },
    crt:      { name: '雪花电视', group: 'scifi', bg: '#0f1410', dot: '#1e2a1e', nodeFill: '#141c16', nodeBorder: '#9fff9f', nodeText: '#e8f5e8', subText: '#93ab93', edge: '#3f5f3f', edgeText: '#b5d6b5', edgeTextBg: 'rgba(15,20,16,.95)', primary: '#e0e0d0', search: '#ffcf50', dimNode: 0.16, dimEdge: 0.08 },
    firefly:  { name: '萤光', group: 'scifi', bg: '#101c14', dot: '#223826', nodeFill: '#16241a', nodeBorder: '#c3f73a', nodeText: '#ecf5dc', subText: '#a4b08a', edge: '#3f6a3a', edgeText: '#cfe3a2', edgeTextBg: 'rgba(16,28,20,.95)', primary: '#f5e960', search: '#ffcf50', dimNode: 0.16, dimEdge: 0.08 },
    gothic:   { name: '哥特', group: 'gothic', bg: '#0d0d10', dot: '#212126', nodeFill: '#141418', nodeBorder: '#a81c2e', nodeText: '#ececef', subText: '#98989f', edge: '#3f3f4a', edgeText: '#c8c8d0', edgeTextBg: 'rgba(13,13,16,.95)', primary: '#b8b8c8', search: '#e0543f', dimNode: 0.16, dimEdge: 0.08 },
    matcha:   { name: '抹茶', group: 'nature', bg: '#f4f5ea', dot: '#e0e4c8', nodeFill: '#ffffff', nodeBorder: '#8a9a2e', nodeText: '#38402e', subText: '#84906e', edge: '#cdd6a8', edgeText: '#6d7a50', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#6f8f5a', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    beach:    { name: '海滩', group: 'nature', bg: '#f8f2e7', dot: '#e8e0cc', nodeFill: '#ffffff', nodeBorder: '#2596be', nodeText: '#2c4852', subText: '#7f97a0', edge: '#e8c8a0', edgeText: '#8a6a45', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#ff8c61', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    autumn:   { name: '秋叶', group: 'warm', bg: '#f9f2e5', dot: '#ecddc2', nodeFill: '#ffffff', nodeBorder: '#c65f3f', nodeText: '#4a3426', subText: '#9c8468', edge: '#e8b96f', edgeText: '#7d5c35', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#c98a2e', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    winter:   { name: '冬雪', group: 'cool', bg: '#f2f7fb', dot: '#dde9f5', nodeFill: '#ffffff', nodeBorder: '#a6c8e0', nodeText: '#33414f', subText: '#7d93a8', edge: '#d3e2ef', edgeText: '#5b7a95', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#6b9cc4', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    chromium: { name: '铬银', group: 'metal', bg: '#14161a', dot: '#2a2e35', nodeFill: '#1e2126', nodeBorder: '#c8d2dc', nodeText: '#eef2f5', subText: '#9aa5ae', edge: '#4a525c', edgeText: '#b7c2cb', edgeTextBg: 'rgba(20,22,26,.95)', primary: '#cfd8e3', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 },
    gunmetal: { name: '枪灰', group: 'metal', bg: '#12171d', dot: '#232c36', nodeFill: '#1a2129', nodeBorder: '#7f95ab', nodeText: '#e6edf3', subText: '#94a3b1', edge: '#3b4a58', edgeText: '#aec0d0', edgeTextBg: 'rgba(18,23,29,.95)', primary: '#8ba3ba', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 },
    rust:     { name: '铁锈红', group: 'metal', bg: '#1a1210', dot: '#33211c', nodeFill: '#241815', nodeBorder: '#c0633f', nodeText: '#f4e7e1', subText: '#b0938a', edge: '#54302a', edgeText: '#d9a791', edgeTextBg: 'rgba(26,18,16,.95)', primary: '#c0633f', search: '#e8a33d', dimNode: 0.16, dimEdge: 0.08 },
    patina:   { name: '铜绿', group: 'metal', bg: '#10191a', dot: '#1f3030', nodeFill: '#162323', nodeBorder: '#5ba8a0', nodeText: '#e2f0ee', subText: '#94b3ae', edge: '#33504e', edgeText: '#b6d8d2', edgeTextBg: 'rgba(16,25,26,.95)', primary: '#5ba8a0', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 },
    tungsten: { name: '钨蓝', group: 'metal', bg: '#10131f', dot: '#202636', nodeFill: '#171c2c', nodeBorder: '#7f95cf', nodeText: '#e8ecf8', subText: '#9aa5c2', edge: '#38415e', edgeText: '#bec9e6', edgeTextBg: 'rgba(16,19,31,.95)', primary: '#8ba3d9', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 },
    cloud:    { name: '云朵', group: 'pastel', bg: '#f4f6f8', dot: '#dde4ea', nodeFill: '#ffffff', nodeBorder: '#9fb3c8', nodeText: '#3d4a56', subText: '#8b9aa8', edge: '#d3dde6', edgeText: '#7f93a6', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#86a9c9', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    peach:    { name: '蜜桃', group: 'pastel', bg: '#fdf3ec', dot: '#f5ddce', nodeFill: '#ffffff', nodeBorder: '#f4a26c', nodeText: '#4c3527', subText: '#a5826a', edge: '#f2d3b8', edgeText: '#8f6244', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#f4a26c', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    milkmint: { name: '奶薄荷', group: 'pastel', bg: '#f2f8f4', dot: '#d9e9df', nodeFill: '#ffffff', nodeBorder: '#8fcbb0', nodeText: '#33503f', subText: '#7f9a8a', edge: '#d5e8dc', edgeText: '#6f8f7c', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#6db897', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    bubble:   { name: '泡泡', group: 'pastel', bg: '#f4f4fd', dot: '#dfe0f5', nodeFill: '#ffffff', nodeBorder: '#a3a8e8', nodeText: '#3f4258', subText: '#8b8eae', edge: '#d6d8f0', edgeText: '#6f74a2', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#8f95e0', search: '#f59f24', dimNode: 0.16, dimEdge: 0.07 },
    porcelain:{ name: '白瓷', group: 'pastel', bg: '#f7f5f1', dot: '#e6e0d6', nodeFill: '#ffffff', nodeBorder: '#b0a58f', nodeText: '#3c382e', subText: '#8d8575', edge: '#ded7c8', edgeText: '#6f6753', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#a79a80', search: '#e8890c', dimNode: 0.16, dimEdge: 0.07 },
    tribal:   { name: '部落', group: 'weave', bg: '#241410', dot: '#45271d', nodeFill: '#321c14', nodeBorder: '#e0784e', nodeText: '#f4e8df', subText: '#c0a08e', edge: '#5c3526', edgeText: '#e8b294', edgeTextBg: 'rgba(36,20,16,.95)', primary: '#d95b33', search: '#e8a33d', dimNode: 0.16, dimEdge: 0.08 },
    viking:   { name: '维京', group: 'weave', bg: '#0f1d22', dot: '#213840', nodeFill: '#16262c', nodeBorder: '#7fa8b0', nodeText: '#e0ecee', subText: '#94adb3', edge: '#35505a', edgeText: '#bdd4d8', edgeTextBg: 'rgba(15,29,34,.95)', primary: '#6f9ca6', search: '#f0a53f', dimNode: 0.16, dimEdge: 0.08 },
    caravan:  { name: '驼队', group: 'weave', bg: '#241708', dot: '#452c12', nodeFill: '#32200e', nodeBorder: '#d9a04e', nodeText: '#f4e9d4', subText: '#bfa478', edge: '#5c3f20', edgeText: '#e5c88e', edgeTextBg: 'rgba(36,23,8,.95)', primary: '#cf9536', search: '#e8890c', dimNode: 0.16, dimEdge: 0.08 },
    totem:    { name: '图腾', group: 'weave', bg: '#121a14', dot: '#26352a', nodeFill: '#1a251e', nodeBorder: '#a04a33', nodeText: '#e8efe6', subText: '#9caf9e', edge: '#39503f', edgeText: '#c2d8c2', edgeTextBg: 'rgba(18,26,20,.95)', primary: '#c05c3f', search: '#e8890c', dimNode: 0.16, dimEdge: 0.08 },
    persia:   { name: '波斯', group: 'weave', bg: '#1d0f14', dot: '#3a202b', nodeFill: '#2a161d', nodeBorder: '#4a6fc0', nodeText: '#f2e8e2', subText: '#b09599', edge: '#6f4a5a', edgeText: '#dcc0a8', edgeTextBg: 'rgba(29,15,20,.95)', primary: '#c25b54', search: '#e8a33d', dimNode: 0.16, dimEdge: 0.08 },
    firework: { name: '烟火', group: 'festival', bg: '#0d1020', dot: '#22264a', nodeFill: '#151a33', nodeBorder: '#ff5f6d', nodeText: '#eef0fa', subText: '#9aa2c8', edge: '#3f4f9f', edgeText: '#c2c8f0', edgeTextBg: 'rgba(13,16,32,.95)', primary: '#ffd23f', search: '#ff8a3d', dimNode: 0.16, dimEdge: 0.08 },
    disco:    { name: '迪斯科', group: 'festival', bg: '#0f0a1c', dot: '#2b1f52', nodeFill: '#181034', nodeBorder: '#3ee6c8', nodeText: '#f0ecfb', subText: '#a49ac4', edge: '#5a3fa8', edgeText: '#d4c8f0', edgeTextBg: 'rgba(15,10,28,.95)', primary: '#ff5fb0', search: '#ffd23f', dimNode: 0.16, dimEdge: 0.08 },
    lantern:  { name: '灯市', group: 'festival', bg: '#1d0d0a', dot: '#45241c', nodeFill: '#2a1610', nodeBorder: '#e8564a', nodeText: '#f5e9e0', subText: '#c09a88', edge: '#6a3a2a', edgeText: '#ecc0a8', edgeTextBg: 'rgba(29,13,10,.95)', primary: '#f5b445', search: '#e8890c', dimNode: 0.16, dimEdge: 0.08 },
    confetti: { name: '彩带', group: 'festival', bg: '#fdf4ee', dot: '#f5dcc9', nodeFill: '#ffffff', nodeBorder: '#ff6ea0', nodeText: '#4a3a50', subText: '#a08fa0', edge: '#ffd166', edgeText: '#8a6f3a', edgeTextBg: 'rgba(255,255,255,.95)', primary: '#58b8ff', search: '#e0543f', dimNode: 0.16, dimEdge: 0.07 },
    kaleido:  { name: '万花筒', group: 'festival', bg: '#120f24', dot: '#28204e', nodeFill: '#1a1538', nodeBorder: '#7ec2ff', nodeText: '#efedfb', subText: '#a49ec8', edge: '#ffd23f', edgeText: '#f4e6b8', edgeTextBg: 'rgba(18,15,36,.95)', primary: '#ff5fb0', search: '#3ee6c8', dimNode: 0.16, dimEdge: 0.08 }
  },

  /* ---------- 画布版式（按主题分类组指派：节点形状 / 连线线型 / 背景 / 光效） ---------- */
  LAYOUTS: {
    classic:  { shape: 'circle',  edge: 'curve',    bg: 'dots',     fx: 'none' },
    nature:   { shape: 'circle',  edge: 'curve',    bg: 'dots',     fx: 'soft' },
    warm:     { shape: 'circle',  edge: 'curve',    bg: 'gradient', fx: 'none' },
    cool:     { shape: 'circle',  edge: 'straight', bg: 'gradient', fx: 'none' },
    pink:     { shape: 'circle',  edge: 'curve',    bg: 'gradient', fx: 'soft' },
    redgold:  { shape: 'circle',  edge: 'curve',    bg: 'gradient', fx: 'double' },
    retro:    { shape: 'circle',  edge: 'straight', bg: 'plain',    fx: 'double' },
    trendy:   { shape: 'rect',    edge: 'straight', bg: 'dots',     fx: 'none' },
    chinese:  { shape: 'circle',  edge: 'curve',    bg: 'plain',    fx: 'none' },
    dessert:  { shape: 'circle',  edge: 'curve',    bg: 'plain',    fx: 'soft' },
    scifi:    { shape: 'hex',     edge: 'straight', bg: 'grid',     fx: 'glow' },
    gothic:   { shape: 'diamond', edge: 'straight', bg: 'gradient', fx: 'none' },
    metal:    { shape: 'rect',    edge: 'straight', bg: 'grid',     fx: 'none' },
    pastel:   { shape: 'circle',  edge: 'straight', bg: 'dots',     fx: 'none' },
    weave:    { shape: 'diamond', edge: 'curve',    bg: 'dots',     fx: 'none' },
    festival: { shape: 'diamond', edge: 'curve',    bg: 'dots',     fx: 'glow' }
  },
  layoutOf(id) {
    const g = (this.THEMES[id] || {}).group || 'classic';
    return this.LAYOUTS[g] || this.LAYOUTS.classic;
  },

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = this.THEMES.light;
    this._themeId = 'light';
    this.resize();
    Utils.emitter.on('graph:change', () => { this._parallelDirty = true; this._pruneAvatarCache(); this.requestDraw(); });
  },

  /* 人物删除后清理头像缓存，避免缓存无限增长 */
  _pruneAvatarCache() {
    if (this._avatarCache.size <= GraphStore.persons.length + 16) return;
    const alive = new Set(GraphStore.pById.keys());
    for (const id of this._avatarCache.keys()) if (!alive.has(id)) this._avatarCache.delete(id);
  },

  setThemeName(name) {
    this.theme = this.THEMES[name] || this.THEMES.light;
    this._themeId = name in this.THEMES ? name : 'light';
    this.requestDraw();
  },

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, Math.floor(rect.width));
    this.h = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.requestDraw();
  },

  /* ---------- 坐标换算 ---------- */
  screenToWorld(sx, sy) {
    return { x: (sx - this.view.x) / this.view.scale, y: (sy - this.view.y) / this.view.scale };
  },
  worldToScreen(wx, wy) {
    return { x: wx * this.view.scale + this.view.x, y: wy * this.view.scale + this.view.y };
  },

  clampZoom(scale) { return Utils.clamp(scale, this.MIN_ZOOM, this.MAX_ZOOM); },

  zoomAt(sx, sy, factor, absolute) {
    const ns = absolute ? Utils.clamp(factor, this.MIN_ZOOM, this.MAX_ZOOM) : this.clampZoom(this.view.scale * factor);
    // 以鼠标位置为中心缩放
    const wx = (sx - this.view.x) / this.view.scale, wy = (sy - this.view.y) / this.view.scale;
    this.view.scale = ns;
    this.view.x = sx - wx * ns;
    this.view.y = sy - wy * ns;
    this.requestDraw();
    Utils.emitter.emit('view:change');
  },

  resetView() {
    this.view = { x: this.w / 2, y: this.h / 2, scale: 1 };
    this.requestDraw();
    Utils.emitter.emit('view:change');
  },

  /* 自适应画布：所有节点全屏展示 */
  fitView(extra) {
    const persons = GraphStore.visiblePersons();
    if (!persons.length) { this.resetView(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of persons) {
      const r = this.nodeRadius(p) + 30;
      if (p.x - r < minX) minX = p.x - r; if (p.x + r > maxX) maxX = p.x + r;
      if (p.y - r < minY) minY = p.y - r; if (p.y + r > maxY) maxY = p.y + r;
    }
    const bw = Math.max(maxX - minX, 50), bh = Math.max(maxY - minY, 50);
    const scale = Utils.clamp(Math.min(this.w / bw, this.h / bh) * 0.92, this.FIT_MIN, this.MAX_ZOOM);
    this.view.scale = scale;
    this.view.x = this.w / 2 - (minX + maxX) / 2 * scale;
    this.view.y = this.h / 2 - (minY + maxY) / 2 * scale;
    this.requestDraw();
    Utils.emitter.emit('view:change');
  },

  /* 让某个节点居中聚焦 */
  centerOn(wx, wy) {
    this.view.x = this.w / 2 - wx * this.view.scale;
    this.view.y = this.h / 2 - wy * this.view.scale;
    this.requestDraw();
    Utils.emitter.emit('view:change');
  },

  requestDraw() {
    if (this._drawPending) return;
    this._drawPending = true;
    requestAnimationFrame(() => { this._drawPending = false; this.draw(); });
  },

  /* ---------- 拓扑缓存：平行边偏移索引 ---------- */
  invalidateTopology() { this._parallelDirty = true; },

  _buildParallel() {
    this._parallel = new Map();
    const seen = new Map(); // pairKey → 已出现的边列表
    for (const r of GraphStore.relations) {
      const key = r.sourceId < r.targetId ? r.sourceId + '|' + r.targetId : r.targetId + '|' + r.sourceId;
      const arr = seen.get(key) || [];
      arr.push(r.id);
      seen.set(key, arr);
    }
    for (const [key, arr] of seen) {
      arr.forEach((id, i) => this._parallel.set(id, { index: i, count: arr.length, selfLoop: false }));
    }
    for (const r of GraphStore.relations) {
      if (r.sourceId === r.targetId) {
        const m = this._parallel.get(r.id) || { index: 0, count: 1 };
        m.selfLoop = true;
        this._parallel.set(r.id, m);
      }
    }
    this._parallelDirty = false;
  },

  /* ---------- 节点尺寸 ---------- */
  nodeRadius(p) {
    return (p.style && p.style.size) ? p.style.size : this.options.nodeSize;
  },

  /* ---------- 头像加载 ---------- */
  ensureAvatar(p) {
    let c = this._avatarCache.get(p.id);
    if (c && c.src === p.avatar) return c;
    c = { img: null, ok: false, src: p.avatar || '', tainted: false };
    this._avatarCache.set(p.id, c);
    if (!p.avatar) return c;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { c.ok = true; this.requestDraw(); };
    img.onerror = () => {
      // CORS 失败时降级为不带 crossOrigin 加载（画布可能被污染，导出时特殊处理）
      if (img.crossOrigin) {
        const img2 = new Image();
        img2.onload = () => { c.img = img2; c.ok = true; c.tainted = true; this.requestDraw(); };
        img2.src = p.avatar;
      }
    };
    img.src = p.avatar;
    c.img = img;
    return c;
  },

  /* ---------- 高亮/淡化上下文 ---------- */
  _highlightCtx() {
    // 人物固定聚焦优先级最高（单击锁定后不被悬浮覆盖）
    if (GraphStore.pinnedId && GraphStore.getPerson(GraphStore.pinnedId)) {
      const related = new Set([GraphStore.pinnedId]);
      for (const nb of GraphStore.neighborsOf(GraphStore.pinnedId)) related.add(nb.other.id);
      const hotEdges = new Set();
      for (const r of GraphStore.relations) {
        if (r.sourceId === GraphStore.pinnedId || r.targetId === GraphStore.pinnedId) hotEdges.add(r.id);
      }
      return { dim: true, related, hotEdges, mode: 'pinned' };
    }
    if (this.hoverPersonId && GraphStore.getPerson(this.hoverPersonId)) {
      const related = new Set([this.hoverPersonId]);
      for (const nb of GraphStore.neighborsOf(this.hoverPersonId)) related.add(nb.other.id);
      const hotEdges = new Set();
      for (const r of GraphStore.relations) {
        if (r.sourceId === this.hoverPersonId || r.targetId === this.hoverPersonId) hotEdges.add(r.id);
      }
      return { dim: true, related, hotEdges, mode: 'hover' };
    }
    if (GraphStore.focus.depth > 0 && GraphStore.focus.ids) {
      return { dim: true, related: GraphStore.focus.ids, hotEdges: null, mode: 'focus' };
    }
    if (GraphStore.highlight.ids && GraphStore.highlight.ids.size) {
      // 事件聚焦：高亮关联人物及其之间的连线，淡化其余
      const related = GraphStore.highlight.ids;
      const hotEdges = new Set();
      for (const r of GraphStore.relations) {
        if (related.has(r.sourceId) && related.has(r.targetId)) hotEdges.add(r.id);
      }
      return { dim: true, related, hotEdges, mode: 'highlight' };
    }
    return { dim: false, related: null, hotEdges: null, mode: null };
  },

  /* ============================================================
     场景绘制（实时画布与导出共用）
     opts: { transparent, noAvatar, noCull, forExport }
     ============================================================ */
  drawScene(ctx, view, w, h, opts) {
    opts = opts || {};
    const th = this.theme;
    const layout = this.layoutOf(this._themeId);
    const scale = view.scale;
    // 导出时文字/线宽随倍率同步放大，避免导出图放大查看时文字发糊（屏幕渲染保持固定字号）
    const fs = opts.forExport ? scale : 1;

    // 背景（主题版式：点阵 / 网格 / 径向渐变 / 纯色）
    if (!opts.transparent) {
      ctx.fillStyle = th.bg;
      ctx.fillRect(0, 0, w, h);
      if (!opts.forExport && scale >= 0.4) {
        if (layout.bg === 'dots') {
          // 点阵背景：圆形点，稍大更清晰（浅色主题下不再"隐形"）
          const step = 36 * scale;
          if (w / step < 160 && h / step < 160) {
            ctx.fillStyle = th.dot;
            const ox = ((view.x % step) + step) % step, oy = ((view.y % step) + step) % step;
            for (let x = ox; x < w; x += step) {
              for (let y = oy; y < h; y += step) {
                ctx.beginPath();
                ctx.arc(x, y, 1.3, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        } else if (layout.bg === 'grid') {
          const step = 48 * scale;
          if (w / step < 160 && h / step < 160) {
            ctx.strokeStyle = th.edge;
            ctx.globalAlpha = 0.55;
            ctx.lineWidth = 1;
            const ox = ((view.x % step) + step) % step, oy = ((view.y % step) + step) % step;
            for (let x = ox; x < w; x += step) {
              ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            }
            for (let y = oy; y < h; y += step) {
              ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            }
            ctx.globalAlpha = 1;
          }
        } else if (layout.bg === 'gradient') {
          const rg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.72);
          rg.addColorStop(0, th.bg);
          rg.addColorStop(1, th.dot);
          ctx.fillStyle = rg;
          ctx.fillRect(0, 0, w, h);
        }
      }
    }

    if (this._parallelDirty) this._buildParallel();
    const hl = opts.forExport ? { dim: false, related: null, hotEdges: null } : this._highlightCtx();

    const margin = 120;
    let vx0, vy0, vx1, vy1;
    if (opts.noCull) { vx0 = -Infinity; vy0 = -Infinity; vx1 = Infinity; vy1 = Infinity; }
    else {
      const tl = this.screenToWorldRect(view, 0, 0, w, h);
      vx0 = tl.x0 - margin; vy0 = tl.y0 - margin; vx1 = tl.x1 + margin; vy1 = tl.y1 + margin;
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    /* ----- 关系边（按颜色/粗细/虚实/透明度分桶批量描边，大规模数据性能优化） ----- */
    const visibleEdges = [];
    for (const r of GraphStore.relations) {
      if (!GraphStore.isEdgeVisible(r)) continue;
      const s = GraphStore.getPerson(r.sourceId), t = GraphStore.getPerson(r.targetId);
      if (!s || !t) continue;
      visibleEdges.push({ r, s, t });
    }

    const edgeLabelList = [];
    const buckets = new Map(); // styleKey → {strokeStyle, lineWidth, dash, alpha, path}
    for (const { r, s, t } of visibleEdges) {
      const meta = this._parallel.get(r.id) || { index: 0, count: 1, selfLoop: false };
      const isHot = !hl.hotEdges || hl.hotEdges.has(r.id);
      const isSelected = GraphStore.selectedEdgeId === r.id;
      const isHover = this.hoverEdgeId === r.id;
      const touchesSel = GraphStore.selection.has(r.sourceId) || GraphStore.selection.has(r.targetId);
      let alpha = 1;
      if (hl.dim && !isHot) alpha = th.dimEdge;

      const st = r.style || {};
      const color = st.color || Utils.colorForType(r.relationType);
      // 线宽响应平缓：接近旧版细线风格（强度9≈2.2px），同时保留强度差
      let width = (st.width > 0 ? st.width : (0.9 + (r.strength || 0) * 0.15)) * this.options.edgeWidthMul;
      if (fs !== 1) width *= fs; // 导出时线宽随倍率放大
      const dash = true; // 全部关系线绘制虚线（统一细虚线风格）
      const arrow = st.arrow || this.options.showArrow;
      const hot = isSelected || isHover || touchesSel;
      if (hot) width *= 1.45;
      const strokeStyle = (isSelected || isHover) ? th.primary : color;

      if (meta.selfLoop) {
        // 自环
        const ang = -Math.PI / 4;
        const rr = this.nodeRadius(s);
        const cx = s.x + Math.cos(ang) * rr * 1.9, cy = s.y + Math.sin(ang) * rr * 1.9;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = width;
        if (dash) ctx.setLineDash([6, 5]); else ctx.setLineDash([]);
        ctx.arc(cx * scale + view.x, cy * scale + view.y, rr * 0.9 * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // 平滑曲线（平行边相互错开）；straight 版式直线连接
        let x1 = s.x, y1 = s.y, x2 = t.x, y2 = t.y;
        const dx = x2 - x1, dy = y2 - y1;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = (meta.count === 1)
          ? (layout.edge === 'straight' ? 0 : this.options.curvature)
          : ((meta.index - (meta.count - 1) / 2) * 0.34);
        const mx = (x1 + x2) / 2 - dy / d * off * d;
        const my = (y1 + y2) / 2 + dx / d * off * d;
        const X1 = x1 * scale + view.x, Y1 = y1 * scale + view.y;
        const CX = mx * scale + view.x, CY = my * scale + view.y;
        const X2 = x2 * scale + view.x, Y2 = y2 * scale + view.y;

        // 裁剪：线段包围盒
        if (!opts.noCull) {
          const bx0 = Math.min(X1, X2, CX) - 20, bx1 = Math.max(X1, X2, CX) + 20;
          const by0 = Math.min(Y1, Y2, CY) - 20, by1 = Math.max(Y1, Y2, CY) + 20;
          if (bx1 < 0 || bx0 > w || by1 < 0 || by0 > h) continue;
        }

        const key = strokeStyle + '|' + width.toFixed(1) + '|' + (dash ? 1 : 0) + '|' + alpha;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { strokeStyle, lineWidth: width, dash, alpha, path: new Path2D() };
          buckets.set(key, bucket);
        }
        bucket.path.moveTo(X1, Y1);
        bucket.path.quadraticCurveTo(CX, CY, X2, Y2);

        // 箭头
        if (arrow) {
          const ang = Math.atan2(Y2 - CY, X2 - CX);
          const tr = this.nodeRadius(t) * scale;
          const ax = X2 - Math.cos(ang) * (tr + 2), ay = Y2 - Math.sin(ang) * (tr + 2);
          const as = Math.max(7, width * 3);
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.fillStyle = strokeStyle;
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - Math.cos(ang - 0.42) * as, ay - Math.sin(ang - 0.42) * as);
          ctx.lineTo(ax - Math.cos(ang + 0.42) * as, ay - Math.sin(ang + 0.42) * as);
          ctx.closePath();
          ctx.fill();
        }

        // 边标签：悬浮 / 选中 / 全局开启。
        // 高亮聚焦模式（固定人物/悬浮/事件聚焦）只标注"属于当前人物"的关系边，
        // 避免开启全局标签时把淡化关系（非当前人物）的标签也显示出来
        let showLabel = isSelected || isHover;
        if (!showLabel) {
          if (hl.dim && hl.hotEdges) showLabel = hl.hotEdges.has(r.id); // pinned/hover/highlight：仅高亮边
          else if (this.options.showEdgeLabels && visibleEdges.length <= 400) showLabel = true; // 全局开启（溯源聚焦时可见边已属于聚焦图）
        }
        if (showLabel) {
          edgeLabelList.push({ text: r.relationType, x: (X1 + CX * 2 + X2) / 4, y: (Y1 + CY * 2 + Y2) / 4, color, selected: isSelected || isHover });
        }
      }
    }
    // 批量描边
    for (const b of buckets.values()) {
      ctx.globalAlpha = b.alpha;
      ctx.strokeStyle = b.strokeStyle;
      ctx.lineWidth = b.lineWidth;
      if (b.dash) ctx.setLineDash([7, 5]); else ctx.setLineDash([]);
      ctx.stroke(b.path);
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.font = (11 * fs) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const lb of edgeLabelList) {
      const tw = ctx.measureText(lb.text).width;
      ctx.fillStyle = th.edgeTextBg;
      ctx.beginPath();
      const pad = 4 * fs, hw = tw / 2 + pad, hh = 9 * fs;
      if (ctx.roundRect) ctx.roundRect(lb.x - hw, lb.y - hh, hw * 2, hh * 2, 4);
      else ctx.rect(lb.x - hw, lb.y - hh, hw * 2, hh * 2);
      ctx.fill();
      ctx.fillStyle = lb.selected ? th.primary : th.edgeText;
      ctx.fillText(lb.text, lb.x, lb.y + 0.5);
    }

    /* ----- 人物节点 ----- */
    const fontLabel = `${this.options.labelSize * fs}px "Microsoft YaHei", sans-serif`;
    // 大规模数据 + 低缩放时隐藏姓名标签，保证交互流畅（悬浮/选中仍显示）
    const hideLabels = !opts.forExport && scale < 0.6 && GraphStore.persons.length > 500;
    for (const p of GraphStore.persons) {
      if (!GraphStore.isPersonVisible(p)) continue;
      const X = p.x * scale + view.x, Y = p.y * scale + view.y;
      const r = this.nodeRadius(p) * scale;
      if (!opts.noCull && (X + r < -60 || X - r > w + 60 || Y + r < -60 || Y - r > h + 120)) continue;

      const isSelected = GraphStore.selection.has(p.id);
      const isHover = this.hoverPersonId === p.id;
      const isSearch = GraphStore.searchHits.has(p.id);
      const isHL = hl.mode === 'highlight' && hl.related.has(p.id);
      const dimmed = hl.dim && !hl.related.has(p.id);
      const alpha = dimmed ? th.dimNode : 1;
      ctx.globalAlpha = alpha;

      const st = p.style || {};
      const rWorld = this.nodeRadius(p);
      const borderColor = st.border || (this.options.colorByGroup && p.group ? Utils.colorForGroup(p.group) : th.nodeBorder);
      const fill = st.fill || th.nodeFill;

      // 选中 / 搜索 / 事件聚焦光圈
      if (isSelected) {
        ctx.beginPath();
        ctx.strokeStyle = th.primary;
        ctx.lineWidth = 2.5 * fs;
        ctx.arc(X, Y, r + 4.5 * fs, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.25;
        ctx.beginPath(); ctx.fillStyle = th.primary; ctx.arc(X, Y, r + 9 * fs, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha;
      } else if (isHL) {
        ctx.beginPath();
        ctx.strokeStyle = th.search;
        ctx.lineWidth = 2.5 * fs;
        ctx.arc(X, Y, r + 5.5 * fs, 0, Math.PI * 2);
        ctx.stroke();
      } else if (isSearch) {
        ctx.beginPath();
        ctx.strokeStyle = th.search;
        ctx.lineWidth = 2 * fs;
        ctx.setLineDash([4 * fs, 3 * fs]);
        ctx.arc(X, Y, r + 4.5 * fs, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 节点主体（形状：主题版式缺省，节点自定义 style.shape 优先）
      const shape = st.shape || layout.shape;
      ctx.beginPath();
      if (shape === 'rect') {
        const rw = r * 1.7, rh = r * 1.3;
        if (ctx.roundRect) ctx.roundRect(X - rw / 2, Y - rh / 2, rw, rh, Math.min(10, r * 0.4));
        else ctx.rect(X - rw / 2, Y - rh / 2, rw, rh);
      } else if (shape === 'hex') {
        const k = r * 1.15;
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i + Math.PI / 6;
          const px = X + Math.cos(a) * k, py = Y + Math.sin(a) * k;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
      } else if (shape === 'diamond') {
        const k = r * 1.3;
        ctx.moveTo(X, Y - k); ctx.lineTo(X + k, Y); ctx.lineTo(X, Y + k); ctx.lineTo(X - k, Y);
        ctx.closePath();
      } else {
        ctx.arc(X, Y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = fill;
      // 主题光效：soft 柔影 / glow 霓虹发光（深色主题）/ double 复古双线
      if (isHover || isSelected) { ctx.shadowColor = 'rgba(63,126,247,.45)'; ctx.shadowBlur = 12 * fs; }
      else if (layout.fx === 'soft') { ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 9 * fs; }
      else if (layout.fx === 'glow') { ctx.shadowColor = th.primary; ctx.shadowBlur = 16 * fs; }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = Math.max(1.5, rWorld * 0.09) * (isHover ? 1.4 : 1) * fs;
      ctx.stroke();
      if (layout.fx === 'double') {
        ctx.beginPath();
        ctx.strokeStyle = th.bg;
        ctx.lineWidth = 1.3 * fs;
        ctx.arc(X, Y, Math.max(2, r * 0.74), 0, Math.PI * 2);
        ctx.stroke();
      }

      // 头像或首字（裁剪圆随形状收紧，避免超出轮廓）
      const av = opts.noAvatar ? null : this.ensureAvatar(p);
      const clipR = shape === 'rect' ? r * 0.6 : shape === 'diamond' ? r * 0.85 : shape === 'hex' ? r * 0.95 : r - 1.5;
      if (av && av.ok && av.img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(X, Y, clipR, 0, Math.PI * 2);
        ctx.clip();
        const iw = av.img.naturalWidth || av.img.width, ih = av.img.naturalHeight || av.img.height;
        if (iw && ih) {
          const s2 = Math.max((r * 2) / iw, (r * 2) / ih);
          ctx.drawImage(av.img, X - iw * s2 / 2, Y - ih * s2 / 2, iw * s2, ih * s2);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = borderColor;
        ctx.globalAlpha = alpha * 0.75;
        ctx.font = `600 ${Math.max(11, r * 0.75)}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((p.name || '?').charAt(0), X, Y + 1);
        ctx.globalAlpha = alpha;
      }

      // 锁定标记
      if (p.isLock) {
        ctx.font = (10 * fs) + 'px sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('🔒', X + r * 0.55, Y - r * 0.55);
      }

      // 姓名标签
      if (!hideLabels || isSelected || isHover || isSearch || isHL) {
        ctx.font = fontLabel;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = st.textColor || th.nodeText;
        ctx.fillText(p.name || '未命名', X, Y + r + 4);
      }
      ctx.globalAlpha = 1;
    }

    /* ----- 连接模式预览线 ----- */
    if (this.connectFromId && !opts.forExport) {
      const s = GraphStore.getPerson(this.connectFromId);
      if (s) {
        const X1 = s.x * scale + view.x, Y1 = s.y * scale + view.y;
        const X2 = this.mouseWorld.x * scale + view.x, Y2 = this.mouseWorld.y * scale + view.y;
        ctx.beginPath();
        ctx.strokeStyle = th.primary;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.moveTo(X1, Y1);
        ctx.lineTo(X2, Y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    /* ----- 框选矩形 ----- */
    if (this.boxRect && !opts.forExport) {
      const b = this.boxRect;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(63,126,247,.08)';
      ctx.strokeStyle = 'rgba(63,126,247,.7)';
      ctx.lineWidth = 1;
      ctx.rect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.fill(); ctx.stroke();
    }
  },

  screenToWorldRect(view, x0, y0, x1, y1) {
    return {
      x0: (x0 - view.x) / view.scale, y0: (y0 - view.y) / view.scale,
      x1: (x1 - view.x) / view.scale, y1: (y1 - view.y) / view.scale
    };
  },

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawScene(ctx, this.view, this.w, this.h, {});
  },

  /* ---------- 命中检测 ---------- */
  pickNode(sx, sy) {
    const wpt = this.screenToWorld(sx, sy);
    for (let i = GraphStore.persons.length - 1; i >= 0; i--) {
      const p = GraphStore.persons[i];
      if (!GraphStore.isPersonVisible(p)) continue;
      const r = this.nodeRadius(p) + 4 / this.view.scale;
      const dx = wpt.x - p.x, dy = wpt.y - p.y;
      if (dx * dx + dy * dy <= r * r) return p;
    }
    return null;
  },

  pickEdge(sx, sy) {
    if (this._parallelDirty) this._buildParallel();
    const wpt = this.screenToWorld(sx, sy);
    const threshold = 7 / this.view.scale;
    // 大数据量时降低贝塞尔采样密度，保证悬浮响应速度
    const steps = GraphStore.relations.length > 2000 ? 7 : 14;
    let best = null, bestD = threshold;
    for (const r of GraphStore.relations) {
      if (!GraphStore.isEdgeVisible(r)) continue;
      const s = GraphStore.getPerson(r.sourceId), t = GraphStore.getPerson(r.targetId);
      if (!s || !t) continue;
      const meta = this._parallel.get(r.id) || { index: 0, count: 1, selfLoop: false };
      let d = Infinity;
      if (meta.selfLoop) {
        const ang = -Math.PI / 4, rr = this.nodeRadius(s);
        const cx = s.x + Math.cos(ang) * rr * 1.9, cy = s.y + Math.sin(ang) * rr * 1.9;
        d = Math.abs(Math.sqrt((wpt.x - cx) ** 2 + (wpt.y - cy) ** 2) - rr * 0.9);
      } else {
        const dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = (meta.count === 1) ? this.options.curvature : ((meta.index - (meta.count - 1) / 2) * 0.34);
        const mx = (s.x + t.x) / 2 - dy / dist * off * dist;
        const my = (s.y + t.y) / 2 + dx / dist * off * dist;
        // 二次贝塞尔采样
        for (let i = 0; i <= steps; i++) {
          const tt = i / steps, u = 1 - tt;
          const px = u * u * s.x + 2 * u * tt * mx + tt * tt * t.x;
          const py = u * u * s.y + 2 * u * tt * my + tt * tt * t.y;
          const dd = Math.sqrt((wpt.x - px) ** 2 + (wpt.y - py) ** 2);
          if (dd < d) d = dd;
        }
      }
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  },

  /* 可见节点包围盒（导出用） */
  bboxOfVisible() {
    const persons = GraphStore.visiblePersons();
    if (!persons.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of persons) {
      const r = this.nodeRadius(p) + 26;
      if (p.x - r < minX) minX = p.x - r; if (p.x + r > maxX) maxX = p.x + r;
      if (p.y - r < minY) minY = p.y - r; if (p.y + r > maxY) maxY = p.y + r;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
};
