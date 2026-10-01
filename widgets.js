'use strict';
/* Widget builder, advanced charts, pivot, cohort, NL assistant, report, data model, themes, exports. Loaded after app.js */
const W={list:[],nid:1,drag:null,note:''};
const WT={season:'Seasonality',cluster:'Clusters',area:'Area',line:'Line',bar:'Bar',column:'Column',donut:'Donut',treemap:'Treemap',funnel:'Funnel',waterfall:'Waterfall',radar:'Radar',box:'Box plot',hist:'Histogram',scatter:'Scatter',bubble:'Bubble',heatmap:'Correlation',pivot:'Pivot',cohort:'Cohort'};
const AGL={sum:'Sum',avg:'Average',median:'Median',min:'Min',max:'Max',count:'Count'},AGT=['bar','column','line','area','donut','treemap','funnel','waterfall','pivot'];
const NODIM=['season','cluster','hist','scatter','bubble','heatmap','radar','cohort'],NOM=['heatmap','cohort','cluster'],M=document.getElementById('main');
const qs=(a,f)=>a[Math.min(a.length-1,Math.floor(f*(a.length-1)))],dl=(b,n)=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;a.click()};
const entityCol=()=>S.cols.find(c=>/client|customer|user|account|member|company/i.test(c.name)&&c.type!=='number'&&c.distinct>3);
const dstr=v=>v instanceof Date?v.toISOString().slice(0,10):v;
function mk(type,o={}){const ms=measures();return{id:W.nid++,type,dim:dims()[0]?.name,dim2:dims()[1]?.name,m:ms[0]?.name||'',y:ms[1]?.name,z:(ms[2]||ms[0])?.name,span:1,n:10,asc:0,lf:{},open:0,fo:0,...o}}
function autoWidgets(){const ms=measures(),ds=dims(),dc=dateCol(),L=[];W.nid=1;W.list=[];
 if(dc)L.push(mk('area',{dim:dc.name,span:2}));
 ds.filter(c=>!c.derived).slice(0,3).forEach((d,i)=>L.push(mk(i?'column':'bar',{dim:d.name})));
 const bd0=ALL().find(c=>c.derived),pc0=ms.find(c=>c.semantic==='percentage');if(bd0)L.push(mk('column',{dim:bd0.name,m:'',n:12}));if(pc0&&ds[0])L.push(mk('bar',{dim:ds[0].name,m:pc0.name,ag:'avg'}));
 if(ds[0])L.push(mk('donut'),mk('treemap'),mk('funnel'),mk('waterfall'));
 if(ds[0]&&ms[0])L.push(mk('box'));
 ms.slice(0,2).forEach(c=>L.push(mk('hist',{m:c.name})));
 if(ms.length>1)L.push(mk('scatter'),mk('bubble'),mk('heatmap',{span:2}));
 if(ms.length>2)L.push(mk('radar'));
 if(dc)L.push(mk('season'));if(ms.length>1)L.push(mk('cluster'));
 if(ds.length>1)L.push(mk('pivot',{span:2}));
 if(dc&&entityCol())L.push(mk('cohort',{span:2}));
 W.list=L}

/* ---- additional chart types ---- */
const xl=(lab,cx,y,n,bw)=>{const s=String(lab);if(n>6)return`<text x="${cx}" y="${y}" text-anchor="end" transform="rotate(-40 ${cx} ${y})" style="font-size:9px">${esc(s.slice(0,18))}</text>`;
 const mc=Math.max(5,Math.floor(bw/5));let a=s,b='';if(s.length>mc){const k=s.lastIndexOf(' ',mc);if(k>0){a=s.slice(0,k);b=s.slice(k+1)}}
 return`<text x="${cx}" y="${y}" text-anchor="middle" style="font-size:9px">${esc(a.slice(0,mc+2))}${b?`<tspan x="${cx}" dy="10">${esc(b.slice(0,mc+2))}</tspan>`:''}</text>`};
function col(it,dim){if(!it.length)return'';const n=it.length,x0=n>6?60:12,w=(392-x0)/n,mx=Math.max(...it.map(i=>i[1]),1e-9),H=n>6?235:185,hm=n>8?90:120;
 return`<svg viewBox="0 0 400 ${H}">${it.map((x,i)=>{const h=Math.max(0,x[1])/mx*hm,cx=x0+i*w+w/2,tag=dim?` class="bar" data-c="${esc(dim)}" data-v="${esc(x[0])}"`:'',vy=146-h-(n>6&&n<=8&&i%2?10:0),vt=n>8?`<text x="${cx+3}" y="${146-h-3}" transform="rotate(-90 ${cx+3} ${146-h-3})" style="font-size:8.5px">${fmt(x[1])}</text>`:`<text x="${cx}" y="${vy}" text-anchor="middle" style="font-size:9px">${fmt(x[1])}</text>`;
  return`<g${tag}><title>${esc(x[0])}: ${fmt(x[1])}</title><rect x="${x0+i*w+2}" y="${150-h}" width="${Math.max(1,w-4)}" height="${h}" fill="${COL[1]}" rx="2"/>${vt}${xl(x[0],cx,164,n,w)}</g>`}).join('')}</svg>`}
