// Source-owned Node test setup. This is not the Cloudflare runtime.
// Only cloudflare:email is mapped; postal-mime resolves from the installed dependency.
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:email') {
      return { url: new URL('./email-message-contract.mjs', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
// Every hosted request in these tests must use an explicit local fixture.
globalThis.fetch = async () => { throw new Error('External network is disabled in the local email tests'); };
