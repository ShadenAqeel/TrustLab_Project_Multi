/* Minimal class-host compatibility layer for the locally available React 16.0 runtime.
 * React 18+ uses native hooks automatically. This makes the exact same JSX
 * components render without internet or a package registry in this sandbox.
 */
let hookHost = null;
function dependenciesEqual(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));}
function compatState(initial){
 const host=hookHost,idx=host._hookIdx++;
 if(!host._hooks[idx])host._hooks[idx]={value:typeof initial==='function'?initial():initial};
 const item=host._hooks[idx];
 return [item.value,(next)=>{const value=typeof next==='function'?next(item.value):next;if(!Object.is(value,item.value)){item.value=value;host.forceUpdate();}}];
}
function compatMemo(factory,deps){
 const host=hookHost,idx=host._hookIdx++;let item=host._hooks[idx];
 if(!item||!dependenciesEqual(item.deps,deps)){item={deps,value:factory()};host._hooks[idx]=item;}
 return item.value;
}
function compatEffect(effect,deps){
 const host=hookHost,idx=host._hookIdx++;let item=host._hooks[idx];
 if(!item){item={deps:null,cleanup:null};host._hooks[idx]=item;}
 if(!dependenciesEqual(item.deps,deps))host._effects.push({idx,effect,deps});
}
function legacyHost(fn){
 return class HookHost extends React.Component{
  constructor(props){super(props);this._hooks=[];this._hookIdx=0;this._effects=[];}
  render(){const prev=hookHost;hookHost=this;this._hookIdx=0;this._effects=[];
   try{return fn(this.props);}finally{hookHost=prev;}}
  componentDidMount(){this._flushEffects()}
  componentDidUpdate(){this._flushEffects()}
  componentWillUnmount(){for(const h of this._hooks){if(h&&typeof h.cleanup==='function')h.cleanup();}}
  _flushEffects(){for(const {idx,effect,deps} of this._effects){const item=this._hooks[idx];if(typeof item.cleanup==='function')item.cleanup();item.deps=deps;item.cleanup=effect()||null;}}
 };
}
const useState=React.useState||compatState;
const useEffect=React.useEffect||compatEffect;
const useMemo=React.useMemo||compatMemo;
const useCallback=React.useCallback||((f,deps)=>compatMemo(()=>f,deps));
const withHooks=React.useState?(f=>f):legacyHost;
