/* Sign in, create account, one-time code, and technician approval.
   The same screens serve both roles; SH.S.view says which phone session is showing. */
(function (SH) {
  var D = SH.data, esc = SH.esc;

  function role() { return SH.S.view; }
  function isCust() { return role() === 'customer'; }
  function logo() { return '<div class="mark" aria-hidden="true">سهّلها</div>'; }

  /* ---------------- screens ---------------- */
  function signin() {
    var U = SH.U(), c = isCust();
    return SH.scr('signin',
      '<div class="body authbody">' +
        '<div class="brandblock">' + logo() + '<h1 class="wordmark">Sahelha</h1>' +
        '<p class="tagline">' + (c ? 'Home services, made simple' : 'Sahelha for service providers') + '</p>' +
        '<span class="rolechip">' + (c ? 'Customer sign-in' : 'Technician sign-in') + '</span></div>' +
        SH.input('fPhone', 'Mobile number', 'f.phone', U.f.phone, { type: 'tel', mode: 'tel', max: 16, enter: 'signIn' }) +
        SH.input('fCode', 'Password', 'f.code', U.f.code, { type: 'password', max: 64, enter: 'signIn' }) +
        (U.err ? '<p class="err" role="alert">' + esc(U.err) + '</p>' : '') +
        SH.btn('Sign in', 'signIn') +
        SH.btn('Create account', 'aGo', { kind: 'ghost', arg: 'signup' }) +
        '<button class="linkbtn" data-act="setView"' + SH.arg(c ? 'provider' : 'customer') + '>' + (c ? "I'm a service provider" : "I'm a customer") + '</button>' +
        '<p class="hint">Signs in to the Sahelha API. The ' + (c ? 'demo customer' : 'demo technician') +
        ' number and password (' + SH.api.PASSWORD + ') are already filled in.</p>' +
      '</div>');
  }

  function areaChips(multi) {
    var U = SH.U();
    return '<div class="chips">' + D.AREAS.map(function (a) {
      var on = multi ? U.f.areas.indexOf(a) >= 0 : U.f.area === a;
      return SH.chip(a, multi ? 'toggleArea' : 'setArea', a, on);
    }).join('') + '</div>';
  }

  function idTile(key, title) {
    var on = SH.U().f[key];
    return '<button class="idtile' + (on ? ' on' : '') + '" data-act="toggleId" data-arg="' + key + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="idic">' + SH.icon(on ? 'check' : 'upload', 22) + '</span>' +
      '<span class="idtx"><b>' + esc(title) + '</b><small>' + (on ? (key === 'idFront' ? 'id-front.jpg added' : 'id-back.jpg added') : 'Tap to add a sample photo') + '</small></span></button>';
  }

  function signup() {
    var U = SH.U(), c = isCust(), f = U.f;
    var h = '<div class="body">' +
      '<p class="lede">' + (c ? 'Book trusted technicians and keep a record of every visit.' : 'Tell us about your work. We verify every technician before they can take jobs.') + '</p>' +
      SH.input('fName', 'Full name', 'f.name', f.name, { max: 40, ph: c ? 'Nour Hassan' : 'Ahmed Salah' }) +
      SH.input('fSPhone', 'Mobile number', 'f.sPhone', f.sPhone, { type: 'tel', mode: 'tel', max: 16, ph: '010 0123 4567' }) +
      SH.input('fPw', 'Password', 'f.pw', f.pw, { type: 'password', max: 64, ph: 'At least 8 characters' });
    if (c) {
      h += '<div class="field"><span class="lbl">Your area</span>' + areaChips(false) + '</div>';
    } else {
      h += '<div class="field"><span class="lbl">Your trade</span><div class="chips">' + D.TRADES.map(function (t) {
        return SH.chip(t.label, 'setTrade', t.id, f.trade === t.id);
      }).join('') + '</div><p class="hint left">The prototype\'s customer app lists air-conditioning technicians, so choose that one to receive the demo request.</p></div>' +
      '<div class="field"><span class="lbl">Years of experience</span><div class="stepper">' +
        '<button class="sbtn" data-act="yearsStep" data-arg="-1" aria-label="Fewer years">' + SH.icon('minus', 20) + '</button>' +
        '<output class="sval">' + f.years + (f.years === 1 ? ' year' : ' years') + '</output>' +
        '<button class="sbtn" data-act="yearsStep" data-arg="1" aria-label="More years">' + SH.icon('plus', 20) + '</button></div></div>' +
      '<div class="field"><span class="lbl">Areas you cover</span>' + areaChips(true) + '</div>' +
      '<div class="field"><span class="lbl">Identity check</span>' + idTile('idFront', 'National ID, front') + idTile('idBack', 'National ID, back') +
        '<p class="hint left">Real photos are not collected in the prototype.</p></div>';
    }
    h += (U.err ? '<p class="err" role="alert">' + esc(U.err) + '</p>' : '') + '</div>' +
      SH.foot(SH.btn('Continue', 'startSignup'));
    return SH.scr('signup', SH.hdr('Create account', 'aGo', 'signin') + h);
  }

  function otp() {
    var U = SH.U(), phone = SH.normPhone(U.f.sPhone);
    return SH.scr('otp', SH.hdr('Verify your number', 'aGo', 'signup') +
      '<div class="body">' +
      '<p class="lede">We sent a 4-digit code to <b>' + esc(SH.fmtPhone(phone)) + '</b>.</p>' +
      SH.input('fOtp', 'Verification code', 'f.otp', U.f.otp, { mode: 'numeric', max: 4, enter: 'verifyOtp' }) +
      (U.err ? '<p class="err" role="alert">' + esc(U.err) + '</p>' : '') +
      '<p class="hint left">Simulated: no text message is sent. The code ' + SH.OTP + ' is already filled in.</p></div>' +
      SH.foot(SH.btn(isCust() ? 'Verify and create account' : 'Verify and submit', 'verifyOtp')));
  }

  function pending() {
    var U = SH.U(), a = SH.find(SH.S.accounts, function (x) { return x.id === U.pendingId; });
    if (!a) { return signin(); }
    function row(done, text) {
      return '<li class="' + (done ? 'done' : 'wait') + '"><span class="dot">' + SH.icon(done ? 'check' : 'hourglass', 16) + '</span><span>' + esc(text) + '</span></li>';
    }
    return SH.scr('pending',
      '<div class="body centerbody">' +
        '<div class="bigicon">' + SH.icon('hourglass', 40) + '</div>' +
        '<h2>We are reviewing your documents</h2>' +
        '<p class="lede">Thanks, ' + esc(SH.first(a.name)) + '. Your account becomes active once an admin has checked your identity. This usually takes a short while.</p>' +
        '<ul class="steps">' + row(true, 'Mobile number verified') + row(true, 'National ID added') + row(false, 'Admin review in progress') + '</ul>' +
        SH.note('proto', '<b>Prototype control.</b> In the real product an admin approves you from the web dashboard. Tap below to play the admin.', 'shield') +
        SH.btn('Simulate admin approval', 'approveTech', { kind: 'amber' }) +
        SH.btn('Sign out', 'signOut', { kind: 'ghost' }) +
      '</div>');
  }

  SH.screens.customer.signin = SH.screens.provider.signin = signin;
  SH.screens.customer.signup = SH.screens.provider.signup = signup;
  SH.screens.customer.otp = SH.screens.provider.otp = otp;
  SH.screens.provider.pending = pending;

  /* ---------------- actions ---------------- */
  var A = SH.act;

  A.aGo = function (screen) { SH.go(screen); };

  // After the API accepts a sign-in or sign-up: record the account and open the right screen
  function enter(U, r, me, area) {
    var c = r === 'customer', acc = SH.api.account(me, r, area);
    SH.mark(c ? 'c_auth' : 'p_auth');
    if (!c && acc.status === 'pending') { U.pendingId = acc.id; SH.go('pending', r); return acc; }
    U.uid = acc.id; U.tab = 'home'; SH.go('home', r);
    if (!c) SH.mark('p_verified');
    return acc;
  }
  function signInWith(r, phone, password) {
    return SH.api.login(phone, password).then(function (d) {
      if (d.user.role !== (r === 'customer' ? 'customer' : 'technician')) {
        throw new Error('This number belongs to a ' + d.user.role + ' account. Switch view at the top of the page.');
      }
      SH.api.tok[r] = d.token;
      return SH.api.call('GET', '/auth/me', null, d.token);
    });
  }

  A.signIn = function () {
    var U = SH.U(), r = role();
    var phone = SH.normPhone(U.f.phone);
    if (!phone) { U.err = 'Enter a valid Egyptian mobile number, like 0100 123 4567.'; return; }
    if (!U.f.code) { U.err = 'Enter your password.'; return; }
    return signInWith(r, phone, U.f.code)
      .then(function (me) { enter(U, r, me); }, function (e) { U.err = e.message; });
  };

  A.startSignup = function () {
    var U = SH.U(), r = role(), f = U.f;
    var name = f.name.trim(), phone = SH.normPhone(f.sPhone);
    if (name.length < 2) { U.err = 'Enter your full name.'; return; }
    if (!phone) { U.err = 'Enter a valid Egyptian mobile number, like 0100 123 4567.'; return; }
    if (String(f.pw || '').length < 8) { U.err = 'Choose a password of at least 8 characters.'; return; }
    if (r === 'provider') {
      if (!f.areas.length) { U.err = 'Choose at least one area you cover.'; return; }
      if (!f.idFront || !f.idBack) { U.err = 'Add both sides of your national ID to continue.'; return; }
    }
    f.otp = SH.OTP;
    SH.go('otp');
  };

  // The one-time code is still simulated (no SMS provider yet, FR-AUTH-09); the account itself is created by the API
  A.verifyOtp = function () {
    var U = SH.U(), r = role(), f = U.f, c = r === 'customer';
    if (String(f.otp).trim() !== SH.OTP) { U.err = 'That code is not right. The demo code is ' + SH.OTP + '.'; return; }
    var body = { name: f.name.trim(), phone: SH.normPhone(f.sPhone), password: f.pw };
    if (!c) Object.assign(body, { trades: [f.trade], years: f.years, base: SH.api.AREAS[f.areas[0]], radiusKm: 15 });
    return SH.api.call('POST', '/auth/register/' + (c ? 'customer' : 'technician'), body)
      .then(function (d) { SH.api.tok[r] = d.token; return SH.api.call('GET', '/auth/me', null, d.token); })
      .then(function (me) {
        var acc = enter(U, r, me, c ? f.area : f.areas);
        if (c) SH.flash('ok', 'Welcome to Sahelha, ' + SH.first(acc.name) + '.', r);
        f.name = ''; f.sPhone = ''; f.pw = '';
      }, function (e) { U.err = e.message; });
  };

  // Plays the admin dashboard (not built yet) with the seeded demo admin account
  A.approveTech = function () {
    var U = SH.U('provider');
    var acc = SH.find(SH.S.accounts, function (a) { return a.id === U.pendingId; });
    if (!acc) return;
    return SH.api.login(SH.api.ADMIN_PHONE, SH.api.PASSWORD)
      .then(function (d) { return SH.api.call('POST', '/admin/technicians/' + acc.techId + '/verify', { decision: 'Verified' }, d.token); })
      .then(function () { return SH.api.call('GET', '/auth/me', null, SH.api.tok.provider); })
      .then(function (me) {
        U.pendingId = null;
        enter(U, 'provider', me);
        SH.flash('ok', 'You are verified. Customers can now find and book you.', 'provider');
      }, SH.api.fail);
  };

  A.signOut = function () {
    var r = role();
    SH.S.ui[r] = SH.newUi(r);
  };

  A.setArea = function (a) { SH.U().f.area = a; };
  A.toggleArea = function (a) {
    var list = SH.U().f.areas, i = list.indexOf(a);
    if (i >= 0) list.splice(i, 1); else list.push(a);
  };
  A.setTrade = function (t) { SH.U().f.trade = t; };
  A.yearsStep = function (d) {
    var f = SH.U().f;
    f.years = Math.min(40, Math.max(1, f.years + Number(d)));
  };
  A.toggleId = function (k) { var f = SH.U().f; f[k] = !f[k]; };
})((window.SH = window.SH || {}));
