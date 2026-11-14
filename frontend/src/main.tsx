import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Activity, ShieldAlert, CheckCircle2, RefreshCw, ExternalLink} from 'lucide-react';
import './style.css';

type Case = {transaction_id:string; payload:any; features:any; score:number|null; decision:string; reasons:string[]; contributions:any[]; created_at:string};
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
function App(){
 const [cases,setCases]=useState<Case[]>([]),[status,setStatus]=useState('open'),[error,setError]=useState(''),[busy,setBusy]=useState('');
 async function load(){try{setError('');const r=await fetch(`${API}/cases?status=${status}&limit=100`);if(!r.ok)throw new Error(`API ${r.status}`);setCases((await r.json()).items)}catch(e){setError(String(e))}}
 useEffect(()=>{load();const t=setInterval(load,5000);return()=>clearInterval(t)},[status]);
 async function label(id:string,label:'fraud'|'legitimate'){setBusy(id);try{const r=await fetch(`${API}/cases/${id}/label`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({label})});if(!r.ok)throw new Error(await r.text());await load()}catch(e){setError(String(e))}finally{setBusy('')}}
 const money=(v:any)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
 return <main><header><div className="brand"><div className="logo"><ShieldAlert/></div><div><b>FraudGuard</b><small>TRANSACTION INTELLIGENCE</small></div></div><div className="live"><i/> LIVE QUEUE <button onClick={load}><RefreshCw size={15}/> Refresh</button></div></header>
 <section className="hero"><div><span className="eyebrow">RISK OPERATIONS / CASE MANAGEMENT</span><h1>Investigations</h1><p>Review suspicious payments, inspect risk signals, and feed analyst decisions back into the model.</p></div><div className="metric"><Activity/><strong>{cases.length}</strong><span>{status} cases</span></div></section>
 <nav><button className={status==='open'?'active':''} onClick={()=>setStatus('open')}>Open queue</button><button className={status==='reviewed'?'active':''} onClick={()=>setStatus('reviewed')}>Reviewed</button></nav>
 {error&&<div className="error">{error} — check that the scoring API is running and CORS is enabled.</div>}
 <section className="queue">{cases.length===0&&!error&&<div className="empty"><CheckCircle2/><h2>You're all caught up</h2><p>No {status} cases at the moment.</p></div>}
 {cases.map(c=><article className="case" key={c.transaction_id}><div className="casehead"><div><span className={`tag ${c.decision}`}>{c.decision}</span><code>{c.transaction_id.slice(0,18)}…</code></div><time>{new Date(c.created_at).toLocaleString()}</time></div>
 <div className="summary"><div><small>TRANSACTION AMOUNT</small><b>{money(c.payload.amount)}</b></div><div><small>RISK SCORE</small><b>{c.score===null?'Rules only':`${(c.score*100).toFixed(1)}%`}</b></div><div><small>MERCHANT</small><b>{c.payload.merchant_id}</b></div><div><small>COUNTRY / DEVICE</small><b>{c.payload.country} · {c.payload.device_id}</b></div></div>
 <div className="signals"><b>Risk signals</b>{c.reasons.map(x=><span key={x}>{x.replaceAll('_',' ')}</span>)}</div>{c.contributions?.length>0&&<div className="signals"><b>Top model drivers</b>{c.contributions.map((x:any)=><span key={x.feature}>{x.feature.replaceAll('_',' ')}: {x.contribution.toFixed(3)}</span>)}</div>}
 <details><summary>Feature snapshot & transaction context</summary><pre>{JSON.stringify({event:c.payload,features:c.features},null,2)}</pre></details>
 {status==='open'&&<div className="actions"><button disabled={busy===c.transaction_id} onClick={()=>label(c.transaction_id,'legitimate')}>Approve as legitimate</button><button className="fraud" disabled={busy===c.transaction_id} onClick={()=>label(c.transaction_id,'fraud')}>Confirm fraud</button></div>}</article>)}
 </section><footer>FraudGuard · Demo analyst console <a href={`${API}/docs`} target="_blank">API docs <ExternalLink size={12}/></a></footer></main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
