import net, { type Socket, type Server } from 'node:net';
import type { PoolConfig } from 'pg';
import { performance } from 'node:perf_hooks';

/** PostgreSQL v3 framing. TLS is intentionally absent on this disposable loopback fixture. */
export class CommitProxy {
  private server?: Server;
  private readonly traceStarted = performance.now();
  private readonly traceStartedUtc = new Date().toISOString();
  private trace: Record<string,unknown>[] = [];
  private connectionSequence = 0;
  serverCommitReplies = 0;
  delayedCommitRepliesDelivered = 0;
  private record(event: string, fields: Record<string,unknown> = {}) {
    if(this.trace.length<4096)this.trace.push({event,elapsedMs:performance.now()-this.traceStarted,...fields});
  }
  diagnostics() {
    return {startedUtc:this.traceStartedUtc,elapsedMs:performance.now()-this.traceStarted,forwardedCommits:this.forwardedCommits,serverCommitReplies:this.serverCommitReplies,delayedCommitRepliesDelivered:this.delayedCommitRepliesDelivered,commitRepliesDropped:this.commitRepliesDropped,blackholeActive:this.blackhole,openSocketCount:this.openSocketCount,pendingReplyTimers:this.timers.size,replyDelayMs:this.replyDelay,commitsBeforeBlackhole:this.delayCount,trace:[...this.trace]};
  }
  private sockets = new Set<Socket>();
  private remaining: number|null = null;
  private resolveCommit?: () => void;
  readonly committed: Promise<void>;
  get openSocketCount() { return this.sockets.size; }
  commitRepliesDropped = 0;
  forwardedCommits = 0;
  private blackhole = false;
  private blackholeQuery?: string;
  private replyDelay = 0;
  private delayCount = 0;
  private delaySchedule?: {commits: Set<number>; unowned: () => Promise<boolean>};
  private timers = new Set<NodeJS.Timeout>();
  constructor(private upstream: PoolConfig, private startupUser?: string) {
    this.committed = new Promise(resolve=>{this.resolveCommit=resolve;});
  }
  /** Ignore the READ lookup COMMIT by arming with 1 when testing HTTP submit. */
  arm(skip = 0) { this.remaining=skip; }
  blackholeTraffic() { this.blackhole=true; }
  /** Let multiple transactions progress within their watchdog, then withhold one ack across the invocation deadline. */
  delayThenBlackholeCommitReplies(milliseconds: number, count: number) { this.replyDelay=milliseconds;this.delayCount=count; }
  delayUnownedClaimsThenBlackhole(milliseconds: number, commits: number[], blackholeCommit: number, unowned: () => Promise<boolean>) {
    this.replyDelay=milliseconds;this.delayCount=blackholeCommit-1;this.delaySchedule={commits:new Set(commits),unowned};
  }
  blackholeAfterQuery(fragment: string) { this.blackholeQuery=fragment; }
  async start(): Promise<PoolConfig> {
    this.server=net.createServer(client=>{
      const connection=++this.connectionSequence;
      let operation='startup',resultNull=false;
      const record=(event:string,fields:Record<string,unknown>={})=>this.record(event,{connection,operation,...fields});
      record('client-connected');
      const remote=net.connect({host:String(this.upstream.host),port:Number(this.upstream.port)});
      remote.on('connect',()=>record('upstream-connected'));
      this.sockets.add(client);this.sockets.add(remote);
      let front:Buffer=Buffer.alloc(0),back:Buffer=Buffer.alloc(0),startup=true,dropping=false,holding=false,holdForever=false;
      let held: Buffer[]=[];
      const cleanup=()=>{client.destroy();remote.destroy();this.sockets.delete(client);this.sockets.delete(remote);};
      client.on('error',(error:NodeJS.ErrnoException)=>{record('client-error',{code:error.code});cleanup();});
      remote.on('error',(error:NodeJS.ErrnoException)=>{record('upstream-error',{code:error.code});cleanup();});
      client.on('close',()=>{record('client-closed');cleanup();});
      remote.on('close',()=>{record('upstream-closed',{blackholeActive:this.blackhole});if(!this.blackhole)cleanup();else this.sockets.delete(remote);});
      client.on('data',chunk=>{
        if(this.blackhole)return;
        front=Buffer.concat([front,chunk]);
        for (;;) {
          if(front.length < (startup?4:5))return;
          const length=startup?front.readInt32BE(0):front.readInt32BE(1)+1;
          if(length<4||length>1024*1024){cleanup();return;}
          if(front.length<length)return;
          let frame=front.subarray(0,length);front=front.subarray(length);
          if(!startup&&(frame[0]===81||frame[0]===80)){
            const bytes=frame.subarray(5);const query=(frame[0]===80?bytes.subarray(bytes.indexOf(0)+1):bytes).toString().split('\0')[0];
            const named=query.match(/zbm_simulation_runtime\.(submit_or_replay|read_own_result|claim_effect|dispatch_fake|request_reconciliation|claim_reconciliation|reconcile_effect|inspect_worker_claim|next_due)\(/);
            if(named){operation=named[1];resultNull=false;record('worker-query');}
            else if(/^BEGIN\b/i.test(query))record('begin');
            else if(/^ROLLBACK\b/i.test(query))record('rollback');
          }
          if(startup) {
            // SSLRequest must not be forwarded as the startup packet.
            if(length===8&&frame.readInt32BE(4)===80877103){client.write('N');continue;}
            startup=false;
            if(this.startupUser) {
              const fields=frame.subarray(8).toString().split('\0');
              for(let i=0;i<fields.length-1;i+=2)if(fields[i]==='user')fields[i+1]=this.startupUser;
              const payload=Buffer.from(fields.join('\0'));const header=Buffer.alloc(8);header.writeInt32BE(8+payload.length,0);header.writeInt32BE(196608,4);frame=Buffer.concat([header,payload]);
            }
          } else if(frame[0]===81 && /^COMMIT\s*;?\s*$/i.test(frame.subarray(5,-1).toString())) {
            this.forwardedCommits++;record('commit-forwarded',{commitNumber:this.forwardedCommits});
            if(this.replyDelay){holdForever=this.forwardedCommits>this.delayCount;holding=holdForever||!this.delaySchedule||this.delaySchedule.commits.has(this.forwardedCommits);}
            if(this.remaining!==null) { if(this.remaining===0){dropping=true;this.remaining=null;}else this.remaining--; }
          }
          if(this.blackholeQuery && !startup && (frame[0]===81||frame[0]===80) && frame.toString().includes(this.blackholeQuery)){this.blackhole=true;record('query-blackhole-activated');return;}
          remote.write(frame);
        }
      });
      remote.on('data',chunk=>{
        if(this.blackhole)return;
        back=Buffer.concat([back,chunk]);
        while(back.length>=5){
          const length=back.readInt32BE(1)+1;if(back.length<length)return;
          const frame=back.subarray(0,length);back=back.subarray(length);
          if(frame[0]===67&&frame.subarray(5,-1).toString()==='COMMIT'){this.serverCommitReplies++;record('server-commit-complete',{serverCommitNumber:this.serverCommitReplies});}
          if(frame[0]===75&&frame.length>=13)record('backend-pid',{pid:frame.readInt32BE(5)});
          if(frame[0]===69){
            let offset=5;while(offset<frame.length-1){const kind=frame[offset++],end=frame.indexOf(0,offset);if(end<0)break;if(kind===67)record('server-sqlstate',{code:frame.subarray(offset,end).toString()});offset=end+1;}
          }
          if(frame[0]===68&&frame.length>=11&&frame.readInt16BE(5)===1){
            const length=frame.readInt32BE(7);
            if(length===-1){resultNull=true;record('worker-result',{resultNull:true});}
            if(length>0&&length<20000){try{
              const value=JSON.parse(frame.subarray(11,11+length).toString());
              if(value===null){resultNull=true;record('worker-result',{resultNull:true});}
              if(value&&typeof value==='object'&&!Array.isArray(value)){
                const safe:Record<string,unknown>={};for(const key of ['found','status','parked','reason','kind','epoch','dispatchNumber','leaseUntil','operationId','receiptId'])if(Object.prototype.hasOwnProperty.call(value,key))safe[key]=value[key];
                if(Object.keys(safe).length)record('worker-result',safe);
              }
            }catch{/* Non-JSON scalar responses carry no diagnostic payload. */}}
          }
          if(holding){
            held.push(frame);
            if(frame[0]===67&&frame.subarray(5,-1).toString()==='COMMIT'){
              if(holdForever){this.blackhole=true;record('commit-blackhole-activated',{commitNumber:this.forwardedCommits});return;}
              const commitNumber=this.forwardedCommits;
              const schedule=()=>{
                const scheduled=performance.now();record('reply-delay-scheduled',{commitNumber,delayMs:this.replyDelay});
                const timer=setTimeout(()=>{this.timers.delete(timer);holding=false;this.delayedCommitRepliesDelivered++;record('delayed-reply-delivered',{commitNumber,actualDelayMs:performance.now()-scheduled,frames:held.length});for(const part of held)client.write(part);held=[];},this.replyDelay);this.timers.add(timer);
              };
              if(this.delaySchedule){
                const emptyClaim=operation==='claim_reconciliation'&&resultNull;
                void this.delaySchedule.unowned().then(unowned=>{
                  record('delay-eligibility',{commitNumber,resultNull,unowned,emptyClaim});
                  if(emptyClaim&&unowned)schedule();
                  else {holding=false;for(const part of held)client.write(part);held=[];}
                }).catch(()=>{record('delay-observation-failed',{commitNumber});cleanup();});
              }else schedule();
            }
          } else if(dropping){
            if(frame[0]===67 && frame.subarray(5,-1).toString()==='COMMIT') {
              // CommandComplete COMMIT is emitted only after PostgreSQL commits.
              this.commitRepliesDropped++;this.resolveCommit?.();cleanup();return;
            }
            if(frame[0]===69){client.write(frame);dropping=false;}
          } else client.write(frame);
        }
      });
    });
    await new Promise<void>((resolve,reject)=>{this.server!.once('error',reject);this.server!.listen(0,'127.0.0.1',resolve);});
    const address=this.server.address();if(!address||typeof address==='string')throw new Error('Proxy listener unavailable');
    return {...this.upstream,host:'127.0.0.1',port:address.port};
  }
  async close() { for(const timer of this.timers)clearTimeout(timer);this.timers.clear();for(const s of this.sockets)s.destroy();this.sockets.clear();if(this.server)await new Promise<void>(resolve=>this.server!.close(()=>resolve())); }
}
