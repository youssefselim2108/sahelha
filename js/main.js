/* Wire up events and start the app. Every button carries data-act="name" (and optionally data-arg);
   the matching function in SH.act changes state, then the page re-renders. */
(function (SH) {
  function run(name, arg) {
    if (SH.busy) return;                      /* one API call at a time */
    var fn = SH.act[name];
    if (!fn) { if (window.console) console.warn('Unknown action: ' + name); return; }
    var U = SH.U(), p;
    if (U) { U.flash = null; U.err = ''; }   /* messages show for one step only */
    SH.S.apiErr = '';
    try { p = fn(arg); } catch (err) { if (window.console) console.error(err); }
    if (p && p.then) {                        /* actions that call the API re-render when it answers */
      SH.busy = true;
      p.catch(function (err) { if (window.console) console.error(err); })
        .then(function () { SH.busy = false; SH.render(); });
    }
    SH.render();
  }
  SH.run = run;

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    run(el.getAttribute('data-act'), el.getAttribute('data-arg'));
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('[data-in]')) return;
    SH.setIn(el.getAttribute('data-in'), el.value);
    if (el.hasAttribute('data-live')) SH.render();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var el = e.target;
    if (!el.matches || !el.matches('[data-enter]')) return;
    e.preventDefault();
    run(el.getAttribute('data-enter'));
  });

  SH.reset();
  SH.render();
  window.setInterval(SH.tickClock, 20000);
})((window.SH = window.SH || {}));
