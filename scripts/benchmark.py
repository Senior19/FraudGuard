"""Concurrent scoring API load test; reports measured percentiles and achieved RPS."""
import argparse
import asyncio
import time
import uuid
from datetime import UTC, datetime

import httpx


def percentile(values, q):
    values=sorted(values)
    if not values:return 0.0
    pos=(len(values)-1)*q; lo=int(pos); hi=min(lo+1,len(values)-1)
    return values[lo]+(values[hi]-values[lo])*(pos-lo)

async def main_async(args):
    sem=asyncio.Semaphore(args.concurrency);latencies=[];decisions={};errors=0
    async with httpx.AsyncClient(timeout=args.timeout) as client:
        async def one(i):
            nonlocal errors
            payload={'transaction_id':str(uuid.uuid4()),'card_id':f'load-card-{i%1000}',
              'merchant_id':f'load-merchant-{i%200}','device_id':f'load-device-{i%500}',
              'amount':str(10+(i%5000)/10),'currency':'XXX','country':'ZZ','latitude':0,'longitude':0,
              'event_time':datetime.now(UTC).isoformat()}
            async with sem:
                start=time.perf_counter()
                try:
                    response=await client.post(args.url+'/score',json=payload)
                    latency=(time.perf_counter()-start)*1000;latencies.append(latency)
                    if response.is_success:
                        d=response.json()['decision'];decisions[d]=decisions.get(d,0)+1
                    else: errors+=1
                except (httpx.HTTPError, ValueError, KeyError, TypeError):
                    errors += 1
        start=time.perf_counter();await asyncio.gather(*(one(i) for i in range(args.count)));elapsed=time.perf_counter()-start
    print(f'requests={len(latencies)} errors={errors} elapsed_s={elapsed:.2f} achieved_rps={len(latencies)/max(elapsed,1e-9):.1f}')
    print(f'latency_ms p50={percentile(latencies,.50):.2f} p95={percentile(latencies,.95):.2f} p99={percentile(latencies,.99):.2f}')
    print(f'decisions={decisions}')

def main():
    p=argparse.ArgumentParser();p.add_argument('--url',default='http://localhost:8000');p.add_argument('--count',type=int,default=10000)
    p.add_argument('--concurrency',type=int,default=100);p.add_argument('--timeout',type=float,default=5);a=p.parse_args()
    asyncio.run(main_async(a))
if __name__=='__main__':main()
