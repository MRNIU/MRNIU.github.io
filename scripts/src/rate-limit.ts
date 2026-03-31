import type { RateLimitInfo } from "./types.js";

export class RateLimitTracker {
  private _remaining: number | null = null;
  private _resetAt: string | null = null;
  private threshold: number;

  constructor(threshold: number = 500) {
    this.threshold = threshold;
  }

  get remaining(): number | null {
    return this._remaining;
  }

  get resetAt(): string | null {
    return this._resetAt;
  }

  update(info: RateLimitInfo): void {
    this._remaining = info.remaining;
    this._resetAt = info.resetAt;
  }

  canContinue(): boolean {
    if (this._remaining === null) return true;
    return this._remaining > this.threshold;
  }
}
