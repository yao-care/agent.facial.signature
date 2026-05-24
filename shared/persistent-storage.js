export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return { supported: false, persisted: false };
  const already = await navigator.storage.persisted();
  if (already) return { supported: true, persisted: true };
  const granted = await navigator.storage.persist();
  return { supported: true, persisted: granted };
}

export async function isPersisted() {
  if (!navigator.storage?.persisted) return false;
  return navigator.storage.persisted();
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}
