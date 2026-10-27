/** The vendor has no public immediate decoder-pool shutdown. Own the original
 * settlement, not an outer aborted race; at most one vendor decode runs globally. */
interface Job { start():Promise<void>; cancel():void }
const waiting=new Map<object,Job>();let running=false;
async function drain(){if(running)return;running=true;try{while(waiting.size){const [owner,job]=waiting.entries().next().value!;waiting.delete(owner);await job.start();}}finally{running=false;}}
export function queueGsDecode<T>(owner:object,create:()=>{initialized:Promise<unknown>;value:T;dispose():void}) {
  let cancelled=false,adopted=false,release:(()=>void)|undefined;
  let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  const abort=()=>new DOMException('表示準備を取り消しました。','AbortError');
  const job:Job={cancel(){cancelled=true;if(waiting.get(owner)===job){waiting.delete(owner);reject(abort());}if(adopted){try{release?.();}finally{release=undefined;}}},async start(){
    if(cancelled){reject(abort());return;}let candidate:ReturnType<typeof create>|undefined,disposed=false;
    const dispose=()=>{if(disposed)return;disposed=true;candidate?.dispose();};
    try{candidate=create();await candidate.initialized;
      if(cancelled){dispose();reject(abort());return;}
      adopted=true;release=dispose;resolve(candidate.value);
    }catch(e){try{dispose();reject(e);}catch(cleanup){reject(new AggregateError([e,cleanup],'GSの表示資源を解放できません。'));}}
  }};
  waiting.get(owner)?.cancel();waiting.set(owner,job);void drain();
  return {promise,cancel:job.cancel};
}