function treemap(items,dim){items=items.filter(i=>i[1]>0).slice(0,14);if(!items.length)return'';const out=[],tot=items.reduce((s,i)=>s+i[1],0)||1;
 (function sp(it,x,y,w,h){if(it.length===1){out.push([it[0],x,y,w,h]);return}const t=it.reduce((s,i)=>s+i[1],0);let acc=0,k=0;while(k<it.length-1&&acc+it[k][1]<t/2)acc+=it[k++][1];k=Math.max(1,k);const l=it.slice(0,k),rr=it.slice(k),f=l.reduce((s,i)=>s+i[1],0)/t;
  if(w>=h){sp(l,x,y,w*f,h);sp(rr,x+w*f,y,w*(1-f),h)}else{sp(l,x,y,w,h*f);sp(rr,x,y+h*f,w,h*(1-f))}})(items,0,0,400,190);
 return`<svg viewBox="0 0 400 190">${out.map(([it,x,y,w,h],i)=>`<g class=bar data-c="${esc(dim)}" data-v="${esc(it[0])}"><title>${esc(it[0])}: ${fmt(it[1])} (${(it[1]/tot*100).toFixed(0)}%)</title><rect x="${x+1}" y="${y+1}" width="${Math.max(0,w-2)}" height="${Math.max(0,h-2)}" fill="${COL[i%6]}" opacity=".85" rx="3"/><text x="${x+5}" y="${y+14}" style="fill:#fff">${esc(it[0].slice(0,Math.max(3,w/6|0)))}</text>${h>=30&&w>=40?`<text x="${x+5}" y="${y+27}" style="fill:#fff;font-size:9px">${fmt(it[1])}${w>=90?` · ${(it[1]/tot*100).toFixed(0)}%`:''}</text>`:''}</g>`).join('')}</svg>`}
function funnel(it,dim){it=it.slice(0,6);if(!it.length)return'';const mx=it[0][1]||1;return`<svg viewBox="0 0 400 ${it.length*30}">${it.map((x,i)=>{const w=Math.max(6,Math.max(0,x[1])/mx*360);return`<g class=bar data-c="${esc(dim)}" data-v="${esc(x[0])}"><title>${esc(x[0])}: ${fmt(x[1])}</title><rect x="${200-w/2}" y="${i*30+2}" width="${w}" height="26" fill="${COL[i%6]}" rx="3"/><text x="200" y="${i*30+19}" text-anchor="middle" style="fill:#fff">${esc(x[0].slice(0,16))} · ${fmt(x[1])}</text></g>`}).join('')}</svg>`}
function waterfall(it){const L=it.slice(0,7),rest=it.slice(7).reduce((s,x)=>s+x[1],0);if(rest)L.push(['Other',rest]);if(!L.length)return'';const tot=L.reduce((s,x)=>s+x[1],0)||1,n=L.length+1,x0=n>6?60:12,w=(392-x0)/n,H=n>6?235:185;let c=0;
 return`<svg viewBox="0 0 400 ${H}">${L.map((x,i)=>{const y0=150-c/tot*120;c+=x[1];const y1=150-c/tot*120,cx=x0+i*w+w/2;return`<rect x="${x0+i*w+2}" y="${Math.min(y0,y1)}" width="${w-4}" height="${Math.abs(y0-y1)||1}" fill="${COL[2]}" rx="2"><title>${esc(x[0])}: ${fmt(x[1])}</title></rect><text x="${cx}" y="${Math.min(y0,y1)-4-(n>6&&i%2?10:0)}" text-anchor="middle" style="font-size:9px">${x[1]>=0?'+':''}${fmt(x[1])}</text>${xl(x[0],cx,164,n,w)}`}).join('')}<rect x="${x0+L.length*w+2}" y="30" width="${w-4}" height="120" fill="${COL[0]}" rx="2"/><text x="${x0+L.length*w+w/2}" y="${n>6?16:26}" text-anchor="middle" style="font-size:9px">${fmt(tot)}</text>${xl('Total',x0+L.length*w+w/2,164,n,w)}</svg>`}
function radar(r,dim,ms){const ax=ms.slice(0,6);if(ax.length<3||!dim)return'<p class=cap>Needs 3+ measures and a category</p>';const gs=agg(r,dim).slice(0,3).map(x=>x[0]);
 const val=(g,m)=>{const v=r.filter(o=>String(o[dim])===g).map(o=>o[m.name]).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0};
 const V=gs.map(g=>ax.map(m=>val(g,m))),mxs=ax.map((_,i)=>Math.max(...V.map(v=>Math.abs(v[i])))||1),P=(i,k)=>{const t=i/ax.length*6.283-1.571;return[200+k*70*Math.cos(t),95+k*70*Math.sin(t)]};
 return`<svg viewBox="0 0 400 190">${[.5,1].map(k=>`<polygon points="${ax.map((_,i)=>P(i,k).join(',')).join(' ')}" fill="none" stroke="var(--bd)"/>`).join('')}${ax.map((m,i)=>{const[x,y]=P(i,1.15);return`<text x="${x}" y="${y}" text-anchor="middle">${esc(m.name.slice(0,12))}</text>`}).join('')}${gs.map((g,gi)=>`<polygon points="${ax.map((m,i)=>P(i,Math.abs(V[gi][i])/mxs[i]).join(',')).join(' ')}" fill="${COL[gi]}" fill-opacity=".2" stroke="${COL[gi]}"/>`).join('')}${gs.map((g,i)=>`<text x="4" y="${12+i*12}"><tspan fill="${COL[i]}">■</tspan> ${esc(g.slice(0,14))}</text>`).join('')}</svg>`}
