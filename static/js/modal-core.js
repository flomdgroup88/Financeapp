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

  // Фикс клавиатуры на iOS / Telegram:
  // Когда появляется клавиатура, visualViewport уменьшается.
  // Мы двигаем .overlay так, чтобы он занимал именно видимую область —
  // тогда модалка остаётся снизу видимой зоны, прямо над клавиатурой.
  if (window.visualViewport) {
    const onVpResize = () => {
      const vvh      = window.visualViewport.height;
      const vvOffset = window.visualViewport.offsetTop;
      const wh       = window.innerHeight;
      const keyboardH = Math.max(0, wh - vvh);

      document.querySelectorAll('.overlay.show').forEach(ov => {
        const modal = ov.querySelector('.modal');
        if (!modal) return;
        if (keyboardH > 80) {
          ov.style.top    = vvOffset + 'px';
          ov.style.height = vvh + 'px';
          ov.style.bottom = 'auto';
          modal.style.maxHeight = (vvh * 0.92) + 'px';
        } else {
          ov.style.top    = '';
          ov.style.height = '';
          ov.style.bottom = '';
          modal.style.maxHeight = '';
        }
      });
    };
    window.visualViewport.addEventListener('resize', onVpResize);
    window.visualViewport.addEventListener('scroll', onVpResize);
  }
}
