'use strict';
/* Zero-dependency .xlsx reader: ZIP directory + native DecompressionStream + regex XML parsing.
   Returns {sheetName: array-of-rows}. Dates are converted using the cell number format. */
const _x=s=>s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi,(m,e)=>({lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"}[e]||String.fromCodePoint(e[1]==='x'?parseInt(e.slice(2),16):+e.slice(1))));
const _attr=(t,n)=>{const m=t.match(new RegExp('\\b'+n+'="([^"]*)"'));return m?_x(m[1]):null};
async function _inflate(buf){const s=new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Uint8Array(await new Response(s).arrayBuffer())}
async function unzip(ab){const u=new Uint8Array(ab),dv=new DataView(ab),files={};let e=u.length-22;while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;
 if(e<0)throw new Error('Not a valid .xlsx (zip) file');let p=dv.getUint32(e+16,true);const cnt=dv.getUint16(e+10,true),td=new TextDecoder();
 for(let i=0;i<cnt;i++){const m=dv.getUint16(p+10,true),cs=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true),name=td.decode(u.subarray(p+46,p+46+nl));
  p+=46+nl+xl+cl;if(!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(name))continue;
  const ds=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true),raw=u.subarray(ds,ds+cs);files[name]=td.decode(m===0?raw:await _inflate(raw))}return files}
const _col=r=>{let n=0;for(const ch of r.replace(/\d/g,''))n=n*26+ch.charCodeAt(0)-64;return n-1};
async function readXlsx(ab){const f=await unzip(ab),out={};
 const ss=[...(f['xl/sharedStrings.xml']||'').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>_x([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('')));
 // date detection from styles: cellXfs index -> numFmtId
 const st=f['xl/styles.xml']||'',cf={};[...st.matchAll(/<numFmt\b[^>]*>/g)].forEach(m=>cf[_attr(m[0],'numFmtId')]=_attr(m[0],'formatCode'));
 const xfs=((st.match(/<cellXfs[\s\S]*?<\/cellXfs>/)||[''])[0].match(/<xf\b[^>]*?(\/>|>)/g)||[]).map(x=>+_attr(x,'numFmtId'));
 const isDate=id=>(id>=14&&id<=22)||(id>=45&&id<=47)||(cf[id]&&/[dmyh]/i.test(cf[id].replace(/"[^"]*"|\[[^\]]*\]|\\./g,''))&&!/^0|#/.test(cf[id]));
 const rels={};[...(f['xl/_rels/workbook.xml.rels']||'').matchAll(/<Relationship\b[^>]*>/g)].forEach(m=>rels[_attr(m[0],'Id')]=_attr(m[0],'Target'));
 for(const m of (f['xl/workbook.xml']||'').matchAll(/<sheet\b[^>]*>/g)){const nm=_attr(m[0],'name'),t=(rels[_attr(m[0],'r:id')]||'').replace(/^\/?(xl\/)?/,'xl/'),xml=f[t];if(!xml)continue;const rows=[];
  for(const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)){const ri=(+_attr(rm[1],'r'))-1,row=[];
   for(const cm of (rm[2]||'').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){const a=cm[1],ci=_col(_attr(a,'r')||'A'),t=_attr(a,'t'),body=cm[2]||'',v=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1];let val=null;
    if(t==='inlineStr')val=_x([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join(''));
    else if(v!==undefined){if(t==='s')val=ss[+v];else if(t==='str')val=_x(v);else if(t==='b')val=v==='1';else if(t==='e')val=null;
     else{val=parseFloat(v);const s=_attr(a,'s');if(s!=null&&isDate(xfs[+s])){const d=new Date(Math.round((val-25569)*864e5));val=new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes())}}}
    row[ci]=val}rows[ri]=row}
  out[nm]=Array.from(rows,r=>r?Array.from(r,v=>v===undefined?null:v):[])}return out}
if(typeof module!=='undefined')module.exports={readXlsx};