function box(r,dim,m){if(!dim||!m)return'';const gs=agg(r,dim).slice(0,6).map(x=>x[0]);
 const D=gs.map(g=>{const a=r.filter(o=>String(o[dim])===g&&o[m]!=null).map(o=>o[m]).sort((x,y)=>x-y);if(a.length<2)return null;const q1=qs(a,.25),q3=qs(a,.75),i=q3-q1;return{g,q1,q3,md:qs(a,.5),lo:a.find(v=>v>=q1-1.5*i),hi:[...a].reverse().find(v=>v<=q3+1.5*i)}}),ok=D.filter(Boolean);if(!ok.length)return'';
 const mn=Math.min(...ok.map(d=>d.lo)),mx=Math.max(...ok.map(d=>d.hi)),Y=v=>160-(v-mn)/((mx-mn)||1)*140,w=370/D.length;
 return`<svg viewBox="0 0 400 190">${D.map((d,i)=>{if(!d)return'';const x=30+i*w,cx=x+(w-16)/2;return`<g><line x1="${cx}" x2="${cx}" y1="${Y(d.lo)}" y2="${Y(d.hi)}" stroke="var(--mut)"/><rect x="${x}" y="${Y(d.q3)}" width="${w-16}" height="${Math.max(1,Y(d.q1)-Y(d.q3))}" fill="${COL[i%6]}" opacity=".7" rx="2"/><line x1="${x}" x2="${x+w-16}" y1="${Y(d.md)}" y2="${Y(d.md)}" stroke="#fff" stroke-width="2"/><text x="${cx}" y="${Y(d.hi)-3}" text-anchor="middle" style="font-size:8.5px">med ${fmt(d.md)}</text><text x="${x}" y="176">${esc(d.g.slice(0,10))}</text></g>`}).join('')}<text x="0" y="24">${fmt(mx)}</text><text x="0" y="160">${fmt(mn)}</text></svg>`}
function bubble(r,a,b,z){if(!a||!b||!z)return'';const p=r.filter(o=>o[a]!=null&&o[b]!=null&&o[z]!=null).filter((_,i,A)=>i%Math.ceil(A.length/250)===0);if(!p.length)return'';
 const f=k=>p.map(o=>o[k]),x0=Math.min(...f(a)),x1=Math.max(...f(a)),y0=Math.min(...f(b)),y1=Math.max(...f(b)),zm=Math.max(...f(z).map(Math.abs))||1;
 return`<svg viewBox="0 0 400 190">${p.map(o=>`<circle cx="${20+(o[a]-x0)/((x1-x0)||1)*360}" cy="${170-(o[b]-y0)/((y1-y0)||1)*150}" r="${2+Math.sqrt(Math.abs(o[z])/zm)*12}" fill="${COL[3]}" opacity=".35"/>`).join('')}<text x="20" y="186">${esc(a)} · size: ${esc(z)}</text><text x="0" y="12">${esc(b)}</text></svg>`}
function pivot(r,d1,d2,m,fn){if(!d1||!d2)return'<p class=cap>Needs two category fields</p>';const A=agg(r,d1,m,fn).slice(0,8).map(x=>x[0]),B=agg(r,d2,m,fn).slice(0,6).map(x=>x[0]),T={};
 grp(r,o=>o[d1]==null||o[d2]==null?null:o[d1]+'|'+o[d2],m,fn).forEach(([k,v])=>T[k]=v);
 return`<div class="scroll"><table><tr><th>${esc(d1)} ↓ ${esc(d2)}</th>${B.map(b=>`<th>${esc(b)}</th>`).join('')}</tr>${A.map(a=>`<tr><th>${esc(a)}</th>${B.map(b=>`<td>${T[a+'|'+b]==null?'':fmt(T[a+'|'+b])}</td>`).join('')}</tr>`).join('')}</table></div>`}
