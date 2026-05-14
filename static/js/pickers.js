import { COLORS, ICONS_ACC, ICONS_SUB, ICONS_CAT } from './config.js';
import { haptic } from './api.js';

export function renderIconPicker(containerId, icons, selected, onChange) {
  const el = document.getElementById(containerId);
  el.innerHTML = icons.map(ico =>
    `<div class="ip-item ${ico === selected ? 'sel' : ''}" data-icon="${ico}" data-picker="${containerId}">${ico}</div>`
  ).join('');
  el._onChange = onChange;
}

export function renderColorPicker(containerId, selected, onChange) {
  const el = document.getElementById(containerId);
  el.innerHTML = COLORS.map(c =>
    `<div class="cp-swatch ${c === selected ? 'sel' : ''}" style="background:${c}" data-color="${c}" data-picker="${containerId}"></div>`
  ).join('');
  el._onChange = onChange;
}

// Handle clicks via event delegation from app.js
export function handlePickerClick(e) {
  const iconItem  = e.target.closest('[data-icon][data-picker]');
  const colorItem = e.target.closest('[data-color][data-picker]');

  if (iconItem) {
    haptic();
    const el  = document.getElementById(iconItem.dataset.picker);
    const ico = iconItem.dataset.icon;
    el.querySelectorAll('.ip-item').forEach(i => i.classList.toggle('sel', i.dataset.icon === ico));
    if (el._onChange) el._onChange(ico);
    return;
  }
  if (colorItem) {
    haptic();
    const el    = document.getElementById(colorItem.dataset.picker);
    const color = colorItem.dataset.color;
    el.querySelectorAll('.cp-swatch').forEach(s => s.classList.toggle('sel', s.dataset.color === color));
    if (el._onChange) el._onChange(color);
    return;
  }
}

export { ICONS_ACC, ICONS_SUB, ICONS_CAT };
