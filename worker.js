const GAS_URL='https://script.google.com/macros/s/AKfycby1GGheYU2SRzs0eNS0kOJPFZpokGB1VAag-nkNc7M72XanDS4PJX6odcyYYqPiyiln_g/exec';
const GAMES=new Set(['cyberrunner','generator','cannon','battle','math','merge']);
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});}
export default {async fetch(request,env){
 const incoming=new URL(request.url);if(incoming.pathname!=='/api/ranking')return env.ASSETS.fetch(request);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
 if(!['GET','POST'].includes(request.method))return json({ok:false,error:'Method not allowed'},405);
 try{const target=new URL(GAS_URL);const init={method:request.method,redirect:'follow',signal:AbortSignal.timeout(18000)};
  if(request.method==='POST'){const text=await request.text();if(text.length>4096)return json({ok:false,error:'Payload too large'},413);const body=JSON.parse(text);if(!GAMES.has(body.game)||!String(body.mode||'').match(/^[a-zA-Z0-9_-]{1,48}$/))return json({ok:false,error:'Invalid game or mode'},400);init.headers={'Content-Type':'text/plain;charset=utf-8'};init.body=JSON.stringify(body);}
  else{const action=incoming.searchParams.get('action');if(action==='health')target.searchParams.set('action','health');else{const game=incoming.searchParams.get('game'),mode=incoming.searchParams.get('mode');if(!GAMES.has(game))return json({ok:false,error:'Invalid game'},400);target.searchParams.set('game',game);if(action==='modes')target.searchParams.set('action','modes');else{if(!String(mode||'').match(/^[a-zA-Z0-9_-]{1,48}$/))return json({ok:false,error:'Invalid mode'},400);target.searchParams.set('mode',mode);}}}
  const response=await fetch(target.toString(),init);if(!response.ok)return json({ok:false,error:'Ranking service unavailable'},502);
  const data=await response.json();if(data.schema!=='kokko-arcade-v4')return json({ok:false,error:'Ranking API update required'},502);
  return json(data,data.ok?200:400);
 }catch{return json({ok:false,error:'共有ランキングに接続できません。成績は端末に保管して再送します。'},502);}
}};