function cohort(r,ec,dc){if(!ec||!dc)return'';const key=d=>d.getFullYear()*12+d.getMonth(),first={},M={},ok=o=>o[dc.name] instanceof Date&&!isNaN(o[dc.name])&&o[ec.name]!=null;
 r.forEach(o=>{if(!ok(o))return;const k=key(o[dc.name]),e=o[ec.name];if(first[e]==null||k<first[e])first[e]=k});
 r.forEach(o=>{if(!ok(o))return;const e=o[ec.name],c=first[e],row=M[c]=M[c]||{},off=key(o[dc.name])-c;(row[off]=row[off]||new Set()).add(e)});
 const cs=Object.keys(M).map(Number).sort((a,b)=>a-b).slice(0,10),offs=[0,1,2,3,4,5,6];
 return`<div class="scroll"><table class="heat"><tr><th>Cohort (first ${esc(ec.name)} month) · active entities</th>${offs.map(o=>`<th>M+${o}</th>`).join('')}</tr>${cs.map(c=>{const n0=M[c][0]?.size||1;return`<tr><th>${Math.floor(c/12)}-${String(c%12+1).padStart(2,'0')} (${n0})</th>${offs.map(o=>{const n=M[c][o]?.size;return n==null?'<td></td>':`<td style="background:rgba(37,99,235,${.15+.85*n/n0})">${Math.round(n/n0*100)}%</td>`}).join('')}</tr>`}).join('')}</table></div>`}

function clusterChart(cl){if(!cl)return['<p class=cap>Needs 2+ numeric fields and 80+ rows</p>',''];const X=cl.X;
 return[`<svg viewBox="0 0 400 190">${X.map((x,i)=>`<circle cx="${20+(Math.max(-3,Math.min(3,x[0]))+3)/6*250}" cy="${170-(Math.max(-3,Math.min(3,x[1]))+3)/6*150}" r="3" fill="${COL[cl.lab[i]%6]}" opacity=".65"/>`).join('')}${cl.groups.map((g,i)=>`<text x="285" y="${20+i*24}"><tspan fill="${COL[g.id%6]}">●</tspan> ${(g.share*100).toFixed(0)}% </text><text x="285" y="${31+i*24}" style="font-size:8px">${esc(g.desc.slice(0,28))}</text>`).join('')}<text x="20" y="186">${esc(cl.ms[0].name)} →</text><text x="0" y="12">${esc(cl.ms[1].name)} ↑ (standardised)</text></svg>`,`${cl.k} segments (silhouette ${cl.sil.toFixed(2)}) using ${cl.ms.map(c=>c.name).join(', ')}.`]}
function localRows(w,r){const F=Object.entries(w.lf||{}).filter(([,v])=>v.length).map(([c,v])=>[c,new Set(v)]);return F.length?r.filter(o=>F.every(([c,s])=>s.has(String(o[c])))):r}
function catVals(c){S.cv=S.cv||{};if(!S.cv[c]){const f={};S.rows.forEach(o=>{const v=o[c];if(v!=null)f[v]=(f[v]||0)+1});S.cv[c]=Object.entries(f).sort(C(c)?.order?(a,b)=>C(c).order.indexOf(a[0])-C(c).order.indexOf(b[0]):(a,b)=>b[1]-a[1]).slice(0,60)}return S.cv[c]}

/* ---- widget rendering: returns [chartHTML, AI caption] ---- */
function wrender(w,r){const D=C(w.dim),isD=D?.type==='date',fnm=w.m?(w.ag||defAg(w.m)):'count',ml=w.m?`${AGL[fnm].toLowerCase()} of ${w.m}`:'count';let a=[];
 if(!NODIM.includes(w.type)&&D&&!isD){a=agg(r,w.dim,w.m||undefined,w.ag||undefined);if(w.asc)a.reverse()}
 const all=a.reduce((s,x)=>s+x[1],0)||1,best=D&&D.order?[...a].sort((x,y)=>w.asc?x[1]-y[1]:y[1]-x[1])[0]:a[0],share=['sum','count'].includes(fnm),lead=best?(share?`${best[0]} ${w.asc?'is lowest':'leads'} ${w.dim} with ${(Math.abs(best[1])/Math.abs(all)*100).toFixed(0)}% of ${ml}; ${a.length} groups in total.`:`${best[0]} has the ${w.asc?'lowest':'highest'} ${ml} (${fmt(best[1])}) among ${a.length} groups.`):'',top=a.slice(0,w.n||10);
 switch(w.type){
 case'bar':return[bar(top,w.dim),lead];case'column':return[col(top,w.dim),lead];case'donut':return[donut(a),lead];
 case'treemap':return[treemap(a,w.dim),lead];case'funnel':return[funnel(a,w.dim),lead];case'waterfall':return[waterfall(a),`Cumulative build-up of ${ml} by ${w.dim}.`];
 case'line':case'area':{const p=isD?trend(r,w.dim,w.m||undefined,w.ag||undefined):top;if(p.length<2)return['<p class=cap>Not enough periods</p>',''];const pk=p.reduce((b,x)=>x[1]>b[1]?x:b),ch=(p.at(-1)[1]-p[0][1])/(Math.abs(p[0][1])||1)*100;
  return[line(p,isD,w.type==='area'),`${ml} ${ch>=0?'rose':'fell'} ${Math.abs(ch).toFixed(0)}% from ${p[0][0]} to ${p.at(-1)[0]}, peaking at ${pk[0]}. Green = 3-pt moving avg, dashed = forecast.`]}
 case'hist':{const c=C(w.m);return[c?hist(r.map(o=>o[w.m]).filter(v=>v!=null)):'',c?`Median ${fmt(c.median)}; ${c.skew>1?'right-skewed':c.skew<-1?'left-skewed':'roughly symmetric'}; ${c.outliers} outliers.`:'']}
 case'scatter':return[scatter(r,w.m,w.y),`Pearson r = ${pearson(r,w.m,w.y).toFixed(2)} between ${w.m} and ${w.y}.`];
 case'bubble':return[bubble(r,w.m,w.y,w.z),`Bubble size shows ${w.z}.`];
 case'heatmap':return[heat(r,measures()),'Blue = positive, red = negative correlation.'];
 case'radar':return[radar(r,w.dim,measures()),`Top 3 ${w.dim} groups compared on normalised averages.`];
 case'box':return[box(r,w.dim,w.m),`Spread of ${ml} within top ${w.dim} groups (box = IQR, white line = median).`];
 case'pivot':return[pivot(r,w.dim,w.dim2,w.m||undefined,w.ag||undefined),`${ml} by ${w.dim} × ${w.dim2}.`];
 case'season':{const se=seasonality(r,C(w.m));return se?[col(se.labels.map((l,i)=>[l,se.idx[i]]),''),se.cap]:['<p class=cap>Needs a date field spanning 6+ weeks with a clear pattern</p>','']}
 case'cluster':return clusterChart(clusterize(r));
 case'cohort':return[cohort(r,entityCol(),dateCol()),`Share of each cohort's ${entityCol()?.name} still active in following months.`]}
 return['','']}
