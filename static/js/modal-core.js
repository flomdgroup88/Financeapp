// modal-core.js — базовые утилиты: тост, открытие/закрытие модалок
// ─────────────────────────────────────────────────────────────

export function showToast(msg, duration = 2200) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.style.cssText = `
      position:fixed;bottom:calc(var(--nav-h) + var(--safe-b) + 14px);left:50%;
      transform:translateX(-50%) translateY(20px);
      background:rgba(30,30,50,.96);color:#e2e8f0;
      padding:10px 20px;border-radius:24px;font-size:14px;font-weight:500;
      box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:999;
      opacity:0;transition:opacity .22s,transform .22s;pointer-events:none;
      white-space:nowrap;max-width:90vw;text-align:center;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(el._tid);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    el._tid = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(20px)';
    }, duration);
  });
}

export const openModal = id => {
  const el = document.getElementById(id);
  el.classList.add('show');
  requestAnimationFrame(() => {
    const body = el.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
  });
};

export const closeModal = id => document.getElementById(id).classList.remove('show');

export function initModalDismiss() {
  document.querySelectorAll('.modal-close,[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close || btn.closest('.overlay').id)));
  document.querySelectorAll('.overlay').forEach(ov =>
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); }));

  document.addEventListener('focusin', e => {
    const field = e.target;
    if (!field.matches('textarea, input')) return;
    const modalBody = field.closest('.modal-body');
    if (!modalBody) return;
    setTimeout(() => { field.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 380);
  });

  if (window.visualViewport) {
    const onVpResize = () => {
      const vvh = window.visualViewport.height;
      const wh  = window.innerHeight;
      const keyboardH = Math.max(0, wh - vvh);
      document.querySelectorAll('.overlay.show .modal').forEach(modal => {
        modal.style.maxHeight = keyboardH > 80 ? `${vvh * 0.97}px` : '';
      });
      if (keyboardH > 80) {
        const focused = document.activeElement;
        if (focused && focused.closest('.modal-body')) {
          setTimeout(() => focused.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        }
      }
    };
    window.visualViewport.addEventListener('resize', onVpResize);
    window.visualViewport.addEventListener('scroll', onVpResize);
  }
}
