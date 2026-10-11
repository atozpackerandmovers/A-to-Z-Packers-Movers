/* Shared customer instructions: quotation is the authoritative record. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let rows = [], plans = [], ready = false, db, fs, failure = '', timer;
  function reference(r = {}) {
    return { id: r.linked_backend_id || r.linkedBackendId || r.quotationBackendId || r.quotationDocId || r.docId || r.__backendId || '', plan: r.module === 'jobs' ? String(r.id || r.job_id || '') : '', job: r.module === 'jobs' ? String(r.job_id || '') : '', no: r.linked_quotation_no || r.linkedQuotationNo || r.quotation_number || r.quotationNo || r.quotationId || r.quotation_id || r.quotation_no || '' };
  }
  function resolve(ref) {
    if (!ref.id && !ref.no && (ref.plan || ref.job)) {
      const matches = plans.filter(p => ('PLAN_'+p.__backendId).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,90) === ref.plan || (ref.job && p.planning_no === ref.job));
      if (matches.length === 1) ref = reference(matches[0]);
    }
    if (ref.id) { const exact = rows.find(r => r.__backendId === ref.id); if (exact) return exact; }
    const matches = rows.filter(r => String(r.quotation_number || r.quotationNo || '') === String(ref.no) && ref.no);
    return matches.length === 1 ? matches[0] : null;
  }
  window.azpQuotationNotesMount = r => { const ref = reference(r); return `<div class="azp-note-mount" data-note-id="${esc(ref.id)}" data-note-no="${esc(ref.no)}" data-note-plan="${esc(ref.plan)}" data-note-job="${esc(ref.job)}"></div>`; };
  window.azpQuotationNoteHTML = r => esc(window.azpGetQuotationNotes(r)).replace(/\n/g, '<br>');
  window.azpGetQuotationNotes = r => {
    const q = resolve(reference(r));
    return q ? String(q.customer_notes || '') : String(r?.quotation_notes || '');
  };
  function mountContent(ref) {
    const q = resolve(ref);
    if (failure) return `<div class="azp-note-box"><b>Customer Notes</b><p>${esc(failure)}</p></div>`;
    if (!q) return `<div class="azp-note-box"><b>Customer Notes</b><p>${esc(failure || (!ready ? 'Loading latest customer instructions…' : 'Link a saved quotation to access its notes.'))}</p></div>`;
    return `<div class="azp-note-box"><div class="azp-note-head"><b>📝 Customer Notes & Conditions</b><button type="button" data-note-edit="${esc(q.__backendId)}">${q.customer_notes ? 'Edit Note' : 'Add Note'}</button></div><p class="azp-note-text">${esc(q.customer_notes || 'No customer conditions recorded yet.')}</p>${q.customer_notes_updated_at ? `<small>Updated ${esc(new Date(q.customer_notes_updated_at).toLocaleString('en-IN'))}${q.customer_notes_by ? ' · '+esc(q.customer_notes_by) : ''}</small>` : ''}</div>`;
  }
  function paint() {
    document.querySelectorAll('.azp-note-mount').forEach(el => {
      let ref = {id: el.dataset.noteId, no: el.dataset.noteNo, plan:el.dataset.notePlan, job:el.dataset.noteJob};
      if (el.id === 'azp-planning-notes') ref = {id: document.getElementById('plan_linked_backend_id')?.value, no: document.getElementById('plan_linked_quotation_no')?.value};
      const html = mountContent(ref); if (el.innerHTML !== html) el.innerHTML = html;
    });
    const board = document.getElementById('azp-notes-records');
    if (board) {
      const term = String(document.getElementById('azp-notes-search')?.value || '').trim().toLowerCase();
      const list = rows.filter(r => term ? [r.customer_name,r.customerName,r.party_mobile,r.partyMobile,r.customerMobile,r.quotation_number,r.quotationNo,r.quotationId,r.customer_notes].join(' ').toLowerCase().includes(term) : true)
        .sort((a,b) => String(b.customer_notes_updated_at || b.created_at || '').localeCompare(String(a.customer_notes_updated_at || a.created_at || '')));
      const html = list.slice(0,80).map(q => `<article class="azp-note-register-card"><strong>${esc(q.customer_name || q.customerName || 'Customer')} · ${esc(q.quotation_number || q.quotationNo || q.quotationId)}</strong><div>${esc(q.party_mobile || q.partyMobile || q.customerMobile)} · ${esc(q.from_location)} → ${esc(q.to_location)}</div>${mountContent(reference(q))}</article>`).join('') || `<p>${esc(failure || (!ready ? 'Loading notes…' : term ? 'No matching quotations.' : 'No notes yet. Search a customer or quotation to add a note.'))}</p>`;
      if (board.innerHTML !== html) board.innerHTML = html;
      const count = document.getElementById('azp-notes-count'), value = String(rows.filter(q=>q.customer_notes).length);
      if (count.textContent !== value) count.textContent = value;
    }
  }
  // Throttle rather than debounce: other live widgets continuously mutate the page.
  window.azpRefreshQuotationNotes = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; paint(); }, 100);
  };
  function closeEditor() {
    const dialog = document.getElementById('azp-note-dialog');
    if (dialog?.dataset.saving === 'yes') return;
    if (dialog && dialog.dataset.dirty === 'yes' && !confirm('Discard unsaved note changes?')) return;
    const returnTo = dialog?._returnTo; dialog?.remove(); returnTo?.focus();
  }
  function openEditor(id) {
    const q = rows.find(r => r.__backendId === id); if (!q || !ready) return;
    if (document.getElementById('azp-note-dialog')) return;
    const previous = String(q.customer_notes || ''), revision = Number(q.customer_notes_revision || 0);
    const dialog = document.createElement('dialog'); dialog.id = 'azp-note-dialog'; dialog._returnTo = document.activeElement;
    dialog.innerHTML = `<form><div class="azp-note-head"><h2>Customer Notes & Conditions</h2><button type="button" data-note-close aria-label="Close">×</button></div><p>${esc(q.customer_name || q.customerName)} · ${esc(q.quotation_number || q.quotationNo || q.quotationId)}</p><p>Record agreed charges, timings, packing requirements, promises and customer conversations. Review these before planning and starting work.</p><label for="azp-note-text">Note</label><textarea id="azp-note-text" rows="9" maxlength="12000" placeholder="Write customer instructions and agreed conditions…"></textarea><label for="azp-note-author">Updated by (name)</label><input id="azp-note-author" maxlength="100" placeholder="Your name"><p id="azp-note-status" role="status"></p><div class="azp-note-head"><button type="button" data-note-close>Cancel</button><button type="submit">Save Note</button></div></form>`;
    document.body.appendChild(dialog); dialog.querySelector('textarea').value = previous;
    dialog.querySelector('input').value = q.customer_notes_by || '';
    dialog.addEventListener('input',()=>{dialog.dataset.dirty='yes';});
    dialog.querySelectorAll('[data-note-close]').forEach(b=>b.onclick=closeEditor);
    dialog.addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
    dialog.querySelector('form').onsubmit = async e => {
      e.preventDefault(); if (dialog.dataset.saving === 'yes') return;
      const text = dialog.querySelector('textarea').value.trim(), author = dialog.querySelector('input').value.trim();
      const status = dialog.querySelector('#azp-note-status');
      if (!text && previous && !confirm('Clear the customer note?')) return;
      dialog.dataset.saving='yes'; dialog.querySelectorAll('button').forEach(b=>b.disabled=true); status.textContent='Saving…';
      try {
        const saved = await fs.runTransaction(db, async tx => {
          const ref = fs.doc(db,'quotations',id), snap = await tx.get(ref);
          if (!snap.exists()) throw Error('This quotation no longer exists.');
          const current = snap.data();
          if (Number(current.customer_notes_revision || 0) !== revision || String(current.customer_notes || '') !== previous) throw Error('Another person updated this note. Copy your changes, close this window and reopen the latest note before saving.');
          const data = {customer_notes:text,customer_notes_by:author,customer_notes_updated_at:new Date().toISOString(),customer_notes_revision:revision+1};
          tx.update(ref,data); return data;
        });
        rows = rows.map(r=>r.__backendId===id?{...r,...saved}:r);
        dialog.dataset.dirty='no';dialog.dataset.saving='no';closeEditor();paint();
        window.showToast?.('Customer note saved for Planning and Execution.', 'success');
      } catch(error) { status.textContent = error.message || 'Note was not saved. Check your connection and try again.'; }
      finally { dialog.dataset.saving='no';dialog.querySelectorAll('button').forEach(b=>b.disabled=false); }
    };
    dialog.showModal(); dialog.querySelector('textarea').focus();
  }
  async function start() {
    const style = document.createElement('link');style.rel='stylesheet';style.href='/quotation-notes.css?v=1';document.head.appendChild(style);
    const root = document.getElementById('mod-dashboard') || document.querySelector('main');
    if (root) {
      const board = document.createElement('details');board.id='azp-notes-register';board.className='azp-note-register';
      board.innerHTML='<summary>📝 Customer Notes <span id="azp-notes-count">0</span></summary><p>Party conversations and agreed conditions for Planning & Execution.</p><input id="azp-notes-search" type="search" placeholder="Search customer, phone, quotation or note to add / edit"><div id="azp-notes-records"></div>';
      root.prepend(board);board.querySelector('input').addEventListener('input',paint);
    }
    document.addEventListener('click',e=>{const b=e.target.closest('[data-note-edit]');if(b)openEditor(b.dataset.noteEdit);});
    const observer=new MutationObserver(window.azpRefreshQuotationNotes);
    observer.observe(document.body,{childList:true,subtree:true});
    document.getElementById('planning-sheet-form')?.addEventListener('input',window.azpRefreshQuotationNotes);
    document.getElementById('planning-sheet-form')?.addEventListener('reset',()=>setTimeout(paint,0));
    paint();
    try {
      const app = await import('https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js');
      fs = await import('https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js');
      db = fs.getFirestore(app.getApp());
      if (document.getElementById('mod-dashboard')) fs.onSnapshot(fs.collection(db,'planningSheets'), snap=>{plans=snap.docs.map(d=>({...d.data(),__backendId:d.id}));paint();},error=>console.warn('Legacy job note linkage unavailable',error));
      fs.onSnapshot(fs.collection(db,'quotations'), snap => { rows=snap.docs.map(d=>({...d.data(),__backendId:d.id}));ready=true;failure='';paint(); }, error=>{ready=false;failure='Unable to load latest notes. Check connection / access before starting work.';console.error('Customer notes listener',error);paint();});
    } catch(error) { failure='Unable to load customer notes. Refresh and check connection / access.';console.error(error);paint(); }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