function wframe(w,r0){let b,cap;const r=localRows(w,r0),mc=C(w.m);_pf=mc&&isFrac(mc)&&!NOM.includes(w.type)&&!['scatter','bubble','radar','box'].includes(w.type)&&(w.ag||defAg(w.m))!=='count'?v=>(v*100).toFixed(1)+'%':null;try{[b,cap]=wrender(w,r)}finally{_pf=null}const ds=[...dimsAll(),...S.cols.filter(c=>c.type==='date')].map(c=>c.name),ms=numCols().map(c=>c.name),
 op=(l,v)=>l.map(x=>`<option${x===v?' selected':''}>${esc(x)}</option>`).join(''),sel=(f,l,v)=>`<select data-wf="${f}">${op(l,v)}</select>`,
 cats=ALL().filter(c=>(c.type==='category'||c.type==='boolean')&&c.distinct>1).map(c=>c.name),lc=cats.includes(w.lfCol)?w.lfCol:(cats.includes(w.dim)?w.dim:cats[0]),
 nF=Object.values(w.lf||{}).reduce((s,v)=>s+v.length,0),title=`${WT[w.type]}${NOM.includes(w.type)?'':' · '+esc(w.m?AGL[w.ag||defAg(w.m)]+' of '+w.m:'count')}${NODIM.includes(w.type)?'':' by '+esc(w.dim)}`;
 const cfg=`<div class="wp"><select data-wf="type">${Object.entries(WT).map(([k,v])=>`<option value="${k}"${k===w.type?' selected':''}>${v}</option>`).join('')}</select>${NODIM.includes(w.type)?'':sel('dim',ds,w.dim)}${NOM.includes(w.type)?'':`<select data-wf="m"><option value="">count</option>${op(ms,w.m)}</select>`}${AGT.includes(w.type)&&w.m?`<select data-wf="ag" title="Aggregation">${[['','Auto'],['sum','Sum'],['avg','Average'],['median','Median'],['min','Min'],['max','Max'],['count','Count']].map(([k,l])=>`<option value="${k}"${(w.ag||'')===k?' selected':''}>${l}</option>`).join('')}</select>`:''}${['scatter','bubble'].includes(w.type)?sel('y',ms,w.y):''}${w.type==='bubble'?sel('z',ms,w.z):''}${w.type==='pivot'?sel('dim2',dims().map(c=>c.name),w.dim2):''}${['bar','column','funnel'].includes(w.type)?`<label class="nn">Top <input type="number" min="3" max="30" value="${w.n||10}" data-wf="n"></label>`:''}</div>`;
 const flt=`<div class="wp"><div class="wpt"><b>Filter this chart only</b><button class="lnk" data-a="lfc">Clear</button></div>${sel('lfCol',cats,lc)}<div class="chips">${catVals(lc).map(([v,n])=>`<button class="chip${(w.lf?.[lc]||[]).includes(v)?' on':''}" data-a="lf" data-lc="${esc(lc)}" data-lv="${esc(v)}">${esc(v)} <em>${n}</em></button>`).join('')}</div></div>`;
 const lp=Object.entries(w.lf||{}).filter(([,v])=>v.length).map(([c,v])=>`<span class="lp">${esc(c)}: ${v.map(esc).join(', ')}</span>`).join('');
 return`<div class="card wd" draggable="true" data-w="${w.id}" style="grid-column:span ${w.span}"><div class="wh"><h3>${title}</h3><div class="wact"><button data-a="flt" class="${nF?'act':''}" title="Filter this chart">⏷${nF?`<sup>${nF}</sup>`:''}</button><button data-a="cfg" title="Chart settings">⚙</button><button data-a="sz" title="Resize">⇔</button><button data-a="dup" title="Duplicate">⧉</button><button data-a="png" title="PNG">⬇</button><button data-a="rm" title="Remove">✕</button></div></div>${w.open?cfg:''}${w.fo?flt:''}${lp?`<div class="lps">${lp}</div>`:''}${b}<div class="cap">✦ ${esc(cap)}</div></div>`}
