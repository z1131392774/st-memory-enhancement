let d={};const c=(o)=>new Proxy(o,{get(t,p){return typeof t[p]=="object"&&t[p]!==null?c(t[p]):t[p]},set(t,p,n){t[p]=n;return true}});export default{get FN(){setTimeout(()=>c(d),0)}}
