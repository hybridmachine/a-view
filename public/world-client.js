async function fetchSnapshot() {
  const response = await fetch('/api/world', {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('World is unavailable');
  return response.json();
}

// One ordering and timing policy for both HTTP refreshes and streamed snapshots.
export class WorldClient {
  constructor({ clock = () => performance.now(), request = fetchSnapshot, onSnapshot = () => {} } = {}) {
    this.clock = clock;
    this.request = request;
    this.onSnapshot = onSnapshot;
    this.snapshot = null;
    this.anchorPerformance = 0;
    this.lastRendered = -Infinity;
    this.refreshing = null;
    this.lastRefreshAttempt = -Infinity;
  }

  accept(data) {
    const current = this.snapshot;
    if (current && (data.serverTime <= current.serverTime || data.world.revision < current.world.revision)) return false;
    // Preserve the last rendered instant when a newer response has more latency.
    if (current) this.now();
    this.snapshot = data;
    this.anchorPerformance = this.clock();
    this.onSnapshot(data);
    return true;
  }

  estimatedNow() {
    return this.snapshot ? this.snapshot.serverTime + this.clock() - this.anchorPerformance : 0;
  }

  now() {
    if (!this.snapshot) return 0;
    // A delivery and its consequences must appear together. Wait just before
    // completion until a committed snapshot contains the changed nest state.
    const actionLimit = this.snapshot.world.action ? this.snapshot.world.action.end - 1 : Infinity;
    this.lastRendered = Math.min(
      Math.max(this.lastRendered, this.estimatedNow()),
      this.snapshot.validUntil,
      actionLimit,
    );
    return this.lastRendered;
  }

  isExpired() {
    return !this.snapshot || this.estimatedNow() >= this.snapshot.validUntil;
  }

  needsRefresh() {
    return this.isExpired() || Boolean(this.snapshot.world.action && this.estimatedNow() >= this.snapshot.world.action.end);
  }

  refresh() {
    if (this.refreshing) return this.refreshing;
    this.lastRefreshAttempt = this.clock();
    this.refreshing = Promise.resolve()
      .then(() => this.request())
      .then(data => this.accept(data))
      .finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  recover(disconnected = false) {
    // Expiration matters even if EventSource still reports an open connection.
    // Coalesce requests and throttle retries when a stalled connection fails.
    if ((disconnected || this.needsRefresh()) && this.clock() - this.lastRefreshAttempt >= 5_000) return this.refresh();
    return Promise.resolve(false);
  }
}
