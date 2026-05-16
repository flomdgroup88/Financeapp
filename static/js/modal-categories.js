// modal-categories.js — модальное окно категорий
// ─────────────────────────────────────────────────────────────
import { S, withLoading } from './state.js';
import { GET, POST, PUT, DEL, haptic } from './api.js';
import { ICONS_CAT } from './config.js';
import { renderIconPicker, renderColorPicker } from './pickers.js';
import { openModal, closeModal } from './modal-core.js';

export function openCatModal(id) {
  S.editCatId = id || null; S.catIcon = '📦'; S.catColor = '#6366f1';
  document.getElementById('cat-modal-title').textContent = id ? 'Редактировать категорию' : 'Новая категория';
  document.getElementById('btn-del-cat').style.display = id ? 'block' : 'none';
  if (id) {
    const c = S.categories.find(x => x.id === id);
    if (c) { document.getElementById('c-name').value = c.name; S.catIcon = c.icon; S.catColor = c.color; }
  } else {
    document.getElementById('c-name').value = '';
  }
  renderIconPicker('c-icon-picker', ICONS_CAT, S.catIcon, v => { S.catIcon = v; });
  renderColorPicker('c-color-picker', S.catColor, v => { S.catColor = v; });
  openModal('ov-cat');
}

export async function saveCat() {
  const name = document.getElementById('c-name').value.trim();
  if (!name) return;
  haptic('medium');
  const body = { name, icon: S.catIcon, color: S.catColor };
  await withLoading('btn-save-cat', async () => {
    if (S.editCatId) await PUT(`/api/categories/${S.editCatId}`, body);
    else             await POST('/api/categories', body);
    closeModal('ov-cat');
    const data = await GET('/api/categories');
    S.categories = data.categories || [];
    window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
  });
}

export async function deleteCat() {
  if (!S.editCatId) return;
  await DEL(`/api/categories/${S.editCatId}`);
  closeModal('ov-cat');
  const data = await GET('/api/categories');
  S.categories = data.categories || [];
  window.__forceRenderCurrentTab?.() ?? window.__renderCurrentTab();
}
