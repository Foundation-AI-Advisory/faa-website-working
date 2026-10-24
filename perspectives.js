/* Client-side topic, format, and keyword discovery. */
(() => {
  'use strict';
  const root = document.querySelector('.perspectives-page');
  if (!root) return;
  const grid = document.getElementById('perspectives-grid');
  const cards = [...grid.querySelectorAll('[data-card-topic]')];
  const topics = [...document.querySelectorAll('[data-perspective-topic]')];
  const search = document.getElementById('perspectives-search');
  const format = document.getElementById('perspectives-format');
  const status = document.getElementById('perspectives-status');
  const heading = document.getElementById('perspectives-heading');
  const clear = document.querySelector('.perspectives-clear-search');
  const reset = document.querySelector('.perspectives-reset');
  const more = document.querySelector('.perspectives-more');
  const moreButton = document.getElementById('perspectives-more');
  const empty = document.querySelector('.perspectives-empty');
  const divider = document.querySelector('.perspectives-divider');
  const topicNames = {all:'All topics',data:'Data',process:'Workflows',ai:'Applied AI'};
  const formatNames = {article:'Articles',brief:'Briefs','field-note':'Field notes',podcast:'Podcasts',video:'Videos',infographic:'Infographics'};
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’‘]/g,"'");
  const indexed = cards.map(card => ({card,topic:card.dataset.cardTopic,format:card.dataset.cardFormat,text:normalize(card.textContent)}));
  let state = {topic:'all',format:'all',q:''}, limit = 9, timer;
  function readURL() {
    const params = new URLSearchParams(location.search);
    const topic = params.get('topic'), selectedFormat = params.get('format');
    state = {topic:Object.hasOwn(topicNames,topic)?topic:'all',format:Object.hasOwn(formatNames,selectedFormat)?selectedFormat:'all',q:(params.get('q')||'').slice(0,200)};
    // Legacy menu links may point to a format with no published content yet.
    if (state.format !== 'all' && ![...format.options].some(option => option.value === state.format)) {
      const option = document.createElement('option');option.value=state.format;option.textContent=formatNames[state.format];format.append(option);
    }
    search.value=state.q;format.value=state.format;limit=9;
  }
  function syncURL(method='pushState') {
    const url = new URL(location.href);
    for (const key of ['topic','format','q']) {
      const value=state[key];
      if (!value || value==='all') url.searchParams.delete(key);else url.searchParams.set(key,value);
    }
    const next=url.pathname+url.search+url.hash;
    if (next !== location.pathname+location.search+location.hash) history[method](null,'',next);
  }
  function render() {
    const words=normalize(state.q.trim()).split(/\s+/).filter(Boolean);
    const filtered=state.topic!=='all'||state.format!=='all'||words.length>0;
    const matches=indexed.filter(item=>(state.topic==='all'||item.topic===state.topic)&&(state.format==='all'||item.format===state.format)&&words.every(word=>item.text.includes(word)));
    const shown=matches.slice(0,limit),visible=new Set(shown.map(item=>item.card));
    cards.forEach(card=>{card.hidden=!visible.has(card);});
    grid.classList.toggle('is-curated',!filtered);
    divider.hidden=filtered||shown.length<4;
    topics.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.perspectiveTopic===state.topic)));
    heading.textContent=filtered?(words.length?'Search results':state.topic==='all'?formatNames[state.format]:topicNames[state.topic]+' perspectives'):'Featured perspectives';
    const total=matches.length;
    status.textContent=`${total} ${total===1?'perspective':'perspectives'}${total>shown.length?' · Showing '+shown.length:''}`;
    clear.hidden=!state.q;reset.hidden=!filtered;empty.hidden=total!==0;more.hidden=shown.length>=total;
    moreButton.textContent=total>shown.length?`Show ${Math.min(6,total-shown.length)} more perspectives ↓`:'Show more perspectives';
    return shown;
  }
  function apply(method='pushState') {clearTimeout(timer);state.q=search.value.trim();limit=9;syncURL(method);render();}
  topics.forEach(button=>button.addEventListener('click',()=>{state.topic=button.dataset.perspectiveTopic;apply();}));
  format.addEventListener('change',()=>{state.format=format.value;apply();});
  search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>apply('replaceState'),200);});
  search.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();search.value='';apply('replaceState');}});
  document.querySelector('.perspectives-tools').addEventListener('submit',event=>{event.preventDefault();apply('replaceState');});
  clear.addEventListener('click',()=>{search.value='';apply('replaceState');search.focus();});
  function resetAll(){clearTimeout(timer);state={topic:'all',format:'all',q:''};search.value='';format.value='all';limit=9;syncURL();render();}
  reset.addEventListener('click',resetAll);
  document.querySelector('.perspectives-reset-all').addEventListener('click',()=>{resetAll();topics[0].focus();});
  moreButton.addEventListener('click',()=>{const previouslyVisible=new Set(cards.filter(card=>!card.hidden));limit+=6;const shown=render();const next=shown.find(item=>!previouslyVisible.has(item.card));if(next)next.card.focus({preventScroll:true});});
  window.addEventListener('popstate',()=>{clearTimeout(timer);readURL();render();});
  readURL();render();document.querySelector('.perspectives-controls').hidden=false;
})();
