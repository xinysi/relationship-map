'use strict';
/* ================= 只读分享页生成器（单文件 HTML） =================
   把当前画布导出为一个自包含、可离线打开的只读展示页：
   平移/缩放/悬浮高亮/点击聚焦/时间轴事件聚焦，无编辑与导入功能。
   内置独立迷你渲染器（不依赖主框架），单文件约 12KB。
------------------------------------------------ */
const SharePage = {

  /* 生成完整 HTML 字符串（供导出下载；数据注入时对 '<' 做 \u003c 转义防脚本注入） */
  build() {
    const data = {
      app: 'rgxw-share',
      name: GraphStore.projectName,
      exportedAt: new Date().toISOString(),
      persons: GraphStore.persons.map(p => ({
        id: p.id, name: p.name, alias: p.alias || '', group: p.group || '',
        gender: p.gender || '', age: p.age || '', position: p.position || '',
        intro: p.intro || '', tag: p.tag || [], x: +p.x || 0, y: +p.y || 0
      })),
      relations: GraphStore.relations.map(r => ({
        sourceId: r.sourceId, targetId: r.targetId, relationType: r.relationType,
        desc: r.desc || '', strength: r.strength || 0, time: r.time || '',
        note: r.note || '', style: r.style || {}
      })),
      events: (GraphStore.events || []).map(e => ({
        title: e.title, time: e.time || '', era: e.era || '', desc: e.desc || '', persons: e.persons || []
      }))
    };
    // 关键：JSON 内嵌 <script> 前用 \u003c 转义，杜绝 </script> 注入
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const lang = (typeof I18n !== 'undefined' && I18n.lang === 'en') ? 'en' : 'zh';
    return this._template(lang).replace('/*__DATA__*/', json);
  },

  _template(lang) {
    const EN = lang === 'en';
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${this._escapeHtml(GraphStore.projectName)} · 人物关系网（只读分享）</title>
<style>
  html,body{margin:0;height:100%;overflow:hidden;font-family:"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif;font-size:13px;color:#2b3445;background:#f0f2f6}
  #cv{position:absolute;inset:0;width:100%;height:100%}
  #top{position:fixed;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(255,255,255,.88);backdrop-filter:blur(6px);border-bottom:1px solid #e2e8f0;pointer-events:none}
  #top b{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:42vw;flex:none}
  #top span{color:#7a8699;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}
  #hint{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:5;background:rgba(255,255,255,.85);border:1px solid #e2e8f0;border-radius:14px;padding:6px 14px;color:#7a8699;pointer-events:none}
  #tooltip{position:fixed;z-index:6;max-width:280px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 6px 24px rgba(30,40,60,.12);padding:10px 12px;display:none;pointer-events:none}
  #tooltip .n{font-weight:600;font-size:14px}
  #tooltip .g{color:#7a8699;font-size:12px;margin-top:2px}
  #tooltip .i{color:#4a5568;font-size:12px;margin-top:5px;line-height:1.6}
  #tl{position:fixed;top:47px;right:0;bottom:0;width:260px;background:#fff;border-left:1px solid #e2e8f0;overflow:auto;padding:10px;box-sizing:border-box;z-index:4}
  #tl .h{font-weight:600;padding:6px 4px;color:#3f7ef7}
  #tl .ev{padding:6px 8px;border-radius:6px;cursor:pointer;margin-bottom:2px}
  #tl .ev:hover{background:#e8f0fe}
  #tl .ev.on{background:#fff3e0}
  #tl .ev .t{font-weight:600}
  #tl .ev .m{color:#7a8699;font-size:11px;margin-top:1px}
  #tlToggle{position:fixed;right:12px;top:56px;z-index:7;background:rgba(255,255,255,.92);border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;cursor:pointer;color:#2b3445}
  #legend{position:fixed;left:14px;top:52px;z-index:6;background:rgba(255,255,255,.9);border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;max-width:200px;max-height:calc(100% - 100px);overflow-y:auto;overflow-x:hidden}
  #legend .lr{display:flex;align-items:center;gap:6px;font-size:11px;color:#4a5568;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #legend .dot{width:10px;height:10px;border-radius:50%;flex:none}
</style>
</head>
<body>
<canvas id="cv"></canvas>
<div id="top"><b>${this._escapeHtml(GraphStore.projectName)}</b><span>${EN ? 'Read-only shared · Relationship Web' : '只读分享 · 人物关系网'}</span><span id="stat"></span></div>
<div id="hint">${EN ? 'Drag to pan · Scroll to zoom · Hover for info · Click to pin (click again or ESC to restore)' : '拖拽平移 · 滚轮缩放 · 悬浮查看信息 · 点击人物固定聚焦（再点或 ESC 恢复）'}</div>
<div id="tooltip"></div>
<div id="legend"></div>
<button id="tlToggle">☰ 时间轴</button>
<div id="tl"></div>
<script>
/* 数据（< 已转义为 \\u003c，防止 script 标签注入） */
var SHARE_DATA = /*__DATA__*/;
(function () {
  var D = SHARE_DATA, n = D.persons.length;
  var pal = ['#5b8ff9','#5ad8a6','#f6bd16','#e8684a','#6dc8ec','#9270ca','#ff9d4d','#269a99','#ff99c3','#7e6bf2'];
  var tpal = ['#7f9fd8','#d89aa2','#8fbd9a','#d0b078','#a794d4','#79b8cc','#cc8fae','#9aad7f','#c78f6b'];
  function hash(s){var h=5381;s=String(s||'');for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h}
  function gColor(g){return pal[hash(g)%pal.length]}
  function tColor(t){return tpal[hash(t)%tpal.length]}
  var byId={};D.persons.forEach(function(p){byId[p.id]=p});
  /* 无有效坐标时环形排布 */
  var hasPos=D.persons.some(function(p){return p.x||p.y});
  if(!hasPos){D.persons.forEach(function(p,i){var a=i/n*Math.PI*2;p.x=Math.cos(a)*Math.max(220,Math.sqrt(n)*30);p.y=Math.sin(a)*Math.max(220,Math.sqrt(n)*30)})}
  /* 视图与交互 */
  var cv=document.getElementById('cv'),ctx=cv.getContext('2d'),w=0,h=0,dpr=window.devicePixelRatio||1;
  var view={x:0,y:0,scale:1.2},hover=null,pin=null,hl=null;
  var tlShow=true;
  function resize(){w=cv.clientWidth;h=cv.clientHeight;cv.width=w*dpr;cv.height=h*dpr;draw()}
  function fit(){var minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;D.persons.forEach(function(p){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)});var bw=Math.max(maxX-minX,10),bh=Math.max(maxY-minY,10);view.scale=Math.min(w/bw,h/bh)*.82;view.x=w/2-(minX+maxX)/2*view.scale;view.y=h/2-(minY+maxY)/2*view.scale;draw()}
  var R=22; // 默认节点半径
  function draw(){
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    var th=pin||hover?0.16:1, thE=pin||hover?0.07:1;
    var hotRel=null;
    if(pin){hotRel=new Set();D.relations.forEach(function(r){if(r.sourceId===pin||r.targetId===pin)hotRel.add(r)})}
    if(hl){hotRel=new Set();D.relations.forEach(function(r){if(hl.has(r.sourceId)&&hl.has(r.targetId))hotRel.add(r)})}
    var relSet=null;
    if(pin||hover){relSet=new Set([pin||hover]);D.relations.forEach(function(r){var o=r.sourceId===(pin||hover)?r.targetId:r.targetId===(pin||hover)?r.sourceId:null;if(o)relSet.add(o)})}
    /* 边 */
    D.relations.forEach(function(r){
      var s=byId[r.sourceId],t=byId[r.targetId];if(!s||!t)return;
      var hot=!hotRel||hotRel.has(r);var op=hot?1:thE;
      var col=(r.style&&r.style.color)||tColor(r.relationType);
      ctx.globalAlpha=op;ctx.strokeStyle=col;
      ctx.lineWidth=(r.style&&r.style.width>0?r.style.width:(0.9+(r.strength||0)*0.15))*(hot?1.45:1);
      ctx.beginPath();ctx.setLineDash([7,5]);
      var dx=t.x-s.x,dy=t.y-s.y,d=Math.sqrt(dx*dx+dy*dy)||1,off=.12;
      var mx=(s.x+t.x)/2-dy/d*off*d,my=(s.y+t.y)/2+dx/d*off*d;
      ctx.moveTo(s.x*view.scale+view.x,s.y*view.scale+view.y);
      ctx.quadraticCurveTo(mx*view.scale+view.x,my*view.scale+view.y,t.x*view.scale+view.x,t.y*view.scale+view.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    /* 节点 */
    D.persons.forEach(function(p){
      var X=p.x*view.scale+view.x,Y=p.y*view.scale+view.y,r=R*view.scale;
      if(X+r<0||X-r>w||Y+r<0||Y-r>h)return;
      var dim=(pin||hover||hl)&&!(relSet&&relSet.has(p.id))&&!(hl&&hl.has(p.id));
      ctx.globalAlpha=dim?th:1;
      var border=p.group?gColor(p.group):'#3f7ef7';
      ctx.beginPath();ctx.arc(X,Y,r,0,Math.PI*2);
      ctx.fillStyle='#ffffff';ctx.fill();
      ctx.strokeStyle=border;ctx.lineWidth=Math.max(1.5,R*0.09)*view.scale;ctx.stroke();
      ctx.fillStyle=border;ctx.globalAlpha=dim?th*.75:.75;
      var fs=Math.max(11,r*.75);
      ctx.font='600 '+fs+'px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText((p.name||'?').charAt(0),X,Y+1);
      ctx.globalAlpha=dim?th:1;
      ctx.font='13px "Microsoft YaHei",sans-serif';ctx.textBaseline='top';
      if(view.scale>=0.6||n<=50||pin===p.id||hover===p.id||(relSet&&relSet.has(p.id))||(hl&&hl.has(p.id))){ctx.fillStyle='#2b3445';ctx.fillText(p.name||'未命名',X,Y+r+4)}
    });
    ctx.globalAlpha=1;
    document.getElementById('stat').textContent=n+(EN?' persons · ':' 人 · ')+D.relations.length+(EN?' relations':' 关系');
  }
  /* 悬浮信息 */
  var tip=document.getElementById('tooltip');
  function showTip(p){tip.style.display='block';tip.innerHTML='<div class="n">'+esc(p.name)+'</div>'+(p.group?'<div class="g">'+esc(p.group)+(p.position?' · '+esc(p.position):'')+'</div>':'')+(p.intro?'<div class="i">'+esc(p.intro.slice(0,120))+'</div>':'')+countRel(p.id)}
  function countRel(id){var c=0,names=[];D.relations.forEach(function(r){var o=null;if(r.sourceId===id)o=r.targetId;else if(r.targetId===id)o=r.sourceId;if(o){c++;if(names.length<3)names.push((byId[o]?byId[o].name:o))}});if(!c)return'';return'<div class="g" style="margin-top:4px">'+(EN?'Related '+c: '关联 '+c+' 条')+'</div>'}
  function hideTip(){tip.style.display='none'}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function pick(sx,sy){var wx=(sx-view.x)/view.scale,wy=(sy-view.y)/view.scale;for(var i=D.persons.length-1;i>=0;i--){var p=D.persons[i],dx=wx-p.x,dy=wy-p.y;if(dx*dx+dy*dy<=(R+4/view.scale)*(R+4/view.scale))return p}return null}
  /* 事件 */
  var drag=null,moved=false;
  cv.addEventListener('mousedown',function(e){var r=cv.getBoundingClientRect();var sx=e.clientX-r.left,sy=e.clientY-r.top;var p=pick(sx,sy);if(p){if(e.shiftKey){pin=pin===p.id?null:p.id}else{pin=pin===p.id?null:p.id;hover=p}draw();return}
    drag={sx:sx,sy:sy,vx:view.x,vy:view.y};moved=false});
  cv.addEventListener('mousemove',function(e){var r=cv.getBoundingClientRect();var sx=e.clientX-r.left,sy=e.clientY-r.top;
    if(drag){view.x=drag.vx+(sx-drag.sx);view.y=drag.vy+(sy-drag.sy);moved=true;hideTip();draw();return}
    var p=pick(sx,sy);
    if(p){hover=p.id;draw();showTip(p);cv.style.cursor='pointer'}else{hover=null;hideTip();cv.style.cursor='default';draw()}});
  cv.addEventListener('mouseup',function(e){drag=null});
  cv.addEventListener('mouseleave',function(){hover=null;hideTip();draw()});
  cv.addEventListener('wheel',function(e){e.preventDefault();var r=cv.getBoundingClientRect();var sx=e.clientX-r.left,sy=e.clientY-r.top;
    var f=e.deltaY<0?1.1:1/1.1;var ns=Math.min(3,Math.max(.3,view.scale*f));
    var wx=(sx-view.x)/view.scale,wy=(sy-view.y)/view.scale;view.scale=ns;view.x=sx-wx*ns;view.y=sy-wy*ns;draw()},{passive:false});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){pin=null;hl=null;draw()}});
  /* 时间轴 */
  var tl=document.getElementById('tl'),eraOrder=[];
  D.events.forEach(function(ev){if(eraOrder.indexOf(ev.era)<0)eraOrder.push(ev.era)});
  function renderTl(){var html='';eraOrder.forEach(function(era){var es=D.events.filter(function(e){return e.era===era});html+='<div class="h">'+esc(era||(EN?'Uncategorized':'未分类'))+'</div>';es.forEach(function(ev){html+='<div class="ev" data-t="'+esc(ev.title)+'"><div class="t">'+esc(ev.title)+'</div>'+(ev.time?'<div class="m">'+esc(ev.time)+'</div>':'')+'</div>'})});tl.innerHTML=html||'<div class="m">'+(EN?'No timeline events yet':'暂无时间线事件')+'</div>'}
  renderTl();
  tl.addEventListener('click',function(e){var el=e.target.closest('.ev');if(!el)return;var t=el.dataset.t;var ev=D.events.filter(function(x){return x.title===t})[0];if(!ev)return;
    var ids=[];ev.persons.forEach(function(nm){var p=null;for(var k in byId)if(byId[k].name===nm){p=byId[k];break}if(p)ids.push(p.id)});
    if(!ids.length){hl=null;draw();return}
    pin=null;hl=new Set(ids);draw();tl.querySelectorAll('.ev').forEach(function(x){x.classList.toggle('on',x===el)})});
  var toggler=document.getElementById('tlToggle');
  toggler.addEventListener('click',function(){tlShow=!tlShow;tl.style.display=tlShow?'block':'none'});
  /* 图例 */
  var legend={},lc=document.getElementById('legend');
  D.persons.forEach(function(p){if(p.group)legend[p.group]=1});
  var gs=Object.keys(legend).sort().slice(0,8);lc.innerHTML=gs.length?'':'';
  if(gs.length){lc.innerHTML=gs.map(function(g){return '<div class="lr"><span class="dot" style="background:'+gColor(g)+'"></span>'+esc(g)+'</div>'}).join('')}
  else{lc.style.display='none'}
  window.addEventListener('resize',resize);
  resize();fit();
})();
</` + `script>
</body>
</html>`;
  },

  _escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
