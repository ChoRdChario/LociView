/** Neutral whole-view admission and actual decoded-instance ownership. No source/storage types. */
export interface GsDemand { readonly count:number; readonly degree:number }
export interface GsReservation { retire():void; release():void }
export interface GsViewIntent {
  readonly owner:object;readonly active:boolean;
  reserve(index:number,demand:GsDemand):GsReservation;cancel():void;
}
export interface GsResidency {
  assertFits(demands:readonly GsDemand[], replacing?:object):void;
  reserve(owner:object,demand:GsDemand):GsReservation;
  admit(demands:readonly GsDemand[],replacing?:GsViewIntent):GsViewIntent;
  subscribe(changed:()=>void):()=>void;
}
export function createGsResidency(maxRows:number,maxScalars:number):GsResidency {
  if(!Number.isSafeInteger(maxRows)||maxRows<=0||!Number.isSafeInteger(maxScalars)||maxScalars<=0)throw Error('GSの表示上限を確認してください。');
  type Cost={rows:number;scalars:number};type Entry=Cost&{owner:object;retired:boolean};
  type Intent={owner:object;active:boolean;demands:readonly GsDemand[];cost:Cost;started:Set<number>};
  const entries=new Set<Entry>(),intents=new Map<object,Intent>(),states=new WeakMap<GsViewIntent,Intent>(),listeners=new Set<()=>void>();
  const notify=()=>{for(const changed of [...listeners])try{changed();}catch{/* Rendering observers have no admission authority. */}};
  const cost=(d:GsDemand):Cost=>{
    if(!Number.isSafeInteger(d.count)||d.count<=0||!Number.isInteger(d.degree)||d.degree<0||d.degree>4)throw Error('GSの表示情報を確認してください。');
    const scalars=d.count*(17+3*d.degree*(d.degree+2));
    if(!Number.isSafeInteger(scalars))throw Error('GSの表示情報を確認してください。');return {rows:d.count,scalars};
  };
  const sum=(values:Iterable<Cost>):Cost=>{let rows=0,scalars=0;for(const c of values){rows+=c.rows;scalars+=c.scalars;}return{rows,scalars};};
  const check=(c:Cost)=>{if(!Number.isSafeInteger(c.rows)||!Number.isSafeInteger(c.scalars)||c.rows>maxRows||c.scalars>maxScalars)
    throw Error('同時に表示できるGSの上限を超えています。別の3D画面を閉じるか、表示するモデルを減らして再試行してください。');};
  const admission=(replacement?:Intent):Cost=>sum([
    ...[...intents.values()].filter(i=>i!==replacement).map(i=>i.cost),
    ...[...entries].filter(e=>e.retired||!intents.has(e.owner)).filter(e=>!(replacement?.active&&e.owner===replacement.owner&&!e.retired)),
  ]);
  const cancel=(state:Intent)=>{if(!state.active)return;state.active=false;intents.delete(state.owner);for(const entry of entries)if(entry.owner===state.owner)entry.retired=true;notify();};
  const reserve=(owner:object,demand:GsDemand)=>{const c=cost(demand);check(sum([...entries,c]));const entry:Entry={owner,...c,retired:false};entries.add(entry);
    return {retire(){entry.retired=true;},release(){if(entries.delete(entry))notify();}};};
  return {subscribe(changed){listeners.add(changed);return()=>{listeners.delete(changed);};},reserve,
    assertFits(demands,replacing){check(sum([...entries].filter(e=>e.owner!==replacing||e.retired).concat(demands.map(d=>({...cost(d),owner:{},retired:false})))));},
    admit(input,replacing){
      const demands=Object.freeze(input.map(d=>Object.freeze({count:d.count,degree:d.degree}))),total=sum(demands.map(cost)),prior=replacing&&states.get(replacing);
      check(sum([admission(prior),total]));
      const state:Intent={owner:{},active:true,demands,cost:total,started:new Set()};
      // This is a promise of future whole-view capacity; it starts no decoder and frees no actual bytes.
      if(prior)cancel(prior);intents.set(state.owner,state);
      const token:GsViewIntent={owner:state.owner,get active(){return state.active;},cancel(){cancel(state);},reserve(index,demand){
        const wanted=state.demands[index];if(!state.active||!Number.isSafeInteger(index)||state.started.has(index)||!wanted||wanted.count!==demand.count||wanted.degree!==demand.degree)throw Error('GSの表示対象を再確認してください。');
        try {check(admission());const reservation=reserve(state.owner,demand);state.started.add(index);return reservation;}
        catch(error){cancel(state);throw error;}
      }};states.set(token,state);return token;
    }};
}

/** The vendor has no public immediate decoder-pool shutdown. Own the original
 * settlement, not an outer aborted race; at most one vendor decode runs globally. */
interface Job { start():Promise<void>; cancel():void }
const waiting=new Map<object,Job>();let running=false;
async function drain(){if(running)return;running=true;try{while(waiting.size){const [owner,job]=waiting.entries().next().value!;waiting.delete(owner);await job.start();}}finally{running=false;}}
export function queueGsDecode<T>(owner:object,create:()=>{initialized:Promise<unknown>;value:T;dispose():void},acquire?:()=>GsReservation) {
  let cancelled=false,adopted=false,release:(()=>void)|undefined,reservation:GsReservation|undefined;
  let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  const abort=()=>new DOMException('表示準備を取り消しました。','AbortError');
  const job:Job={cancel(){cancelled=true;reservation?.retire();if(waiting.get(owner)===job){waiting.delete(owner);reject(abort());}if(adopted){try{release?.();}finally{release=undefined;}}},async start(){
    if(cancelled){reject(abort());return;}let candidate:ReturnType<typeof create>|undefined,attempted=false;
    const dispose=()=>{if(attempted)return;attempted=true;reservation?.retire();
      // A throwing constructor/cleanup cannot prove that the vendor released its resources.
      if(candidate){candidate.dispose();reservation?.release();}
    };
    try{reservation=acquire?.();candidate=create();await candidate.initialized;
      if(cancelled){dispose();reject(abort());return;}
      adopted=true;release=dispose;resolve(candidate.value);
    }catch(e){try{dispose();reject(e);}catch(cleanup){reject(new AggregateError([e,cleanup],'GSの表示資源を解放できません。'));}}
  }};
  waiting.get(owner)?.cancel();waiting.set(owner,job);void drain();
  return {promise,cancel:job.cancel};
}
