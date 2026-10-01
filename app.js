'use strict';
/* InsightLens – client-side analytics. Modules: Ingest → Profile → Insights → Charts → UI */
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let _pf=null;const fmt=n=>_pf&&typeof n==='number'&&!isNaN(n)?_pf(n):fmt0(n),fmt0=n=>{if(n==null||isNaN(n))return'–';const a=Math.abs(n),u=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']].find(x=>a>=x[0]);return u?(n/u[0]).toFixed(2)+u[1]:String(+(+n).toFixed(2))};
const COL=['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)','var(--c6)'];
const S={wb:{},rows:[],cols:[],filt:{},rng:{},q:'',sort:null,shown:200,name:''};

/* ---------- INGEST ---------- */
function parseCSV(t){const r=[];let row=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];
 if(q){if(ch=='"'&&t[i+1]=='"'){c+='"';i++}else if(ch=='"')q=false;else c+=ch}
 else if(ch=='"')q=true;else if(ch==','){row.push(c);c=''}else if(ch=='\n'||ch=='\r'){if(ch=='\r'&&t[i+1]=='\n')i++;row.push(c);r.push(row);row=[];c=''}else c+=ch}
 if(c||row.length){row.push(c);r.push(row)}return r}
function loadFile(f){const rd=new FileReader(),ext=(f.name.match(/\.(\w+)$/)||[])[1]?.toLowerCase();
 rd.onload=async e=>{try{S.wb={};const ab=e.target.result;
  if(ext==='csv')S.wb[f.name]=parseCSV(new TextDecoder().decode(ab)).map(r=>r.map(v=>v===''?null:v));
  else if(ext==='xlsx'||ext==='xlsm')S.wb=await readXlsx(ab);
  else if(typeof XLSX!=='undefined'){const wb=XLSX.read(ab,{type:'array',cellDates:true});wb.SheetNames.forEach(n=>S.wb[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null}))}
  else return alert('Legacy .xls needs the optional SheetJS file (lib/xlsx.full.min.js). Please save as .xlsx or .csv instead.');
  const names=Object.keys(S.wb).filter(n=>S.wb[n].length>1);if(!names.length)throw new Error('No data found');
  $('#sheet').innerHTML=names.map(n=>`<option>${esc(n)}</option>`).join('');S.name=f.name;useSheet(names[0])}
  catch(err){alert('Could not read file: '+err.message)}};rd.readAsArrayBuffer(f)}
function useSheet(n){S.cur=n;S.dr=null;S.hier=null;S.rng={};S.slp={};S.bd=null;S.cv={};S.clk=null;S.fresh=true;const aoa=S.wb[n].filter(r=>r.some(v=>v!=null&&v!==''));
 // header detection: first row (of top 15) with >=60% string cells of max width
 const w=Math.max(...aoa.slice(0,15).map(r=>r.filter(v=>v!=null).length));
 let h=aoa.findIndex((r,i)=>i<15&&r.filter(v=>typeof v==='string').length>=.6*w&&r.filter(v=>v!=null).length>=.6*w);if(h<0)h=0;
 const seen={},names=aoa[h].map((v,i)=>{let s=String(v??'Column '+(i+1)).trim(),k=s;while(seen[k])k=s+'_'+(++seen[s]);seen[k]=1;return k});
 const body=aoa.slice(h+1);S.cols=names.map((nm,i)=>profile(nm,body.map(r=>r[i]??null)));
 S.rows=body.map((r,ri)=>{const o={};S.cols.forEach((c,i)=>o[c.name]=c.vals[ri]);return o});
 normPct();S.cols.forEach(c=>delete c.vals);addBands();S.filt={};S.q='';$('#q').value='';S.sort=null;S.shown=200;
 $('#meta').textContent=`${S.rows.length.toLocaleString('en-US')} rows × ${S.cols.length} cols`;buildFilters();autoWidgets();render()}

/* ---------- PROFILE ---------- */
const dateRe=/^\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}$/;
function profile(name,raw){raw=raw.map(v=>typeof v==='string'&&/^(-+|–|n\/?a|null|none|nil)?$/i.test(v.trim())?null:v);const nn=raw.filter(v=>v!=null&&String(v).trim()!==''),n=raw.length,ratio=f=>nn.length?nn.filter(f).length/nn.length:0;
 let type='text',vals=raw.map(v=>v===undefined||(typeof v==='string'&&v.trim()==='')?null:v);
 const numStr=v=>typeof v==='number'||(typeof v==='string'&&/^-?[\d,]*\.?\d+%?$/.test(v.trim()));
 if(ratio(v=>v instanceof Date||(typeof v==='string'&&dateRe.test(v.trim())))>.8){type='date';vals=vals.map(v=>v==null?null:v instanceof Date?v:new Date(v))}
 else if(ratio(numStr)>.8){type='number';vals=vals.map(v=>v==null?null:typeof v==='number'?v:parseFloat(String(v).replace(/[,%]/g,''))).map(v=>isNaN(v)?null:v)}
 else{const d=new Set(nn.map(String));if(d.size<=2&&nn.every(v=>/^(true|false|yes|no|y|n|0|1)$/i.test(v)))type='boolean';else if(d.size<=Math.max(40,n*.05))type='category'}
 if(type==='category'||type==='boolean'){const f={};vals.forEach(v=>{if(v==null)return;const k=String(v).trim().replace(/\s+/g,' '),l=k.toLowerCase();((f[l]=f[l]||{})[k]=(f[l][k]||0)+1)});const best={};for(const l in f)best[l]=Object.entries(f[l]).sort((a,b)=>b[1]-a[1])[0][0];vals=vals.map(v=>v==null?null:best[String(v).trim().replace(/\s+/g,' ').toLowerCase()])}
 const nulls=raw.filter(v=>v==null).length,blank=raw.filter(v=>typeof v==='string'&&v.trim()==='').length;
 const p={name,type,n,nulls,nullPct:(nulls+blank)/n*100,blankPct:blank/n*100,distinct:new Set(vals.filter(v=>v!=null).map(String)).size,vals};
 p.isKey=p.distinct===n-nulls&&n>1&&(type==='text'||/(^|_|\s)(id|no|number|code)$/i.test(name));
 p.semantic=/%|percent|pct|rate/i.test(name)?'percentage':/amount|revenue|price|cost|value|sales|fee|budget|inr|usd|₹|\$/i.test(name)?'currency':/country|state|city|region|zip|location|district/i.test(name)?'geographic':p.isKey?'key':type;
 if(type==='number'){const a=vals.filter(v=>v!=null).sort((x,y)=>x-y),m=a.length,q=f=>m?a[Math.min(m-1,Math.floor(f*(m-1)))]:null;
  Object.assign(p,{min:a[0],max:a[m-1],mean:a.reduce((s,v)=>s+v,0)/m,median:q(.5),q1:q(.25),q3:q(.75),sum:a.reduce((s,v)=>s+v,0)});
  p.variance=a.reduce((s,v)=>s+(v-p.mean)**2,0)/Math.max(1,m-1);p.std=Math.sqrt(p.variance);
  p.skew=p.std?a.reduce((s,v)=>s+((v-p.mean)/p.std)**3,0)/m:0;const iq=p.q3-p.q1;p.outliers=a.filter(v=>v<p.q1-1.5*iq||v>p.q3+1.5*iq).length}
 return p}
