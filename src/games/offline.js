export async function prepareOffline() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('unavailable');
  const registration = await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker) throw new Error('unavailable');
  if (worker.state !== 'activated') await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')),25000);
    worker.addEventListener('statechange',() => { if (worker.state === 'activated') { clearTimeout(timer); resolve(); } if (worker.state === 'redundant') { clearTimeout(timer); reject(new Error('install-failed')); } });
  });
  return new Promise((resolve,reject) => {
    const channel = new MessageChannel(), timer = setTimeout(() => reject(new Error('timeout')),10000);
    channel.port1.onmessage = (event) => { clearTimeout(timer); event.data?.complete ? resolve(true) : reject(new Error('incomplete')); channel.port1.close(); };
    (registration.active || worker).postMessage({ type:'VERIFY_CACHE' },[channel.port2]);
  });
}
