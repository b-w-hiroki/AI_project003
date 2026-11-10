// Offline Chromium DOM integration: never load X or contact Anthropic.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',r=>r.abort());
  await page.setContent('<style>body{margin:16px;font-family:sans-serif}article{overflow-wrap:anywhere}</style><article data-testid="tweet"><a href="/test/status/123">test</a><div data-testid="tweetText">'+ '架空のテスト本文。'.repeat(60)+'</div><div role="group"></div></article>');
  await page.addStyleTag({path:'extension/content/styles.css'});
  await page.addScriptTag({content:fs.readFileSync('extension/shared/platforms.js','utf8')+'\nwindow.aiqCurrentPlatform=()=>AIQ_PLATFORMS[0];'});
  await page.addScriptTag({content:'window.sent=[];window.chrome={runtime:{sendMessage:(m,cb)=>sent.push({m,cb})}};'});
  await page.addScriptTag({path:'extension/content/x.js'});
  let accept=false, prompts=0;
  page.on('dialog',async d=>{prompts++;assert.match(d.message(),/Anthropic/);assert.match(d.message(),/従量課金/);await(accept?d.accept():d.dismiss());});
  await page.click('.aiq-btn');
  assert.equal(await page.evaluate(()=>sent.length),0);
  accept=true;await page.click('.aiq-btn');
  assert.equal(await page.evaluate(()=>sent.length),1);
  await page.evaluate(()=>sent[0].cb({ok:false,error:'テスト用エラー'}));
  accept=false;await page.getByText('リトライ',{exact:true}).click();
  assert.equal(await page.evaluate(()=>sent.length),1);
  assert.equal(await page.locator('.aiq-card').count(),1);
  accept=true;await page.getByText('リトライ',{exact:true}).click();
  assert.equal(await page.evaluate(()=>sent.length),2);
  await page.evaluate(()=>sent[1].cb({ok:true,data:{summary_3lines:['これは架空の要約です','外部通信なし','確認とキャンセルを検証'],key_points:['読みやすさを確認']}}));
  await page.click('.aiq-btn');await page.click('.aiq-btn');
  assert.equal(await page.evaluate(()=>sent.length),2);
  assert.equal(prompts,4);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  fs.mkdirSync('qa-artifacts',{recursive:true});await page.screenshot({path:'qa-artifacts/summary-mobile.png',fullPage:true});
  console.log('Chromium offline: native confirm accept/cancel, retry cancel preservation, success and cached toggle passed. No X/API/keys used.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
