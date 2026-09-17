#!/usr/bin/env node
// Generated production consumer: keep adjacent to its model and capability snapshot.
import {readFile} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {installationRoutes,componentDefinitions} from './installation-model.mjs';
const modes=['final','first-publish-immutable-bootstrap'];
const decode=text=>text.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&#x27;':"'"})[entity]);
export function publicationFailures(capabilities,{mode='final',html,surface='ecosystem'}={}) {
 if(!modes.includes(mode)) throw new Error('Unknown installation publication mode.');
 if(!['ecosystem','slopcheck'].includes(surface)) throw new Error('Unknown installation publication surface.');
 if(typeof html!=='string'||!html.trim()) throw new Error('Rendered installation HTML is required.');
 const failures=[],bootstrap=capabilities.distribution?.bootstrap;
 const all=Object.keys(componentDefinitions),shown=surface==='slopcheck'?['slopcheck']:all;
 const code=[...html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g)].map(match=>decode(match[1]).trim());
 const body=decode(html);
 const actualProfiles=[...html.matchAll(/data-profile-panel="([a-z-]+)"/g)].map(match=>match[1]);
 if(actualProfiles.length!==shown.length||shown.some(profile=>!actualProfiles.includes(profile))) failures.push('The rendered component inventory differs from this publication surface.');
 for(const profile of all) {
  const routes=installationRoutes(capabilities,profile);
  for(const [channel,route] of Object.entries(routes)) {
   if(!route.ready) failures.push(`${profile}/${channel} has no verified published route`);
   if(shown.includes(profile)&&route.ready&&(!route.command||!code.includes(route.command))) failures.push(`${profile}/${channel} rendered command does not match the verified route`);
  }
  const source=routes.source;
  if(!source.artifactUrl||!source.sha256) failures.push(`${profile}/source has no verified release archive and checksum`);
  else if(shown.includes(profile)&&(!body.includes(`href="${source.artifactUrl}"`)||!code.includes(source.sha256))) failures.push(`${profile}/source rendered archive or checksum differs from publication evidence`);
 }
 if(mode==='final'&&bootstrap?.short_url_verified!==true) failures.push('The short bootstrap address has not passed ordinary live-URL verification');
 if(mode==='first-publish-immutable-bootstrap') {
  if(bootstrap?.short_url_verified!==false) failures.push('First publication requires an explicitly unverified short URL; use final mode after its verification.');
  if(code.some(value=>value.includes(`curl -fsSL ${bootstrap?.short_url}`))) failures.push('First publication rendered an unverified short bootstrap command');
  for(const profile of ['full','skills-only','modular']) {
   const route=installationRoutes(capabilities,profile).curl;
   if(!route.ready||!route.command?.startsWith(`curl -fsSL ${bootstrap?.url} |`)) failures.push(`${profile} first publication must use its immutable bootstrap URL`);
  }
 }
 return failures;
}
export async function runCLI(args=process.argv.slice(2),defaultHTML=null) {
 const parsed=parseArgs({args,options:{mode:{type:'string',default:'final'},surface:{type:'string',default:'ecosystem'},html:{type:'string',multiple:true}},allowPositionals:false});
 const files=parsed.values.html??(defaultHTML?[defaultHTML]:[]);
 if(!files.length) throw new Error('Pass --html for every rendered installation page.');
 const capabilities=JSON.parse(await readFile(new URL('./release-capabilities.json',import.meta.url),'utf8'));
 const failures=[];
 for(const path of files) for(const failure of publicationFailures(capabilities,{mode:parsed.values.mode,surface:parsed.values.surface,html:await readFile(resolve(path),'utf8')})) failures.push(`${path}: ${failure}`);
 if(failures.length) {console.error(failures.join('\n'));process.exitCode=1;}
 else console.log(`Installation publication gate passed (${parsed.values.mode}; ${files.length} rendered page(s)).`);
}
if(process.argv[1]&&realpathSync(resolve(process.argv[1]))===realpathSync(fileURLToPath(import.meta.url))) await runCLI();
