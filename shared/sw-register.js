export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });

    // 偵測新版本到位 → 自動 skipWaiting + 重整一次，使用者不需操作。
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // 已有舊版 SW 控制中 → 新版安裝完。叫它立刻接管，然後重整。
          newWorker.postMessage('skipWaiting');
        }
      });
    });

    // 當 SW controller 換到新版本 → 自動重整一次（只重整一次，避免無限迴圈）
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  } catch (err) {
    console.warn('[sw] register failed', err);
  }
}
