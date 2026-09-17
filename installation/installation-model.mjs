// Canonical release-to-presentation adapter. Copy with sync-ecosystem-chrome.mjs.
export const componentDefinitions = {
  full: {label:'Full system', repository:'https://github.com/synthesisengineering/synthesis-skills', binary:'synthesis'},
  'skills-only': {label:'Skills-only catalog', repository:'https://github.com/synthesisengineering/synthesis-skills', binary:'synthesis'},
  modular: {label:'Individual skill', repository:'https://github.com/synthesisengineering/synthesis-skills', binary:'synthesis'},
  slopcheck: {label:'Synthesis SlopCheck', repository:'https://github.com/synthesisengineering/synthesis-slopcheck', binary:'slopcheck'},
  console: {label:'Synthesis Console', repository:'https://github.com/synthesisengineering/synthesis-console', binary:'synthesis-console'},
  ownwords: {label:'Ownwords', repository:'https://github.com/synthesiswriting/ownwords', binary:'ownwords'},
};
export const installationChannels = ['agent','curl','brew','npm','bun','source'];
const managers = ['brew','npm','bun'];
const prefixes = {brew:'brew install',npm:'npm install -g',bun:'bun add -g'};
const version = value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const https = value => typeof value === 'string' && /^https:\/\/[A-Za-z0-9._~:/%+@=-]+$/.test(value);
const pending = () => Object.fromEntries(['curl',...managers,'source'].map(channel=>[channel,{ready:false}]));
function verified(route,channel) {
  if (!route) return false;
  if (!['pending','verified'].includes(route.status)) throw new Error(`Unknown ${channel} verification status.`);
  return route.status === 'verified';
}
function validSource(url,repository,release) {
  return https(url) && !url.includes('/../') && !url.includes('%') && (url === `${repository}/tree/v${release}` || url.startsWith(`${repository}/blob/v${release}/`));
}
function artifact(route,repository,channel) {
  if (!version(route.release) || !sha(route.sha256) || !validSource(route.source_url,repository,route.release) || !https(route.artifact_url) || !route.artifact_url.startsWith(`${repository}/releases/download/v${route.release}/`) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(route.artifact_url.slice(`${repository}/releases/download/v${route.release}/`.length)) || (channel==='curl' && !route.artifact_url.endsWith('.sh'))) throw new Error(`Invalid ${channel} released artifact provenance.`);
}
function packageRoute(distribution,route,channel,binary,setup,expectedRelease,repository,legacy=false) {
  if (!verified(route,channel)) return {ready:false};
  if (!version(route.release) || route.release!==expectedRelease) throw new Error(`Invalid ${channel} package release identity.`);
  const packageName=route.package;
  if (typeof packageName!=='string') throw new Error(`Missing ${channel} package.`);
  if (channel==='brew') {
    if (packageName!==`synthesisengineering/tap/${binary}`) throw new Error('Invalid brew package.');
  } else {
    const match=/^(@[a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/.exec(packageName);
    const expectedName = binary === 'synthesis-console' ? 'console' : binary;
    const admittedUnscoped = binary === 'ownwords' && packageName === 'ownwords' && distribution.official_npm_packages?.includes(packageName);
    if (!admittedUnscoped && (!match || !distribution.official_npm_scopes?.includes(match[1]) || match[2]!==expectedName)) throw new Error(`Invalid ${channel} publisher or package.`);
  }
  if (!https(route.evidence_url) || !Array.isArray(route.platforms) || !route.platforms.length || route.platforms.some(value=>!/^[a-z0-9-]+$/.test(value))) throw new Error(`Verified ${channel} route lacks platform or release evidence.`);
  const evidenceURLs=[`${repository}/releases/tag/v${route.release}`];
  if(channel!=='brew') evidenceURLs.push(`https://www.npmjs.com/package/${packageName}/v/${route.release}`,`https://registry.npmjs.org/${packageName}/${route.release}`);
  if(!evidenceURLs.includes(route.evidence_url)) throw new Error(`Invalid ${channel} version-specific release evidence.`);
  if (legacy && (!Array.isArray(route.install) || ![1,2].includes(route.install.length) || route.install.join(' && ')!==`${prefixes[channel]} ${packageName} && synthesis setup --profile {profile}`)) throw new Error(`Invalid ${channel} install command.`);
  const command=channel==='brew'
    ? `${prefixes[channel]} ${packageName} && test "$(brew list --versions --formula ${packageName})" = "${binary} ${route.release}" && "$(brew --prefix ${packageName})/bin/${binary}" ${setup}`
    : `${prefixes[channel]} ${packageName}@${route.release} && ${binary} ${setup}`;
  return {ready:true,command,release:route.release,platforms:route.platforms,evidenceUrl:route.evidence_url};
}
export function installationRoutes(capabilities,component,options={}) {
  const definition=componentDefinitions[component];
  if (!definition) throw new Error('Unknown installation profile or component.');
  const result=pending(),distribution=capabilities.distribution;
  if (!distribution) return result;
  if (distribution.schema_version!==1) throw new Error('Unknown distribution schema.');
  const tool=!['full','skills-only','modular'].includes(component);
  const optout=options.noDormantCore ? ' --no-dormant-core' : '';
  if (tool) {
    const spec=distribution.components?.[component];
    if (!spec) return result;
    if (spec.repository!==definition.repository || spec.binary!==definition.binary) throw new Error('Invalid tool repository or binary.');
    if (spec.core_staging?.supported!==true || spec.core_staging.opt_out_argument!=='--no-dormant-core') throw new Error('Tool core staging contract is incomplete.');
    const releases=Object.values(spec.channels??{}).filter(route=>verified(route,'tool')).map(route=>route.release);
    if(releases.some(release=>!version(release)||release!==releases[0])) throw new Error('Tool package and artifact releases disagree.');
    for (const channel of managers) result[channel]=packageRoute(distribution,spec.channels?.[channel],channel,spec.binary,`setup${optout}`,releases[0],spec.repository);
    const curl=spec.channels?.curl;
    if (verified(curl,'curl')) {
      artifact(curl,spec.repository,'curl');
      result.curl={ready:true,command:`curl -fsSL ${curl.artifact_url} | sh -s --${optout}`,bootstrap:curl};
    }
    const source=spec.channels?.source;
    if (verified(source,'source')) {
      artifact(source,spec.repository,'source');
      result.source={ready:true,command:`git clone --branch v${source.release} --single-branch ${spec.repository}.git`,artifactUrl:source.artifact_url,sha256:source.sha256,sourceUrl:source.source_url};
    }
    return result;
  }
  let setup=`setup --profile ${component}`;
  if (component==='modular') {
    const modular=distribution.modular;
    if (!verified(modular,'modular')) return result;
    if (!version(modular.release) || modular.release!==distribution.bootstrap?.release || !Array.isArray(modular.skills) || !modular.skills.length || modular.skills.some(skill=>!/^synthesis-[a-z0-9-]+$/.test(skill)) || !modular.skills.includes(modular.default_skill)) throw new Error('Invalid modular skill inventory or release.');
    const skill=options.skill??modular.default_skill;
    if (!modular.skills.includes(skill)) throw new Error('Unknown selected skill.');
    setup+=` --skill ${skill}${optout}`;
  } else {
    const args=capabilities.profiles?.[component]?.bootstrap_arguments;
    if (!Array.isArray(args) || args.join(' ')!==setup) throw new Error('Invalid profile arguments.');
  }
  const bootstrap=distribution.bootstrap;
  if (bootstrap) {
    if (!version(bootstrap.release) || !sha(bootstrap.sha256) || !https(bootstrap.source_url)) throw new Error('Released bootstrap lacks version, SHA-256, or source provenance.');
    if (!/^https:\/\/raw\.githubusercontent\.com\/synthesisengineering\/synthesis-skills\/(?:[a-f0-9]{40}|v\d+\.\d+\.\d+)\/onboard\.sh$/.test(bootstrap.url??'')) throw new Error('Bootstrap must name an immutable released artifact.');
    const immutableRef = bootstrap.url.split('/').at(-2);
    if (bootstrap.source_url !== `https://github.com/synthesisengineering/synthesis-skills/blob/${immutableRef}/onboard.sh`) throw new Error('Bootstrap source provenance does not match the artifact.');
    let url=bootstrap.url;
    if (bootstrap.short_url_verified===true) {
      if (bootstrap.short_url!=='https://synthesisengineering.org/onboard.sh') throw new Error('Unexpected bootstrap short URL.');
      url=bootstrap.short_url;
    }
    result.curl={ready:true,command:`curl -fsSL ${url} | sh -s -- ${setup} --pin ${bootstrap.release}`,bootstrap};
    result.source={ready:true,command:`git clone --branch v${bootstrap.release} --single-branch ${definition.repository}.git`,sourceUrl:`${definition.repository}/tree/v${bootstrap.release}`};
    if(bootstrap.archive_url!==undefined || bootstrap.archive_sha256!==undefined) {
      const archive={release:bootstrap.release,artifact_url:bootstrap.archive_url,sha256:bootstrap.archive_sha256,source_url:result.source.sourceUrl};
      artifact(archive,definition.repository,'source archive');
      Object.assign(result.source,{artifactUrl:archive.artifact_url,sha256:archive.sha256});
    }
  }
  for (const channel of managers) result[channel]=packageRoute(distribution,distribution.channels?.[channel],channel,'synthesis',setup,bootstrap?.release,definition.repository,true);
  return result;
}