const ALL=()=>S.dcols?[...S.cols,...S.dcols]:S.cols,C=n=>ALL().find(c=>c.name===n),measures=()=>S.cols.filter(c=>c.type==='number'&&!c.isKey&&!/version|\bref\b|serial|sr\.? ?no/i.test(c.name)&&c.nullPct<60&&c.distinct>1).sort((a,b)=>{const sc=c=>(/\b(eur|usd|gbp|converted|normali[sz]ed)\b/i.test(c.name)?2:0)+(c.semantic==='currency'?1:0)-(/base currency|local/i.test(c.name)?2:0);return sc(b)-sc(a)||a.nullPct-b.nullPct});
const dims=()=>ALL().filter(c=>c.type==='category'&&c.distinct>=2&&c.distinct<=30&&c.nullPct<70).sort((a,b)=>(a.derived?1:0)-(b.derived?1:0)||(a.distinct<3)-(b.distinct<3)||a.distinct-b.distinct);
const dateCol=()=>S.cols.find(c=>c.type==='date'&&c.nullPct<70);

/* ---------- NUMERIC BANDS & AGGREGATION ---------- */
const numCols=()=>S.cols.filter(c=>c.type==='number'&&!c.isKey&&c.distinct>1&&c.nullPct<95);
const isFrac=c=>!!c&&c.semantic==='percentage'&&c.type==='number'&&Math.abs(c.q1)<=1.5&&Math.abs(c.q3)<=1.5,mixed=c=>isFrac(c)&&(c.max>1.5||c.min<-1.5);
const defAg=x=>{const c=typeof x==='string'?C(x):x;return c&&c.semantic==='percentage'?'avg':'sum'};   // never sum percentages
const sortBand=(c,a,b)=>c.order?c.order.indexOf(a)-c.order.indexOf(b):(a<b?-1:a>b?1:0);
/* Every numeric column also becomes an analysable dimension: "X (band)" = 5 equal-frequency ranges (or its distinct values when few). */
function addBands(){S.dcols=[];numCols().filter(c=>c.distinct>=3).forEach(c=>{const nn=S.rows.map(o=>o[c.name]).filter(v=>v!=null).sort((a,b)=>a-b);if(nn.length<10)return;
 const F=v=>isFrac(c)?(+(v*100).toFixed(1))+'%':fmt0(v),uniq=[...new Set(nn)];let cuts,labs,binf;
 if(uniq.length<=8){labs=uniq.map(F);binf=v=>labs[uniq.indexOf(v)]}
 else{cuts=[];for(let i=1;i<5;i++){const q=nn[Math.floor(i/5*(nn.length-1))];if(!cuts.length||q>cuts.at(-1))cuts.push(q)}
  labs=Array.from({length:cuts.length+1},(_,i)=>i===0?`≤ ${F(cuts[0])}`:i===cuts.length?`> ${F(cuts[i-1])}`:`${F(cuts[i-1])} – ${F(cuts[i])}`);labs=labs.map((l,i)=>labs.indexOf(l)===i?l:l+' #'+(i+1));
  binf=v=>{const i=cuts.findIndex(q=>v<=q);return labs[i<0?cuts.length:i]}}
 const name=c.name+' (band)',vals=S.rows.map(o=>{const v=o[c.name];return o[name]=v==null?null:binf(v)});
 const p=profile(name,vals);delete p.vals;Object.assign(p,{type:'category',semantic:'band',derived:true,src:c.name,order:labs,isKey:false});S.dcols.push(p)})}
const med=v=>{if(!v.length)return 0;const q=[...v].sort((a,b)=>a-b);return q[Math.floor(q.length/2)]};
function grp(r,keyf,m,fn){fn=fn||defAg(m);const need=/median|min|max/.test(fn),g=new Map();
 r.forEach(o=>{const k=keyf(o);if(k==null)return;let a=g.get(k);if(!a)g.set(k,a={s:0,c:0,n:0,v:need?[]:null});a.c++;if(m){const v=o[m];if(v!=null&&!isNaN(v)){a.s+=v;a.n++;if(need)a.v.push(v)}}});
 const val=a=>!m?a.c:fn==='avg'?(a.n?a.s/a.n:0):fn==='count'?a.n:fn==='median'?med(a.v):fn==='min'?a.v.reduce((x,y)=>Math.min(x,y),Infinity):fn==='max'?a.v.reduce((x,y)=>Math.max(x,y),-Infinity):a.s;
 return[...g].map(([k,a])=>[k,val(a)])}

/* Percent columns that mix scales (0.29 and 68) are repaired: whole-number entries are divided by 100 and reported in Data Quality. */
function normPct(){S.cols=S.cols.map(c=>{if(!mixed(c))return c;let n=0;S.rows.forEach(o=>{const v=o[c.name];if(typeof v==='number'&&Math.abs(v)>1.5){o[c.name]=v/100;n++}});const p=profile(c.name,S.rows.map(o=>o[c.name]));p.fixedN=n;return p})}
const dimsAll=()=>[...dims(),...S.cols.filter(c=>(c.type==='text'||c.type==='category')&&!c.isKey&&c.distinct>=2&&c.distinct<=.5*c.n&&c.nullPct<80&&!dims().includes(c))];

