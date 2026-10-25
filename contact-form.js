
(async function(){
  const form=document.querySelector('#faa-contact-form'); if(!form)return;
  const status=document.querySelector('#faa-contact-status'), button=form.querySelector('button[type=submit]');
  let config;try{const r=await fetch('/contact-config.json',{cache:'no-store'});if(!r.ok)return;config=await r.json();}catch{return;}
  if(!config.enabled||!config.turnstileSiteKey||!/^https:\/\//.test(config.endpoint||''))return;
  let token='',widget;
  const setStatus=(message)=>{status.textContent=message;};
  window.faaTurnstileReady=()=>{
    widget=window.turnstile.render('#faa-contact-challenge',{
      sitekey:config.turnstileSiteKey,action:'contact',
      callback:value=>{token=value;button.disabled=false;},
      'expired-callback':()=>{token='';button.disabled=true;setStatus('Please complete the security check again.');},
      'error-callback':()=>{token='';button.disabled=true;setStatus('The security check could not load. Please use the email link below.');}
    });
    form.hidden=false;document.querySelector('#faa-contact-fallback').hidden=true;
  };
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=faaTurnstileReady&render=explicit';script.async=true;
  document.head.append(script);
  let submissionId=crypto.randomUUID();
  form.addEventListener('input',()=>{submissionId=crypto.randomUUID();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity()||!token)return;
    button.disabled=true;setStatus('Sending your inquiry…');
    const data=Object.fromEntries(new FormData(form));
    data.token=token;data.submissionId=submissionId;
    data.context=(new URLSearchParams(location.search).get('subject')||'Website inquiry').slice(0,160);
    try{
      const r=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(25000)});
      const result=await r.json();
      if(!r.ok||result.ok!==true)throw new Error('submission_failed');
      form.reset();form.querySelector('fieldset').disabled=true;
      setStatus('Thank you. Your inquiry has been submitted to Foundation AI Advisory.');
      status.focus();
    }catch{
      setStatus('We could not confirm your submission. Your entries are still here. Please try again or email us below.');
      token='';window.turnstile.reset(widget);status.focus();
    }
  });
})();
