/* Connects the prototype to the Sahelha backend, which serves this page and the API on the same origin (/api).
   The screens are unchanged: each job action asks the API first and only updates the phones if the API agrees,
   so the backend's rules (BR-01 … BR-08) decide what can happen. Payment, chat, reviews and history stay simulated. */
(function (SH) {
  var D = SH.data, J = SH.jobs, A = SH.act;
  var API = (SH.api = { tok: {}, techTok: {} });

  // Demo only: the seeded accounts (backend/src/seed.js), used when one phone plays the other side.
  API.PASSWORD = 'sahelha123';
  API.ADMIN_PHONE = '01000000000';
  var DEMO_TECH_PHONES = { 'Ahmed Salah': '01112345678', 'Mostafa Hassan': '01112345679', 'Karim Adel': '01112345680', 'Youssef Nabil': '01112345681' };

  // shortcut: fixed area centres stand in for Google Maps geocoding (FR-LOC); swap when Maps is added.
  API.AREAS = {
    'Maadi': { lat: 29.9602, lng: 31.2569 }, 'Nasr City': { lat: 30.0566, lng: 31.3301 }, 'New Cairo': { lat: 30.0074, lng: 31.4913 },
    'Sheikh Zayed': { lat: 30.0394, lng: 30.9447 }, 'Heliopolis': { lat: 30.0911, lng: 31.3227 }, 'Dokki': { lat: 30.0385, lng: 31.2123 }
  };

  API.call = function (method, path, body, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch('/api' + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || 'The server answered ' + r.status);
          return d;
        });
      }, function () { throw new Error('Cannot reach the Sahelha API. Start it with "npm start" in backend/.'); });
  };
  API.login = function (phone, password) { return API.call('POST', '/auth/login', { login: phone, password: password }); };
  API.fail = function (e) { SH.S.apiErr = e.message; };

  /* ---- keep the prototype's technician objects in step with the API ---- */
  API.toTech = function (c) {
    var S = SH.S, inp = c.reliabilityInputs || {};
    // Reuse the prototype's record for the same person so its photo colour, areas and earnings carry over
    var t = SH.tech(c.id) || SH.find(S.techs, function (x) { return !x.api && x.name === c.name; });
    if (!t) { t = { areas: ['Maadi'], work: [] }; S.techs.push(t); }
    if (t.id && t.id !== c.id) {
      var oldId = t.id;
      S.earnings.forEach(function (e) { if (e.techId === oldId) e.techId = c.id; });
    }
    Object.assign(t, {
      id: c.id, api: true, name: c.name, first: SH.first(c.name), initials: SH.initials(c.name),
      av: t.av || D.AVATARS[c.name.length % D.AVATARS.length], trade: c.trades[0], years: c.years,
      jobs: c.completedJobs, rating: c.avgRating, ontime: c.completedJobs ? Math.round(inp.onTime) : null,
      cancel: Math.round(100 - inp.fewCancellations), repeat: Math.round(inp.repeatCustomers),
      diag: c.diagnosticFee, avail: 1, verified: c.status === 'Verified', rel: c.reliability
    });
    if (c.distanceKm != null) t.dist = c.distanceKm;
    if (t.dist == null) t.dist = 0;
    if (c.matchScore != null) t.match = c.matchScore;
    return t;
  };

  // Records a signed-in user as a phone account. `area` is the customer's area or the technician's area list.
  API.account = function (me, role, area) {
    var S = SH.S, acc = SH.find(S.accounts, function (a) { return a.role === role && a.phone === me.phone; });
    if (!acc) { acc = { id: me.id, role: role, phone: me.phone, area: 'Maadi' }; S.accounts.push(acc); }
    acc.name = me.name;
    if (role === 'customer' && area) acc.area = area;
    if (me.technician) {
      var t = API.toTech(me.technician);
      if (area) t.areas = area.slice();
      acc.techId = t.id;
      acc.status = me.technician.status === 'Verified' ? 'verified' : 'pending';
    }
    return acc;
  };

  // Scores come from the server (SRS weights), not from the prototype's own formulas
  var rel0 = D.reliability, score0 = D.matchScore, ranked0 = D.ranked;
  D.reliability = function (t) { return t && t.api ? t.rel : rel0(t); };
  D.matchScore = function (t) { return t.api ? t.match : score0(t); };
  D.ranked = function (techs, sort) {
    var ids = SH.S.matchIds || [];
    return ranked0(techs.filter(function (t) { return ids.indexOf(t.id) >= 0; }), sort);
  };
  SH.myTech = function () {
    var a = SH.acct('provider');
    return a && a.techId ? SH.tech(a.techId) : null;
  };

  /* ---- who is allowed to make each call ---- */
  function custTok() { return API.tok.customer; }
  function techTok(j) {
    var a = SH.acct('provider');
    if (a && a.techId === j.techId && API.tok.provider) return Promise.resolve(API.tok.provider);
    if (API.techTok[j.techId]) return Promise.resolve(API.techTok[j.techId]);
    var t = SH.tech(j.techId), phone = t && DEMO_TECH_PHONES[t.name];
    if (!phone) return Promise.reject(new Error('Sign in as ' + (t ? t.name : 'the technician') + ' in Technician view to do this step.'));
    return API.login(phone, API.PASSWORD).then(function (d) { return (API.techTok[j.techId] = d.token); });
  }
  function asTech(j, method, path, body) {
    return techTok(j).then(function (tok) { return API.call(method, '/bookings/' + j.apiId + path, body, tok); });
  }
  function asCust(j, method, path, body) { return API.call(method, '/bookings/' + j.apiId + path, body, custTok()); }

  /* ---- the technician's steps ---- */
  var ops = {
    accept: function (j) { return asTech(j, 'POST', '/accept'); },
    decline: function (j) { return asTech(j, 'POST', '/decline'); },
    drive: function (j) { return asTech(j, 'POST', '/status', { to: 'OnTheWay' }); },
    arrive: function (j) { return asTech(j, 'POST', '/status', { to: 'Arrived' }); },
    // The first quotation is the itemised quote (FR-QUO-01). After one is approved its items are locked (BR-04),
    // so a revision is sent as an extra cost for the difference (FR-QUO-04).
    quote: function (j, v) {
      var diag = J.tech(j).diag, total = diag + v.parts + v.labor + v.extra;
      if (j.apiApproved == null) {
        var items = [{ kind: 'diagnostic', description: 'Diagnostic visit', amount: diag }];
        if (v.parts) items.push({ kind: 'parts', description: 'Parts', amount: v.parts });
        if (v.labor) items.push({ kind: 'labor', description: 'Labor', amount: v.labor });
        if (v.extra) items.push({ kind: 'labor', description: 'Extra work', amount: v.extra });
        return asTech(j, 'POST', '/quotation', { items: items });
      }
      var add = total - j.apiApproved;
      if (add <= 0) return Promise.reject(new Error('A revised quotation can only add cost: approved items are locked.'));
      return asTech(j, 'POST', '/quotation/extra', { description: 'Revised quotation v' + (j.quotes.length + 1), amount: add })
        .then(function (q) { j.apiExtraId = q.items[q.items.length - 1]._id; });
    },
    complete: function (j) { return asTech(j, 'POST', '/status', { to: 'Completed' }); }
  };

  // Wraps a technician action: check the local step is possible, ask the API, then let the original update the phones
  function guard(name, op, ok, arg) {
    var orig = A[name];
    A[name] = function (a) {
      var j = J.forProvider();
      if (!j || !j.apiId || !ok(j)) return orig(a);
      return op(j, arg && arg()).then(function () { orig(a); }, API.fail);
    };
  }
  function is(status) { return function (j) { return j.status === status; }; }
  guard('acceptJob', ops.accept, is('requested'));
  guard('declineJob', ops.decline, is('requested'));
  guard('startDriving', ops.drive, is('accepted'));
  guard('markArrived', ops.arrive, is('enroute'));
  guard('sendQuote', ops.quote, function (j) { return J.canQuote(j) && !!SH.U('provider').q; }, function () { return SH.U('provider').q; });
  guard('completeJob', ops.complete, function (j) { return J.canFinish(j) && j.after; });

  // "Prototype control" on the customer phone plays the technician's next step through the same calls
  var sim0 = A.simNext;
  A.simNext = function (what) {
    var j = J.forCustomer(), op = null;
    if (!j || !j.apiId) return sim0(what);
    if (j.status === 'requested') op = ops.accept;
    else if (j.status === 'accepted') op = ops.drive;
    else if (j.status === 'enroute') op = ops.arrive;
    else if (j.status === 'started' && what === 'finish') op = J.canFinish(j) ? ops.complete : null;
    else if (j.status === 'started') op = J.canQuote(j) ? function (x) { return ops.quote(x, J.defaults(x)); } : null;
    if (!op) return sim0(what); // photos and "start" are local steps
    return op(j).then(function () { sim0(what); }, API.fail);
  };

  /* ---- the customer's steps ---- */
  function createRequest(r, slotIdx) {
    var a = SH.acct('customer'), slot = D.slotsFor(SH.S.now)[slotIdx];
    return API.call('POST', '/requests', {
      description: r.descr.trim(), category: r.cat, suggestedCategory: r.aiCat || null,
      location: Object.assign({ address: a.area }, API.AREAS[a.area] || API.AREAS.Maadi), slotStart: slot.at.toISOString()
    }, custTok()).then(function (req) { r.apiId = req._id; r.apiSlot = slotIdx; return req; });
  }

  var runAI0 = A.runAI;
  A.runAI = function () {
    var r = SH.U('customer').req;
    if (!r.descr.trim()) return runAI0();
    return API.call('POST', '/requests/suggest', { description: r.descr }, custTok())
      .then(function (s) { r.aiCat = s.category; runAI0(); }, API.fail);
  };

  var find0 = A.findTechs;
  A.findTechs = function () {
    var r = SH.U('customer').req;
    if (!r.descr.trim()) return find0();
    return createRequest(r, r.slot)
      .then(function (req) { return API.call('GET', '/requests/' + req._id + '/matches', null, custTok()); })
      .then(function (m) {
        SH.S.matchIds = m.candidates.map(function (c) { return API.toTech(c).id; });
        if (!m.candidates.length) { r.err = m.message; return; }
        find0();
      }, API.fail);
  };

  var book0 = A.confirmBooking;
  A.confirmBooking = function () {
    var r = SH.U('customer').req;
    if (!r || !r.techId) return;
    // The match list was made for one slot; another slot needs its own request so availability is checked again
    var ready = r.slot === r.apiSlot ? Promise.resolve() : createRequest(r, r.slot);
    return ready
      .then(function () { return API.call('POST', '/bookings', { requestId: r.apiId, technicianId: r.techId }, custTok()); })
      .then(function (b) { book0(); SH.S.job.apiId = b._id; }, API.fail);
  };

  var cancel0 = A.cCancelYes;
  A.cCancelYes = function () {
    var j = J.forCustomer();
    if (!j || !j.apiId || !J.canCancel(j)) return cancel0();
    return asCust(j, 'POST', '/cancel', { reason: 'Cancelled by the customer' }).then(function () { cancel0(); }, API.fail);
  };

  var approve0 = A.approveQuote;
  A.approveQuote = function () {
    var j = J.forCustomer(), q = j && J.latest(j);
    if (!j || !j.apiId || !q || q.status !== 'pending') return approve0();
    var call = j.apiApproved == null
      // BR-02: the service may only start once the quotation is approved, so the technician starts it now
      ? asCust(j, 'POST', '/quotation/decision', { approve: true }).then(function () { return asTech(j, 'POST', '/status', { to: 'ServiceStarted' }); })
      : asCust(j, 'POST', '/quotation/extra/' + j.apiExtraId + '/decision', { approve: true });
    return call.then(function () { j.apiApproved = D.qTotal(q); approve0(); }, API.fail);
  };

  var reject0 = A.rejectQuote;
  A.rejectQuote = function () {
    var j = J.forCustomer(), q = j && J.latest(j);
    if (!j || !j.apiId || !q || q.status !== 'pending') return reject0();
    if (j.apiApproved != null) {
      return asCust(j, 'POST', '/quotation/extra/' + j.apiExtraId + '/decision', { approve: false }).then(function () { reject0(); }, API.fail);
    }
    // FR-QUO-03: declining the quotation ends the booking; the diagnostic fee stays payable
    return asCust(j, 'POST', '/quotation/decision', { approve: false }).then(function () {
      J.decide(j, false);
      j.status = 'cancelled'; j.cancelledBy = 'customer'; j.hideC = true;
      SH.U('customer').tab = 'home';
      SH.go('home', 'customer');
      SH.flash('info', 'Quotation rejected, so the booking is cancelled. Only the ' + SH.egp(q.diag) + ' diagnostic fee is due.', 'customer');
    }, API.fail);
  };

  /* ---- sign out and restart also end the API session ---- */
  var signOut0 = A.signOut;
  A.signOut = function () { delete API.tok[SH.S.view]; signOut0(); };

  var restart0 = A.restart;
  A.restart = function () {
    var j = SH.S.job, live = j && j.apiId && ['requested', 'accepted', 'enroute', 'arrived', 'started'].indexOf(j.status) >= 0;
    // Free the technician's slot on the server, otherwise they stay busy at that time
    var done = live ? asCust(j, 'POST', '/cancel', { reason: 'Demo restarted' }).catch(function () {}) : Promise.resolve();
    return done.then(function () { restart0(); API.tok = {}; API.techTok = {}; });
  };
})((window.SH = window.SH || {}));
