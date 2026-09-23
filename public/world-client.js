import {validCottageState} from '../shared/cottage.js';
import {validBirdState,birdBoundary} from '../shared/bird.js';
import {validHistory,sameIdentity} from '../shared/field-notes.js';

async function fetchSnapshot() {
  const response = await fetch('/api/world', {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('World is unavailable');
  return response.json();
}

const expectedBoundary=data=>Math.min(data.world.action?.end??Infinity,birdBoundary(data.world.bird),data.world.cottage?.pending?.end??Infinity,data.world.cottage?.nextDecisionAt??Infinity);
const boundary=data=>Math.min(data.nextCommitAt??Infinity,expectedBoundary(data));
function validSnapshot(data){
  if(!data?.world||!Number.isFinite(data.serverTime)||!Number.isFinite(data.validUntil)||data.validUntil<data.serverTime||!Number.isSafeInteger(data.world.revision)||data.world.revision<0)return false;
  if(data.notes!==undefined&&(!validHistory(data.notes)||data.notes.worldId!==data.world.id||data.notes.epoch!==data.world.epoch))return false;
  if(data.world.cottage&&!validCottageState(data.world.cottage))return false;
  if((data.world.version>=4||data.world.bird)&&!validBirdState(data.world.bird))return false;
  if(data.world.bird?.mode==='routine'&&(data.world.action||data.world.nest?.stage!=='built'))return false;
  if(Object.hasOwn(data,'nextCommitAt')){
    const expected=expectedBoundary(data);
    if(data.nextCommitAt===null)return expected===Infinity;
    if(!Number.isFinite(data.nextCommitAt)||data.nextCommitAt<=data.serverTime||data.nextCommitAt>expected)return false;
  }
  return boundary(data)>data.serverTime;
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
    if(!validSnapshot(data))return false;
    const current = this.snapshot;
    const replaced=current?.notes&&data.notes&&!sameIdentity(current.notes,data.notes);
    if (current && (data.serverTime <= current.serverTime || !replaced&&data.world.revision < current.world.revision)) return false;
    if(replaced){this.snapshot=null;this.lastRendered=-Infinity;}
    // Preserve the last rendered instant when a newer response has more latency.
    if (current) this.now();
    if(Math.min(data.validUntil,boundary(data)-1)<this.lastRendered)return false;
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
    // Hold just before any discrete boundary until a committed snapshot
    // contains its effects, including newly accepted cottage tasks.
    const actionLimit = boundary(this.snapshot)-1;
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
    return this.isExpired() || this.estimatedNow() >= boundary(this.snapshot);
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