const LS={get:()=>{try{return JSON.parse(localStorage.getItem('il_layouts')||'{}')}catch{return{}}},set:o=>{try{localStorage.setItem('il_layouts',JSON.stringify(o))}catch{}}};
function widgetsHTML(r){const L=Object.keys(LS.get());
 return`<div class="card tbar"><select id="nt">${Object.entries(WT).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><button class="btn" data-a="add">+ Add widget</button><button class="btn" data-a="save">Save layout</button><select id="wl"><option value="">Load layout…</option>${L.map(n=>`<option>${esc(n)}</option>`).join('')}</select><button class="btn" data-a="exp">Export config</button><label class="btn">Import config<input id="imp" type="file" accept=".json" hidden></label><button class="btn" data-a="auto">Auto layout</button></div>${W.note?`<div class="card ins">${esc(W.note)}</div>`:''}<div class="grid">${W.list.map(w=>wframe(w,r)).join('')}</div>`}

/* ---- Natural-language assistant: turns questions into dashboard widgets + filters ---- */
function ask(q){q=q.toLowerCase();const A=ALL(),nm=c=>(c.derived?c.src:c.name).toLowerCase(),has=c=>q.includes(nm(c))||q.includes(nm(c).replace(/s$/,'')),dc=dateCol(),n=+(q.match(/\b(\d+)\b/)||[0,10])[1],
 band=/band|bucket|slab|\brange\b|group/.test(q),cnt=/\b(count|number of|how many)\b/.test(q),
 ag=/\b(average|avg|mean)\b/.test(q)?'avg':/median/.test(q)?'median':/\b(minimum|min)\b/.test(q)?'min':/\b(maximum|max)\b/.test(q)?'max':/\b(total|sum)\b/.test(q)?'sum':'',
 stop=/^(name|value|type|date|order|number|total|count)$/,sc=c=>q.includes(nm(c))?10:nm(c).split(/[^a-z0-9]+/).filter(x=>x.length>=4&&!stop.test(x)&&new RegExp('\\b'+x).test(q)).length,best=l=>l.map(c=>[sc(c),c]).filter(x=>x[0]>0).sort((a,b)=>b[0]-a[0])[0]?.[1],
 d=band?(A.filter(c=>c.derived&&has(c))[0]||A.find(c=>c.derived)):(best(dimsAll().filter(c=>!c.derived))||dims().find(c=>!c.derived)),
 ms=numCols().filter(has).filter(c=>!(band&&d&&c.name===d.src)),m=cnt?null:(ms[0]||(band?null:measures()[0])),mn=m?.name||'';let w;
 if(/last year|last 12|past year/.test(q)&&dc){let mx=0;S.rows.forEach(o=>{const t=+o[dc.name];if(t>mx)mx=t});S.rng[dc.name]=[mx-365*864e5,null];const bd=bounds(dc).a;S.slp[dc.name]=[Math.max(0,Math.round((mx-365*864e5-bd[0])/((bd.at(-1)-bd[0])||1)*1000)),1000];buildFilters()}
 if(/trend|over time|monthly|growth|last year/.test(q)&&dc)w=mk('area',{dim:dc.name,m:mn,ag,span:2});
 else if(/correlat|relationship|\bvs\b|versus/.test(q)&&ms.length>1)w=mk('scatter',{m:ms[0].name,y:ms[1].name});
 else if(/distribut|histogram|spread/.test(q)&&(ms[0]||measures()[0]))w=mk('hist',{m:(ms[0]||measures()[0]).name});
 else if(/share|proportion|split/.test(q)&&d)w=mk('donut',{dim:d.name,m:mn,ag});
 else if(/declin|lowest|bottom|worst|least/.test(q)&&d)w=mk('bar',{dim:d.name,m:mn,ag,asc:1,n});
 else if(/compare|comparison/.test(q)&&d)w=mk('column',{dim:d.name,m:mn,ag,n:12});
 else if(d)w=mk('bar',{dim:d.name,m:mn,ag,n});
 if(!w){W.note='Try: "top 10 clients", "average PM% by cus type", "count by order value band", "trend last year", "lowest bid model", "distribution of amount".';return render()}
 W.list.unshift(w);W.note=`Added "${WT[w.type]}" widget from your question: "${q}".`;render();M.querySelector('.grid')?.scrollIntoView({behavior:'smooth'})}

