const LOCK_NAME = 'facial-signature-tab';
const BC_NAME = 'facial-signature-tab-bc';

export async function acquireSingleTabLock({ timeoutMs = 1000 } = {}) {
  // 優先用 navigator.locks
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return acquireViaLocks();
  }
  // fallback to BroadcastChannel
  return acquireViaBroadcast(timeoutMs);
}

function acquireViaLocks() {
  return new Promise(resolve => {
    let released;
    const releasePromise = new Promise(r => { released = r; });
    navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) {
        resolve({ acquired: false, release: () => {} });
        return;
      }
      resolve({ acquired: true, release: () => released() });
      await releasePromise;
    });
  });
}

async function acquireViaBroadcast(timeoutMs) {
  const bc = new BroadcastChannel(BC_NAME);
  let othersResponded = false;

  bc.addEventListener('message', (ev) => {
    if (ev.data === 'ping') {
      bc.postMessage('held');
    } else if (ev.data === 'held') {
      othersResponded = true;
    }
  });

  bc.postMessage('ping');
  await new Promise(r => setTimeout(r, timeoutMs));

  if (othersResponded) {
    bc.close();
    return { acquired: false, release: () => {} };
  }

  // claim — keep responding to future pings
  return {
    acquired: true,
    release: () => bc.close(),
  };
}
