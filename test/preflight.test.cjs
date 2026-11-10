const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../extension/content/x.js'),'utf8');
const request=source.slice(source.indexOf('  function requestSummary('),source.indexOf('  // ---- カード'));
function setup(accept=true, busy=false, onConfirm=()=>{}) {
 const sent=[], prompts=[], messages=[];
 const ctx={window:{confirm:m=>{prompts.push(m);onConfirm();return accept;}},chrome:{runtime:{sendMessage:(m,cb)=>sent.push({m,cb})}},toast:m=>messages.push(m)};
 vm.createContext(ctx);vm.runInContext(`let inFlight=${busy};\n${request}`,ctx);
 const btn={disabled:false,textContent:'⚡要約'};
 return {ctx,sent,prompts,messages,btn,run:textEl=>ctx.requestSummary({},textEl,btn,false,'post1')};
}
test('cancel makes no external request or busy state change',()=>{
 const h=setup(false);h.run({textContent:'テスト本文'});assert.equal(h.sent.length,0);assert.equal(h.btn.disabled,false);assert.equal(vm.runInContext('inFlight',h.ctx),false);
});
test('discloses destination cost and content then sends captured text only',()=>{
 const el={textContent:'確認した本文'};const h=setup(true,false,()=>el.textContent='変更された本文');h.run(el);
 assert.equal(h.sent[0].m.text,'確認した本文');assert.match(h.prompts[0],/Anthropic/);assert.match(h.prompts[0],/従量課金/);assert.match(h.prompts[0],/確認した本文/);assert.equal(h.btn.disabled,true);
});
test('retry/main shared lock prevents simultaneous requests without another prompt',()=>{
 const h=setup();h.run({textContent:'first'});h.run({textContent:'second'});assert.equal(h.sent.length,1);assert.equal(h.prompts.length,1);
});
test('empty and oversized text never prompts or sends',()=>{
 for(const text of ['  ','a'.repeat(20001)]){const h=setup();h.run({textContent:text});assert.equal(h.sent.length,0);assert.equal(h.prompts.length,0);}
});
test('retry keeps its card available if canceled or busy',()=>{
 const retry=source.slice(source.indexOf('  function renderError('),source.indexOf('  // ---- 部品'));
 assert.ok(!retry.includes('card.remove()'));
});