/* ---- Executive report / storytelling ---- */
function reportText(ins,r){const m=measures()[0],bad=S.cols.filter(c=>c.nullPct>20).length,P=[`Executive report – ${S.name}`,`Scope: ${r.length.toLocaleString('en-US')} of ${S.rows.length.toLocaleString('en-US')} records across ${S.cols.length} fields are in view; ${bad} field(s) exceed 20% missing values.`];
 if(m)P.push(`Headline: total ${m.name} is ${fmt(r.reduce((a,o)=>a+(o[m.name]||0),0))} (average ${fmt(m.mean)} per record).`);
 ins.filter(i=>!i.q).slice(0,5).forEach((i,k)=>P.push(`Finding ${k+1}: ${i.t} (confidence ${i.conf}%)`));recs(ins).forEach((x,k)=>P.push(`Action ${k+1}: ${x}`));return P}
function reportHTML(ins,r){const P=reportText(ins,r);return`<div class="card rep"><h3>Executive report &amp; story <button class="btn" data-a="rep">Download</button></h3><p><b>${esc(P[0])}</b></p>${P.slice(1).map(p=>`<p>${esc(p)}</p>`).join('')}</div>`}

/* ---- Data model: relationships, hierarchies, lineage ---- */
function hdrOf(aoa){const A=aoa.filter(r=>r.some(v=>v!=null)),w=Math.max(...A.slice(0,15).map(r=>r.filter(v=>v!=null).length)),h=A.findIndex((r,i)=>i<15&&r.filter(v=>typeof v==='string').length>=.6*w);return(A[Math.max(0,h)]||[]).filter(v=>v!=null).map(v=>String(v).trim())}
function calcHier(){const ds=dims().filter(c=>!c.derived).slice(0,8),out=[];ds.forEach(a=>ds.forEach(b=>{if(a===b||b.distinct<=a.distinct)return;const m=new Map();let ok=true;for(const o of S.rows){const y=o[b.name],x=o[a.name];if(y==null||x==null)continue;if(m.has(y)&&m.get(y)!==x){ok=false;break}m.set(y,x)}if(ok)out.push(`${a.name} → ${b.name}`)}));return out}
function modelHTML(){const sh=Object.keys(S.wb),H=Object.fromEntries(sh.map(n=>[n,hdrOf(S.wb[n]).map(x=>x.toLowerCase())])),E=[];
 sh.forEach((a,i)=>sh.slice(i+1).forEach(b=>{const c=H[a].filter(x=>H[b].includes(x));if(c.length)E.push([a,b,c])}));
 const pos=sh.map((_,i)=>[200+(sh.length>1?140:0)*Math.cos(i/sh.length*6.283),95+(sh.length>1?65:0)*Math.sin(i/sh.length*6.283)]);
 const svg=`<svg viewBox="0 0 400 190">${E.map(([a,b,c])=>{const p=pos[sh.indexOf(a)],q=pos[sh.indexOf(b)];return`<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="var(--mut)"/><text x="${(p[0]+q[0])/2}" y="${(p[1]+q[1])/2}">${esc(c.slice(0,2).join(', '))}</text>`}).join('')}${sh.map((n,i)=>`<circle cx="${pos[i][0]}" cy="${pos[i][1]}" r="7" fill="${n===S.cur?COL[1]:COL[0]}"/><text x="${pos[i][0]}" y="${pos[i][1]+18}" text-anchor="middle">${esc(n.slice(0,22))}</text>`).join('')}</svg>`;
 if(!S.hier)S.hier=calcHier();const keys=S.cols.filter(c=>c.isKey).map(c=>c.name),fk=S.cols.filter(c=>c.type==='category'&&/(^|\W|_)(id|code|ref)\b/i.test(c.name)).map(c=>c.name);
 return`${sec('s-model','🧬','Data Model & Lineage','Sheet relationships, keys, hierarchies and lineage')}<div class="grid">${card('Sheet relationship graph',svg,E.length?`${E.length} shared-column link(s) between sheets`:'No shared columns between sheets')}${card('Discovered structure',`<p><b>Lineage:</b> ${esc(S.name)} → ${sh.length} sheet(s) → “${esc(S.cur)}” (${S.rows.length.toLocaleString('en-US')} rows, ${S.cols.length} cols) → ${W.list.length} widgets</p><p><b>Primary-key candidates:</b> ${esc(keys.join(', ')||'none')}</p><p><b>Foreign-key-like:</b> ${esc(fk.join(', ')||'none')}</p><p><b>Hierarchies:</b> ${esc(S.hier.slice(0,8).join('; ')||'none detected')}</p>`)}</div>`}

