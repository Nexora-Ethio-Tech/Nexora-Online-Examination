export class ExamClock {
  private epoch: number;
  private received: number;
  constructor(
    serverNow: string,
    private monotonic = () => performance.now(),
  ) {
    this.epoch = Date.parse(serverNow);
    this.received = monotonic();
  }
  now() {
    return this.epoch + Math.max(0, this.monotonic() - this.received);
  }
  sync(serverNow: string) {
    this.epoch = Math.max(this.now(), Date.parse(serverNow));
    this.received = this.monotonic();
  }
}
