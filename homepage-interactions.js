/* Two ways to create value: recover time or add useful output. */
(() => {
  'use strict';
  const section = document.getElementById('your-role');
  const select = document.getElementById('business-role');
  const picker = document.getElementById('role-picker');
  const container = document.getElementById('role-panels');
  const layout = document.querySelector('.role-layout');
  const target = document.querySelector('.role-target');
  const context = document.querySelector('.role-context');
  const panels = Array.from(document.querySelectorAll('#role-panels .role-panel'));
  const status = document.getElementById('role-status');
  const choices = Array.from(document.querySelectorAll('[data-role-goal][type="button"]'));
  if (!section || !select || !picker || !container || !panels.length) return;

  // These examples describe additional work, rather than relabeling existing savings.
  const capacity = {
    ceo: ['Turn more operating signals into action.', 'Additional operating exception reviews', 'Review issues beyond the standing leadership pack, with source evidence, decisions needed, and named follow-up owners.', ['Research emerging operating exceptions', 'Prepare additional decision briefs', 'Track unresolved action items'], 'Review one week of deferred operating issues and select the decisions worth preparing.', 'Operational visibility; shorter decision cycle time.', 'Additional decision-ready issues reviewed and resolved.'],
    cfo: ['Give more financial risks the attention they need.', 'Additional cash and margin analysis', 'Extend analysis to scenarios and exceptions the finance team has not had capacity to examine, using reconciled inputs and approved assumptions.', ['Prepare additional cash scenarios', 'Research margin exceptions', 'Draft risk and action briefs'], 'List deferred cash and margin questions, then select a bounded analysis with reconciled inputs.', 'Cash flow visibility; earlier margin and risk intervention.', 'Additional cash or margin exceptions reviewed and acted on.'],
    controller: ['Get to the exceptions beyond the close.', 'Additional reconciliation and control reviews', 'Prepare evidence for aged reconciliation items and recurring close problems that would otherwise remain unresolved.', ['Research aged reconciliation items', 'Investigate recurring close exceptions', 'Prepare control improvement notes'], 'Identify unresolved reconciliation items outside the routine close and verify the supporting records.', 'Lower risk exposure; shorter future close cycles.', 'Additional exceptions resolved and recurring errors prevented.'],
    ar: ['Give more overdue accounts a useful next step.', 'Additional collections preparation', 'Prepare account histories, dispute evidence, and approved follow-up drafts for overdue accounts that currently receive too little attention.', ['Research additional overdue accounts', 'Prepare additional collection drafts', 'Build unresolved dispute packets'], 'Identify overdue accounts receiving no regular follow-up and confirm balances and contact ownership.', 'Improved collections coverage and cash flow.', 'Additional verified accounts followed up and cash collected.'],
    ap: ['Get ahead of more supplier exceptions.', 'Additional payable exception reviews', 'Extend review to invoice discrepancies and supplier issues that would otherwise stay in the queue, with evidence for an authorized AP reviewer.', ['Investigate additional invoice exceptions', 'Prepare supplier discrepancy packets', 'Draft outstanding approval follow-ups'], 'Select a deferred invoice exception queue and verify invoice, PO, and receipt records.', 'Fewer payment delays; better cash flow visibility and lower risk.', 'Additional exceptions resolved without payment or vendor errors.'],
    ops: ['Give more operating bottlenecks an owner.', 'Additional workflow exception analysis', 'Prepare evidence and action briefs for recurring delays that daily firefighting leaves the operations team unable to investigate.', ['Research deferred operating bottlenecks', 'Prepare additional exception briefs', 'Track improvement action handoffs'], 'Choose one recurring delay the team has not had time to investigate and establish its baseline.', 'Higher throughput; shorter cycle time.', 'Additional bottlenecks resolved and the resulting cycle-time improvement.'],
    production: ['Get to the downtime patterns behind the shift.', 'Additional production loss reviews', 'Analyze more shift and downtime records to surface recurring losses for the plant team to validate and address.', ['Review additional shift histories', 'Research recurring downtime patterns', 'Prepare improvement action briefs'], 'Select a deferred downtime review and confirm the reliability of shift logs and equipment codes.', 'Higher throughput; better production visibility.', 'Additional loss patterns validated and downtime reduced.'],
    supply: ['Give more supply risks attention before they escalate.', 'Additional supplier commitment reviews', 'Review more open orders and supplier commitments, preparing evidence and follow-up drafts for risks the buying team cannot currently cover.', ['Review additional supplier commitments', 'Research uncovered delivery risks', 'Prepare buyer follow-up packets'], 'Identify open orders outside current review coverage and confirm supplier commitments and due dates.', 'Lower supply risk; fewer interruptions to throughput.', 'Additional at-risk orders reviewed and disruptions prevented.'],
    inventory: ['Get to more of the discrepancies in the queue.', 'Additional inventory exception reviews', 'Prepare movement histories and count-review evidence for stock discrepancies that the warehouse team has not had capacity to investigate.', ['Research additional stock discrepancies', 'Prepare additional count-review packets', 'Draft unresolved movement follow-ups'], 'Select deferred stock discrepancies and verify item, bin, and movement records.', 'Better inventory visibility; lower working-capital and fulfillment risk.', 'Additional verified discrepancies resolved and inventory accuracy improved.'],
    logistics: ['Cover more delivery exceptions before customers chase.', 'Additional shipment exception preparation', 'Review more shipments and prepare verified status updates and exception packets for deliveries beyond the dispatch team’s current coverage.', ['Review additional shipment histories', 'Draft additional customer updates', 'Prepare deferred delivery exception packets'], 'Identify shipments outside current follow-up coverage and verify carrier events and delivery commitments.', 'Better delivery visibility; shorter exception cycle time.', 'Additional delivery exceptions resolved and service commitments met.'],
    quality: ['Build evidence for more unresolved quality issues.', 'Additional quality investigation preparation', 'Organize inspection records, traceability, and draft issue summaries for investigations that would otherwise remain in the backlog.', ['Gather additional inspection evidence', 'Prepare deferred issue summaries', 'Draft corrective-action follow-up packs'], 'Choose a deferred quality investigation and verify specifications, revisions, and traceability.', 'Lower quality risk; fewer repeat defects and margin losses.', 'Additional investigations completed and repeat defects reduced.'],
    sales: ['Reach the prospects you never had time to research.', 'Additional qualified prospecting', 'Research additional target accounts, verify fit, and prepare relevant outreach drafts for salesperson review using approved sources and current CRM records.', ['Research additional target accounts', 'Verify fit and CRM history', 'Prepare relevant outreach drafts'], 'Define the ideal customer, approve research sources, and identify accounts outside current prospecting coverage.', 'More qualified pipeline and selling capacity.', 'Additional qualified accounts researched, conversations started, and opportunities created.', ['Current CRM records, defined ideal-customer criteria, approved research sources, product claims, and contact-use rules.', 'Remove duplicate accounts, define qualification criteria, and assign research, outreach review, and follow-up ownership.', 'Salesperson verifies account facts and approves outreach, pricing, and commitments; review remains part of the time estimate.']],
    estimating: ['Review more suitable bids without rushing the estimate.', 'Additional bid opportunity preparation', 'Screen more suitable bid packages and prepare scope, missing-information, and RFI checklists for estimator review before committing estimating effort.', ['Organize additional bid packages', 'Prepare additional scope and RFI checks', 'Draft additional bid review summaries'], 'Define bid/no-bid criteria and select suitable opportunities the team currently lacks capacity to review.', 'Greater bid-review throughput; better use of estimating capacity.', 'Additional suitable bids reviewed, with estimate quality and margin protected.'],
    pm: ['Give more project risks attention before they grow.', 'Additional project risk and change reviews', 'Prepare evidence on open actions, emerging schedule risks, and potential changes that the project team has not had time to examine.', ['Research additional project risks', 'Prepare unresolved action reviews', 'Draft additional change evidence packs'], 'Identify deferred project risks or change reviews and confirm the current schedule and contract records.', 'Lower margin leakage and project risk; better delivery visibility.', 'Additional verified risks addressed and changes documented in time.'],
    service: ['Follow through on the customer issues still waiting.', 'Additional unresolved customer case preparation', 'Prepare account evidence and draft responses for unresolved customer cases beyond the service team’s current review coverage.', ['Triage additional unresolved cases', 'Research additional account evidence', 'Draft additional case follow-ups'], 'Select unresolved cases outside normal coverage and confirm account access and escalation ownership.', 'Shorter customer resolution cycles; lower service risk.', 'Additional cases resolved while accuracy and service quality are maintained.'],
    it: ['Get to the recurring issues behind the ticket queue.', 'Additional service problem reviews', 'Review more recurring tickets and prepare source-linked problem summaries and runbook improvement drafts for IT approval.', ['Review additional recurring tickets', 'Research approved resolution evidence', 'Draft additional runbook improvements'], 'Select a recurring issue the team has not had time to investigate and confirm approved ticket and runbook access.', 'Lower operational risk; fewer repeat tickets and interruptions.', 'Additional recurring problems resolved and repeat ticket volume reduced.'],
    hr: ['Give more onboarding work consistent follow-through.', 'Additional onboarding and policy support', 'Prepare additional approved policy answers, onboarding checklists, and routine communications that the HR team has not had capacity to complete.', ['Prepare additional policy answer drafts', 'Build deferred onboarding checklists', 'Draft additional routine communications'], 'Choose deferred routine onboarding or policy support work and verify policy versions and access permissions.', 'Shorter onboarding cycle time; lower compliance and handoff risk.', 'Additional onboarding steps completed accurately and on time.'],
    marketing: ['Get useful content out of the ideas still waiting.', 'Additional approved campaign preparation', 'Turn more approved source material into researched outlines, channel drafts, and campaign review briefs for the marketing owner to approve.', ['Research additional source-backed outlines', 'Prepare additional channel drafts', 'Build additional campaign review briefs'], 'Select content the team has not had time to develop and approve the audience, sources, claims, and review owner.', 'Greater campaign throughput and qualified demand capacity.', 'Additional approved content published and qualified inquiries generated.'],
    admin: ['Follow through on the actions that keep slipping.', 'Additional meeting and action support', 'Prepare briefs, action registers, and follow-up drafts for meetings and commitments beyond the assistant’s current coverage.', ['Prepare additional meeting briefs', 'Build deferred action registers', 'Draft additional follow-up packets'], 'Identify meetings or commitments without regular support and confirm access and follow-up ownership.', 'Shorter follow-up cycles; better visibility of commitments.', 'Additional commitments tracked and completed on time.']
  };
  const recovered = new Map(panels.map(panel => [panel.id, panel.innerHTML]));
  let goal = 'recovered';

  function applyGoal(panel) {
    panel.innerHTML = recovered.get(panel.id);
    if (goal !== 'capacity') return;
    const spec = capacity[panel.id.replace('role-', '')];
    if (!spec) return;
    const [title, application, description, tasks, firstStep, impact, success, foundation] = spec;
    panel.querySelector('h3').textContent = title;
    panel.querySelector('.role-application').textContent = application;
    panel.querySelector('.role-description').textContent = description;
    panel.querySelector('.role-time h4').textContent = 'One possible path to 10 hours of capacity added';
    panel.querySelector('.role-assumption').textContent = 'Illustrative weekly hours, not measured client results. Manual = equivalent effort for additional work; With AI includes human review. Added = Manual minus With AI. Validate useful output, review effort, and quality in your business.';
    const headers = panel.querySelectorAll('thead th');
    ['Work', 'Manual*', 'With AI*', 'Added*'].forEach((label, i) => { headers[i].textContent = label; });
    panel.querySelectorAll('tbody th').forEach((cell, i) => { cell.textContent = tasks[i]; });
    panel.querySelector('tfoot th').textContent = 'Weekly equivalent';
    panel.querySelector('.role-outcome p').textContent = impact;
    const next = panel.querySelectorAll('.role-next p');
    next[1].replaceChildren(Object.assign(document.createElement('strong'), {textContent: 'First step:'}), ' ' + firstStep);
    next[3].replaceChildren(Object.assign(document.createElement('strong'), {textContent: 'Success measure:'}), ' ' + success + ' Count additional useful output after review and rework; include setup and ongoing costs in the business case.');
    panel.querySelector('.role-cta').firstChild.textContent = 'Find my capacity opportunity';
    if (foundation) panel.querySelectorAll('.role-foundation li p').forEach((p, i) => { p.textContent = foundation[i]; });
  }

  function showRole() {
    const selected = panels.find(panel => panel.id === 'role-' + select.value);
    panels.forEach(panel => { panel.hidden = panel !== selected; });
    if (selected) applyGoal(selected);
    container.hidden = !selected;
    if (target) {
      target.hidden = !selected;
      target.querySelector('.mi-label').textContent = goal === 'capacity' ? 'Weekly capacity-added target' : 'Weekly time-back target';
    }
    if (context) {
      context.hidden = !selected;
      context.textContent = goal === 'capacity'
        ? 'Start with valuable work you cannot currently cover. Govern the data, define the workflow, then apply AI with a review owner. Measure additional output after review effort.'
        : 'Start with work you already repeat. Improve the data and workflow, then use AI to reduce the preparation.';
    }
    if (layout) layout.classList.toggle('is-awaiting-role', !selected);
    if (status) status.textContent = selected
      ? 'Showing ' + (goal === 'capacity' ? 'capacity added' : 'time recovered') + ' for ' + select.options[select.selectedIndex].text + '.'
      : (goal === 'capacity' ? 'Capacity added' : 'Time recovered') + ' selected. Choose your role to explore a practical application.';
  }

  choices.forEach(button => {
    button.addEventListener('click', () => {
      goal = button.dataset.roleGoal;
      section.dataset.roleGoal = goal;
      choices.forEach(choice => { choice.setAttribute('aria-pressed', String(choice === button)); });
      showRole();
    });
  });
  select.value = '';
  select.addEventListener('change', showRole);
  picker.hidden = false;
  showRole();
})();
