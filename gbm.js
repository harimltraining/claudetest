'use strict';
/* GBM – XGBoost-style gradient boosting (2nd-order gradients, L2 regularisation, gamma, histogram splits,
   early stopping on a hold-out) plus exact path-dependent TreeSHAP for shallow trees. Pure JS, no dependencies. */
const GBM=(()=>{
const tick=()=>new Promise(r=>setTimeout(r,0));
const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
function cutsFor(v,rows,nb){const a=Float64Array.from(rows,i=>v[i]).sort(),u=[];for(let i=0;i<a.length;i++)if(!i||a[i]!==a[i-1])u.push(a[i]);
 if(u.length<=nb)return u.slice(0,-1);const c=[];for(let k=1;k<nb;k++){const q=a[Math.floor(k/nb*(a.length-1))];if((!c.length||q>c[c.length-1])&&q<u[u.length-1])c.push(q)}return c}
function binOf(v,cuts){const b=new Uint8Array(v.length);for(let i=0;i<v.length;i++){let lo=0,hi=cuts.length;while(lo<hi){const m=(lo+hi)>>1;if(v[i]<=cuts[m])hi=m;else lo=m+1}b[i]=lo}return b}
function auc(y,p){const n=y.length,o=Array.from({length:n},(_,i)=>i).sort((a,b)=>p[a]-p[b]);let rs=0,np=0,i=0;
 while(i<n){let j=i;while(j+1<n&&p[o[j+1]]===p[o[i]])j++;const r=(i+j)/2+1;for(let k=i;k<=j;k++)if(y[o[k]]===1){rs+=r;np++}i=j+1}const nn=n-np;return np&&nn?(rs-np*(np+1)/2)/(np*nn):.5}
const leaf=(tree,cols,i)=>{let k=0;while(!tree[k].leaf){const d=tree[k];k=cols[d.f].v[i]<=d.thr?d.l:d.r}return tree[k].val};
const raw=(m,cols,i)=>{let s=m.F0;for(const t of m.trees)s+=leaf(t,cols,i);return s};
const sig=z=>1/(1+Math.exp(-z));

/* Train. cols: [{name,v:Float64Array}], y: Float64Array, obj: 'logistic'|'squared' */
async function fit(cols,y,obj,o={}){const n=y.length,F=cols.length,R=rng(o.seed||7),lr=o.lr||.1,depth=o.depth||3,lam=o.lambda??1,gam=o.gamma??0,minH=o.minH||(obj==='logistic'?.5:2),maxT=o.rounds||120,pat=o.patience||15,log=obj==='logistic';
 const idx=Array.from({length:n},(_,i)=>i);for(let i=n-1;i>0;i--){const j=Math.floor(R()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]]}
 const nv=Math.max(2,Math.floor(n*.2)),valid=idx.slice(0,nv),train=idx.slice(nv),cuts=cols.map(c=>cutsFor(c.v,train,24)),bins=cols.map((c,j)=>binOf(c.v,cuts[j]));
 let mean=0;train.forEach(i=>mean+=y[i]);mean/=train.length;const pm=Math.min(.999,Math.max(.001,mean)),F0=log?Math.log(pm/(1-pm)):mean;
 const f=new Float64Array(n).fill(F0),g=new Float64Array(n),h=new Float64Array(n),trees=[],curve=[];let best=1e18,bestIt=1;
 for(let t=0;t<maxT;t++){
  if(o.cancel&&o.cancel())return null;
  for(const i of train){if(log){const p=sig(f[i]);g[i]=p-y[i];h[i]=Math.max(p*(1-p),1e-6)}else{g[i]=f[i]-y[i];h[i]=1}}
  const tree=[],mk=(ids,d)=>{let G=0,H=0;for(const i of ids){G+=g[i];H+=h[i]}tree.push({leaf:true,val:-G/(H+lam)*lr,cov:H,G,H,ids,d});return tree.length-1};mk(train,0);
  for(let k=0;k<tree.length;k++){const nd=tree[k];if(nd.d>=depth||nd.H<2*minH)continue;let bg=1e-9,bj=-1,bk=-1;const base=nd.G*nd.G/(nd.H+lam);
   for(let j=0;j<F;j++){const nb=cuts[j].length;if(!nb)continue;const Gb=new Float64Array(nb+1),Hb=new Float64Array(nb+1),bb=bins[j];
    for(const i of nd.ids){const b=bb[i];Gb[b]+=g[i];Hb[b]+=h[i]}
    let GL=0,HL=0;for(let s=0;s<nb;s++){GL+=Gb[s];HL+=Hb[s];const GR=nd.G-GL,HR=nd.H-HL;if(HL<minH||HR<minH)continue;const gain=.5*(GL*GL/(HL+lam)+GR*GR/(HR+lam)-base)-gam;if(gain>bg){bg=gain;bj=j;bk=s}}}
   if(bj<0)continue;const bb=bins[bj],L=[],Rr=[];for(const i of nd.ids)(bb[i]<=bk?L:Rr).push(i);
   nd.leaf=false;nd.f=bj;nd.thr=cuts[bj][bk];nd.gain=bg;nd.l=mk(L,nd.d+1);nd.r=mk(Rr,nd.d+1)}
  for(const nd of tree){if(nd.leaf)for(const i of nd.ids)f[i]+=nd.val;delete nd.ids}
  for(const i of valid)f[i]+=leaf(tree,cols,i);trees.push(tree);
  let L=0;for(const i of valid)L+=log?-(y[i]*Math.log(sig(f[i])+1e-12)+(1-y[i])*Math.log(1-sig(f[i])+1e-12)):(f[i]-y[i])**2;L/=nv;curve.push(L);
  if(L<best-1e-9){best=L;bestIt=t+1}else if(t+1-bestIt>=pat)break;
  if(t%3===0){o.onProgress&&o.onProgress((t+1)/maxT);await tick()}}
 const model={trees:trees.slice(0,bestIt),F0,obj,best:bestIt,curve,valid,train,names:cols.map(c=>c.name)};
 // importance (gain / weight / cover per column) from kept trees
 model.imp=cols.map(()=>({gain:0,weight:0,cover:0}));for(const t of model.trees)for(const d of t)if(!d.leaf){const m=model.imp[d.f];m.gain+=d.gain;m.weight++;m.cover+=d.cov}
 // hold-out metrics
 const yv=valid.map(i=>y[i]),pv=valid.map(i=>log?sig(raw(model,cols,i)):raw(model,cols,i)),M={};
 if(log){M.auc=auc(yv,pv);M.acc=yv.filter((v,k)=>(pv[k]>=.5?1:0)===v).length/nv;const pos=yv.reduce((a,b)=>a+b,0)/nv;M.baseAcc=Math.max(pos,1-pos);M.basePos=pos;M.logloss=yv.reduce((s,v,k)=>s-(v*Math.log(pv[k]+1e-12)+(1-v)*Math.log(1-pv[k]+1e-12)),0)/nv}
 else{const my=train.reduce((s,i)=>s+y[i],0)/train.length;let se=0,st=0,ae=0;yv.forEach((v,k)=>{se+=(v-pv[k])**2;st+=(v-my)**2;ae+=Math.abs(v-pv[k])});M.r2=st?1-se/st:0;M.rmse=Math.sqrt(se/nv);M.mae=ae/nv}
 model.metrics=M;return model}

/* Exact path-dependent TreeSHAP: for each tree enumerate subsets of the (<=7) features it uses; absent features are averaged by node cover. */
const FACT=[1];for(let i=1;i<12;i++)FACT.push(FACT[i-1]*i);
function shapRow(model,cols,i,phi){let base=model.F0;
 for(const tree of model.trees){const used=[],fm={};for(const d of tree)if(!d.leaf&&!(d.f in fm)){fm[d.f]=used.length;used.push(d.f)}const m=used.length;if(!m){base+=tree[0].val;continue}
  const ev=(k,mask)=>{const d=tree[k];if(d.leaf)return d.val;if((mask>>fm[d.f])&1)return ev(cols[d.f].v[i]<=d.thr?d.l:d.r,mask);const a=tree[d.l],b=tree[d.r];return(a.cov*ev(d.l,mask)+b.cov*ev(d.r,mask))/(a.cov+b.cov)};
  const V=new Float64Array(1<<m);for(let s=0;s<(1<<m);s++)V[s]=ev(0,s);base+=V[0];
  for(let a=0;a<m;a++){let s=0;for(let mask=0;mask<(1<<m);mask++){if((mask>>a)&1)continue;let c=0,x=mask;while(x){c+=x&1;x>>=1}s+=FACT[c]*FACT[m-c-1]/FACT[m]*(V[mask|(1<<a)]-V[mask])}phi[used[a]]+=s}}
 return base}
async function shapAll(model,cols,rows,onProgress){const out=[];let base=0;for(let k=0;k<rows.length;k++){const phi=new Float64Array(cols.length);base=shapRow(model,cols,rows[k],phi);out.push(phi);if(k%40===0){onProgress&&onProgress(k/rows.length);await tick()}}return{phi:out,base}}
const api={fit,shapAll,shapRow,raw,auc,sig,rng};if(typeof module!=='undefined')module.exports=api;return api})();
