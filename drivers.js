'use strict';
/* Driver analysis: pick an outcome (e.g. Win/Loss) + values + elements → instant relationships + XGBoost-style model + SHAP.
   Depends on app.js helpers (S, C, ALL, rows, fmt, bar, sec, card, catVals, isFrac) and gbm.js. */
const DR_TARGET=/win\W*loss|outcome|result|status|churn|converted|success|won/i,DR_POS=/^(won|win|yes|true|success|closed won|converted)$/i,DR_SKIP=/^(open|pending|in progress|ongoing|na|n\/a|-|\(missing\))$/i;
const words=s=>String(s).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=4),leaky=(a,b)=>words(a).some(w=>words(b).includes(w));
const nap=()=>new Promise(r=>setTimeout(r,0)),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const erf=x=>{const t=1/(1+.3275911*Math.abs(x)),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return x>=0?y:-y};
const chiP=(x,k)=>{if(k<1)return 1;const z=(Math.cbrt(x/k)-(1-2/(9*k)))/Math.sqrt(2/(9*k));return 1-.5*(1+erf(z/Math.SQRT2))};
const pearsonArr=(x,y)=>{const mx=mean(x),my=mean(y);let a=0,b=0,c=0;x.forEach((v,i)=>{a+=(v-mx)*(y[i]-my);b+=(v-mx)**2;c+=(y[i]-my)**2});return b&&c?a/Math.sqrt(b*c):0};
const dlab=(c,v)=>c.type==='date'?new Date(v).toISOString().slice(0,7):isFrac(c)?(v*100).toFixed(0)+'%':fmt(v);

/* ---- state ---- */
const targetCols=()=>ALL().filter(c=>!c.derived&&!c.isKey&&((['category','boolean'].includes(c.type)&&c.distinct>=2&&c.distinct<=20)||(c.type==='number'&&c.distinct>5)));
const candFeats=t=>ALL().filter(c=>!c.derived&&c.name!==t&&!c.isKey&&c.nullPct<95&&((c.type==='number'&&c.distinct>1)||c.type==='date'||(['category','boolean','text'].includes(c.type)&&c.distinct>=2&&c.distinct<=Math.min(500,.5*c.n))));
function drState(){if(S.dr)return S.dr;const T=targetCols();if(!T.length)return null;const t=T.find(c=>DR_TARGET.test(c.name)&&c.type!=='number')||T.find(c=>c.type!=='number')||T[0];S.dr={run:0};setTarget(t.name);return S.dr}
function setTarget(name){const D=S.dr,c=C(name);D.target=name;D.res=null;D.biv=null;D.busy=false;D.err='';
 if(c.type==='number'){D.incl=new Set();D.pos=new Set()}
 else{const v=catVals(name).map(x=>x[0]);D.incl=new Set(v.filter(x=>!DR_SKIP.test(x)));if(D.incl.size<2)D.incl=new Set(v);const p=[...D.incl].filter(x=>DR_POS.test(x));D.pos=new Set(p.length?p:[...D.incl].slice(0,1))}
 D.feats=new Set(candFeats(name).filter(f=>!leaky(f.name,name)).slice(0,14).map(f=>f.name))}
const drKey=D=>JSON.stringify([D.target,[...D.incl].sort(),[...D.pos].sort(),[...D.feats].sort(),S.q,S.rng,Object.entries(S.filt).map(([k,v])=>[k,[...v].sort()])]);
function plan(r,D){const reg=C(D.target).type==='number';let rs,note='';
 if(reg)rs=r.filter(o=>o[D.target]!=null&&!isNaN(o[D.target]));
 else{rs=r.filter(o=>D.incl.has(String(o[D.target])));if(D.pos.size&&!rs.some(o=>!D.pos.has(String(o[D.target])))){rs=r.filter(o=>o[D.target]!=null);note=`Only positive values were included, so “${[...D.pos].join(' / ')}” is compared with all other rows (one-vs-rest).`}}
 return{rows:rs,y:rs.map(o=>reg?+o[D.target]:(D.pos.has(String(o[D.target]))?1:0)),note,reg}}

