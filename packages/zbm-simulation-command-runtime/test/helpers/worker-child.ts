import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import type { PoolConfig } from 'pg';

/** Real child owns its socket and transaction; parent sees only explicit IPC barriers. */
export class WorkerChild {
  private child: ChildProcess;
  private sequence=0;
  private pending=new Map<number,{resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>();
  private ready: Promise<void>;
  constructor(credentials: PoolConfig) {
    const source=String.raw`
      const {Client}=require(process.env.D_TEST_PG);
      let c;
      process.on('message',async m=>{
        try {
          if(m.kind==='connect'){c=new Client(m.credentials);c.on('error',()=>{});await c.connect();process.send({id:m.id,value:{pid:(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid}});return;}
          if(m.kind==='query'){
            const r=await c.query(m.text,m.values);process.send({id:m.id,value:r.rows});return;
          }
        } catch(e){process.send({id:m.id,error:{message:'Child database operation failed',code:e.code}});}
      });
    `;
    this.child=spawn(process.execPath,['-e',source],{env:{...process.env,D_TEST_PG:resolve('node_modules/pg')},stdio:['ignore','ignore','pipe','ipc']});
    this.child.on('message',raw=>{
      const m=raw as {id:number;value?:unknown;error?:{message:string;code?:string}};
      const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);
      if(m.error)p.reject(Object.assign(new Error(m.error.message),{code:m.error.code}));else p.resolve(m.value);
    });
    this.child.on('exit',()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Worker child exited'));}this.pending.clear();});
    this.ready=this.request('connect',{credentials}).then(()=>undefined);
  }
  private request(kind:string,fields:Record<string,unknown>):Promise<unknown>{
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Child IPC barrier timeout'));},10000);
      this.pending.set(id,{resolve,reject,timer});this.child.send({id,kind,...fields});
    });
  }
  async query<T = Record<string,unknown>>(text:string,values:unknown[]=[]):Promise<T[]> { await this.ready;return await this.request('query',{text,values}) as T[]; }
  async call<T>(fn:string,values:unknown[]):Promise<T>{
    if(!/^[a-z_]+$/.test(fn))throw new Error('Invalid fixture function');
    return (await this.query<{result:T}>(`SELECT zbm_simulation_runtime.${fn}(${values.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,values))[0].result;
  }
  async kill() {
    if(this.child.exitCode!==null||this.child.signalCode!==null)return;
    const exited=new Promise<void>(resolve=>this.child.once('exit',()=>resolve()));this.child.kill('SIGKILL');await exited;
  }
}
