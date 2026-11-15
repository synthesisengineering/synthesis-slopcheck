// Local interface model of the documented incoming reply argument, not Cloudflare runtime.
export class EmailMessage {
  constructor(from, to, raw) {
    if (![from,to].every(x => typeof x === 'string' && x.trim() && !/[\r\n]/.test(x))) throw new TypeError('Invalid envelope');
    if (typeof raw !== 'string') throw new TypeError('This fixture requires a raw MIME string');
    this.from=from; this.to=to; this.raw=raw;
  }
}