/* ---- quick relationships (model-free): rate of the outcome by level / band, with strength + p-value ---- */
function bivar(P,name){const c=C(name),n=P.rows.length,base=mean(P.y),reg=P.reg;let items=[],strength=0,p=null,dir=0,kind;
 if(c.type==='number'||c.type==='date'){kind='num';const val=P.rows.map(o=>{const v=o[name];return v==null?null:+v}),ok=[];val.forEach((v,i)=>{if(v!=null&&!isNaN(v))ok.push(i)});if(ok.length<20)return null;
  const s=ok.map(i=>val[i]).sort((a,b)=>a-b),cuts=[];for(let k=1;k<5;k++){const q=s[Math.floor(k/5*(s.length-1))];if(!cuts.length||q>cuts[cuts.length-1])cuts.push(q)}
  const B=cuts.length+1,ag=Array.from({length:B+1},()=>({n:0,s:0}));val.forEach((v,i)=>{let b=B;if(v!=null&&!isNaN(v)){b=cuts.findIndex(q=>v<=q);if(b<0)b=cuts.length}ag[b].n++;ag[b].s+=P.y[i]});
  const L=x=>dlab(c,x),lb=i=>B===1?'all':i===0?`≤ ${L(cuts[0])}`:i===cuts.length?`> ${L(cuts[i-1])}`:`${L(cuts[i-1])} – ${L(cuts[i])}`;
  for(let b=0;b<B;b++)if(ag[b].n)items.push({label:lb(b),val:ag[b].s/ag[b].n,n:ag[b].n});if(ag[B].n>=n*.05)items.push({label:'(missing)',val:ag[B].s/ag[B].n,n:ag[B].n});
  const xs=ok.map(i=>val[i]),ys=ok.map(i=>P.y[i]);if(reg){const r=pearsonArr(xs,ys);strength=Math.abs(r);dir=Math.sign(r)}else{const a=GBM.auc(ys,xs);strength=Math.abs(a-.5)*2;dir=Math.sign(a-.5)}}
 else{kind='cat';const m=new Map();P.rows.forEach((o,i)=>{const l=o[name]==null?'(missing)':String(o[name]);let a=m.get(l);if(!a)m.set(l,a={n:0,s:0});a.n++;a.s+=P.y[i]});
  const Lv=[...m].sort((a,b)=>b[1].n-a[1].n);items=Lv.slice(0,8).map(([l,a])=>({label:l,val:a.s/a.n,n:a.n}));
  if(Lv.length>8){const t=Lv.slice(8).reduce((q,[,a])=>({n:q.n+a.n,s:q.s+a.s}),{n:0,s:0});items.push({label:'(other)',val:t.s/t.n,n:t.n})}
  if(reg){let ssb=0,sst=0;Lv.forEach(([,a])=>ssb+=a.n*(a.s/a.n-base)**2);P.y.forEach(v=>sst+=(v-base)**2);strength=sst?Math.sqrt(ssb/sst):0}
  else{let chi=0;Lv.forEach(([,a])=>{const e1=a.n*base,e0=a.n*(1-base);if(e1>0)chi+=(a.s-e1)**2/e1;if(e0>0)chi+=((a.n-a.s)-e0)**2/e0});
   const k=Lv.length,phi2=Math.max(0,chi/n-(k-1)/(n-1)),kc=k-(k-1)**2/(n-1);strength=kc>1?Math.sqrt(phi2/Math.min(1,kc-1)):0;p=chiP(chi,k-1)}}   // bias-corrected Cramér's V
 return{name,kind,strength,p,dir,items,base}}
function rateBars(items,base,pct){const mx=Math.max(...items.map(i=>i.val),base)||1,mn=Math.min(0,...items.map(i=>i.val)),sc=v=>(v-mn)/((mx-mn)||1)*190,H=items.length*22+8,f=v=>pct?(v*100).toFixed(0)+'%':fmt(v);
 return`<svg viewBox="0 0 400 ${H}">${items.map((it,i)=>`<g><title>${esc(it.label)}: ${f(it.val)} (n=${it.n})</title><text x="0" y="${i*22+14}">${esc(String(it.label).slice(0,19))}</text><rect x="115" y="${i*22+4}" width="${Math.max(1,sc(it.val))}" height="15" rx="3" fill="${it.val>=base?COL[2]:COL[3]}" opacity=".85"/><text x="${120+sc(it.val)}" y="${i*22+15}">${f(it.val)} · n=${it.n}</text></g>`).join('')}<line x1="${115+sc(base)}" x2="${115+sc(base)}" y1="0" y2="${H}" stroke="var(--mut)" stroke-dasharray="3"/></svg>`}

/* ---- design matrix: one-hot for categories (top 12 levels), numeric as-is (+missing flag), dates → time/month/weekday ---- */
function buildDesign(rs,y,feats){const n=rs.length,cols=[],groups=[];
 feats.forEach(name=>{const c=C(name),gi=groups.length,add=(nm,v)=>cols.push({name:nm,group:gi,v});
  if(c.type==='number'||c.type==='date'){const isD=c.type==='date',raw=rs.map(o=>{const v=o[name];const x=v==null?null:+v;return x==null||isNaN(x)?null:x}),ok=raw.filter(v=>v!=null).sort((a,b)=>a-b),md=ok.length?ok[Math.floor(ok.length/2)]:0,miss=n-ok.length;
   const fill=Float64Array.from(raw,v=>v==null?md:v);
   if(isD){add(name+' (date)',fill);add(name+' (month)',Float64Array.from(fill,t=>new Date(t).getMonth()));add(name+' (weekday)',Float64Array.from(fill,t=>new Date(t).getDay()))}else add(name,fill);
   if(miss>=.05*n)add(name+' (missing)',Float64Array.from(raw,v=>v==null?1:0));groups.push({name,kind:'num',date:isD,raw})}
  else{const lv=rs.map(o=>o[name]==null?'(missing)':String(o[name])),f=new Map();lv.forEach(l=>f.set(l,(f.get(l)||0)+1));const top=[...f].sort((a,b)=>b[1]-a[1]).slice(0,12).map(x=>x[0]),ts=new Set(top);
   top.forEach(l=>add(`${name} = ${l}`,Float64Array.from(lv,x=>x===l?1:0)));if(f.size>top.length)add(`${name} = (other)`,Float64Array.from(lv,x=>ts.has(x)?0:1));
   groups.push({name,kind:'cat',raw:lv.map(x=>ts.has(x)?x:'(other)')})}});
 return{cols,groups,y:Float64Array.from(y)}}

