import { Injectable } from '@nestjs/common';

@Injectable()
export class ClockService {
  private mockTime: Date | null = null;

  /**
   * Returns the current UTC time, or the injected mock time if set.
   */
  now(): Date {
    return this.mockTime ? new Date(this.mockTime.getTime()) : new Date();
  }

  /**
   * Returns the ISO 8601 UTC string.
   */
  isoString(): string {
    return this.now().toISOString();
  }

  /**
   * Overrides system time for deterministic testing.
   */
  setMockTime(time: Date | string | number): void {
    this.mockTime = new Date(time);
  }

  /**
   * Advances mock time by milliseconds.
   */
  advanceByMs(ms: number): void {
    const current = this.now();
    this.mockTime = new Date(current.getTime() + ms);
  }

  /**
   * Resets mock time back to real system time.
   */
  reset(): void {
    this.mockTime = null;
  }
}
