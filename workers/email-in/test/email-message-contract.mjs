// Local interface model, not Cloudflare runtime. The Message-ID requirement
// also reproduces the actual provider's "no message-id set" rejection.
export class EmailMessage {
  constructor(from, to, raw) {
    if (![from,to].every(x => typeof x === 'string' && x.trim() && !/[\r\n]/.test(x))) throw new TypeError('Invalid envelope');
    if (typeof raw !== 'string') throw new TypeError('This fixture requires a raw MIME string');
    if (!/^Message-ID:\s*<[^<>\s@]+@[^<>\s@]+>\s*$/im.test(raw.split('\r\n\r\n')[0])) throw new TypeError('no message-id set');
    this.from=from; this.to=to; this.raw=raw;
  }
}