/* ---- run model → SHAP → summaries ---- */
const setProg=(p,t)=>{const e=document.getElementById('drprog');if(e){e.firstElementChild.style.width=(p*100).toFixed(0)+'%';e.lastElementChild.textContent=t}};
const shuffleN=(n,k,seed)=>{const R=GBM.rng(seed),a=Array.from({length:n},(_,i)=>i);for(let i=n-1;i>0;i--){const j=Math.floor(R()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,k)};
async function drRun(){const D=S.dr,r=rows(),P=plan(r,D),feats=[...D.feats],reg=P.reg,id=++D.run;D.err='';
 if(!feats.length)return fail('Select at least one element to analyse against.');
 if(!reg){if(!D.pos.size)return fail('Choose which value counts as the outcome to explain.');const np=P.y.reduce((a,b)=>a+b,0);if(np<15||P.y.length-np<15)return fail(`Not enough examples: ${np} positive vs ${P.y.length-np} other rows (need at least 15 of each). Adjust the included values or global filters.`)}
 else if(P.rows.length<60)return fail('Too few rows with a value for this outcome (need 60+).');
 function fail(m){D.err=m;D.busy=false;drRefresh()}
 D.busy=true;D.res=null;drRefresh();setProg(0,'Preparing data…');await nap();
 let rs=P.rows,y=P.y;if(rs.length>20000){const k=shuffleN(rs.length,20000,11);rs=k.map(i=>P.rows[i]);y=k.map(i=>P.y[i])}
 const des=buildDesign(rs,y,feats),t0=Date.now();
 const model=await GBM.fit(des.cols,des.y,reg?'squared':'logistic',{cancel:()=>D.run!==id,onProgress:p=>setProg(p*.7,'Training gradient-boosted trees…')});if(!model)return;
 const pick=shuffleN(rs.length,Math.min(600,rs.length),5),sh=await GBM.shapAll(model,des.cols,pick,p=>setProg(.7+p*.3,'Computing SHAP values…'));if(D.run!==id)return;
 D.res=summarise(model,des,sh,pick,P,rs.length,Date.now()-t0);D.res.key=drKey(D);D.busy=false;drRefresh();setTimeout(()=>document.getElementById('drres')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
function summarise(model,des,sh,pick,P,nUsed,ms){const G=des.groups.length,reg=P.reg,cols=des.cols,n=des.y.length,y=des.y,base=mean(Array.from(y));
 const phiG=sh.phi.map(p=>{const g=new Float64Array(G);cols.forEach((c,j)=>g[c.group]+=p[j]);return g});
 const meanAbs=Array.from({length:G},(_,g)=>mean(phiG.map(r=>Math.abs(r[g])))),gain=Array.from({length:G},()=>0);cols.forEach((c,j)=>gain[c.group]+=model.imp[j].gain);const gs=gain.reduce((a,b)=>a+b,0)||1;
 const order=[...Array(G).keys()].sort((a,b)=>meanAbs[b]-meanAbs[a]),posName=[...S.dr.pos].join(' / ')||S.dr.target,eff=[];
 des.groups.forEach((gr,g)=>{const items=[];
  if(gr.kind==='cat'){const lv=[...new Set(gr.raw)];lv.forEach(l=>{let sn=0,sp=0,an=0,as=0;pick.forEach((ri,s)=>{if(gr.raw[ri]===l){sn++;sp+=phiG[s][g]}});gr.raw.forEach((x,i)=>{if(x===l){an++;as+=y[i]}});if(sn>=3)items.push({label:l,phi:sp/sn,rate:as/an,n:an})});items.sort((a,b)=>Math.abs(b.phi)-Math.abs(a.phi));gr.pct=null}
  else{const ok=gr.raw.filter(v=>v!=null).sort((a,b)=>a-b),cuts=[];for(let k=1;k<5;k++){const q=ok[Math.floor(k/5*(ok.length-1))];if(!cuts.length||q>cuts[cuts.length-1])cuts.push(q)}
   const bi=v=>{if(v==null)return cuts.length+1;const b=cuts.findIndex(q=>v<=q);return b<0?cuts.length:b},B=cuts.length+2,sn=Array(B).fill(0),sp=Array(B).fill(0),an=Array(B).fill(0),as=Array(B).fill(0),c=C(gr.name),L=x=>dlab(c,x);
   pick.forEach((ri,s)=>{const b=bi(gr.raw[ri]);sn[b]++;sp[b]+=phiG[s][g]});gr.raw.forEach((v,i)=>{const b=bi(v);an[b]++;as[b]+=y[i]});
   for(let b=0;b<B;b++){if(sn[b]<3)continue;const lab=b===cuts.length+1?'(missing)':cuts.length===0?'all':b===0?`≤ ${L(cuts[0])}`:b===cuts.length?`> ${L(cuts[b-1])}`:`${L(cuts[b-1])} – ${L(cuts[b])}`;items.push({label:lab,phi:sp[b]/sn[b],rate:as[b]/an[b],n:an[b]})}
   const srt=pick.map(ri=>gr.raw[ri]),vs=srt.filter(v=>v!=null).sort((a,b)=>a-b);gr.pct=srt.map(v=>v==null||vs.length<2?.5:vs.findIndex(x=>x>=v)/(vs.length-1))}
  eff[g]=items});
 const mt=model.metrics,conf=reg?Math.min(95,Math.max(30,Math.round(40+mt.r2*60))):Math.min(95,Math.max(30,Math.round(50+(mt.auc-.5)*100)))-(model.valid.length<100?15:0),fnd=[];
 order.slice(0,6).forEach(g=>{const it=eff[g].filter(x=>x.n>=Math.max(8,.02*n)),up=it.filter(x=>x.phi>0).sort((a,b)=>b.phi-a.phi)[0],dn=it.filter(x=>x.phi<0).sort((a,b)=>a.phi-b.phi)[0],gn=des.groups[g].name;
  [up,dn].filter(Boolean).slice(0,g===order[0]?2:1).forEach(x=>{const pos=x.phi>0;
   fnd.push({t:reg?`${gn}: ${x.label} ${pos?'raises':'lowers'} ${S.dr.target} (avg ${fmt(x.rate)} vs ${fmt(base)} overall; SHAP ${pos?'+':''}${fmt(x.phi)}).`:`${gn}: ${x.label} ${pos?'raises':'lowers'} the likelihood of ${posName} — observed ${(x.rate*100).toFixed(0)}% vs ${(base*100).toFixed(0)}% overall (n=${x.n}; SHAP ${pos?'+':''}${x.phi.toFixed(2)} log-odds ≈ odds ×${Math.exp(x.phi).toFixed(2)}).`,
    why:`Average SHAP contribution of this ${des.groups[g].kind==='cat'?'level':'range'} across ${pick.length} sampled rows; ${gn} ranks #${order.indexOf(g)+1} by mean |SHAP| (${meanAbs[g].toFixed(3)}).`,conf})})});
 return{mt,reg,n,nUsed,nTrain:model.train.length,nValid:model.valid.length,trees:model.best,ms,base,phiG,pick,meanAbs,gain:gain.map(x=>x/gs),order,groups:des.groups,eff,fnd,conf,posName,note:P.note}}

/* ---- rendering ---- */
function swarm(R){const top=R.order.slice(0,10),mx=Math.max(1e-9,...top.map(g=>Math.max(...R.phiG.map(r=>Math.abs(r[g]))))),rh=26,H=top.length*rh+30,X=v=>270+v/mx*115;
 return`<svg viewBox="0 0 400 ${H}"><line x1="270" x2="270" y1="6" y2="${H-22}" stroke="var(--mut)"/>${top.map((g,k)=>{const G=R.groups[g],ys=k*rh+rh/2+8;return`<text x="0" y="${ys+3}">${esc(G.name.slice(0,24))}</text>`+R.phiG.map((row,s)=>{const t=G.pct?G.pct[s]:null;return`<circle cx="${X(row[g]).toFixed(1)}" cy="${(ys+((s*37)%100/100-.5)*(rh-8)).toFixed(1)}" r="2.2" fill="${t==null?'hsl(220,8%,62%)':`hsl(${215+145*t},80%,52%)`}" opacity=".7"/>`}).join('')}).join('')}<text x="270" y="${H-6}" text-anchor="middle">← lowers · SHAP value · raises →</text></svg>`}
function divBars(items,pct){const it=items.slice(0,8),mx=Math.max(1e-9,...it.map(i=>Math.abs(i.phi))),H=it.length*22+6,CX=190;
 return`<svg viewBox="0 0 400 ${H}">${it.map((x,i)=>{const w=Math.abs(x.phi)/mx*55,y=i*22+3,p=x.phi>=0;return`<g><title>${esc(x.label)}: SHAP ${x.phi.toFixed(3)}, observed ${pct?(x.rate*100).toFixed(1)+'%':fmt(x.rate)}, n=${x.n}</title><text x="0" y="${y+12}">${esc(String(x.label).slice(0,15))}</text><rect x="${p?CX:CX-w}" y="${y}" width="${Math.max(1,w)}" height="15" rx="3" fill="${p?COL[2]:COL[3]}" opacity=".85"/><text x="${p?CX+w+4:CX-w-4}" text-anchor="${p?'start':'end'}" y="${y+12}">${p?'+':''}${x.phi.toFixed(2)}</text><text x="398" text-anchor="end" y="${y+12}" style="fill:var(--mut)">${pct?(x.rate*100).toFixed(0)+'%':fmt(x.rate)} · n=${x.n}</text></g>`}).join('')}<line x1="${CX}" x2="${CX}" y1="0" y2="${H}" stroke="var(--mut)"/></svg>`}
const chipH=(attr,v,on,n,extra='')=>`<button class="chip${on?' on':''}${extra}" ${attr}="${esc(v)}">${esc(v)}${n!=null?` <em>${n}</em>`:''}</button>`;
function driversHTML(r){const D=drState();return sec('s-drivers','🎯','Driver Analysis','Pick an outcome, pick what to test it against — get relationships, an XGBoost-style model and SHAP explanations')+(D?`<div id="drwrap">${driversInner(r)}</div>`:'<div class="card">No suitable outcome column found (need a category with 2–20 values, or a numeric field).</div>')}
function driversInner(r){const D=S.dr,c=C(D.target),P=plan(r,D),T=targetCols(),reg=P.reg,key=drKey(D),F=candFeats(D.target),grp=(t,l)=>l.length?`<div class="fgl">${t}</div><div class="chips big">${l.map(f=>chipH('data-dr-f',f.name,D.feats.has(f.name),null,leaky(f.name,D.target)?' leak':'').replace('>',` title="${leaky(f.name,D.target)?'Name overlaps with the outcome – may leak the answer':''}">`).replace(/>([^<]*)</,(m,t)=>`>${leaky(f.name,D.target)?'⚠ ':''}${t}<`)).join('')}</div>`:'';
 let h=`<div class="card dr">
 <div class="drq"><label>Which element do you want to analyse?</label><select data-dr="target"><optgroup label="Outcome (categories)">${T.filter(x=>x.type!=='number').map(x=>`<option${x.name===D.target?' selected':''}>${esc(x.name)}</option>`).join('')}</optgroup><optgroup label="Numeric (regression)">${T.filter(x=>x.type==='number').map(x=>`<option${x.name===D.target?' selected':''}>${esc(x.name)}</option>`).join('')}</optgroup></select></div>`;
 if(!reg){const vs=catVals(D.target);h+=`<div class="drq"><label>Which values should be included? <small>rows with unticked values (e.g. Open) are ignored</small></label><div class="chips big">${vs.map(([v,n])=>chipH('data-dr-i',v,D.incl.has(v),n)).join('')}</div></div>
  <div class="drq"><label>Which included value is the outcome to explain? <small>everything else included counts as “not ${esc([...D.pos].join('/')||'outcome')}”</small></label><div class="chips big">${vs.filter(([v])=>D.incl.has(v)).map(([v,n])=>chipH('data-dr-p',v,D.pos.has(v),n)).join('')||'<span class=cap>Include at least one value</span>'}</div></div>`}
 h+=`<div class="drq"><label>Analyse against which elements? <small>${D.feats.size} selected · ⚠ = name overlaps with the outcome (possible leakage)</small></label><div class="dra"><button class="lnk" data-dr-a="rec">Recommended</button><button class="lnk" data-dr-a="all">Select all</button><button class="lnk" data-dr-a="none">Clear</button></div>
  ${grp('Categorical',F.filter(f=>!['number','date'].includes(f.type)))}${grp('Numeric',F.filter(f=>f.type==='number'))}${grp('Dates',F.filter(f=>f.type==='date'))}</div>
 <div class="drrun"><button class="btn pri" data-dr-a="run"${D.busy?' disabled':''}>▶ Run driver model (XGBoost-style + SHAP)</button><span class="cap">${P.rows.length.toLocaleString('en-US')} rows in scope after global filters${reg?'':` · ${P.y.reduce((a,b)=>a+b,0).toLocaleString('en-US')} “${esc([...D.pos].join(' / '))}” vs ${(P.y.length-P.y.reduce((a,b)=>a+b,0)).toLocaleString('en-US')} others`}</span></div>
 ${P.note?`<p class="warn">⚠ ${esc(P.note)} Tick the other outcomes you want to compare against (for example Lost) and leave Open unticked for a cleaner answer.</p>`:''}${D.err?`<p class="warn">⚠ ${esc(D.err)}</p>`:''}${D.busy?`<div class="prog" id="drprog"><i style="width:0"></i><span>Starting…</span></div>`:''}</div>`;
 // quick relationships (instant, model-free)
 if(D.feats.size&&P.rows.length>=20&&(reg||D.pos.size)){if(!D.biv||D.biv.key!==key){const st=Math.ceil(P.rows.length/30000),PB=st>1?{...P,rows:P.rows.filter((_,i)=>i%st===0),y:P.y.filter((_,i)=>i%st===0)}:P;D.biv={key,list:[...D.feats].map(f=>bivar(PB,f)).filter(Boolean).sort((a,b)=>b.strength-a.strength)}}const L=D.biv.list;
  h+=`<div class="card"><h3>Quick relationships — ${reg?'how strongly each element moves':'how strongly each element separates'} “${esc(D.target)}”</h3><div class="cap">${reg?'Strength = correlation ratio (categories) or |correlation| (numeric)':'Strength = bias-corrected Cramér’s V (categories) or |AUC−0.5|×2 (numeric). p from a χ² test.'} Model-free, one element at a time.</div><div class="cw">${bar(L.map(x=>[`${x.name}${x.kind==='num'?(x.dir>0?' ↑':' ↓'):''}`,x.strength]),'')}</div><div class="cap">High-cardinality text fields (e.g. client names) can look stronger than they are.</div></div>${explainQuick(P,D,L)}<div class="grid">${L.map(x=>card(`${esc(x.name)} <small>strength ${x.strength.toFixed(2)}${x.p!=null?` · p ${x.p<.001?'<0.001':x.p.toFixed(3)}`:''}</small>`,rateBars(x.items,x.base,!reg),reg?`Average ${esc(D.target)} per ${x.kind==='num'?'band':'level'}; dashed line = overall (${fmt(x.base)})`:`${esc([...D.pos].join(' / '))} rate per ${x.kind==='num'?'band':'level'}; dashed line = overall (${(x.base*100).toFixed(0)}%). Green above, red below.`)).join('')}</div>`}
 if(D.res)h+=resultsHTML(D,key);return h}
function resultsHTML(D,key){const R=D.res,mt=R.mt,K=(l,v,s='')=>`<div class="card kpi"><span>${l}</span><b>${v}</b><em>${s}</em></div>`,top=R.order.slice(0,12),pct=!R.reg;
 const auc=mt.auc,verdict=R.reg?(mt.r2>.5?'explains a good share of the variation':mt.r2>.2?'explains some of the variation':'explains little of the variation'):(auc>=.8?'strong separation':auc>=.7?'useful separation':auc>=.6?'weak separation':'almost no better than chance');
 let h=`<div class="sh" id="drres"><span class="ic">🧠</span><div><h2>Model results</h2><small>Gradient-boosted trees (depth 3, L2 regularised, early-stopped on a 20% hold-out) explained with exact TreeSHAP</small></div></div>${R.key!==key?'<div class="card ins"><b>Selections or global filters changed since this model ran.</b> Press “Run driver model” to refresh these results.</div>':''}
 <div class="kpis">${R.reg?K('Hold-out R²',mt.r2.toFixed(2),`RMSE ${fmt(mt.rmse)} · MAE ${fmt(mt.mae)}`):K('Hold-out AUC',auc.toFixed(2),'0.5 = random · 1.0 = perfect')+K('Accuracy',(mt.acc*100).toFixed(0)+'%',`vs ${(mt.baseAcc*100).toFixed(0)}% by always guessing the majority`)}${K('Rows analysed',R.n.toLocaleString('en-US'),R.n<R.nUsed?`sampled from ${R.nUsed.toLocaleString('en-US')}`:`${R.nTrain} train · ${R.nValid} hold-out`)}${K('Trees used',R.trees,`trained in ${(R.ms/1000).toFixed(1)}s`)}${R.reg?'':K('Outcome rate',(R.base*100).toFixed(0)+'%',esc(R.posName))}</div>
 <div class="card"><h3>✨ Key drivers <small>${R.reg?'':'ranked by mean |SHAP|'}</small></h3><p>The model shows ${verdict} on unseen rows (${R.reg?'R² '+mt.r2.toFixed(2):'AUC '+auc.toFixed(2)}). Top drivers: <b>${top.slice(0,3).map(g=>esc(R.groups[g].name)).join(', ')}</b>.</p>${(R.reg?mt.r2<.2:auc<.6)?'<p class="warn">⚠ Weak signal — treat the findings below as tentative.</p>':''}</div>${explainModel(R,D)}
 <div class="igrid">${R.fnd.map(f=>`<div class="card ins"><div class="ih"><span class="ii">🎯</span><div class="it">${esc(f.t)}</div></div><div class="cf"><i style="width:${f.conf}%"></i></div><div class="cfl">${f.conf}% confidence (from hold-out ${R.reg?'R²':'AUC'})</div><details><summary>Why this insight?</summary><p>${esc(f.why)}</p></details></div>`).join('')}</div>
 <div class="grid">${card('SHAP importance <small>mean |SHAP value|</small>',bar(top.map(g=>[R.groups[g].name,R.meanAbs[g]]),''),`Average size of each element’s push on the prediction${R.reg?'':' (log-odds)'}. Bigger = matters more.`)}${card('Gain importance <small>XGBoost “gain”</small>',bar([...top].sort((a,b)=>R.gain[b]-R.gain[a]).map(g=>[R.groups[g].name,R.gain[g]]),''),'Share of total loss reduction from splits on each element. Compare with SHAP: large gaps hint at interactions or rarely used splits.')}</div>
 <div class="card"><h3>SHAP summary <small>each dot = one row</small></h3><div class="cw">${swarm(R)}</div><div class="cap">Right of the line pushes ${R.reg?'the value up':`toward “${esc(R.posName)}”`}; left pushes away. Colour = feature value (blue low → red high); grey = categorical.</div></div>
 <div class="sh"><span class="ic">🔎</span><div><h2>How each driver behaves</h2><small>Average SHAP per level / band, next to the observed ${R.reg?'average':'rate'}</small></div></div>
 <div class="grid">${top.slice(0,8).map(g=>card(esc(R.groups[g].name)+` <small>mean |SHAP| ${R.meanAbs[g].toFixed(3)}</small>`,divBars(R.eff[g],pct),`Green = raises ${R.reg?'the value':esc(R.posName)}, red = lowers. Right column = observed ${R.reg?'average':'rate'}.`)).join('')}</div>
 <p class="cap">Association, not causation: SHAP explains what the model relies on, not what would happen if you changed a field. ${R.n<500?'With few rows the model can be unstable.':''}</p>`;return h}
/* ---- plain-English explainers (generated from the user's own selection and results) ---- */
const sw=s=>s<.1?'negligible':s<.2?'weak':s<.35?'moderate':'strong',sgn=v=>(v>=0?'+':'')+v.toFixed(2);
function explainQuick(P,D,L){const reg=P.reg,base=mean(P.y),n=P.rows.length,pos=[...D.pos].join(' / ')||D.target,f=v=>reg?fmt(v):(v*100).toFixed(0)+'%',minN=Math.max(10,Math.round(.03*n)),li=[],weak=[];
 L.slice(0,8).forEach(x=>{if(x.strength<.1){weak.push(x.name);return}
  const ok=x.items.filter(i=>i.n>=minN&&i.label!=='(missing)'),hi=[...ok].sort((a,b)=>b.val-a.val)[0],lo=[...ok].sort((a,b)=>a.val-b.val)[0],small=x.items.filter(i=>i.n<10&&i.label!=='(missing)').map(i=>i.label),sus=reg?[]:x.items.filter(i=>i.n>=20&&(i.val>=.999||i.val<=.001));
  let t=`<b>${esc(x.name)}</b> — ${sw(x.strength)} link (${x.strength.toFixed(2)})${x.p!=null&&x.p>=.05?`; the differences could be chance (p ${x.p.toFixed(2)})`:''}. `;
  if(x.kind==='num'&&x.dir)t+=`${x.dir>0?'Higher':'Lower'} values tend to go with ${reg?'a higher '+esc(D.target):'“'+esc(pos)+'” more often'}. `;
  if(hi&&lo&&hi!==lo)t+=`Best: ${esc(hi.label)} (${f(hi.val)}, n=${hi.n}); weakest: ${esc(lo.label)} (${f(lo.val)}, n=${lo.n}) against ${f(base)} overall. `;
  if(small.length)t+=`Ignore ${esc(small.join(', '))} — too few rows to trust. `;
  if(sus.length)t+=`<span class="warn">⚠ ${esc(sus.map(i=>i.label).join(', '))} is exactly ${sus[0].val>=.999?'100%':'0%'} — check whether this field is only filled in after the outcome is known.</span>`;li.push(t)});
 return`<div class="card expl"><h3>📖 In plain English</h3><p>${reg?`The average ${esc(D.target)} is ${f(base)} across ${n.toLocaleString('en-US')} rows.`:`Of ${n.toLocaleString('en-US')} rows, <b>${f(base)}</b> are “${esc(pos)}”. Each chart below shows how that rate changes inside each group — green bars are above the overall rate, red bars below.`} The strongest links come first.</p><ul>${li.map(t=>`<li>${t}</li>`).join('')}</ul>${weak.length?`<p>Little or no link: ${esc(weak.join(', '))}.</p>`:''}<p class="cap">Strength runs from 0 (no link) to 1 (perfectly predictive); under 0.1 is negligible, 0.1–0.2 weak, 0.2–0.35 moderate, above 0.35 strong. These are one-field-at-a-time views, so fields can overlap — run the model to separate them.</p></div>`}
function explainModel(R,D){const reg=R.reg,mt=R.mt,pos=R.posName,f=v=>reg?fmt(v):(v*100).toFixed(0)+'%',top=R.order.slice(0,5),minN=Math.max(8,Math.round(.02*R.n)),qr=(D.biv&&D.biv.list||[]).map(x=>x.name),li=[],notes=[];
 const good=reg?mt.r2:mt.auc,verdict=reg?(mt.r2>.5?'fairly reliable':mt.r2>.2?'only partly reliable':'unreliable'):(mt.auc>=.8?'reliable':mt.auc>=.7?'reasonably reliable':mt.auc>=.6?'only weakly reliable':'unreliable');
 const intro=reg?`On rows it had not seen, the model explains ${(mt.r2*100).toFixed(0)}% of the variation in ${esc(D.target)} (R² ${mt.r2.toFixed(2)}; 0% = no better than the average). Its typical error is about ${fmt(mt.mae)}.`:`On rows it had not seen, the model ranks “${esc(pos)}” correctly ${Math.round(mt.auc*100)}% of the time (AUC ${mt.auc.toFixed(2)}; 50% is a coin toss) and gets ${Math.round(mt.acc*100)}% of calls right, versus ${Math.round(mt.baseAcc*100)}% for always guessing the majority outcome.${mt.acc<mt.baseAcc+.03?(mt.auc>=.7?' Accuracy is close to the majority baseline because one outcome dominates, so AUC is the fairer score here.':' That is barely better than guessing, so lean on the group-level patterns rather than individual predictions.'):''}`;
 top.forEach((g,k)=>{const nm=R.groups[g].name,all=R.eff[g],it=all.filter(x=>x.n>=minN),up=it.filter(x=>x.phi>0).sort((a,b)=>b.phi-a.phi)[0],dn=it.filter(x=>x.phi<0).sort((a,b)=>a.phi-b.phi)[0],q=qr.indexOf(nm);
  let t=`<b>#${k+1} ${esc(nm)}</b> — `;if(up)t+=`${esc(up.label)} pushes ${reg?'the value up':'toward “'+esc(pos)+'”'} (${sgn(up.phi)}; observed ${f(up.rate)}, n=${up.n}). `;if(dn)t+=`${esc(dn.label)} pushes ${reg?'the value down':'away from it'} (${sgn(dn.phi)}; observed ${f(dn.rate)}, n=${dn.n}). `;if(!up&&!dn)t+='no group has enough rows for a firm statement. ';
  if(q>=0&&q-k>=2)t+='It matters more once other fields are combined than on its own. ';else if(q>=0&&k-q>=2)t+='It looks weaker once other fields are accounted for — much of its effect overlaps with other fields. ';
  if(all.some(x=>x.n<minN))t+='Groups with very few rows were left out of this reading. ';
  if(!reg&&all.some(x=>x.n>=20&&(x.rate>=.999||x.rate<=.001)))notes.push(`${esc(nm)} has a group with a perfect (100% or 0%) outcome — verify this field is known <i>before</i> the outcome, otherwise it is a giveaway rather than a driver.`);li.push(t)});
 if(!reg){if(R.base>.85||R.base<.15)notes.push(`The outcome is very lopsided (${f(R.base)}), so accuracy looks high even for a poor model — rely on AUC.`)}
 if(R.nValid<100)notes.push('Fewer than 100 hold-out rows were available, so the scores above can swing a lot.');
 return`<div class="card expl"><h3>📖 In plain English</h3><p><b>Can you trust it?</b> The model is <b>${verdict}</b>. ${intro}</p>${reg?'':`<p><b>How to read the SHAP scores:</b> they are in log-odds. +0.7 roughly doubles the odds of “${esc(pos)}”, −0.7 roughly halves them, and 0 means no push. Bigger bars matter more.</p>`}<p><b>What drives the result, most important first:</b></p><ul>${li.map(t=>`<li>${t}</li>`).join('')}</ul>${notes.length?`<p class="warn"><b>Check before acting:</b></p><ul>${notes.map(t=>`<li>${t}</li>`).join('')}</ul>`:''}<p class="cap">These are patterns in your data, not proof of cause. Treat them as where to look first, and ignore groups with only a handful of rows.</p></div>`}
function drRefresh(){const el=document.getElementById('drwrap');if(el&&S.dr)el.innerHTML=driversInner(rows())}
/* ---- events ---- */
document.getElementById('main').addEventListener('change',e=>{if(e.target.dataset.dr==='target'){setTarget(e.target.value);drRefresh()}});
document.getElementById('main').addEventListener('click',e=>{const D=S.dr,t=e.target.closest('[data-dr-i],[data-dr-p],[data-dr-f],[data-dr-a]');if(!D||!t)return;const tog=(s,v)=>s.has(v)?s.delete(v):s.add(v);
 if(t.dataset.drI!=null){tog(D.incl,t.dataset.drI);D.pos.forEach(v=>{if(!D.incl.has(v))D.pos.delete(v)})}
 else if(t.dataset.drP!=null)tog(D.pos,t.dataset.drP);else if(t.dataset.drF!=null)tog(D.feats,t.dataset.drF);
 else{const a=t.dataset.drA,F=candFeats(D.target);if(a==='all')D.feats=new Set(F.map(f=>f.name));else if(a==='none')D.feats=new Set();else if(a==='rec')D.feats=new Set(F.filter(f=>!leaky(f.name,D.target)).slice(0,14).map(f=>f.name));else if(a==='run')return drRun()}
 D.err='';drRefresh()});
