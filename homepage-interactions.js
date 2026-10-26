/* Role details appear only after a visitor makes a selection. */
(() => {
  'use strict';
  const select = document.getElementById('business-role');
  const picker = document.getElementById('role-picker');
  const container = document.getElementById('role-panels');
  const layout = document.querySelector('.role-layout');
  const target = document.querySelector('.role-target');
  const context = document.querySelector('.role-context');
  const panels = Array.from(document.querySelectorAll('#role-panels .role-panel'));
  const status = document.getElementById('role-status');
  if (!select || !picker || !container || !panels.length) return;
  function showRole() {
    const selected = panels.find(panel => panel.id === 'role-' + select.value);
    panels.forEach(panel => { panel.hidden = panel !== selected; });
    container.hidden = !selected;
    if (target) target.hidden = !selected;
    if (context) context.hidden = !selected;
    if (layout) layout.classList.toggle('is-awaiting-role', !selected);
    if (status) status.textContent = selected
      ? 'Showing the practical AI application for ' + select.options[select.selectedIndex].text + '.'
      : 'Choose a role to see a practical AI application.';
  }
  select.value = '';
  select.addEventListener('change', showRole);
  picker.hidden = false;
  showRole();
})();