/* ---- events: widget toolbar, drag & drop, layouts, exports ---- */
function png(id){const s=M.querySelector(`[data-w="${id}"] svg`);if(!s)return alert('This widget is a table; use Excel/CSV export.');const cs=getComputedStyle(document.body),v=k=>cs.getPropertyValue('--'+k).trim();
 let x=new XMLSerializer().serializeToString(s).replace(/var\(--(c\d|tx|bd|mut)\)/g,(m,k)=>v(k)).replace(/(<svg[^>]*>)/,`$1<style>text{fill:${v('tx')};font:10px sans-serif}</style>`);
 if(!/xmlns=/.test(x))x=x.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');const vb=s.viewBox.baseVal,img=new Image();
 img.onload=()=>{const c=document.createElement('canvas');c.width=vb.width*3;c.height=vb.height*3;const g=c.getContext('2d');g.fillStyle=v('bg')||'#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);c.toBlob(b=>dl(b,'chart.png'))};img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(x)}
M.addEventListener('change',e=>{const t=e.target,wd=t.closest('[data-w]');if(t.dataset.wf){const w=W.list.find(x=>x.id===+wd.dataset.w);w[t.dataset.wf]=t.dataset.wf==='n'?+t.value:t.value;if(t.dataset.wf==='type'&&['line','area'].includes(t.value)&&!C(w.dim)?.type!=='date'){const dc=dateCol();if(dc&&C(w.dim)?.type!=='date')w.dim=dc.name}render()}
 else if(t.id==='wl'&&t.value){const l=LS.get()[t.value];if(l){W.list=JSON.parse(JSON.stringify(l));W.nid=Math.max(...W.list.map(x=>x.id),0)+1;render()}}
 else if(t.id==='imp'&&t.files[0]){const rd=new FileReader();rd.onload=()=>{try{const c=JSON.parse(rd.result);W.list=c.widgets;W.nid=Math.max(...W.list.map(x=>x.id),0)+1;S.filt=Object.fromEntries(Object.entries(c.filters||{}).map(([k,a])=>[k,new Set(a)]));S.rng=c.rng||{};S.q=c.search||'';$('#q').value=S.q;buildFilters();render()}catch(x){alert('Invalid config')}};rd.readAsText(t.files[0])}});
M.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,id=+b.closest('[data-w]')?.dataset.w,i=W.list.findIndex(x=>x.id===id);
 if(a==='rm')W.list.splice(i,1);else if(a==='cfg')W.list[i].open=!W.list[i].open;else if(a==='flt')W.list[i].fo=!W.list[i].fo;else if(a==='lfc')W.list[i].lf={};else if(a==='lf'){const w=W.list[i];w.lf=w.lf||{};const arr=w.lf[b.dataset.lc]=w.lf[b.dataset.lc]||[],k=arr.indexOf(b.dataset.lv);k<0?arr.push(b.dataset.lv):arr.splice(k,1)}else if(a==='dup')W.list.splice(i+1,0,{...W.list[i],id:W.nid++});else if(a==='sz')W.list[i].span=W.list[i].span%3+1;else if(a==='png')return png(id);
 else if(a==='add')W.list.push(mk($('#nt').value));else if(a==='auto')autoWidgets();
 else if(a==='save'){const n=prompt('Layout name');if(!n)return;const L=LS.get();L[n]=W.list;LS.set(L);toast('Layout saved')}
 else if(a==='exp')return dl(new Blob([JSON.stringify({file:S.name,sheet:S.cur,widgets:W.list,filters:Object.fromEntries(Object.entries(S.filt).map(([k,v])=>[k,[...v]])),rng:S.rng,search:S.q},null,1)],{type:'application/json'}),'dashboard-config.json');
 else if(a==='rep'){const P=reportText(insights(rows()),rows());return dl(new Blob([`<meta charset=utf-8><body style="font:15px/1.6 sans-serif;max-width:760px;margin:40px auto"><h1>${esc(P[0])}</h1>${P.slice(1).map(p=>`<p>${esc(p)}</p>`).join('')}`],{type:'text/html'}),'executive-report.html')}
 W.note='';render()});
M.addEventListener('dragstart',e=>{const c=e.target.closest?.('.wd');if(c)W.drag=+c.dataset.w});
M.addEventListener('dragover',e=>{if(e.target.closest?.('.wd'))e.preventDefault()});
M.addEventListener('drop',e=>{const c=e.target.closest?.('.wd');if(!c||W.drag==null)return;e.preventDefault();const f=W.list.findIndex(x=>x.id===W.drag),t=W.list.findIndex(x=>x.id===+c.dataset.w);if(f<0||t<0)return;W.list.splice(t,0,W.list.splice(f,1)[0]);W.drag=null;render()});
document.getElementById('xls').onclick=()=>{const r=rows();dl(new Blob([`<meta charset=utf-8><table><tr>${S.cols.map(c=>`<th>${esc(c.name)}</th>`).join('')}</tr>${r.map(o=>`<tr>${S.cols.map(c=>`<td>${esc(dstr(o[c.name]))}</td>`).join('')}</tr>`).join('')}</table>`],{type:'application/vnd.ms-excel'}),'export.xls')};
const PAL={Ocean:['#2563eb','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4'],Sunset:['#f97316','#e11d48','#eab308','#a855f7','#14b8a6','#3b82f6'],Forest:['#059669','#65a30d','#0891b2','#d97706','#7c3aed','#dc2626'],Mono:['#334155','#64748b','#94a3b8','#0f766e','#475569','#1e293b']};
document.getElementById('pal').innerHTML=Object.keys(PAL).map(k=>`<option>${k}</option>`).join('');
document.getElementById('pal').onchange=e=>{const s=document.documentElement.style;PAL[e.target.value].forEach((c,i)=>s.setProperty('--c'+(i+1),c));s.setProperty('--ac',PAL[e.target.value][0])};