/* ---------- FILTERING ---------- */
function rows(){const q=S.q.toLowerCase();let r=S.rows.filter(o=>Object.entries(S.filt).every(([k,s])=>!s.size||s.has(String(o[k])))&&Object.entries(S.rng).every(([k,[lo,hi]])=>{let v=o[k];if(v==null)return true;v=+v;return(lo==null||v>=lo)&&(hi==null||v<=hi)})&&(!q||S.cols.some(c=>String(o[c.name]??'').toLowerCase().includes(q))));
 if(S.sort){const{k,d}=S.sort;r=[...r].sort((a,b)=>(a[k]>b[k]?1:a[k]<b[k]?-1:0)*d)}return r}
function bounds(c){S.bd=S.bd||{};if(S.bd[c.name])return S.bd[c.name];const a=S.rows.map(o=>+o[c.name]).filter(v=>!isNaN(v)&&v!=null).sort((x,y)=>x-y);return S.bd[c.name]={a,date:c.type==='date'}}
function slVal(c,p){const b=bounds(c),a=b.a;return b.date?a[0]+(a.at(-1)-a[0])*p/1000:a[Math.round(p/1000*(a.length-1))]}
const fv=(c,v)=>C(c)?.type==='date'?new Date(v).toISOString().slice(0,10):fmt(v);
function chips(c){const vs=[...new Set(S.rows.map(o=>o[c.name]).filter(v=>v!=null).map(String))].sort((a,b)=>sortBand(c,a,b)).slice(0,40);return`<div class="fg"><div class="fl">${esc(c.name)}</div><div class="chips" data-f="${esc(c.name)}">${vs.map(v=>`<button class="chip${S.filt[c.name]?.has(v)?' on':''}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div></div>`}
function slider(c){const b=bounds(c);if(b.a.length<2)return'';const p=S.slp[c.name]||[0,1000];
 return`<div class="fg"><div class="fl">${esc(c.name)} <small>${b.date?'date range':'range (by rank)'}</small></div><div class="dr" data-rc="${esc(c.name)}"><div class="dv"><span>${fv(c.name,slVal(c,p[0]))}</span><span>${fv(c.name,slVal(c,p[1]))}</span></div><div class="dt"><div class="df" style="left:${p[0]/10}%;right:${100-p[1]/10}%"></div><input type=range min=0 max=1000 value="${p[0]}" data-i=0><input type=range min=0 max=1000 value="${p[1]}" data-i=1></div></div></div>`}
function buildFilters(){const dc=dateCol();$('#filters').innerHTML=(dc?slider(dc):'')+measures().slice(0,2).map(slider).join('')+dims().slice(0,6).map(chips).join('')}
function pick(col,val){if(!col)return;const s=S.filt[col]=S.filt[col]||new Set();s.has(val)?s.delete(val):s.add(val);
 if(!col)return;document.querySelectorAll('.chips[data-f]').forEach(e=>{if(e.dataset.f===col)e.querySelectorAll('.chip').forEach(b=>b.classList.toggle('on',S.filt[col].has(b.dataset.v)))});render()}

/* ---------- ANALYTICS ---------- */
function agg(r,dim,m,fn){const D=C(dim),o=grp(r,x=>x[dim],m,fn).map(([k,v])=>[String(k),v]);return o.sort(D&&D.order?(x,y)=>D.order.indexOf(x[0])-D.order.indexOf(y[0]):(x,y)=>y[1]-x[1])}
function trend(r,dc,m,fn){return grp(r,o=>{const d=o[dc];return d instanceof Date&&!isNaN(d)?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'):null},m,fn).sort((a,b)=>a[0]<b[0]?-1:1)}
function pearson(r,a,b){let n=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;r.forEach(o=>{const x=o[a],y=o[b];if(x==null||y==null)return;n++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y});
 const d=Math.sqrt((n*sxx-sx*sx)*(n*syy-sy*sy));return n>2&&d?(n*sxy-sx*sy)/d:0}
function linreg(ys){const n=ys.length,mx=(n-1)/2,my=ys.reduce((a,b)=>a+b,0)/n;let sxy=0,sxx=0;ys.forEach((y,i)=>{sxy+=(i-mx)*(y-my);sxx+=(i-mx)**2});const b=sxx?sxy/sxx:0;return{b,a:my-b*mx}}

/* ---------- CHARTS (inline SVG, zero dependencies) ---------- */
function bar(items,dim){if(!items.length)return'<p class=cap>No data</p>';const mx=Math.max(...items.map(i=>i[1]))||1,H=items.length*22+6;
 return`<svg viewBox="0 0 400 ${H}">${items.map((it,i)=>`<g class="bar" data-c="${esc(dim)}" data-v="${esc(it[0])}"><title>${esc(it[0])}: ${fmt(it[1])}</title><text x="0" y="${i*22+14}">${esc(it[0].slice(0,22))}</text><rect x="120" y="${i*22+4}" width="${Math.max(1,it[1]/mx*230)}" height="15" rx="3" fill="${COL[0]}"/><text x="${125+it[1]/mx*230}" y="${i*22+15}">${fmt(it[1])}</text></g>`).join('')}</svg>`}
function line(pts,proj,fill=true){if(pts.length<2)return'<p class=cap>Not enough periods</p>';const ys=pts.map(p=>p[1]),L=ys.length;let f=[];
 if(proj){const{a,b}=linreg(ys);f=[1,2,3].map(i=>a+b*(L-1+i))}const all=[...ys,...f],mn=Math.min(...all,0),mx=Math.max(...all),X=i=>28+i/(all.length-1)*338,Y=v=>158-(v-mn)/((mx-mn)||1)*120;
 const P=a=>a.map((v,i)=>`${i?'L':'M'}${X(i)},${Y(v)}`).join(''),ma=ys.map((_,i)=>{const s=ys.slice(Math.max(0,i-2),i+1);return s.reduce((a,b)=>a+b,0)/s.length});
 const idx=L<=12?ys.map((_,i)=>i):[...new Set([0,L-1,ys.indexOf(Math.max(...ys)),ys.indexOf(Math.min(...ys))])],xs=L<=8?pts.map((_,i)=>i):[0,Math.floor((L-1)/2),L-1];
 return`<svg viewBox="0 0 400 185">${fill?`<path d="${P(ys)}L${X(L-1)},158L28,158Z" fill="${COL[0]}" opacity=".15"/>`:''}<path d="${P(ys)}" fill="none" stroke="${COL[0]}" stroke-width="2"/>${proj?`<path d="${P(ma)}" fill="none" stroke="${COL[2]}" stroke-width="1.5"/>`:''}${f.length?`<path d="M${X(L-1)},${Y(ys[L-1])}${f.map((v,i)=>`L${X(L+i)},${Y(v)}`).join('')}" fill="none" stroke="${COL[1]}" stroke-dasharray="4"/><text x="${X(L+2)}" y="${Y(f[2])-6}" text-anchor="end" style="fill:${COL[1]};font-size:9px">${fmt(f[2])} (forecast)</text>`:''}${L<=24?ys.map((v,i)=>`<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="${COL[0]}"><title>${esc(pts[i][0])}: ${fmt(v)}</title></circle>`).join(''):''}${idx.map(i=>`<text x="${X(i)}" y="${Y(ys[i])-7}" text-anchor="middle" style="font-size:9px">${fmt(ys[i])}</text>`).join('')}${xs.map(i=>`<text x="${X(i)}" y="178" text-anchor="middle" style="font-size:8.5px">${esc(String(pts[i][0]).slice(0,10))}</text>`).join('')}</svg>`}
function hist(vals,bins=12){if(!vals.length)return'';let mn=Infinity,mx=-Infinity;for(const v of vals){if(v<mn)mn=v;if(v>mx)mx=v}const w=(mx-mn)/bins||1,b=Array(bins).fill(0);vals.forEach(v=>b[Math.min(bins-1,Math.floor((v-mn)/w))]++);const m=Math.max(...b);
 return`<svg viewBox="0 0 400 170">${b.map((c,i)=>`<rect x="${10+i*31}" y="${140-c/m*125}" width="28" height="${c/m*125}" fill="${COL[4]}" rx="2"><title>${fmt(mn+i*w)} – ${fmt(mn+(i+1)*w)}: ${c} rows</title></rect>${c?`<text x="${24+i*31}" y="${137-c/m*125}" text-anchor="middle" style="font-size:8.5px">${c}</text>`:''}`).join('')}<text x="10" y="160">${fmt(mn)}</text><text x="190" y="160" text-anchor="middle">${fmt(mn+(mx-mn)/2)}</text><text x="390" y="160" text-anchor="end">${fmt(mx)}</text></svg>`}
function donut(items){const t=items.reduce((s,i)=>s+i[1],0)||1;let a=-Math.PI/2;
 const arcs=items.slice(0,6).map((it,i)=>{const th=it[1]/t*Math.PI*2,x1=100+80*Math.cos(a),y1=90+80*Math.sin(a);a+=th;const x2=100+80*Math.cos(a),y2=90+80*Math.sin(a);
  return`<path class="bar" data-v="${esc(it[0])}" d="M${x1},${y1}A80,80 0 ${th>Math.PI?1:0} 1 ${x2},${y2}" stroke="${COL[i]}" stroke-width="28" fill="none"/>`}).join('');
 return`<svg viewBox="0 0 400 180">${arcs}${items.slice(0,6).map((it,i)=>`<text x="210" y="${40+i*20}"><tspan fill="${COL[i]}">■</tspan> ${esc(it[0].slice(0,14))} · ${fmt(it[1])} (${(it[1]/t*100).toFixed(0)}%)</text>`).join('')}</svg>`}
function scatter(r,a,b){const p=r.filter(o=>o[a]!=null&&o[b]!=null).filter((_,i,arr)=>i%Math.ceil(arr.length/1500)===0);if(!p.length)return'';
 const xs=p.map(o=>o[a]),ys=p.map(o=>o[b]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 return`<svg viewBox="0 0 400 190">${p.map(o=>`<circle cx="${20+(o[a]-x0)/((x1-x0)||1)*370}" cy="${170-(o[b]-y0)/((y1-y0)||1)*150}" r="2.5" fill="${COL[5]}" opacity=".6"/>`).join('')}<text x="20" y="186">${esc(a)}</text><text x="0" y="12">${esc(b)}</text></svg>`}
function heat(r,ms){const M=ms.slice(0,8);return`<div class="scroll"><table class="heat"><tr><th></th>${M.map(m=>`<th>${esc(m.name.slice(0,10))}</th>`).join('')}</tr>${M.map(a=>`<tr><th>${esc(a.name.slice(0,14))}</th>${M.map(b=>{const v=pearson(r,a.name,b.name);return`<td style="background:${v>=0?`rgba(37,99,235,${Math.abs(v)})`:`rgba(239,68,68,${Math.abs(v)})`}">${v.toFixed(2)}</td>`}).join('')}</tr>`).join('')}</table></div>`}
const card=(t,body,cap='')=>`<div class="card"><h3>${t}</h3>${body}<div class="cap">${cap}</div></div>`;

/* ---------- SEASONALITY & CLUSTERING ---------- */
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function seasonality(r,m){const dc=dateCol();if(!dc)return null;const v=[];r.forEach(o=>{const d=o[dc.name];if(d instanceof Date&&!isNaN(d))v.push([d,m?(o[m.name]||0):1])});if(v.length<30)return null;
 let mn=Infinity,mx=-Infinity;v.forEach(([d])=>{const t=+d;if(t<mn)mn=t;if(t>mx)mx=t});const av=m&&defAg(m)==='avg',days=(mx-mn)/864e5,nm=m?m.name:'Record volume',mk=(kind,labels,idx,n)=>{const act=idx.map((x,i)=>x>.2?i:-1).filter(i=>i>=0),off=idx.length-act.length,pk=act.reduce((b,i)=>idx[i]>idx[b]?i:b,act[0]),tr=act.reduce((b,i)=>idx[i]<idx[b]?i:b,act[0]),spread=idx[pk]-idx[tr];return{kind,labels,idx,pk,tr,spread,n,cap:`${labels[pk]} is ${((idx[pk]-1)*100).toFixed(0)}% above average; ${labels[tr]} is ${((1-idx[tr])*100).toFixed(0)}% below${off?`; ${off} ${kind==='dow'?'day(s)':'month(s)'} almost inactive`:''} (1.0 = average).`}};
 if(days>=540){const T={},NN={};v.forEach(([d,x])=>{const k=d.getFullYear()*12+d.getMonth();T[k]=(T[k]||0)+x;NN[k]=(NN[k]||0)+1});const by=Array.from({length:12},()=>[]);Object.entries(T).forEach(([k,x])=>by[k%12].push(av?x/NN[k]:x));
  const avg=by.map(a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0),ok=avg.filter(x=>x>0),mean=ok.reduce((s,x)=>s+x,0)/(ok.length||1);
  if(ok.length>=10&&mean){const s=mk('month',MON,avg.map(x=>x/mean),Object.keys(T).length);if(s.spread>.3)return{...s,text:`${nm} shows an annual seasonal pattern: ${s.cap}`,why:`Average monthly total per calendar month across ${s.n} months, indexed to the overall monthly mean.`,conf:Math.min(90,Math.round(40+s.n/12*12+s.spread*30)),met:`spread ${(s.spread*100).toFixed(0)}% between peak and trough month`}}}
 if(days>=42){let s7=Array(7).fill(0);const c7=Array(7).fill(0);v.forEach(([d,x])=>{s7[d.getDay()]+=x;c7[d.getDay()]++});if(av)s7=s7.map((x,i)=>c7[i]?x/c7[i]:0);const mean=s7.reduce((a,b)=>a+b,0)/7;
  if(mean>0){const s=mk('dow',DOW,s7.map(x=>x/mean),Math.round(days/7));if(s.spread>.35)return{...s,text:`${nm} follows a weekly rhythm: ${s.cap}`,why:`${nm} summed by weekday over ${s.n} weeks and indexed to the average weekday.`,conf:Math.min(88,Math.round(40+s.n*1.2+s.spread*20)),met:`peak/trough spread ${(s.spread*100).toFixed(0)}%, ${s.n} weeks observed`}}}
 return null}
const rngS=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
function kmeans(X,k,R){const n=X.length,d=X[0].length,dist=(a,b)=>{let s=0;for(let i=0;i<d;i++)s+=(a[i]-b[i])**2;return s};let C=[X[Math.floor(R()*n)]];
 while(C.length<k){const D=X.map(x=>Math.min(...C.map(c=>dist(x,c)))),t=D.reduce((a,b)=>a+b,0);let u=R()*t,i=0;while(i<n-1&&(u-=D[i])>0)i++;C.push(X[i])}
 const lab=Array(n).fill(0);for(let it=0;it<25;it++){let ch=false;X.forEach((x,i)=>{let b=0,bd=Infinity;C.forEach((c,j)=>{const v=dist(x,c);if(v<bd){bd=v;b=j}});if(lab[i]!==b){lab[i]=b;ch=true}});
  C=C.map((c,j)=>{const m=X.filter((_,i)=>lab[i]===j);return m.length?c.map((_,q)=>m.reduce((s,x)=>s+x[q],0)/m.length):c});if(!ch)break}return{lab,C,dist}}
function silhouette(X,lab,k,dist){const n=X.length;let tot=0;for(let i=0;i<n;i++){const s=Array(k).fill(0),c=Array(k).fill(0);for(let j=0;j<n;j++){if(j===i)continue;s[lab[j]]+=Math.sqrt(dist(X[i],X[j]));c[lab[j]]++}
 const a=c[lab[i]]?s[lab[i]]/c[lab[i]]:0;let b=Infinity;for(let q=0;q<k;q++)if(q!==lab[i]&&c[q])b=Math.min(b,s[q]/c[q]);tot+=Math.max(a,b)&&isFinite(b)?(b-a)/Math.max(a,b):0}return tot/n}
function clusterize(r){const ms=measures().filter(c=>c.distinct>5).slice(0,3);if(ms.length<2)return null;
 const key=ms.map(c=>c.name)+JSON.stringify([S.q,S.rng,Object.entries(S.filt).map(([k,v])=>[k,[...v]])])+r.length;if(S.clk?.key===key)return S.clk.val;
 const rr=r.filter(o=>ms.every(c=>o[c.name]!=null));let val=null;
 if(rr.length>=80){const st=Math.ceil(rr.length/900),P=rr.filter((_,i)=>i%st===0),tf=(c,v)=>Math.abs(c.skew)>2?Math.sign(v)*Math.log1p(Math.abs(v)):v,raw=P.map(o=>ms.map(c=>tf(c,o[c.name])));
  const mu=ms.map((_,j)=>raw.reduce((s,x)=>s+x[j],0)/raw.length),sd=ms.map((_,j)=>Math.sqrt(raw.reduce((s,x)=>s+(x[j]-mu[j])**2,0)/raw.length)||1),X=raw.map(x=>x.map((v,j)=>(v-mu[j])/sd[j]));
  let best=null;for(let k=2;k<=5;k++){const km=kmeans(X,k,rngS(7+k)),sil=silhouette(X,km.lab,k,km.dist);if(!best||sil>best.sil)best={k,sil,...km}}
  const desc=z=>ms.map((c,j)=>Math.abs(z[j])>.5?`${z[j]>0?'high':'low'} ${c.name}`:null).filter(Boolean).join(', ')||'mid-range on all fields';
  const groups=Array.from({length:best.k},(_,j)=>{const n=best.lab.filter(l=>l===j).length;return{id:j,n,share:n/P.length,desc:desc(best.C[j])}}).filter(g=>g.n).sort((a,b)=>b.n-a.n);
  val={ms,X,lab:best.lab,k:best.k,sil:best.sil,groups,n:P.length}}
 S.clk={key,val};return val}

/* ---------- INSIGHTS (each: kind, text, why, metrics, confidence) ---------- */
function insights(r){const out=[],ms=measures(),ds=dims(),dc=dateCol(),m=ms[0],add=(k,t,why,conf,met,q)=>out.push({k,t,why,conf,met,q});
 if(m&&ds[0]&&defAg(m)==='sum'){const a=agg(r,ds[0].name,m.name),t=a.reduce((s,x)=>s+x[1],0);if(a.length>1&&t)add('share',`${a[0][0]} contributes ${(a[0][1]/t*100).toFixed(0)}% of total ${m.name} across ${ds[0].name}.`,`Largest of ${a.length} groups by sum of ${m.name}.`,Math.min(95,60+a.length*2),`top=${fmt(a[0][1])} of ${fmt(t)}; runner-up ${a[1][0]} ${(a[1][1]/t*100).toFixed(0)}%`)}
 if(dc){const tr=trend(r,dc.name,m?.name);if(tr.length>=4){const h=Math.floor(tr.length/2),p=tr.slice(0,h).reduce((s,x)=>s+x[1],0),l=tr.slice(h).reduce((s,x)=>s+x[1],0);
  if(p)add('trend',`${m?m.name:'Record count'} ${l>=p?'increased':'decreased'} ${Math.abs((l-p)/p*100).toFixed(0)}% in the second half of the period vs the first.`,`Compared summed monthly values, ${tr[0][0]}–${tr[h-1][0]} vs ${tr[h][0]}–${tr.at(-1)[0]}.`,Math.min(90,45+tr.length*3),`first half ${fmt(p)}, second half ${fmt(l)}, ${tr.length} periods`);
  const mean=tr.reduce((s,x)=>s+x[1],0)/tr.length,sd=Math.sqrt(tr.reduce((s,x)=>s+(x[1]-mean)**2,0)/tr.length);
  tr.filter(x=>sd&&Math.abs(x[1]-mean)>2*sd).slice(0,2).forEach(x=>add('anomaly',`Anomaly: ${x[0]} is unusual (${fmt(x[1])} vs typical ${fmt(mean)}).`,`Deviates >2σ (σ=${fmt(sd)}) from the monthly mean.`,85,`z=${((x[1]-mean)/sd).toFixed(1)}`))}}
 const se=seasonality(r,m);if(se)add('season',se.text,se.why,se.conf,se.met);
 const cl=clusterize(r);if(cl&&cl.sil>.35)add('cluster',`${cl.k} natural segments found across ${cl.ms.map(c=>c.name).join(' / ')}: ${cl.groups.slice(0,3).map(g=>`${(g.share*100).toFixed(0)}% show ${g.desc}`).join('; ')}.`,`k-means (k=${cl.k}, chosen from 2–5 by silhouette) on ${cl.n} sampled rows; skewed fields log-scaled, all standardised.`,Math.min(90,Math.round(35+cl.sil*110)),`silhouette ${cl.sil.toFixed(2)} (>0.5 = well separated)`);
 const top=[];for(let i=0;i<ms.length&&i<8;i++)for(let j=i+1;j<Math.min(ms.length,8);j++)top.push([ms[i].name,ms[j].name,pearson(r,ms[i].name,ms[j].name)]);
 top.filter(x=>Math.abs(x[2])>.6).sort((a,b)=>Math.abs(b[2])-Math.abs(a[2])).slice(0,3).forEach(x=>add('corr',`${Math.abs(x[2])>.8?'Strong':'Moderate'} ${x[2]>0?'positive':'negative'} correlation between ${x[0]} and ${x[1]} (r=${x[2].toFixed(2)}).`,`Pearson r over pairwise-complete rows.`,Math.min(95,Math.round(50+Math.abs(x[2])*45)),`r²=${(x[2]**2).toFixed(2)}`));
 S.cols.filter(c=>c.fixedN).forEach(c=>add('quality',`"${c.name}" mixed two scales: ${c.fixedN} whole-number entries (e.g. 68) were auto-converted to fractions (0.68) so averages are meaningful.`,`Most values sit at ${fmt(c.q1)}–${fmt(c.q3)}; entries above 1.5 were treated as whole percentages and divided by 100.`,90,`${c.fixedN} values corrected`,1));
 S.cols.filter(c=>c.nullPct>20).slice(0,4).forEach(c=>add('quality',`"${c.name}" is ${c.nullPct.toFixed(0)}% empty.`,`Null+blank cells ÷ ${c.n} rows.`,99,`${c.nulls} missing`,1));
 ms.filter(c=>c.outliers/c.n>.02).slice(0,3).forEach(c=>add('outlier',`${c.name} has ${c.outliers} outliers (${(c.outliers/c.n*100).toFixed(1)}%)${Math.abs(c.skew)>1?` and is ${c.skew>0?'right':'left'}-skewed`:''}.`,`Outside 1.5×IQR fences [${fmt(c.q1)}, ${fmt(c.q3)}]; skewness ${c.skew.toFixed(2)}.`,88,`skew ${c.skew.toFixed(2)}`));
 return out}
function recs(ins){const R=[],has=k=>ins.some(i=>i.k===k);if(has('quality'))R.push('Clean or backfill columns flagged with high missing rates before relying on their aggregates.');
 if(has('anomaly'))R.push('Investigate the flagged anomaly periods for one-off events or data-entry errors.');
 if(has('corr'))R.push('Test the correlated pairs for causality before acting; they may share a common driver.');
 if(has('season'))R.push('Plan capacity, targets and campaigns around the detected seasonal peaks and troughs.');
 if(has('cluster'))R.push('Treat the detected segments differently (pricing, ownership, follow-up) instead of using one average.');
 if(ins.some(i=>/decreased/.test(i.t)))R.push('The overall trend is declining; drill into groups via the filters to locate the source.');
 return R.length?R:['No critical issues detected. Explore filters to drill deeper.']}

/* ---------- RENDER ---------- */
const ICON={share:'🥧',trend:'📈',anomaly:'⚠️',corr:'🔗',quality:'🧹',outlier:'🎯',season:'🔁',cluster:'🧩'};
const sec=(id,ic,t,sub='')=>`<div class="sh" id="${id}"><span class="ic">${ic}</span><div><h2>${t}</h2>${sub?`<small>${sub}</small>`:''}</div></div>`;
function spark(p){if(!p||p.length<2)return'';const ys=p.map(x=>x[1]),mn=Math.min(...ys),mx=Math.max(...ys);return`<svg class="spk" viewBox="0 0 100 28" preserveAspectRatio="none"><path d="${ys.map((v,i)=>`${i?'L':'M'}${i/(ys.length-1)*100},${26-(v-mn)/((mx-mn)||1)*24}`).join('')}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`}
function pills(){const P=[];Object.entries(S.filt).forEach(([c,s])=>s.forEach(v=>P.push([`f|${c}|${v}`,`${c}: ${v}`])));Object.entries(S.rng).forEach(([c,[lo,hi]])=>{if(lo!=null||hi!=null)P.push([`r|${c}`,`${c}: ${lo==null?'min':fv(c,lo)} → ${hi==null?'max':fv(c,hi)}`])});if(S.q)P.push(['q',`Search: “${S.q}”`]);return P}
function toast(m){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t)}t.textContent=m;t.className='show';clearTimeout(t._h);t._h=setTimeout(()=>t.className='',2200)}
function render(){if(!S.cols.length)return;const r=rows(),ms=measures(),ds=dims(),dc=dateCol(),m=ms[0],ins=insights(r),qual=100-S.cols.reduce((a,c)=>a+c.nullPct,0)/S.cols.length,PL=pills();let h='';
 const cnt=t=>S.cols.filter(c=>c.type===t).length;
 h+=`<div class="hero card" id="s-overview"><div><h1>${esc(S.name)}</h1><p>${esc(S.cur)} · ${S.rows.length.toLocaleString('en-US')} rows × ${S.cols.length} columns · ${cnt('number')} numeric · ${cnt('category')} categorical · ${cnt('date')} date</p></div><div class="ring" style="--p:${qual.toFixed(0)}"><b>${qual.toFixed(0)}%</b><small>data quality</small></div></div>`;
 h+=`<div class="pl">${PL.length?PL.map(([k,t])=>`<button class="pill2" data-rm="${esc(k)}">${esc(t)} ✕</button>`).join('')+`<span class="cap">${r.length.toLocaleString('en-US')} of ${S.rows.length.toLocaleString('en-US')} rows match</span>`:`<span class="cap">Showing all ${S.rows.length.toLocaleString('en-US')} rows · click any bar, slice or tile to cross-filter</span>`}</div>`;
 h+=`<div class="kpis"><div class="card kpi"><span>Records</span><b>${r.length.toLocaleString('en-US')}</b><em>${(r.length/S.rows.length*100).toFixed(0)}% of dataset</em></div>${ms.slice(0,4).map((c,i)=>{const pc=c.semantic==='percentage',vs=r.map(o=>o[c.name]).filter(v=>v!=null),s=vs.reduce((a,v)=>a+v,0),avg=vs.length?s/vs.length:0,tr=dc?trend(r,dc.name,c.name):null,d=tr&&tr.length>2?(tr.at(-1)[1]-tr.at(-2)[1])/(Math.abs(tr.at(-2)[1])||1)*100:null,P=v=>isFrac(c)?(v*100).toFixed(1)+'%':fmt(v),md=pc&&mixed(c);
  return`<div class="card kpi" style="--k:${COL[(i+1)%6]}"><span>${pc?(md?'Median':'Average'):'Total'} ${esc(c.name)}</span><b>${pc?P(md?c.median:avg):fmt(s)}</b><em>${pc?(md?'mixed scales – see Data Quality':`min ${P(c.min)} · max ${P(c.max)}`):`avg ${fmt(avg)}`}${d!=null?` · <i class="${d>=0?'up':'dn'}">${d>=0?'▲':'▼'} ${Math.abs(d).toFixed(0)}% last period</i>`:''}</em>${spark(tr)}</div>`}).join('')}</div>`;
 h+=sec('s-insights','✨','AI Insights','Each card explains why it was generated, the supporting metrics and a confidence score')+`<div class="igrid">${ins.filter(i=>!i.q).map(i=>`<div class="card ins"><div class="ih"><span class="ii">${ICON[i.k]||'💡'}</span><div class="it">${esc(i.t)}</div></div><div class="cf"><i style="width:${i.conf}%"></i></div><div class="cfl">${i.conf}% confidence</div><details><summary>Why this insight?</summary><p>${esc(i.why)}</p><p class="met">${esc(i.met||'')}</p></details></div>`).join('')||'<p class=cap>No notable patterns found.</p>'}</div>`;
 h+=`<div class="card"><h3>💡 Recommendations</h3>${recs(ins).map(x=>`<p>• ${esc(x)}</p>`).join('')}</div>${reportHTML(ins,r)}`;
 h+=sec('s-dash','📊','Dashboard','Hover a chart for its tools: ⏷ filter this chart only · ⚙ change type or fields · ⇔ resize · drag to reorder')+widgetsHTML(r);
 h+=driversHTML(r);
 h+=sec('s-ask','💬','Ask your data','Questions become widgets and filters')+`<div class="card"><input id="ask" placeholder="Ask e.g. “top 10 ${esc(ds[0]?.name||'category')}” or “trend last year”"><div class="qp">${['top 10 '+(ds[0]?.name||'category'),'trend last year','distribution of '+(m?.name||'value'),'lowest '+(ds[1]?.name||ds[0]?.name||'category'),'compare '+(m?.name||'value')+' by '+(ds[0]?.name||'category')].map(q=>`<button class="chip" data-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
 h+=sec('s-quality','🧹','Data Quality & Profile')+(ins.some(i=>i.q)?`<div class="igrid">${ins.filter(i=>i.q).map(i=>`<div class="card ins"><div class="ih"><span class="ii">🧹</span><div class="it">${esc(i.t)}</div></div><details><summary>Why?</summary><p>${esc(i.why)}</p></details></div>`).join('')}</div>`:'')+`<div class="card scroll"><table><tr><th>Column</th><th>Type</th><th>Complete</th><th>Distinct</th><th>Min</th><th>Max</th><th>Mean</th><th>Median</th><th>Std</th><th>Q1</th><th>Q3</th><th>Skew</th><th>Outliers</th></tr>${S.cols.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.semantic!==c.type?c.semantic+'/':''}${c.type}${c.isKey?' 🔑':''}</td><td><div class="qb ${c.nullPct>20?'bad':''}"><i style="width:${100-c.nullPct}%"></i></div> ${(100-c.nullPct).toFixed(0)}%</td><td>${c.distinct}</td>${['min','max','mean','median','std','q1','q3'].map(k=>`<td>${c[k]==null?'':fmt(c[k])}</td>`).join('')}<td>${c.skew==null?'':c.skew.toFixed(2)}</td><td>${c.outliers??''}</td></tr>`).join('')}</table></div>`;
 h+=modelHTML();
 const geo=S.cols.find(c=>c.semantic==='geographic'&&c.distinct>1);if(geo)h+=sec('s-geo','🌍','Geographic')+`<div class="grid">${card(`By ${esc(geo.name)}`,bar(agg(r,geo.name,m?.name).slice(0,10),geo.name))}</div>`;
 h+=sec('s-table','🗂','Detailed Table')+`<div class="card scroll"><table><tr>${S.cols.map(c=>`<th data-s="${esc(c.name)}">${esc(c.name)}${S.sort?.k===c.name?(S.sort.d>0?' ▲':' ▼'):''}</th>`).join('')}</tr>${r.slice(0,S.shown).map(o=>`<tr>${S.cols.map(c=>`<td>${o[c.name] instanceof Date?o[c.name].toISOString().slice(0,10):esc(o[c.name])}</td>`).join('')}</tr>`).join('')}</table>${r.length>S.shown?`<button class="btn" id="more">Show more (${(r.length-S.shown).toLocaleString('en-US')} remaining)</button>`:''}</div>`;
 const keep=document.activeElement?.id==='ask'?$('#ask').value:'';$('#main').className=S.fresh?'fresh':'';S.fresh=false;$('#main').innerHTML=h;if(keep){$('#ask').value=keep}}

/* ---------- EVENTS & EXPORT ---------- */
$('#file').onchange=e=>e.target.files[0]&&loadFile(e.target.files[0]);
$('#sheet').onchange=e=>useSheet(e.target.value);
$('#q').oninput=e=>{S.q=e.target.value;render()};
$('#reset').onclick=()=>{S.filt={};S.rng={};S.slp={};S.q='';$('#q').value='';buildFilters();render();toast('Filters reset')};
$('#filters').onclick=e=>{const b=e.target.closest('.chip');if(b)pick(b.parentNode.dataset.f,b.dataset.v)};
let _dt;$('#filters').oninput=e=>{const t=e.target;if(t.type!=='range')return;const box=t.closest('.dr'),c=C(box.dataset.rc),ins=box.querySelectorAll('input'),p=[+ins[0].value,+ins[1].value];
 if(+t.dataset.i===0&&p[0]>p[1])ins[0].value=p[0]=p[1];if(+t.dataset.i===1&&p[1]<p[0])ins[1].value=p[1]=p[0];S.slp[c.name]=p;
 box.querySelector('.df').style.cssText=`left:${p[0]/10}%;right:${100-p[1]/10}%`;const sp=box.querySelectorAll('.dv span');sp[0].textContent=fv(c.name,slVal(c,p[0]));sp[1].textContent=fv(c.name,slVal(c,p[1]));
 if(p[0]===0&&p[1]===1000)delete S.rng[c.name];else S.rng[c.name]=[p[0]===0?null:slVal(c,p[0]),p[1]===1000?null:slVal(c,p[1])];clearTimeout(_dt);_dt=setTimeout(render,S.rows.length>30000?350:60)};
$('#theme').onclick=()=>{const d=document.documentElement.dataset;d.t=d.t==='dark'?'':'dark';document.body.dataset.t=d.t};
if(matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.dataset.t=document.body.dataset.t='dark'}
$('#sb').onclick=()=>document.body.classList.toggle('sb-off');
$('#pdf').onclick=()=>window.print();
$('#csv').onclick=()=>{const r=rows(),q=v=>`"${String(v??'').replace(/"/g,'""')}"`,t=[S.cols.map(c=>q(c.name)).join(','),...r.map(o=>S.cols.map(c=>q(o[c.name] instanceof Date?o[c.name].toISOString().slice(0,10):o[c.name])).join(','))].join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/csv'}));a.download='export.csv';a.click();toast('CSV exported')};
$('#main').addEventListener('click',e=>{const b=e.target.closest('[data-c][data-v]');if(b&&b.dataset.c)return pick(b.dataset.c,b.dataset.v);
 const x=e.target.closest('[data-rm]');if(x){const[t,c,...v]=x.dataset.rm.split('|');if(t==='f')S.filt[c].delete(v.join('|'));else if(t==='r'){delete S.rng[c];delete S.slp[c]}else{S.q='';$('#q').value=''}buildFilters();return render()}
 const a=e.target.closest('[data-ask]');if(a){$('#ask').value=a.dataset.ask;return ask(a.dataset.ask)}
 const h=e.target.closest('[data-s]');if(h){const k=h.dataset.s;S.sort={k,d:S.sort?.k===k?-S.sort.d:1};render()}
 if(e.target.id==='more'){S.shown+=500;render()}});
$('#main').addEventListener('keydown',e=>{if(e.target.id==='ask'&&e.key==='Enter')ask(e.target.value)});
addEventListener('dragover',e=>e.preventDefault());addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer?.files?.[0];if(f&&/\.(xlsx|xlsm|xls|csv)$/i.test(f.name))loadFile(f)});
addEventListener('scroll',()=>{const H=[...document.querySelectorAll('.sh')];let cur=H[0];H.forEach(e=>{if(e.getBoundingClientRect().top<140)cur=e});document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('on',!!cur&&a.getAttribute('href')==='#'+cur.id))},{passive:true});
