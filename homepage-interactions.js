/* Native select and details remain keyboard accessible; no tracking or network calls. */
(() => {
  'use strict';
  const select = document.getElementById('business-role');
  const picker = document.getElementById('role-picker');
  const panels = Array.from(document.querySelectorAll('#role-panels .role-panel'));
  const status = document.getElementById('role-status');
  if (!select || !picker || !panels.length) return;
  function showRole() {
    const selected = panels.find(panel => panel.id === 'role-' + select.value);
    if (!selected) return;
    panels.forEach(panel => { panel.hidden = panel !== selected; });
    if (status) status.textContent = 'Showing the practical AI application for ' + select.options[select.selectedIndex].text + '.';
  }
  select.addEventListener('change', showRole);
  picker.hidden = false;
  showRole();
})();
