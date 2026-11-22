/* Connects the prototype's "Find technicians" step to the Sahelha backend (GET /api/matches).
   The ranked list and the reliability scores come from the server; every other step stays simulated. */
(function (SH) {
  var D = SH.data, A = SH.act;

  // shortcut: fixed area centres stand in for Google Maps geocoding (FR-LOC); swap when Maps is added.
  var AREAS = {
    'Maadi': { lat: 29.9602, lng: 31.2569 }, 'Nasr City': { lat: 30.0566, lng: 31.3301 }, 'New Cairo': { lat: 30.0074, lng: 31.4913 },
    'Sheikh Zayed': { lat: 30.0394, lng: 30.9447 }, 'Heliopolis': { lat: 30.0911, lng: 31.3227 }, 'Dokki': { lat: 30.0385, lng: 31.2123 }
  };

  // Copy the server's figures onto the prototype's technician with the same name (keeps its photo and id)
  function toTech(c) {
    var S = SH.S, inp = c.reliabilityInputs;
    var t = SH.find(S.techs, function (x) { return x.name === c.name; });
    if (!t) { t = { id: String(c.id), name: c.name, first: SH.first(c.name), initials: SH.initials(c.name), av: D.AVATARS[c.name.length % D.AVATARS.length], areas: ['Maadi'], work: [], avail: 1, verified: true }; S.techs.push(t); }
    Object.assign(t, {
      api: true, trade: c.trades[0], years: c.years, jobs: c.completedJobs, rating: c.avgRating,
      ontime: Math.round(inp.onTime), cancel: Math.round(100 - inp.fewCancellations), repeat: Math.round(inp.repeatCustomers),
      diag: c.diagnosticFee, dist: c.distanceKm, rel: c.reliability, match: c.matchScore
    });
    return t.id;
  }

  // Scores come from the server (SRS weights), not from the prototype's own formulas
  var rel0 = D.reliability, score0 = D.matchScore, ranked0 = D.ranked;
  D.reliability = function (t) { return t && t.api ? t.rel : rel0(t); };
  D.matchScore = function (t) { return t.api ? t.match : score0(t); };
  D.ranked = function (techs, sort) {
    var ids = SH.S.matchIds;
    return ranked0(ids ? techs.filter(function (t) { return ids.indexOf(t.id) >= 0; }) : techs, sort);
  };

  var find0 = A.findTechs;
  A.findTechs = function () {
    var r = SH.U('customer').req, a = SH.acct('customer');
    if (!r.descr.trim()) return find0(); // the prototype shows its own "describe the problem" message
    var at = AREAS[a && a.area] || AREAS.Maadi;
    return fetch('/api/matches?category=' + encodeURIComponent(r.cat) + '&lat=' + at.lat + '&lng=' + at.lng)
      .then(function (res) { return res.json(); })
      .then(function (m) {
        if (m.error) throw new Error(m.error);
        SH.S.matchIds = m.candidates.map(toTech);
        find0();
      })
      .catch(function (e) {
        SH.S.apiErr = 'Cannot get technicians from the Sahelha API (' + e.message + '). Start it with "npm start" in backend/.';
      });
  };
})((window.SH = window.SH || {}));
