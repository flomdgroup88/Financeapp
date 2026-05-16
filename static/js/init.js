// Делегируем клики до загрузки ES-модуля
document.getElementById('btn-transfer-hdr').onclick = () =>
  window.__transferModalFn && window.__transferModalFn();
document.getElementById('btn-income-hdr').onclick = () =>
  window.__incomeModalFn && window.__incomeModalFn();

// Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
