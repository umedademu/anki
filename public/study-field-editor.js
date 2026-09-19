export function createStudyFieldEditor({root, context, pause, load, save, finish}) {
  let active = null;
  const labels = {prompt:"問題",answer:"回答",explanation:"解説"};
  const targets = {prompt:['#question-text','#question-reading'],answer:['.answer-line','#vocabulary-speech-groups'],explanation:['#term-overview-text']};
  const stop = event => { if (active && !active.form.contains(event.target)) {event.preventDefault();event.stopImmediatePropagation();} };
  root.addEventListener('click',stop,true);
  window.addEventListener('beforeunload',event=>{if(active){event.preventDefault();event.returnValue='';}});
  async function open(field,button) {
    if(active)return;
    const snapshot=context(); if(!snapshot)return;
    const form=document.createElement('form');form.className='study-field-form';
    const label=document.createElement('label');label.textContent=labels[field]+'を編集';
    const input=document.createElement('textarea');input.rows=5;input.maxLength=20000;input.required=field!=='explanation';input.setAttribute('aria-label',labels[field]+'の編集内容');
    label.append(input);
    const actions=document.createElement('div');actions.className='study-field-actions';
    const submit=document.createElement('button');submit.type='submit';submit.textContent='保存';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='キャンセル';
    const status=document.createElement('p');status.setAttribute('role','status');status.textContent='最新の内容を読み込んでいます…';
    actions.append(submit,cancel);form.append(label,actions,status);
    const hidden=targets[field].map(selector=>root.querySelector(selector)).filter(Boolean).map(node=>({node,hidden:node.classList.contains('is-hidden')}));
    const buttons=[...root.querySelectorAll('button')].map(node=>({node,disabled:node.disabled}));
    active={snapshot,field,form,hidden,buttons,button,pending:null};const edit=active;
    pause(); buttons.forEach(({node})=>node.disabled=true);hidden.forEach(({node})=>node.classList.add('is-hidden'));
    button.parentElement.append(form);input.disabled=true;submit.disabled=true;
    function close() {
      if(active!==edit)return;
      active=null;form.remove();hidden.forEach(({node,hidden})=>node.classList.toggle('is-hidden',hidden));
      buttons.forEach(({node,disabled})=>node.disabled=disabled);finish();button.focus({preventScroll:true});
    }
    edit.close=close;
    cancel.addEventListener('click',close);
    form.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'&&!cancel.disabled){event.preventDefault();close();}});
    form.addEventListener('submit',async event=>{
      event.preventDefault();event.stopPropagation();
      const value=input.value.trim();
      if(!value && field!=='explanation'){status.textContent='空欄にはできません。';return;}
      submit.disabled=true;cancel.disabled=true;input.disabled=true;status.textContent='保存しています…';
      edit.done=new Promise(resolve=>edit.resolve=resolve);
      try {
        edit.pending ??= {operationId:crypto.randomUUID(),value};
        await save(snapshot,field,edit.pending,edit.loaded); close();
      } catch(error) {
        status.textContent=error.message+' 入力内容は残っています。';
        // 応答消失時は同じ内容・同じ操作番号で再送する。
        submit.textContent='保存を再試行';submit.disabled=error.status===409;cancel.disabled=false;input.disabled=false;input.readOnly=true;
      } finally {edit.resolve();edit.done=null;}
    });
    try {
      const loaded=await load(snapshot);if(active!==edit)return;
      edit.loaded=loaded;input.value=loaded[field]??'';input.disabled=false;submit.disabled=false;
      status.textContent='';input.focus();
    }catch(error){if(active===edit){status.textContent=error.message+' キャンセルして開き直してください。';}}
  }
  for(const button of root.querySelectorAll('[data-edit-study]'))button.addEventListener('click',()=>void open(button.dataset.editStudy,button));
  return {get active(){return Boolean(active);}, async closeForNavigation(){if(active?.done)await active.done;active?.close();}};
}
