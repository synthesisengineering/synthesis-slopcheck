// Local interface tests: no email is sent. The EmailMessage stand-in models only the documented constructor/reply shape.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import PostalMime from 'postal-mime';
import { EmailMessage } from 'cloudflare:email';
import worker from '../email-handler.js';
import { onRequestPost } from '../../../functions/api/hosted/analyze.js';
const originalFetch=globalThis.fetch, originalError=console.error;
afterEach(()=>{globalThis.fetch=originalFetch;console.error=originalError;});

function fixture({subject='Résumé 😊',messageId='<source@example.net>',references='<earlier@example.net>',analysis='A useful café note.\nשלום 😊'}={}) {
  const payloads=[],errors=[],store=new Map();
  globalThis.fetch=async(url,opts)=>{
    assert.equal(url,'https://tools.synthesiswriting.org/slopcheck/api/hosted/analyze');
    assert.equal(opts.headers['X-Internal-Proxy-Key'],'local-fixture-key');
    return new Response(JSON.stringify({text:analysis}));
  };
  console.error=(...args)=>errors.push(args.map(String).join(' '));
  const headers={Subject:'=?UTF-8?B?'+Buffer.from(subject).toString('base64')+'?='}; if(messageId)headers['Message-ID']=messageId;if(references)headers.References=references;
  const message={from:'author@example.net',to:'check@synthesiswriting.org',headers:new Headers(headers),raw:'From: author@example.net\r\nContent-Type: text/plain\r\n\r\nReview this paragraph.',
    async reply(payload){
      assert.ok(payload instanceof EmailMessage,'reply requires EmailMessage');
      assert.equal(payload.from,this.to); assert.equal(payload.to,this.from);
      assert.ok(payload.raw.includes('\r\n\r\n'),'raw MIME header/body boundary');
      payloads.push(payload);
    },setReject(){throw new Error('Unexpected rejection');}};
  const env={INTERNAL_PROXY_KEY:'local-fixture-key',SENDER_HASH_SALT:'fixture-salt',SLOPCHECK_KV:{async get(k){return store.get(k)||null;},async put(k,v,o){assert.equal(o.expirationTtl,90000);store.set(k,v);}}};
  return {message,env,payloads,errors,store};
}

test('the normal npm test setup blocks unmocked network requests',async()=>{
 await assert.rejects(originalFetch('https://unexpected.example.invalid/'),/External network is disabled/);
});
test('proper raw MIME reply keeps the reverse envelope, Unicode content and thread',async()=>{
 const f=fixture();await worker.email(f.message,f.env,{});assert.equal(f.errors.length,0);assert.equal(f.payloads.length,1);
 const parsed=await new PostalMime().parse(f.payloads[0].raw);
 assert.equal(parsed.subject,'Re: Résumé 😊');assert.equal(parsed.inReplyTo,'<source@example.net>');
 assert.equal(parsed.references,'<earlier@example.net> <source@example.net>');
 assert.equal(parsed.from.address,f.message.to);assert.equal(parsed.to[0].address,f.message.from);
 assert.match(parsed.text,/A useful café note\.\nשלום 😊/);
});
test('long Unicode subjects fold without corrupting text or excessive encoded words',async()=>{
 const subject='東京😊'.repeat(80);const f=fixture({subject});await worker.email(f.message,f.env,{});
 assert.equal(f.errors.length,0);const raw=f.payloads[0].raw;
 const parsed=await new PostalMime().parse(raw);assert.equal(parsed.subject,'Re: '+subject);
 const header=raw.split('\r\n\r\n')[0];for(const word of header.match(/=\?UTF-8\?B\?.*?\?=/g)||[])assert.ok(word.length<=75);
 for(const line of raw.split('\r\n\r\n')[1].trim().split('\r\n'))assert.ok(line.length<=76);
});
test('missing message ID does not invent a parent or a reference',async()=>{
 const f=fixture({messageId:'',references:''});await worker.email(f.message,f.env,{});
 const raw=f.payloads[0].raw;assert.ok(!raw.includes('In-Reply-To:'));assert.ok(!raw.includes('References:'));
});
test('header line breaks cannot inject an extra recipient header',async()=>{
 const f=fixture();f.message.headers={get(name){return name.toLowerCase()==='subject'?'Draft\r\nBcc: injected@example.invalid':'<source@example.net>';}};
 await worker.email(f.message,f.env,{});assert.equal(f.errors.length,0);const raw=f.payloads[0].raw;
 assert.ok(!/^Bcc:/m.test(raw));const parsed=await new PostalMime().parse(raw);assert.equal(parsed.bcc,undefined);
});
test('local interface explicitly rejects a Response payload',async()=>{
 const f=fixture();await assert.rejects(f.message.reply(new Response('text')),/reply requires EmailMessage/);
});
test('200,000-character content reaches the actual hosted size gate without prefix inflation',async()=>{
 const f=fixture();const content='x'.repeat(200000);f.message.raw='From: author@example.net\r\nContent-Type: text/plain\r\n\r\n'+content;
 const pageEnv={...f.env,IP_HASH_SALT:'fixture-ip-salt',SLOPCHECK_ANTHROPIC_KEY:'fixture-provider-key',TURNSTILE_SECRET_KEY:'fixture-turnstile'};
 let hostedPayload,providerCalls=0;
 globalThis.fetch=async(url,opts)=>{
   if(url==='https://tools.synthesiswriting.org/slopcheck/api/hosted/analyze'){
     hostedPayload=JSON.parse(opts.body);assert.equal(hostedPayload.userContent,content);assert.ok(hostedPayload.userPrompt.endsWith(content));
     const request=new Request(url,{method:'POST',headers:opts.headers,body:opts.body});
     return onRequestPost({request,env:pageEnv});
   }
   assert.equal(url,'https://api.anthropic.com/v1/messages');providerCalls++;
   const data=JSON.parse(opts.body);assert.ok(data.messages[0].content.endsWith(content));
   return new Response(JSON.stringify({content:[{type:'text',text:'Boundary content accepted.'}]}));
 };
 await worker.email(f.message,f.env,{});assert.equal(f.errors.length,0);assert.equal(providerCalls,1);assert.equal(f.payloads.length,1);
 const parsed=await new PostalMime().parse(f.payloads[0].raw);assert.match(parsed.text,/Boundary content accepted/);
 delete hostedPayload.userContent;
 const oldShape=new Request('https://fixture.invalid/api/hosted/analyze',{method:'POST',headers:{'Content-Type':'application/json','X-Internal-Proxy-Key':'local-fixture-key'},body:JSON.stringify(hostedPayload)});
 const response=await onRequestPost({request:oldShape,env:pageEnv});assert.equal(response.status,413);assert.equal(providerCalls,1);
});
