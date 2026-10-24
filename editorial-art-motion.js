/* The accessible static artwork remains the default without JavaScript. */
(function(){
  'use strict';
  var reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  var connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  var instances=[];
  function enhance(image){
    if(image.closest('.faa-editorial-motion')||image.closest('a'))return;
    var wrapper=document.createElement('div');wrapper.className='faa-editorial-motion';image.before(wrapper);wrapper.appendChild(image);
    var button=document.createElement('button');button.type='button';button.className='faa-editorial-motion-toggle';wrapper.appendChild(button);
    var canvas,context,source,resizeObserver;
    var state={paused:reduced.matches||Boolean(connection&&connection.saveData),visible:false,ready:false,frame:0,elapsed:0,last:0};
    function update(){
      var running=state.ready&&!state.paused&&state.visible&&!document.hidden&&!reduced.matches;
      wrapper.dataset.motionState=running?'running':'paused';
      button.textContent=state.paused?'Play motion':'Pause motion';button.setAttribute('aria-label',(state.paused?'Play':'Pause')+' artwork animation');button.setAttribute('aria-pressed',String(state.paused));
      if(state.frame)cancelAnimationFrame(state.frame);state.frame=0;state.last=0;
      if(context&&running)state.frame=requestAnimationFrame(animate);
    }
    function render(time){
      var w=canvas.width,h=canvas.height,iw=source.naturalWidth,ih=source.naturalHeight;if(!w||!h||!iw||!ih)return;
      for(var y=0;y<h;y+=2){var v=y/h;var sx=iw*(.04+.014*Math.sin(v*7+time*.30)+.004*Math.sin(v*17-time*.2));var sy=ih*(.04+v*.92+.014*Math.sin(v*5-time*.35));context.drawImage(source,sx,sy,iw*.92,ih/h*2.5*.92,0,y,w,2.5);}
    }
    function animate(now){
      state.frame=0;if(wrapper.dataset.motionState!=='running')return;
      if(state.last&&now-state.last<40){state.frame=requestAnimationFrame(animate);return;}
      if(state.last)state.elapsed+=Math.min((now-state.last)/1000,.1);state.last=now;
      try{render(state.elapsed);}catch(_){useDrift();return;}state.frame=requestAnimationFrame(animate);
    }
    function resize(){if(!context)return;var ratio=Math.min(window.devicePixelRatio||1,1.5);canvas.width=Math.round(wrapper.clientWidth*ratio);canvas.height=Math.round(wrapper.clientHeight*ratio);render(state.elapsed);}
    function useDrift(){if(state.frame)cancelAnimationFrame(state.frame);state.frame=0;if(canvas)canvas.remove();context=null;if(resizeObserver)resizeObserver.disconnect();wrapper.dataset.motionRenderer='drift';state.ready=true;update();}
    function initialize(){
      if(!image.naturalWidth)return;if(image.dataset.faaMotion!=='flow'){if(!state.ready)useDrift();return;}
      // Decode the cached srcset source without density-corrected dimensions.
      var candidate=new Image();candidate.decoding='async';
      candidate.onload=function(){
        if(candidate.src!==(image.currentSrc||image.src))return;source=candidate;
        if(state.ready&&context){resize();return;}if(state.ready)return;
        canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');wrapper.insertBefore(canvas,button);
        try{context=canvas.getContext('2d',{alpha:false});if(!context){useDrift();return;}resize();if('ResizeObserver'in window){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(wrapper);}else window.addEventListener('resize',resize,{passive:true});wrapper.dataset.motionRenderer='canvas';state.ready=true;update();}catch(_){useDrift();}
      };candidate.onerror=useDrift;candidate.src=image.currentSrc||image.src;
    }
    button.addEventListener('click',function(){state.paused=!state.paused;update();});
    function preference(){state.paused=reduced.matches||Boolean(connection&&connection.saveData);button.hidden=reduced.matches;update();}
    instances.push({update:update,preference:preference});
    if('IntersectionObserver'in window){new IntersectionObserver(function(entries){state.visible=entries[0].isIntersecting;update();},{threshold:.05}).observe(wrapper);}else state.visible=true;
    preference();if(image.complete&&image.naturalWidth)initialize();image.addEventListener('load',initialize);image.addEventListener('error',function(){button.hidden=true;},{once:true});
  }
  document.querySelectorAll('img[data-faa-motion]').forEach(enhance);
  document.addEventListener('visibilitychange',function(){instances.forEach(function(i){i.update();});});
  function preferences(){instances.forEach(function(i){i.preference();});}
  if(reduced.addEventListener)reduced.addEventListener('change',preferences);else if(reduced.addListener)reduced.addListener(preferences);
  if(connection&&connection.addEventListener)connection.addEventListener('change',preferences);
})();
