/* One role selection reveals both opportunities and their verified calculations. */
(() => {
  const root=document.getElementById('faa-role-opportunities');
  const picker=root.querySelector('#faa-op-role');
  const explore=root.querySelector('#faa-op-explore');
  const catalog=JSON.parse(document.getElementById('faa-op-catalog').textContent);
  const data=Object.fromEntries(catalog.map(role=>[role.key,role]));
  const initial={time:{title:'Make room<br>in your week.',description:'Spend less time on routine work. Put more of your attention where it makes a difference.',impact:'Less routine work. More time for what matters.'},capacity:{title:'Get to the work<br>still waiting.',description:'Cover valuable work you cannot get to today. Create capacity to move more priorities forward.',impact:'More useful work within reach.'}};
  const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function totals(scenario){
    const before=scenario.rows.reduce((n,row)=>n+row[1],0);
    const after=scenario.rows.reduce((n,row)=>n+row[2],0);
    return {before,after,benefit:before-after};
  }
  function workflow(role,kind){
    const capacity=kind==='capacity';
    const d=role[kind], sum=totals(d);
    const rows=d.rows.map(([label,before,after])=>`<tr><th scope="row">${esc(label)}</th><td>${before}h</td><td>${after}h</td><td>${before-after}h</td></tr>`).join('');
    const foundations=[['Data Curation & Governance',role.foundations.data],['Workflow Optimization',role.foundations.workflow],['AI Design & Implementation',role.foundations.ai]];
    return `<section class="fo-workflow ${capacity?'fo-workflow-capacity':''}" aria-label="${capacity?'Capacity added':'Time recovered'} calculation for ${esc(role.name)}">
      <div class="fo-detail-label"><p class="fo-eyebrow">${capacity?'Capacity added':'Time recovered'}</p><span>${sum.benefit} ${capacity?'equivalent hours':'hours back'}</span></div>
      <p class="fo-detail-role">${esc(role.name)}</p>
      <h4>${esc(d.title)}</h4>
      <h5>${esc(d.application)}</h5>
      <p class="fo-detail-description">${esc(d.description)}</p>
      <h6>${capacity?'One possible path to '+sum.benefit+' hours of added capacity':'One possible path to '+sum.benefit+' hours back'}</h6>
      <p class="fo-table-note">${capacity?'Illustrative weekly equivalent effort for additional work, not measured client results. Manual is what this work would require without AI. With AI includes use, human review, and rework.':'Illustrative weekly hours for one person, not measured client results. Target time includes AI use, human review, and rework. Actual savings depend on volume, data quality, and adoption.'}</p>
      <table><caption class="fo-sr">${esc(role.name)}: ${capacity?'capacity added':'time recovered'} calculation. Hours per week; monthly work is normalized to a weekly average.</caption><thead><tr><th scope="col">Work</th><th scope="col">${capacity?'Manual':'Today'}</th><th scope="col">${capacity?'With AI':'Target'}</th><th scope="col">${capacity?'Added':'Back'}</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th scope="row">${capacity?'Weekly equivalent':'Weekly total'}</th><td>${sum.before}h</td><td>${sum.after}h</td><td>${sum.benefit}h</td></tr></tfoot></table>
      <details class="fo-prerequisites"><summary class="cursor-interaction">What needs to be in place <span aria-hidden="true">+</span></summary><ol>${foundations.map(([label,text])=>`<li><strong>${esc(label)}</strong>${esc(text)}</li>`).join('')}</ol></details>
      <p class="fo-detail-impact"><strong>Business impact</strong>${esc(d.impact)}</p>
    </section>`;
  }
  picker.addEventListener('change',()=>{
    const key=picker.value;
    const role=data[key];
    root.dataset.role=key;
    root.querySelectorAll('.fo-value').forEach(e=>e.hidden=!role);
    explore.hidden=!role;
    if(!role) explore.open=false;
    ['time','capacity'].forEach(kind=>{
      const d=role?role[kind]:initial[kind];
      const title=root.querySelector('#faa-op-'+kind+'-title');
      if(role) title.textContent=d.shortTitle; else title.innerHTML=d.title;
      root.querySelector('#faa-op-'+kind+'-description').textContent=d.description;
      root.querySelector('#faa-op-'+kind+'-impact').textContent=d.impact;
      const work=root.querySelector('#faa-op-'+kind+'-work');
      work.hidden=!role;
      work.replaceChildren(...(role?d.rows:[]).map(row=>Object.assign(document.createElement('li'),{textContent:row[0]})));
      if(role) root.querySelector('.fo-'+kind+' .fo-number').textContent=totals(d).benefit;
    });
    root.querySelector('#faa-op-context').textContent=role?role.name:'Two ways to move your business forward.';
    picker.setAttribute('title',role?role.name:'Choose your role');
    root.querySelector('#faa-op-caveat').textContent=role?'Illustrative weekly targets, not guaranteed results. Added capacity measures equivalent work enabled. If it uses recovered time, count that benefit once.':'Choose your role to see practical examples and illustrative weekly targets.';
    root.querySelector('#faa-op-announcement').textContent=role?'Both opportunities updated for '+role.name+'. '+totals(role.time).benefit+' hours recovered and '+totals(role.capacity).benefit+' equivalent hours of capacity added each week. Illustrative targets to validate.':'Choose a role to see both opportunities.';
    if(role){
      root.querySelector('#faa-op-summary-kicker').textContent='Your role. Both opportunities. The calculations behind them.';
      root.querySelector('#faa-op-workflows').innerHTML=workflow(role,'time')+workflow(role,'capacity');
      const entries=[['Objective','Recover preparation time and extend capacity for additional work in this role.'],['Owner',role.owner],['Next step',role.next],['Timeline',role.timeline],['Measures',role.measures],['Value','Count each benefit once. If added capacity uses time already counted as recovered, do not add those hours again. Include setup, operating cost, review, and rework in the payback calculation.']];
      root.querySelector('#faa-op-business-case').replaceChildren(...entries.flatMap(([label,value])=>[Object.assign(document.createElement('dt'),{textContent:label}),Object.assign(document.createElement('dd'),{textContent:value})]));
    }
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      root.querySelectorAll('.fo-benefit').forEach((e,i)=>e.animate([{transform:'translateY(7px)',opacity:.78},{transform:'translateY(0)',opacity:1}],{duration:340,delay:i*45,easing:'cubic-bezier(.2,.7,.25,1)'}));
    }
  });
})();
