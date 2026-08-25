/* TENIS LIVE MHC — app.js */
(function () {
  'use strict';

  const REFRESH_SEC = 30;
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/tennis';

  const state = {
    tour: 'todos',
    mode: 'todos',
    tab: 'live',
    tournaments: [],
    matches: [],
    atpLive: [],
    challPoints: [],
    challLive: { tournaments: [], matches: [] },
    itfLive: { tournaments: [], matches: [] },
    mixedLive: { matches: [], loaded: false },
    cal: { atp: [], wta: [], chall: [], itf: [], loaded: false, tab: 'todos' },
    rankSingles: { atp: null, wta: null },
    rankView: 'oficial',
    rankLive: { atp: [], wta: [], atpRace: [], wtaRace: [], loaded: false },
    rankLiveUpdated: '',
    rankSinglesUpdated: '',
    rankDoubles: { atp: null, wta: null },
    rankDoublesLoading: false,
    rankSearch: '',
    news: { items: [], loaded: false, error: '' },
    videos: { items: [], loaded: false, error: '' },
    elo: { atp: null, wta: null, loaded: false },
    playerTab: 'todos',
    playerSearch: '',
    playerCountry: '',
    wheelchair: { data: null, loaded: false, tab: 'menSingles' },
    wcLive: { events: [], loaded: false, error: '' },
    wcVideos: { items: [], loaded: false },
    seeds: { singles: {}, doubles: {}, loaded: false },
    seedMap: {},
    seedMapATP: {},
    seedMapWTA: {},
    seedByTour: {},
    seedSurnameTours: {},
    finishedAt: {},
    finishedMatches: {},
    liveSnapshot: {},
    h2hCache: null,
    statsCache: null,
    h2hSearch: { loading: false, data: null, error: null, searched: false },
    lastUpdate: null,
    refreshing: false,
    countdown: REFRESH_SEC,
    drawTournamentId: null,
    drawRound: 'todas',
    theme: 'oscuro',
    font: 'defecto',
    fsize: 'normal'
  };

  const ROUND_ORDER = [
    'Qualifying 1st Round', 'Qualifying 2nd Round', 'Qualifying 3rd Round', 'Qualifying Final',
    'Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6',
    'Round of 64', 'Round of 32', 'Round of 16', 'Round of 8',
    'Quarterfinal', 'Quarter-Final', 'Semifinal', 'Final'
  ];
  const ROUND_LABEL = {
    'Qualifying 1st Round': 'Clasif. R1', 'Qualifying 2nd Round': 'Clasif. R2',
    'Qualifying 3rd Round': 'Clasif. R3', 'Qualifying Final': 'Clasif. Final',
    'Round 1': 'Ronda 1', 'Round 2': 'Ronda 2', 'Round 3': 'Ronda 3', 'Round 4': 'Ronda 4',
    'Round 5': 'Ronda 5', 'Round 6': 'Ronda 6',
    'Round of 64': '1/32', 'Round of 32': '1/16', 'Round of 16': 'Octavos', 'Round of 8': 'Cuartos',
    'Quarterfinal': 'Cuartos', 'Quarter-Final': 'Cuartos', 'Semifinal': 'Semifinal', 'Final': 'Final'
  };

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function generateFavicon(color) {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var x = c.getContext('2d');
    var cx = 64, cy = 64, r = 52;
    x.clearRect(0, 0, 128, 128);
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.35)';
    x.shadowBlur = 10;
    x.shadowOffsetX = 3;
    x.shadowOffsetY = 4;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fillStyle = color;
    x.fill();
    x.restore();
    var hl = x.createRadialGradient(cx - 14, cy - 16, 4, cx, cy, r);
    hl.addColorStop(0, 'rgba(255,255,255,0.45)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    hl.addColorStop(1, 'rgba(0,0,0,0.12)');
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fillStyle = hl;
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.8)';
    x.lineWidth = 3.5;
    x.lineCap = 'round';
    x.beginPath();
    x.arc(cx + 8, cy, r * 0.75, -2.1, -0.6);
    x.stroke();
    x.beginPath();
    x.arc(cx - 8, cy, r * 0.75, Math.PI + 0.6, Math.PI + 2.1);
    x.stroke();
    x.beginPath();
    x.arc(cx, cy + 6, r * 0.65, 0.7, Math.PI - 0.7);
    x.stroke();
    x.beginPath();
    x.arc(cx, cy + 6, r * 0.65, Math.PI + 0.7, Math.PI * 2 - 0.7);
    x.stroke();
    x.strokeStyle = 'rgba(0,0,0,0.08)';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.stroke();
    x.font = 'bold 36px Arial Black, Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillText('MHC', cx + 1, cy + 3);
    x.fillStyle = '#ffffff';
    x.fillText('MHC', cx, cy + 2);
    var link = document.getElementById('faviconLink');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; link.id = 'faviconLink'; document.head.appendChild(link); }
    link.type = 'image/png';
    link.href = c.toDataURL('image/png') + '?t=' + Date.now();
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }
  function todayStr() {
    const s = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function typeFor(tour, mode) {
    const men = tour === 'atp' || tour === 'chall';
    return mode === 'doubles'
      ? (men ? "Men's Doubles" : "Women's Doubles")
      : (men ? "Men's Singles" : "Women's Singles");
  }
  function selectedTours() {
    if (state.tour === 'todos') return ['atp', 'wta', 'chall', 'itf'];
    return [state.tour];
  }
  function selectedModes() {
    return state.mode === 'todos' ? ['singles', 'doubles'] : [state.mode];
  }
  function typeSetFor(tour, mode) {
    if (tour === 'itf') {
      if (mode === 'todos') return ["Men's Singles", "Men's Doubles", "Women's Singles", "Women's Doubles"];
      const sex = mode === 'singles' ? 'Singles' : 'Doubles';
      return ["Men's " + sex, "Women's " + sex];
    }
    return [typeFor(tour, mode)];
  }
  function selectedTypes() {
    const types = [];
    for (const t of selectedTours()) for (const m of selectedModes()) types.push(...typeSetFor(t, m));
    return types;
  }
  function tourOf(m) {
    if (m.tour === 'mixto') return 'mixto';
    if (m.tour === 'chall') return 'chall';
    if (m.tour === 'itf') return 'itf';
    if (m.tour === 'atp' || m.tour === 'wta') return m.tour;
    if (!m.type) return m.tour || 'atp';
    return m.type.indexOf("Men") === 0 ? 'atp' : 'wta';
  }
  function tourLabel(m) {
    const t = tourOf(m);
    if (t === 'chall') return 'CHALL';
    if (t === 'mixto') return 'MIXTO';
    if (t === 'itf') return m.cat === 'w' ? 'ITF W' : 'ITF M';
    return t === 'atp' ? 'ATP' : 'WTA';
  }
  function flagUrl(code) {
    return code ? 'https://a.espncdn.com/i/teamlogos/countries/500/' + code.toLowerCase() + '.png' : '';
  }
  function flagImg(url, alt, size) {
    if (!url) return '<span class="noflag"></span>';
    return '<img class="flag" src="' + esc(url) + '" alt="' + esc(alt || '') + '" loading="lazy" onerror="this.outerHTML=\'<span class=&quot;noflag&quot;></span>\'">';
  }

  /* ---------------- data fetching ---------------- */

  async function fetchJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    return r.json();
  }

  function normalizeScoreboard(json, circuit) {
    const matches = [];
    const tourMap = new Map();
    for (const ev of (json.events || [])) {
      for (const g of (ev.groupings || [])) {
        for (const c of (g.competitions || [])) {
          const tid = circuit + '-' + String(c.tournamentId || ev.id);
          if (!tourMap.has(tid)) {
            tourMap.set(tid, {
              id: tid,
              name: ev.name || '',
              date: ev.date,
              status: ev.status ? ev.status.type : null,
              previousWinners: ev.previousWinners || [],
              logo: (ev.logos && ev.logos[0] && (ev.logos[0].href || ev.logos[0].url)) || ''
            });
          }
          matches.push({
            id: String(c.id),
            date: c.date,
            state: c.status && c.status.type ? c.status.type.state : '',
            period: c.status ? c.status.period : 0,
            suspended: !!(c.status && (function (s) {
              const t = s.type || {};
              return /suspend|delay|rain|postpon|toilet|medical|changeover/i.test(
                (s.detail || '') + ' ' + (s.name || '') + ' ' + (s.description || '') +
                ' ' + (t.detail || '') + ' ' + (t.name || '') + ' ' + (t.description || ''));
            })(c.status)),
            suspReason: (function (s) {
              if (!s) return '';
              return s.detail || s.description || (s.type && s.type.detail) || (s.type && s.type.name) || '';
            })(c.status),
            type: c.type ? c.type.text : '',
            round: c.round ? c.round.displayName : '',
            tournamentId: tid,
            tournamentName: ev.name || '',
            tour: circuit,
            venue: c.venue && c.venue.fullName ? c.venue.fullName : '',
            notes: c.notes && c.notes.text ? c.notes.text : '',
            competitors: (c.competitors || []).map(p => {
              const ath = p.athlete;
              const roster = p.roster;
              const name = ath && ath.displayName ? ath.displayName
                : roster && roster.displayName ? roster.displayName
                : roster && roster.shortDisplayName ? roster.shortDisplayName : 'TBD';
              const flag = ath && ath.flag ? ath.flag.href
                : roster && roster.athletes && roster.athletes[0] && roster.athletes[0].flag ? roster.athletes[0].flag.href : '';
              const flagAlt = ath && ath.flag ? ath.flag.alt
                : roster && roster.athletes && roster.athletes[0] && roster.athletes[0].flag ? roster.athletes[0].flag.alt : '';
              return {
                homeAway: p.homeAway,
                winner: !!p.winner,
                order: p.order,
                name: name,
                flag: flag,
                flagAlt: flagAlt,
                linescores: (p.linescores || []).map(ls => ({
                  value: ls.value,
                  tiebreak: ls.tiebreak,
                  winner: !!ls.winner
                }))
              };
            })
          });
        }
      }
    }
    return { matches, tournaments: Array.from(tourMap.values()) };
  }

  function sofaLines(sc, includeCurrent) {
    const out = [];
    let sawAny = false;
    for (let i = 1; i <= 5; i++) {
      const v = sc ? sc['period' + i] : null;
      if (v === null || v === undefined) break;
      out.push({ value: v, tiebreak: false, winner: false });
      sawAny = true;
    }
    const cur = sc ? sc.current : null;
    if (includeCurrent && cur !== null && cur !== undefined) out.push({ value: cur, tiebreak: false, winner: false, live: true });
    else if (!sawAny && includeCurrent && cur !== null && cur !== undefined) out.push({ value: cur, tiebreak: false, winner: false, live: true });
    return out;
  }

  function tierLabel(name, circuit) {
    const n = (name || '').toLowerCase();
    const isW = circuit === 'wta';
    if (/australian open|roland garros|french open|wimbledon|us open/.test(n)) return 'GRAND SLAM';
    if (/atp finals|nitto/.test(n) && !isW) return 'ATP FINALS';
    if (/wta finals/.test(n)) return 'WTA FINALS';
    if (/united cup|billie jean king|davis cup/.test(n)) return 'EQUIPOS';
    const m1000 = /indian wells|miami|monte.?carlo|madrid|\brome\b|\broma\b|canada|canadian|national bank|cincinnati|shanghai|paris|doha|dubai|beijing|wuhan|guadalajara|toronto|montreal|western.*southern/;
    if (m1000.test(n)) return isW ? 'WTA 1000' : 'MASTERS 1000';
    const m500 = /rotterdam|acapulco|rio de janeiro|barcelona|halle|queen.?s|washington|tokyo|vienna|basel|hamburg|estoril|munich|lyon|geneva|doha|dubai|eastbourne|s.hertogenbosch|stuttgart|beijing|chengdu|zhuhai|antwerp|metz|moselle|korea|seoul|japan open|china open/;
    if (m500.test(n)) return isW ? 'WTA 500' : 'ATP 500';
    if (/challeng/.test(n) || circuit === 'chall') return 'CHALLENGER';
    if (/itf/.test(n) || circuit === 'itf') return 'ITF';
    if (/\b250\b|open/.test(n)) return isW ? 'WTA 250' : 'ATP 250';
    return isW ? 'WTA' : 'ATP';
  }

  function surfClassOf(txt) {
    const t = (txt || '').toLowerCase();
    if (t.indexOf('clay') > -1 || t.indexOf('arcilla') > -1) return 'clay';
    if (t.indexOf('grass') > -1 || t.indexOf('pasto') > -1 || t.indexOf('césped') > -1 || t.indexOf('cesped') > -1) return 'grass';
    if (t.indexOf('indoor') > -1) return 'indoor';
    if (t.indexOf('carpet') > -1 || t.indexOf('alfombra') > -1) return 'carpet';
    return 'hard';
  }

  function surfShortOf(txt) {
    const c = surfClassOf(txt);
    if (c === 'clay') return 'ARCILLA';
    if (c === 'grass') return 'PASTO';
    if (c === 'indoor') return 'INDOOR';
    if (c === 'carpet') return 'CARPET';
    return 'DURA';
  }

  let sofaPastEvents = null;
  async function fetchSofaRaw() {
    const today = new Date();
    const iso = d => d.toISOString().slice(0, 10);
    const t = iso(today);
    let r = await fetch('https://api.sofascore.com/api/v1/sport/tennis/scheduled-tournaments/' + t + '/page/1');
    if (!r.ok) {
      r = await fetch('https://api.sofascore.com/api/v1/sport/tennis/scheduled-events/' + t);
      if (!r.ok) throw new Error('sofascore ' + r.status);
      const jj0 = await r.json();
      if (!jj0 || !jj0.events) throw new Error('sofascore sin eventos');
      return { shape: 'events', j: jj0 };
    }
    let allTours = [];
    for (let pg = 1; pg <= 8; pg++) {
      const rp = await fetch('https://api.sofascore.com/api/v1/sport/tennis/scheduled-tournaments/' + t + '/page/' + pg);
      if (!rp.ok) break;
      const jp = await rp.json();
      const list = (jp && jp.tournaments) || [];
      if (!list.length) break;
      allTours = allTours.concat(list);
      if (list.length < 20) break;
    }
    try {
      const re = await fetch('https://api.sofascore.com/api/v1/sport/tennis/scheduled-events/' + t);
      if (re.ok) {
        const je = await re.json();
        if (je && je.events) {
          const seen = {};
          for (const tt of allTours) {
            for (const ev of (tt.events || [])) seen[ev.id] = true;
          }
          const extra = je.events.filter(ev => !seen[ev.id]);
          if (extra.length) allTours = allTours.concat([{ tournament: {}, events: extra }]);
        }
      }
    } catch (_) {}
    const j = { tournaments: allTours };
    return { shape: 'tours', j: j };
  }

  async function sofaPastFinished() {
    if (sofaPastEvents) return sofaPastEvents;
    const today = new Date();
    const iso = d => d.toISOString().slice(0, 10);
    const out = [];
    for (const d of [iso(new Date(today.getTime() - 86400000)), iso(new Date(today.getTime() - 172800000))]) {
      try {
        const rp = await fetch('https://api.sofascore.com/api/v1/sport/tennis/scheduled-events/' + d);
        if (rp.ok) {
          const jp = await rp.json();
          if (jp && jp.events) out.push(...jp.events.filter(ev => ev.status && ev.status.type === 'Finished'));
        }
      } catch (_) {}
    }
    sofaPastEvents = out;
    return out;
  }

  function sofaEventsOf(raw) {
    const out = [];
    if (raw.shape === 'tours') {
      for (const t of (raw.j.tournaments || [])) {
        const tinfo = t.tournament || {};
        for (const ev of (t.events || [])) {
          try { ev.__catName = ((tinfo.category || {}).name) || ''; } catch (_) {}
          if (!ev.uniqueTournament && tinfo.uniqueTournament) ev.uniqueTournament = tinfo.uniqueTournament;
          if (!ev.tournament) ev.tournament = tinfo;
          out.push(ev);
        }
      }
    } else {
      const arr = raw.j.events || [];
      for (const ev of arr) out.push(ev);
    }
    return out;
  }

  function guessSurface(name, dateStr) {
    const n = (name || '').toLowerCase();
    if (/monte.?carlo|roland garros|french open|internazionali|\brome\b|\broma\b|hamburg|estoril|munich|barcelona|rio de janeiro|umag|kitzbuhel|gstaad|bastad|cordoba|santiago|buenos aires|mar del plata|concepcion|munich|madrid open|italian open/.test(n)) return 'Red clay';
    if (/wimbledon|eastbourne|halle|mallorca|newport|s-hertogenbosch|libema|queen.?s|stuttgart.*grass|maharashtra|newport beach/.test(n)) return 'Grass';
    let m = new Date().getMonth();
    if (dateStr) { const d = new Date(dateStr); if (!isNaN(d)) m = d.getMonth(); }
    if (m === 3 || m === 4) return 'Red clay';
    if (m === 5) return 'Grass';
    return 'Hardcourt outdoor';
  }

  function sofaMetaFromEvent(ev) {
    const ut = ev.uniqueTournament || {};
    const tName = ut.name || (ev.tournament || {}).name || '';
    const cat = (((ev.tournament || {}).category || {}).name || '').toLowerCase();
    let circuit = cat === 'wta' ? 'wta' : (cat.indexOf('chall') > -1 ? 'chall' : 'atp');
    return {
      id: 'sf-' + (ut.id || (ev.tournament || {}).id || tName),
      name: tName,
      logo: ut.id ? ('https://api.sofascore.com/api/v1/unique-tournament/' + ut.id + '/image') : '',
      surface: ev.groundType || '',
      tier: tierLabel(tName, circuit),
      circuit: circuit
    };
  }

  async function refreshSofaMetaStatic() {
    try {
      const j = await fetchJson('sofa-meta.json?t=' + Date.now()).catch(() => null);
      if (j && j.ok && j.meta) state.sofaMetaStatic = j.meta;
    } catch (_) { state.sofaMetaStatic = null; }
  }

  function applySofaMetaStatic() {
    const m = state.sofaMetaStatic;
    if (!m) return;
    for (const t of state.tournaments) {
      if (t.logo && t.surface) continue;
      const nk = taNorm(t.name || '');
      if (!nk) continue;
      let hit = m[nk] || null;
      if (!hit) {
        for (const k in m) {
          if (k.indexOf(nk) > -1 || nk.indexOf(k) > -1) { hit = m[k]; break; }
        }
      }
      if (hit) {
        t.logo = t.logo || hit.logo || '';
        t.surface = t.surface || hit.surface || '';
        t.tier = t.tier || hit.tier || '';
      }
    }
  }

  async function sofaMetaEnrich() {
    const now = Date.now();
    if (state.sofaMeta && state.sofaMeta.ts && now - state.sofaMeta.ts < 600000) {
      applySofaMeta(state.sofaMeta.bySurname, state.sofaMeta.byName);
      return;
    }
    try {
      const raw = await fetchSofaRaw();
      const allEvents = sofaEventsOf(raw);
      const bySurname = new Map();
      const byName = new Map();
      let nEvents = 0, nKept = 0;
      for (const ev of allEvents) {
        nEvents++;
        const cat = ((((ev.tournament || {}).category || {}).name) || ev.__catName || '').toLowerCase();
        if (!/atp|wta|chall|itf/.test(cat)) continue;
        nKept++;
        const meta = sofaMetaFromEvent(ev);
        const nk = taNorm(meta.name);
        if (nk && !byName.has(nk)) byName.set(nk, meta);
        [ev.homeTeam, ev.awayTeam].forEach(team => {
          const nm = (team || {}).name || '';
          nm.split('/').forEach(part => {
            const words = part.trim().split(/\s+/);
            if (!words.length) return;
            const sur = words[words.length - 1].toLowerCase().replace(/[^a-z\u00C0-\u024F]/g, '');
            if (sur.length > 2 && !bySurname.has(sur)) bySurname.set(sur, meta);
          });
        });
      }
      state.sofaMeta = { bySurname: bySurname, byName: byName, ts: now, err: '', nEvents: nEvents, nKept: nKept };
      applySofaMeta(bySurname, byName);
      if (state.tab === 'live') renderLive();
    } catch (eSofa) {
      state.sofaMeta = { bySurname: new Map(), byName: new Map(), ts: now, err: (eSofa && eSofa.message) || 'error' };
    }
  }

  function applySofaMeta(bySurname, byName) {
    for (const t of state.tournaments) {
      if (t.logo && t.surface) continue;
      const nk = taNorm(t.name || '');
      let meta = byName ? (byName.get(nk) || null) : null;
      if (!meta && byName) {
        for (const [key, val] of byName) {
          if (key.indexOf(nk) > -1 || nk.indexOf(key) > -1) { meta = val; break; }
        }
      }
      if (!meta) {
        for (const m of state.matches.filter(x => x.tournamentId === t.id)) {
          for (const comp of m.competitors) {
            const words = (comp.name || '').trim().split(/\s+/);
            const sur = words[words.length - 1].toLowerCase().replace(/[^a-z\u00C0-\u024F]/g, '');
            const hit = bySurname.get(sur);
            if (hit) { meta = hit; break; }
          }
          if (meta) break;
        }
      }
      if (meta) {
        t.logo = t.logo || meta.logo;
        t.surface = t.surface || meta.surface;
        t.tier = t.tier || meta.tier;
      }
    }
  }

  async function sofascoreFallback() {
    const raw = await fetchSofaRaw();
    const pastEv = await sofaPastFinished().catch(() => []);
    const allEvents = sofaEventsOf(raw).concat(pastEv);
    const res = {
      atp: { matches: [], tournaments: [] },
      wta: { matches: [], tournaments: [] },
      chall: { matches: [], tournaments: [] },
      itf: { matches: [], tournaments: [] },
      wc: { matches: [], tournaments: [] }
    };
    for (const ev of allEvents) {
      const cat = ((((ev.tournament || {}).category || {}).name) || ev.__catName || '').toLowerCase();
      let circuit = '';
      if (/wheelchair|silla/.test(cat)) circuit = 'wc';
      else if (/chall/.test(cat)) circuit = 'chall';
      else if (/itf/.test(cat)) circuit = 'itf';
      else if (/atp/.test(cat)) circuit = 'atp';
      else if (/wta|women|femen/.test(cat)) circuit = 'wta';
      else continue;
      const tName = (ev.uniqueTournament && ev.uniqueTournament.name) || (ev.tournament && ev.tournament.name) || '';
      const meta = sofaMetaFromEvent(ev);
      const tid = meta.id;
      if (!res[circuit].tournaments.some(t => t.id === tid)) {
        res[circuit].tournaments.push({ id: tid, name: tName, date: '', status: null, previousWinners: [], logo: meta.logo, surface: meta.surface, tier: meta.tier });
      }
      const st = (ev.status || {}).type || '';
      const desc = (ev.status || {}).description || '';
      const hN = (ev.homeTeam || {}).name || 'TBD';
      const aN = (ev.awayTeam || {}).name || 'TBD';
      const isDbl = hN.indexOf('/') > -1 || aN.indexOf('/') > -1;
      const fem = /wta|women|femen/.test(cat) || (/itf/.test(cat) && /women|femen/.test(cat));
      let typeTxt;
      if (circuit === 'wc') typeTxt = isDbl ? "Wheelchair Doubles" : "Wheelchair Singles";
      else if (circuit === 'chall') typeTxt = (isDbl ? "Men's Doubles" : "Men's Singles");
      else if (circuit === 'itf') typeTxt = (isDbl ? (fem ? "Women's Doubles" : "Men's Doubles") : (fem ? "Women's Singles" : "Men's Singles"));
      else typeTxt = circuit === 'wta' ? (isDbl ? "Women's Doubles" : "Women's Singles") : (isDbl ? "Men's Doubles" : "Men's Singles");
      const hc = (ev.homeScore || {}).current || 0;
      const ac = (ev.awayScore || {}).current || 0;
      res[circuit].matches.push({
        id: 'sf-' + ev.id,
        date: ev.startTimestamp ? new Date(ev.startTimestamp * 1000).toISOString() : '',
        state: st === 'inprogress' ? 'in' : (st === 'finished' ? 'post' : 'pre'),
        period: 0,
        suspended: /suspend|delay|rain/i.test(desc),
        suspReason: /suspend|delay|rain/i.test(desc) ? desc : '',
        type: typeTxt,
        round: (ev.roundInfo || {}).name || '',
        tournamentId: tid,
        tournamentName: tName,
        tour: circuit,
        venue: '',
        notes: '',
        competitors: [
          { homeAway: 'home', winner: st === 'finished' && hc > ac, order: 1, name: hN, flag: '', flagAlt: (((ev.homeTeam || {}).country || {}).a2Code) || '', linescores: sofaLines(ev.homeScore, st === 'inprogress') },
          { homeAway: 'away', winner: st === 'finished' && ac > hc, order: 2, name: aN, flag: '', flagAlt: (((ev.awayTeam || {}).country || {}).a2Code) || '', linescores: sofaLines(ev.awayScore, st === 'inprogress') }
        ],
        pts0: st === 'inprogress' ? String((ev.homeScore || {}).displayScore || '') : '',
        pts1: st === 'inprogress' ? String((ev.awayScore || {}).displayScore || '') : ''
      });
    }
    return res;
  }

  function sofaPbpParse(j) {
    let best = [];
    const scan = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        const pts = node.filter(x => x && typeof x === 'object' && x.winnerCode != null);
        if (pts.length > best.length) best = pts;
        node.forEach(scan);
        return;
      }
      if (typeof node === 'object') Object.keys(node).forEach(k => scan(node[k]));
    };
    try { scan(j); } catch (e) { return null; }
    if (!best.length) return null;
    const keyOf = p => [p.periodNumber != null ? p.periodNumber : (p.setNumber != null ? p.setNumber : ''), p.gameNumber != null ? p.gameNumber : ''].join('-');
    const curKey = keyOf(best[best.length - 1]);
    const inGame = best.filter(p => keyOf(p) === curKey);
    let s1 = 0, s2 = 0;
    for (const p of inGame) {
      const w = String(p.winnerCode);
      if (w === '1') s1++; else if (w === '2') s2++;
    }
    const srv = inGame.length ? inGame[inGame.length - 1].serverPlayer1 : null;
    return { s1: s1, s2: s2, server1: srv === true ? 1 : srv === false ? 2 : 0 };
  }

  function gameScoreLabel(a, b) {
    const L = ['0', '15', '30', '40'];
    if (a >= 3 && b >= 3) {
      if (a === b) return ['40', '40'];
      return a > b ? ['AD', ''] : ['', 'AD'];
    }
    return [L[Math.min(a, 3)], L[Math.min(b, 3)]];
  }

  async function refreshSofaPoints() {
    const live = allMatches().filter(m => m.state === 'in');
    if (!live.length) return;
    const targets = [];
    for (const m of live) {
      if (/^sf-\d+$/.test(String(m.id || ''))) targets.push([m, String(m.id).slice(3)]);
    }
    if (!targets.length) {
      const map = await sofaEventIdMap();
      if (map) {
        for (const m of live) {
          if (Date.now() - (m.sfFailAt || 0) < 300000) continue;
          const id = sofaFindId(m, map);
          if (id) targets.push([m, id]);
          else m.sfFailAt = Date.now();
        }
      }
    }
    if (!targets.length) return;
    await Promise.all(targets.map(async pr => {
      const m = pr[0];
      try {
        const r = await fetch('https://api.sofascore.com/api/v1/event/' + pr[1] + '/point-by-point');
        if (!r.ok) { m.pbpDbg = pr[1] + ':HTTP' + r.status; return; }
        const j = await r.json();
        m.sofaPts = sofaPbpParse(j);
        if (m.sofaPts) m.sofaPtsAt = Date.now();
        m.pbpDbg = pr[1] + ':HTTP' + r.status + ':' + JSON.stringify(m.sofaPts);
      } catch (e) { m.pbpDbg = pr[1] + ':ERR:' + e.message; }
    }));
  }

  function sofaLocalDay(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  let sofaIdMap = null;
  let sofaIdMapAt = 0;

  async function sofaEventIdMap() {
    if (sofaIdMap && Date.now() - sofaIdMapAt < 300000) return sofaIdMap;
    const days = [-86400000, 0, 86400000].map(off => sofaLocalDay(new Date(Date.now() + off)));
    const map = new Map();
    await Promise.all(days.map(async d => {
      try {
        let r = await fetch('https://api.sofascore.com/api/v1/sport/tennis/scheduled-tournaments/' + d + '/page/1');
        if (!r.ok) return;
        const tours = [];
        for (let pg = 1; pg <= 4; pg++) {
          if (pg > 1) r = await fetch('https://api.sofascore.com/api/v1/sport/tennis/scheduled-tournaments/' + d + '/page/' + pg);
          if (!r.ok) break;
          const jp = await r.json();
          const list = (jp && jp.tournaments) || [];
          if (!list.length) break;
          tours.push(...list);
          if (list.length < 20) break;
        }
        for (const tt of tours) {
          for (const ev of ((tt && tt.events) || [])) {
            const hN = taNorm((ev.homeTeam || {}).name || '');
            const aN = taNorm((ev.awayTeam || {}).name || '');
            if (!hN || !aN) continue;
            map.set(hN + '|' + aN, String(ev.id));
            map.set(aN + '|' + hN, String(ev.id));
          }
        }
      } catch (e) { /* noop */ }
    }));
    if (map.size) { sofaIdMap = map; sofaIdMapAt = Date.now(); }
    return sofaIdMap;
  }

  function sofaPairMatch(x, y) { return !!x && !!y && (x === y || x.indexOf(y) > -1 || y.indexOf(x) > -1); }

  function sofaFindId(m, map) {
    const cs = m.competitors || [];
    const n0 = taNorm((cs[0] || {}).name || '');
    const n1 = taNorm((cs[1] || {}).name || '');
    if (!n0 || !n1) return null;
    for (const kv of map) {
      const parts = kv[0].split('|');
      if ((sofaPairMatch(n0, parts[0]) && sofaPairMatch(n1, parts[1])) ||
          (sofaPairMatch(n0, parts[1]) && sofaPairMatch(n1, parts[0]))) return kv[1];
    }
    return null;
  }

  function taNorm(s) {
    return s.toLowerCase().replace(/[^a-z\u00C0-\u024F\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  async function fetchTAH2HWeb(nameA, nameB) {
    const rp1 = resolveNameClient(nameA);
    const rp2 = resolveNameClient(nameB);
    if (!rp1) throw new Error('no-encontrado:' + nameA);
    if (!rp2) throw new Error('no-encontrado:' + nameB);
    const q2norm = taNorm(rp2);
    const slug = taSlug(rp1);
    let result = null;
    try {
      const rFull = await fetch('https://r.jina.ai/https://www.tennisabstract.com/cgi-bin/player-classic.cgi?p=' + slug, { headers: { 'X-Return-Format': 'html' } });
      if (rFull.ok) {
        const fullHtml = await rFull.text();
        const fnCheck = fullHtml.match(/Tennis Abstract:\s*(.+?)\s+Match Results/);
        if (fullHtml.indexOf('var matchmx') > -1 && fnCheck && fnCheck[1].trim().toLowerCase() === rp1.toLowerCase()) {
          result = parseMatchmxClient(fullHtml, rp1, q2norm);
          if (result && !result.meetings.length) result = null;
        }
      }
    } catch (e0) { result = null; }
    if (!result) {
      let text = null;
      try {
        const r1 = await fetch('https://r.jina.ai/https://www.tennisabstract.com/jsfrags/' + slug + '.js', { headers: { 'X-Return-Format': 'text' } });
        if (r1.ok) text = await r1.text();
      } catch (e1) { text = null; }
      if (!text || text.indexOf('<tr') < 0) {
        try {
          const r2 = await fetch('https://www.tennisabstract.com/jsfrags/' + slug + '.js', { mode: 'cors' });
          if (r2.ok) text = await r2.text();
        } catch (e2) { text = null; }
      }
      if (!text || text.indexOf('<tr') < 0) throw new Error('sin-datos');
      result = parseTaFragClient(text, rp1, rp2);
    }
    return {
      p1: (result.realName || rp1),
      p2: rp2,
      meetings: result.meetings || []
    };
  }

  function taCountWins(meetings, selfName) {
    const sur = taNorm(selfName).split(' ').pop();
    let w = 0;
    for (const mt of meetings) {
      const nw = taNorm(mt.winner || '');
      if (nw === sur || nw.endsWith(' ' + sur)) w++;
    }
    return w;
  }

  async function refreshScoreboards() {
    const [atp, wta] = await Promise.all([
      fetchJson(ESPN + '/atp/scoreboard').catch(() => null),
      fetchJson(ESPN + '/wta/scoreboard').catch(() => null)
    ]);
    let a = atp ? normalizeScoreboard(atp, 'atp') : { matches: [], tournaments: [] };
    let w = wta ? normalizeScoreboard(wta, 'wta') : { matches: [], tournaments: [] };
    let extraSrcs = [];
    if (!a.matches.length && !w.matches.length) {
      try {
        const sf = await sofascoreFallback();
        if (sf.atp.matches.length) a = sf.atp;
        if (sf.wta.matches.length) w = sf.wta;
        if (sf.chall.matches.length && !(state.challLive && state.challLive.ok && (state.challLive.matches || []).length)) {
          state.challLive = { ok: true, time: '', tournaments: sf.chall.tournaments, matches: sf.chall.matches };
        }
        if (!useLocalBackend() && sf.itf.matches.length) extraSrcs.push(sf.itf);
      } catch (_) {}
    } else {
      sofaMetaEnrich();
    }
    const srcs = [a, w].concat(extraSrcs);
    const tmap = new Map();
    const mmap = new Map();
    for (const src of srcs) {
      for (const t of src.tournaments) tmap.set(t.id, t);
      for (const m of src.matches) if (!mmap.has(m.id)) mmap.set(m.id, m);
    }
    state.tournaments = Array.from(tmap.values());
    state.matches = Array.from(mmap.values());
    applySofaMetaStatic();
    if (!state.sofaMetaStatic && !state.sofaMetaLoading) {
      state.sofaMetaLoading = true;
      refreshSofaMetaStatic().then(() => {
        state.sofaMetaLoading = false;
        if (state.sofaMetaStatic) { applySofaMetaStatic(); if (state.tab === 'live') renderLive(); }
      });
    }
    if (state.drawTournamentId && !state.tournaments.some(t => t.id === state.drawTournamentId)) {
      state.drawTournamentId = null;
    }
  }

  function normalizeEspnRank(json) {
    const list = (json.rankings || []).find(r => r.ranks && r.ranks.length) || (json.rankings || [])[0];
    return ((list && list.ranks) || []).map(r => ({
      rank: r.current,
      previous: r.previous,
      points: r.points,
      trend: r.trend || '-',
      name: r.athlete && r.athlete.displayName ? r.athlete.displayName : '—',
      flag: r.athlete && r.athlete.flag ? r.athlete.flag : '',
      flagAlt: r.athlete && r.athlete.flagAltText ? r.athlete.flagAltText : ''
    }));
  }

  async function refreshRankingsSingles(force) {
    if (!force && state.rankSinglesAt && Date.now() - state.rankSinglesAt < 600000 &&
        state.rankSingles.atp && state.rankSingles.wta) return;
    state.rankSinglesAt = Date.now();
    const ltRow = r => ({
      rank: r.rank,
      points: parseInt(String(r.points || '').replace(/[^\d]/g, ''), 10) || 0,
      trend: r.move || 0,
      name: r.name,
      flag: flagUrl((r.country || '').toLowerCase()),
      flagAlt: r.country || ''
    });
    const jobs = ['atp', 'wta'].map(tour => {
      const p = useLocalBackend()
        ? fetchJson('/api/rankings/live?tour=' + tour + '&race=0&official=1')
        : fetchJson('rankings/' + tour + '_singles.json').then(j => {
            if (!j || !j.players || !j.players.length) throw new Error('json vacio');
            return { rows: j.players, updated: j.updated || null };
          }).catch(() =>
            fetch('https://r.jina.ai/https://live-tennis.eu/en/official-' + tour + '-ranking', { headers: { 'X-Return-Format': 'html' } }).then(r => { if (!r.ok) throw new Error('jina ' + r.status); return r.text(); }).then(t => ({ rows: parseLtRows(t), updated: new Date().toISOString() }))
          );
      return p.then(j => {
        const rows = (j && j.rows) || j;
        if (!Array.isArray(rows) || !rows.length) throw new Error('sin datos');
        state.rankSingles[tour] = rows.map(ltRow);
        state.rankSinglesSource = 'live-tennis.eu (ranking oficial completo)';
        if (j && j.updated) state.rankSinglesUpdated = j.updated;
      }).catch(() => {});
    });
    await Promise.allSettled(jobs);
    const needAtp = !state.rankSingles.atp || !state.rankSingles.atp.length;
    const needWta = !state.rankSingles.wta || !state.rankSingles.wta.length;
    if (needAtp || needWta) {
      try {
        const [a, w] = await Promise.all([fetchJson(ESPN + '/atp/rankings'), fetchJson(ESPN + '/wta/rankings')]);
        if (needAtp) state.rankSingles.atp = normalizeEspnRank(a);
        if (needWta) state.rankSingles.wta = normalizeEspnRank(w);
        state.rankSinglesSource = 'ESPN';
      } catch (_) {}
    }
  }

  /* ---------- ATP live (conteo de puntos 15/30/40) ---------- */

  function useLocalBackend() {
    return !/\.github\.io$/i.test(location.hostname);
  }

  function parseAtpLive(raw) {
    const out = [];
    if (Array.isArray(raw && raw.matches)) {
      for (const m of raw.matches) {
        out.push({
          status: m.status,
          type: m.type || 'singles',
          suspended: m.suspended === true || m.status === 'S' || m.status === 'D',
          p1: norm(m.p1), p2: norm(m.p2),
          g1: m.g1, g2: m.g2, server: m.server,
          sets1: m.sets1 || [], sets2: m.sets2 || []
        });
      }
      return out;
    }
    const tours = (raw && raw.Data && raw.Data.LiveMatchesTournamentsOrdered) || [];
    for (const t of tours) {
      for (const m of (t.LiveMatches || [])) {
        out.push({
          status: m.MatchStatus,
          type: m.IsDoubles ? 'doubles' : 'singles',
          suspended: m.MatchStatus === 'S' || m.MatchStatus === 'D',
          p1: norm((m.PlayerTeam.Player.PlayerFirstName || '') + ' ' + (m.PlayerTeam.Player.PlayerLastName || '')),
          p2: norm((m.OpponentTeam.Player.PlayerFirstName || '') + ' ' + (m.OpponentTeam.Player.PlayerLastName || '')),
          g1: m.PlayerTeam.GameScore, g2: m.OpponentTeam.GameScore,
          server: m.ServerTeam,
          sets1: (m.PlayerTeam.SetScores || []).map(s => s.SetScore),
          sets2: (m.OpponentTeam.SetScores || []).map(s => s.SetScore)
        });
      }
    }
    return out;
  }

  async function refreshAtpLive() {
    try {
      const url = useLocalBackend()
        ? 'api/live/atp'
        : 'https://app.atptour.com/api/v2/gateway/livematches/website?scoringTournamentLevel=tour';
      const j = await fetchJson(url);
      state.atpLive = parseAtpLive(j);
    } catch (err) {
      state.atpLive = [];
    }
  }

  function parseChallenger(j) {
    const matches = [], tournaments = [], points = [];
    const tourById = new Map();
    const getTour = (id, name, date, city, country) => {
      if (!tourById.has(id)) {
        const t = { id: id, name: name || 'Torneo', date: date || null, city: '', country: '', status: null, previousWinners: [] };
        tourById.set(id, t);
        tournaments.push(t);
      }
      const t = tourById.get(id);
      if (name) t.name = name;
      if (date) t.date = date;
      if (city) t.city = city;
      if (country) t.country = country;
      return t;
    };
    const push = (tid, m) => {
      const t = getTour(tid, m.tournamentName, m.tournamentDate, m.tournamentCity, m.tournamentCountry);
      matches.push({
        id: m.id || tid + '-' + (m.p1 || 'x') + '-' + (m.p2 || 'x'),
        date: null,
        state: m.state || 'pre',
        suspended: m.suspended === true || m.status === 'S' || m.status === 'D',
        period: null,
        type: m.type || "Men's Singles",
        round: m.round || '',
        tournamentId: tid,
        tournamentName: t.name,
        tour: 'chall',
        venue: ((t.city || '') + (t.country ? ', ' + t.country : '')).trim(),
        notes: m.notes || '',
        competitors: [
          { homeAway: 'home', winner: false, order: 1, name: m.p1 || 'TBD', flag: flagUrl(m.p1flag), flagAlt: '', linescores: (m.sets1 || []).map(v => ({ value: v, tiebreak: null, winner: false })) },
          { homeAway: 'away', winner: false, order: 2, name: m.p2 || 'TBD', flag: flagUrl(m.p2flag), flagAlt: '', linescores: (m.sets2 || []).map(v => ({ value: v, tiebreak: null, winner: false })) }
        ]
      });
      if (m.status === 'P' || m.status === 'W') {
        points.push({ status: 'P', p1: norm(m.p1), p2: norm(m.p2), g1: m.g1, g2: m.g2, server: m.server });
      }
    };
    for (const t of ((j && j.tournaments) || [])) {
      getTour(t.id, t.name, t.date, t.city, t.country);
    }
    for (const m of ((j && j.matches) || [])) {
      push(m.tournamentId || 'chall-0', m);
    }
    const gw = j && j.Data && j.Data.LiveMatchesTournamentsOrdered;
    if (gw) {
      for (const t of gw) {
        if (!t.EventTitle) continue;
        const tid = 'chall-' + t.EventId;
        getTour(tid, t.EventTitle, t.EventStartDate, t.EventCity, t.EventCountryCode);
        for (const m of (t.LiveMatches || [])) {
          push(tid, {
            id: tid + '-' + m.MatchId,
            type: m.IsDoubles ? "Men's Doubles" : "Men's Singles",
            state: m.MatchStatus === 'P' || m.MatchStatus === 'W' ? 'in' : m.MatchStatus === 'F' ? 'post' : (m.MatchStatus === 'S' || m.MatchStatus === 'D') ? 'in' : 'pre',
            suspended: m.MatchStatus === 'S' || m.MatchStatus === 'D',
            round: m.RoundName || '',
            notes: m.ExtendedMessage || '',
            status: m.MatchStatus,
            g1: m.PlayerTeam.GameScore,
            g2: m.OpponentTeam.GameScore,
            server: m.ServerTeam,
            p1: (((m.PlayerTeam.Player.PlayerFirstName || '') + ' ' + (m.PlayerTeam.Player.PlayerLastName || '')).trim()),
            p2: (((m.OpponentTeam.Player.PlayerFirstName || '') + ' ' + (m.OpponentTeam.Player.PlayerLastName || '')).trim()),
            p1flag: m.PlayerTeam.Player.PlayerCountry,
            p2flag: m.OpponentTeam.Player.PlayerCountry,
            sets1: (m.PlayerTeam.SetScores || []).map(s => s.SetScore),
            sets2: (m.OpponentTeam.SetScores || []).map(s => s.SetScore)
          });
        }
      }
    }
    return { matches, tournaments, points };
  }

  async function refreshChallLive() {
    try {
      const url = useLocalBackend()
        ? 'api/live/chall'
        : 'https://app.atptour.com/api/v2/gateway/livematches/website?scoringTournamentLevel=challenger';
      const j = await fetchJson(url);
      const r = parseChallenger(j);
      state.challLive = r;
      state.challPoints = r.points;
    } catch (err) {
      state.challLive = { tournaments: [], matches: [] };
      state.challPoints = [];
    }
  }

  function applySuspensions() {
    for (const e of state.atpLive) {
      if (!e.suspended) continue;
      if (!e.p1 || !e.p2) continue;
      for (const m of state.matches) {
        if (m.suspended) continue;
        const names = m.competitors.map(p => norm(p.name)).filter(Boolean);
        if (names.length < 2) continue;
        if (names.indexOf(e.p1) === -1 || names.indexOf(e.p2) === -1) continue;
        m.suspended = true;
        m.suspReason = m.suspReason || 'SUSPENDIDO';
        m.state = 'in';
      }
    }
  }

  function parseItf(j) {
    const matches = [], tournaments = [];
    for (const t of (j.tournaments || [])) {
      tournaments.push({ id: t.id, name: t.name, date: null, status: null, previousWinners: [] });
      for (const m of (t.matches || [])) {
        const sex = t.cat === 'm' ? "Men's" : "Women's";
        if (m.finished) {
          const s1 = m.sets1 || [], s2 = m.sets2 || [];
          const n = Math.min(s1.length, s2.length);
          const ls1 = [], ls2 = [];
          for (let i = 0; i < n; i++) {
            const a = parseInt(s1[i], 10), b = parseInt(s2[i], 10);
            ls1.push({ value: isNaN(a) ? null : a, winner: !isNaN(a) && !isNaN(b) && a > b });
            ls2.push({ value: isNaN(b) ? null : b, winner: !isNaN(a) && !isNaN(b) && b > a });
          }
          const w1 = (m.res1 || 0) > (m.res2 || 0);
          matches.push({
            id: t.id + '-f-' + m.teId,
            date: null,
            state: 'post',
            period: null,
            type: sex + ' Singles',
            round: m.round || '',
            tournamentId: t.id,
            tournamentName: t.name,
            tour: 'itf',
            cat: t.cat,
            venue: '',
            notes: '',
            competitors: [
              { homeAway: 'home', winner: w1, order: 1, name: m.p1 || 'TBD', flag: '', flagAlt: '', linescores: ls1 },
              { homeAway: 'away', winner: !w1, order: 2, name: m.p2 || 'TBD', flag: '', flagAlt: '', linescores: ls2 }
            ],
            itfTime: m.time || '',
            h2h: '',
            teId: m.teId
          });
          continue;
        }
        matches.push({
          id: t.id + '-' + (m.p1 || 'x') + '-' + (m.p2 || 'x'),
          date: null,
          state: 'pre',
          period: null,
          type: sex + ' Singles',
          round: m.round || '',
          tournamentId: t.id,
          tournamentName: t.name,
          tour: 'itf',
          cat: t.cat,
          venue: '',
          notes: '',
          competitors: [
            { homeAway: 'home', winner: false, order: 1, name: m.p1 || 'TBD', flag: '', flagAlt: '', linescores: [] },
            { homeAway: 'away', winner: false, order: 2, name: m.p2 || 'TBD', flag: '', flagAlt: '', linescores: [] }
          ],
          itfTime: m.time,
          h2h: m.h2h,
          teId: m.teId
        });
      }
    }
    return { matches, tournaments };
  }

  async function refreshItfLive() {
    try {
      const url = useLocalBackend() ? 'api/itf/live' : 'itf_live.json';
      const j = await fetchJson(url);
      state.itfLive = parseItf(j);
    } catch (err) {
      state.itfLive = { tournaments: [], matches: [] };
    }
  }

  async function refreshNews() {
    try {
      const url = useLocalBackend() ? 'api/news' : 'news.json';
      const j = await fetchJson(url).catch(() => null);
      if (!j || !j.items) {
        state.news = { items: [], loaded: true, error: 'No se pudieron cargar las noticias.' };
      } else {
        state.news = { items: j.items, updated: j.updated, loaded: true, error: '' };
      }
    } catch (err) {
      state.news = { items: [], loaded: true, error: err.message };
    }
    if (state.tab === 'news') render();
  }

  async function refreshVideos() {
    try {
      const url = useLocalBackend() ? 'api/videos' : 'videos.json';
      const j = await fetchJson(url).catch(() => null);
      if (!j || !j.videos) {
        state.videos = { items: [], loaded: true, error: 'No se pudieron cargar los videos.' };
      } else {
        state.videos = { items: j.videos, updated: j.updated, loaded: true, error: '' };
      }
    } catch (err) {
      state.videos = { items: [], loaded: true, error: err.message };
    }
    if (state.tab === 'videos') render();
  }

  async function refreshElo() {
    try {
      const url = useLocalBackend() ? 'api/elo' : 'elo.json';
      const j = await fetchJson(url).catch(() => null);
      if (j && j.ok) {
        state.elo = { atp: j.atp || null, wta: j.wta || null, loaded: true };
      } else {
        state.elo = { atp: null, wta: null, loaded: true };
      }
    } catch (_) {
      state.elo = { atp: null, wta: null, loaded: true };
    }
    if (state.tab === 'players') render();
  }

  function matchLiveName(espnName, liveName) {
    if (espnName === liveName) return true;
    if (espnName.indexOf(liveName) > -1 || liveName.indexOf(espnName) > -1) return true;
    return false;
  }

  function livePoints(m) {
    if (m.state !== 'in') return null;
    const names = m.competitors.map(p => norm(p.name)).filter(Boolean);
    if (names.length < 2) return null;
    const allLive = [...state.atpLive, ...state.challPoints];
    const hit = allLive.find(e => e.status === 'P' &&
      ((matchLiveName(names[0], e.p1) && matchLiveName(names[1], e.p2)) ||
       (matchLiveName(names[1], e.p1) && matchLiveName(names[0], e.p2))));
    if (!hit) return null;
    const side0 = matchLiveName(names[0], hit.p1) && matchLiveName(names[1], hit.p2);
    const g0 = side0 ? hit.g1 : hit.g2;
    const g1 = side0 ? hit.g2 : hit.g1;
    const serverName = hit.server === 2 ? hit.p1 : hit.server === 1 ? hit.p2 : '';
    return { g0, g1, serverName };
  }

  function pointLabel(g) {
    const v = String(g == null ? '' : g).toUpperCase().trim();
    if (v === 'A' || v === 'AD' || v === 'ADV') return 'A';
    return v;
  }
  function pointPair(g0, g1) {
    const a = pointLabel(g0), b = pointLabel(g1);
    if (!a && !b) return null;
    if (a === '40' && b === '40') return 'DEUCE';
    return a + '-' + b;
  }

  async function refreshRankingsDoubles() {
    const local = useLocalBackend();
    const [atp, wta] = await Promise.all([
      fetchJson(local ? 'api/rankings/atp?type=doubles' : 'rankings/atp_doubles.json'),
      fetchJson(local ? 'api/rankings/wta?type=doubles' : 'rankings/wta_doubles.json')
    ]);
    state.rankDoubles.atp = atp;
    state.rankDoubles.wta = wta;
  }

  function normSeedKey(s) {
    return String(s || '').toLowerCase().replace(/-/g, ' ').replace(/\./g, '').replace(/\s+/g, ' ').trim();
  }
  function normTourneyKey(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function tourneyCore(s) {
    const stop = { atp: 1, wta: 1, itf: 1, challenger: 1, chall: 1, open: 1, pro: 1, tennis: 1, series: 1, utr: 1, match: 1 };
    return normTourneyKey(s).split(' ').filter(w => w && !stop[w]).join(' ');
  }
  function seedPairKey(s) {
    const toks = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(t => t.length > 1);
    return toks.sort().join('|');
  }

  function buildSeedMaps(seeds) {
    const atp = {}, wta = {}, all = {}, byTour = {}, surnameTours = {};
    if (!seeds) return { atp, wta, all, byTour, surnameTours };
    const tours = Array.isArray(seeds.tournaments) ? seeds.tournaments : [];

    const noteForm = (tourKey, circuit, form, seed) => {
      if (!form) return;
      const ck = (circuit || '?') + '::' + form;
      let e = surnameTours[ck];
      if (!e) { e = surnameTours[ck] = { tours: {}, seed: seed }; }
      e.tours[tourKey] = 1;
      if (e.seed !== seed) e.seed = null;
    };

    for (const t of tours) {
      const nk = normTourneyKey(t.name || '');
      if (!nk) continue;
      const circuit = String(t.circuit || '').toLowerCase();
      const bucket = { circuit: circuit, seeds: {}, pairs: {} };
      for (const [k, v] of Object.entries(t.singles || {})) {
        const norm = normSeedKey(k);
        if (!norm) continue;
        bucket.seeds[norm] = v;
        bucket.seeds[norm.replace(/\s+/g, '')] = v;
        const ps = norm.split(' ');
        noteForm(nk, circuit, norm, v);
        if (ps.length >= 2) noteForm(nk, circuit, ps.slice(-2).join(' '), v);
        noteForm(nk, circuit, ps[ps.length - 1], v);
      }
      for (const [k, v] of Object.entries(t.doubles || {})) {
        const pk = seedPairKey(k);
        if (pk) bucket.pairs[pk] = v;
        const norm = normSeedKey(k.replace(/\//g, ' '));
        if (norm) { bucket.seeds[norm] = v; bucket.seeds[norm.replace(/\s+/g, '')] = v; }
      }
      if (!byTour[nk]) byTour[nk] = [];
      byTour[nk].push(bucket);

      const target = circuit === 'wta' ? wta : circuit === 'atp' ? atp : all;
      for (const [k, v] of Object.entries(bucket.seeds)) { target[k] = v; all[k] = v; }
    }
    return { atp, wta, all, byTour, surnameTours };
  }

  async function refreshSeeds() {
    try {
      const url = useLocalBackend() ? 'api/seeds' : 'seeds.json';
      const j = await fetchJson(url).catch(() => null);
      if (j && j.ok) {
        state.seeds = j;
        const maps = buildSeedMaps(j);
        state.seedMap = maps.all;
        state.seedMapATP = maps.atp;
        state.seedMapWTA = maps.wta;
        state.seedByTour = maps.byTour;
        state.seedSurnameTours = maps.surnameTours;
      }
    } catch (_) {}
  }

  function circuitOf(m) {
    if (!m || !m.type) return null;
    return m.type.indexOf('Men') > -1 ? 'atp' : m.type.indexOf('Women') > -1 ? 'wta' : null;
  }

  function findSeedBucket(tourName, circuit) {
    const bt = state.seedByTour || {};
    const keys = Object.keys(bt);
    if (!tourName || !keys.length) return null;
    const q = normTourneyKey(tourName);
    if (!q) return null;
    const flat = [];
    for (const k of keys) for (const b of bt[k]) flat.push({ k: k, b: b });
    let cands = flat.filter(x => x.k === q);
    if (!cands.length) {
      let pool = flat.filter(x => !circuit || !x.b.circuit || x.b.circuit === circuit);
      if (!pool.length) pool = flat.slice();
      const qc = tourneyCore(q);
      cands = pool.filter(x => {
        if (x.k.indexOf(q) > -1 || q.indexOf(x.k) > -1) return true;
        const kc = tourneyCore(x.k);
        return qc.length >= 4 && kc.length >= 3 && (x.k.indexOf(qc) > -1 || qc.indexOf(kc) > -1);
      });
    }
    if (cands.length > 1 && circuit) {
      const pref = cands.filter(x => x.b.circuit === circuit);
      if (pref.length) cands = pref;
    }
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0].b;
    const exact = cands.filter(x => tourneyCore(x.k) === tourneyCore(q));
    return exact.length === 1 ? exact[0].b : null;
  }

  function lookupSeedIn(map, n, parts) {
    if (!map) return null;
    if (map[n] != null) return map[n];
    if (parts.length >= 2) {
      const two = parts.slice(-2).join(' ');
      if (map[two] != null) return map[two];
    }
    const compact = n.replace(/\s+/g, '');
    if (map[compact] != null) return map[compact];
    const last = parts[parts.length - 1];
    const hits = Object.keys(map).filter(k => k === last);
    return hits.length === 1 ? map[last] : null;
  }

  function findSeed(name, circuit, tourName) {
    if (!name) return null;
    const n = normSeedKey(name);
    const parts = n.split(' ').filter(Boolean);
    if (!parts.length) return null;
    const bucket = findSeedBucket(tourName, circuit);
    if (bucket) {
      if (/\//.test(name)) {
        const pk = seedPairKey(name);
        return pk && bucket.pairs[pk] != null ? bucket.pairs[pk] : null;
      }
      return lookupSeedIn(bucket.seeds, n, parts);
    }
    // hay nombre de torneo pero no se pudo asociar con certeza: SIN badge (nunca cruzar torneos)
    if (tourName) return null;
    // sin torneo conocido: solo si la forma es unica en todo el universo del circuito
    const st = state.seedSurnameTours || {};
    const forms = [n];
    if (parts.length >= 2) forms.push(parts.slice(-2).join(' '));
    forms.push(parts[parts.length - 1]);
    for (const f of forms) {
      const ea = st['atp::' + f], ew = st['wta::' + f];
      const e = circuit === 'atp' ? ea : circuit === 'wta' ? ew : (ea && !ew ? ea : (!ea && ew ? ew : null));
      if (e && e.seed != null && Object.keys(e.tours).length === 1) return e.seed;
    }
    return null;
  }

  function stampFinished() {
    const now = Date.now();
    const all = allMatches();
    for (const m of all) {
      if (m.state === 'post') {
        if (!state.finishedAt[m.id]) {
          state.finishedAt[m.id] = now;
        }
        state.finishedMatches[m.id] = JSON.parse(JSON.stringify(m));
      }
    }
    saveFinishedToStorage();
  }

  function localDateStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function loadFinishedFromStorage() {
    try {
      const today = localDateStr();
      const raw = localStorage.getItem('finishedMatches');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.date !== today) { localStorage.removeItem('finishedMatches'); return; }
      for (const [id, m] of Object.entries(data.matches || {})) {
        if (!state.finishedMatches[id]) {
          state.finishedMatches[id] = m;
          if (!state.finishedAt[id]) state.finishedAt[id] = Date.now();
        }
      }
    } catch (_) {}
  }

  function saveFinishedToStorage() {
    try {
      const today = localDateStr();
      localStorage.setItem('finishedMatches', JSON.stringify({ date: today, matches: state.finishedMatches }));
    } catch (_) {}
  }

  async function refreshTennisExplorerResults() {
    try {
      const url = useLocalBackend() ? 'api/results' : 'results.json';
      const j = await fetchJson(url).catch(() => null);
      if (!j || !j.ok || !j.matches) return;
      const now = Date.now();
      for (const m of j.matches) {
        if (m.state === 'post') {
          if (!state.finishedAt[m.id]) state.finishedAt[m.id] = now;
          state.finishedMatches[m.id] = JSON.parse(JSON.stringify(m));
        }
      }
      saveFinishedToStorage();
    } catch (_) {}
  }

  function snapshotLiveMatches() {
    const snap = {};
    for (const m of allMatches()) {
      if (m.state === 'in' || m.state === 'pre') {
        snap[m.id] = JSON.parse(JSON.stringify(m));
      }
    }
    state.liveSnapshot = snap;
  }

  function detectDisappearedMatches() {
    const now = Date.now();
    const currentIds = new Set(allMatches().map(m => m.id));
    for (const [id, prev] of Object.entries(state.liveSnapshot)) {
      if (currentIds.has(id)) continue;
      if (state.finishedMatches[id]) continue;
      const finished = JSON.parse(JSON.stringify(prev));
      finished.state = 'post';
      if (!state.finishedAt[id]) state.finishedAt[id] = now;
      state.finishedMatches[id] = finished;
    }
    state.liveSnapshot = {};
  }

  function parseMixedHtml(html) {
    try {
      let flight = '';
      const rx = /\[1,\s*"((?:[^"\\]|\\.)*)"\s*\]/g;
      let m2;
      while ((m2 = rx.exec(html)) !== null) {
        try { flight += JSON.parse('"' + m2[1] + '"'); } catch (e) {}
      }
      if (!flight) return [];
      const raws = [];
      const lines = flight.split('\n');
      for (const line of lines) {
        const t = line.trim();
        const ci = t.indexOf(':');
        if (ci < 1 || ci > 10) continue;
        const payload = t.slice(ci + 1);
        if (!(payload.startsWith('[') || payload.startsWith('{'))) continue;
        if (payload.indexOf('Mixed Doubles') < 0) continue;
        let obj = null;
        try { obj = JSON.parse(payload); } catch (e) { continue; }
        const stack = [obj];
        while (stack.length) {
          const cur = stack.pop();
          if (Array.isArray(cur)) { for (const e2 of cur) stack.push(e2); continue; }
          if (!cur || typeof cur !== 'object') continue;
          if (Array.isArray(cur.initialMatches)) {
            for (const mm of cur.initialMatches) {
              if (mm && mm.eventCategory === 'Mixed Doubles') raws.push(mm);
            }
          }
          for (const k in cur) { const v = cur[k]; if (v && typeof v === 'object') stack.push(v); }
        }
      }
      return mapMixedRaw(raws);
    } catch (e) { return []; }
  }

  function mapMixedRaw(raws) {
    const out = [];
    for (const mm of raws || []) {
      try {
        const st = String(mm.status || '');
        const mstate = st === 'live' || st === 'in_progress' ? 'in' : st === 'completed' ? 'post' : 'pre';
        const h = mm.homeTeam, a = mm.awayTeam;
        if (!h || !h.name) continue;
        const an = a && a.name ? a.name : 'Por definir';
        const hCode = h.player1 && h.player1.countryCode ? String(h.player1.countryCode).toLowerCase() : '';
        const aCode = a && a.player1 && a.player1.countryCode ? String(a.player1.countryCode).toLowerCase() : '';
        const sets = mm.score && Array.isArray(mm.score.sets) ? mm.score.sets : [];
        const total = sets.length;
        const lsH = [], lsA = [];
        sets.forEach((s, idx) => {
          const decided = mstate === 'post' || idx < total - 1;
          const lh = { value: s.homeGames, winner: false }, la = { value: s.awayGames, winner: false };
          const tbH = s.homeTiebreakPoints != null ? s.homeTiebreakPoints : null;
          const tbA = s.awayTiebreakPoints != null ? s.awayTiebreakPoints : null;
          if (tbH != null || tbA != null) {
            if (tbA != null && (tbH == null || tbA < tbH)) la.tiebreak = tbA;
            else if (tbH != null) lh.tiebreak = tbH;
          }
          if (decided) {
            if (s.homeGames > s.awayGames) lh.winner = true;
            else if (s.awayGames > s.homeGames) la.winner = true;
          }
          lsH.push(lh); lsA.push(la);
        });
        const wid = String(mm.winnerId || '');
        const mid = 'tcom-' + String(mm.id).replace(/[^a-zA-Z0-9]/g, '');
        const cg = mstate === 'in' && mm.score && mm.score.currentGame ? mm.score.currentGame : null;
        out.push({
          id: mid,
          tournamentId: 'tcom-mixed',
          tournamentName: 'US Open Mixed Doubles',
          date: mm.startTime,
          state: mstate,
          type: "Mixed Doubles",
          tour: 'mixto',
          round: mm.round || '',
          venue: mm.venue && mm.venue.name ? mm.venue.name : '',
          competitors: [
            { name: h.name, flag: hCode, flagAlt: hCode.toUpperCase(), homeAway: 'home', winner: !!wid && wid === String(h.id), linescores: lsH },
            { name: an, flag: aCode, flagAlt: aCode.toUpperCase(), homeAway: 'away', winner: !!wid && !!a && wid === String(a.id), linescores: lsA }
          ],
          pts0: cg ? String(cg.homePointDisplay || '') : '',
          pts1: cg ? String(cg.awayPointDisplay || '') : '',
          period: mstate === 'in' && mm.score && mm.score.currentSetNumber ? mm.score.currentSetNumber : 0
        });
      } catch (e) {}
    }
    return out;
  }

  async function refreshMixed() {
    try {
      if (useLocalBackend()) {
        const j = await fetchJson('api/mixed/live');
        if (j && j.ok && Array.isArray(j.matches) && j.matches.length) state.mixedLive.matches = j.matches;
      } else {
        const now = Date.now();
        const last = state.mixedLive.at || 0;
        if (now - last < 60000) { state.mixedLive.loaded = true; return; }
        state.mixedLive.at = now;
        try {
          const jf = await fetchJson('mixed.json');
          if (jf && Array.isArray(jf.matches) && jf.matches.length) {
            state.mixedLive.matches = jf.matches;
            window.__mhcMixDebug = { ts: new Date().toISOString(), src: 'json', count: jf.matches.length };
            state.mixedLive.loaded = true; return;
          }
        } catch (e1) {}
        const r = await fetch('https://r.jina.ai/https://www.tennis.com/', { headers: { 'X-Return-Format': 'html' } });
        if (!r.ok) throw new Error('jina ' + r.status);
        const txt = await r.text();
        const parsed = parseMixedHtml(txt);
        if (parsed.length) state.mixedLive.matches = parsed;
        window.__mhcMixDebug = { ts: new Date().toISOString(), len: txt.length, count: parsed.length };
      }
    } catch (e) {
      try { window.__mhcMixDebug = { err: String(e).slice(0, 120), ts: new Date().toISOString() }; } catch (e2) {}
    }
    state.mixedLive.loaded = true;
  }

  async function refreshAll(force) {
    if (state.refreshing) return;
    state.refreshing = true;
    try {
      snapshotLiveMatches();
      await Promise.allSettled([refreshScoreboards(), refreshRankingsSingles(force), refreshAtpLive(), refreshChallLive(), refreshNews(), refreshVideos(), refreshSeeds(), refreshElo(), refreshTennisExplorerResults(), refreshWheelchair(), refreshMixed()]);
      await refreshSofaPoints();
      if (state.rankView !== 'oficial') refreshRankingsLive().then(() => { if (state.tab === 'rankings' || state.tab === 'argentina') render(); });
      if (state.wheelchair && state.wheelchair.tab === 'live') refreshWcLive();
      applySuspensions();
      detectDisappearedMatches();
      stampFinished();
      refreshItfLive().then(() => {
        stampFinished();
        if (state.tab === 'live' || state.tab === 'tournaments') render();
      });
      const wantsDoubles = state.mode === 'doubles' || state.mode === 'todos';
      if ((state.tab === 'rankings' && wantsDoubles) || state.tab === 'argentina') {
        await refreshRankingsDoubles();
      } else if (force && wantsDoubles && !(state.rankDoubles.atp && state.rankDoubles.wta)) {
        await refreshRankingsDoubles();
      }
      state.lastUpdate = new Date();
      render();
    } catch (err) {
      console.error(err);
      renderError(err);
    } finally {
      state.refreshing = false;
      state.countdown = REFRESH_SEC;
      $('lastUpdate').textContent = state.lastUpdate ? state.lastUpdate.toLocaleTimeString('es') : '--';
    }
  }

  function renderError(err) {
    const view = $('view-' + state.tab);
    const content = view && view.querySelector('.content');
    if (content && (content.querySelector('.loading') || !content.textContent.trim())) {
      content.innerHTML = '<div class="error-box">No se pudieron cargar los datos: ' + esc(err.message) + '. Comprueba tu conexion a internet.</div>';
    }
  }

  /* ---------------- calendario --------------- */

  async function refreshCalendar() {
    try {
      const urls = useLocalBackend()
        ? ['api/calendar/atp', 'api/calendar/wta', 'api/calendar/chall', 'api/calendar/itf']
        : ['calendar_atp.json', 'calendar_wta.json', 'calendar_chall.json', 'calendar_itf.json'];
      const [a, w, c, i] = await Promise.all([
        fetchJson(urls[0]).catch(() => ({ tournaments: [] })),
        fetchJson(urls[1]).catch(() => ({ tournaments: [] })),
        fetchJson(urls[2]).catch(() => ({ tournaments: [] })),
        fetchJson(urls[3]).catch(() => ({ tournaments: [] }))
      ]);
      state.cal.atp = a.tournaments || [];
      state.cal.wta = w.tournaments || [];
      state.cal.chall = c.tournaments || [];
      state.cal.itf = i.tournaments || [];
      state.cal.loaded = true;
      if (state.tab === 'calendar') render();
    } catch (err) {
      state.cal.loaded = true;
      if (state.tab === 'calendar') render();
    }
  }

  function calLevelLabel(t) {
    if (t.circuit === 'chall') return 'CHALL';
    if (t.circuit === 'itf') return t.cat || 'ITF';
    if (t.circuit === 'atp') return t.level === 'main' ? 'ATP' : 'CHALL';
    return t.level === 'main' ? 'WTA' : 'WTA 125';
  }

  function renderCalendar() {
    const el = $('calContent');
    if (!state.cal.loaded) { el.innerHTML = '<div class="loading">Cargando calendario...</div>'; return; }
    const allEmpty = !state.cal.atp.length && !state.cal.wta.length && !state.cal.chall.length && !state.cal.itf.length;
    const emptyTab = state.cal.tab !== 'todos' && !state.cal[state.cal.tab].length;
    if (allEmpty) {
      el.innerHTML = '<div class="error-box">No se pudo cargar el calendario.</div>';
      $('calMeta').textContent = '';
      return;
    }
    if (emptyTab) {
      el.innerHTML = '<div class="error-box">' + (state.cal.tab === 'itf' ? 'Calendario ITF no disponible. Correr scripts/update-calendars-chall-itf.ps1.' : 'Sin torneos para este circuito.') + '</div>';
      $('calMeta').textContent = '';
      return;
    }
    const circuits = state.cal.tab === 'todos' ? ['atp', 'wta', 'chall', 'itf'] : [state.cal.tab];
    const list = [];
    for (const c of circuits) {
      for (const t of state.cal[c]) {
        if (c === 'atp' && t.level !== 'main' && state.cal.chall.length) continue;
        list.push(t);
      }
    }
    if (!list.length) { el.innerHTML = '<div class="error-box">Sin torneos para este circuito.</div>'; $('calMeta').textContent = ''; return; }
    list.sort((a, b) => a.date.localeCompare(b.date));
    const months = [];
    const byMonth = new Map();
    for (const t of list) {
      const key = (t.date || '').slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(t);
    }
    for (const key of Array.from(byMonth.keys()).sort()) {
      const [y, m] = key.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
      months.push({ label, items: byMonth.get(key) });
    }
    const surfaceDot = s => '<span class="cal-dot" style="background:' + (s === 'Clay' ? '#c97d47' : s === 'Grass' ? '#4caf50' : s === 'Carpet' ? '#9e9e9e' : '#43749b') + '"></span>' + esc(s);
    const html = months.map(mo => {
      const rows = mo.items.map(t =>
        '<div class="cal-item">' +
          '<div class="cal-date">' + esc(fmtDate(t.date)) + '</div>' +
          '<div class="cal-body">' +
            '<div class="cal-name">' + esc(t.name) + (t.current ? '<span class="cal-now">ESTA SEMANA</span>' : '') + '</div>' +
            '<div class="cal-info">' +
              '<span class="cal-level">' + esc(calLevelLabel(t)) + '</span>' +
              '<span class="cal-surf">' + surfaceDot(t.surface) + '</span>' +
              (t.location ? '<span class="cal-loc">' + esc(t.location) + '</span>' : '') +
              (t.prize ? '<span class="cal-prize">' + esc(t.prize) + '</span>' : '') +
              (t.draw ? '<span class="cal-draw">Cuadro ' + t.draw + '</span>' : '') +
            '</div>' +
            (t.winner && t.winner !== '-' ? '<div class="cal-winner">Campeón: <b>' + esc(t.winner) + '</b></div>' : '') +
          '</div>' +
        '</div>'
      ).join('');
      return '<div class="cal-month"><h3>' + esc(mo.label) + '</h3>' + rows + '</div>';
    }).join('');
    el.innerHTML = html;
    $('calMeta').textContent = list.length + ' torneo(s)';
  }

  /* ---------------- filters ---------------- */

  function allMatches() {
    const chall = state.challLive && state.challLive.matches ? state.challLive.matches : [];
    const itf = state.itfLive && state.itfLive.matches ? state.itfLive.matches : [];
    const mix = state.mixedLive && state.mixedLive.matches ? state.mixedLive.matches : [];
    return [...state.matches, ...chall, ...itf, ...mix];
  }
  function allTournaments() {
    const chall = state.challLive && state.challLive.tournaments ? state.challLive.tournaments : [];
    const itf = state.itfLive && state.itfLive.tournaments ? state.itfLive.tournaments : [];
    return [...state.tournaments, ...chall, ...itf];
  }
  function filteredMatches() {
    if (state.tour === 'mixto') return allMatches().filter(m => tourOf(m) === 'mixto');
    const types = new Set(selectedTypes());
    const tours = new Set(selectedTours());
    return allMatches().filter(m => types.has(m.type) && tours.has(tourOf(m)));
  }
  function filteredTournaments() {
    const ids = new Set(filteredMatches().map(m => m.tournamentId));
    return allTournaments().filter(t => ids.has(t.id));
  }

  /* ---------------- render: live ---------------- */

  function statusBadge(m) {
    if (m.suspended) {
      const reason = (m.suspReason || 'SUSPENDIDO').toUpperCase();
      return '<span class="badge susp">' + esc(reason) + '</span>';
    }
    if (m.state === 'in') return '<span class="badge live">EN VIVO</span>';
    if (m.state === 'post') return '<span class="badge final">FINALIZADO</span>';
    return '<span class="badge upcoming">PROXIMO</span>';
  }

  function renderLive() {
    const list = filteredMatches().filter(m => m.state !== 'post' || state.tour === 'mixto');
    const el = $('liveContent');
    if (!allMatches().length) { el.innerHTML = '<div class="loading">Cargando partidos...</div>'; return; }
    if (state.tour === 'itf') {
      if (!state.itfLive.matches.length && !state.matches.some(x => x.tour === 'itf')) {
        el.innerHTML = useLocalBackend()
          ? '<div class="loading">Cargando partidos ITF...</div>'
          : '<div class="error-box">No hay partidos ITF en este momento.</div>';
        return;
      }
    }
    if (!list.length) {
      const label = state.tour === 'todos' ? 'en este momento' : 'de ' + state.tour.toUpperCase() + ' ' + (state.mode === 'singles' ? 'singles' : state.mode === 'doubles' ? 'dobles' : 'en este momento');
      el.innerHTML = '<div class="error-box">No hay partidos ' + label + '.</div>';
      return;
    }

    const byTour = new Map();
    for (const m of list) {
      if (!byTour.has(m.tournamentId)) byTour.set(m.tournamentId, []);
      byTour.get(m.tournamentId).push(m);
    }

    let liveCount = 0;
    let html = '';
    for (const [tid, ms] of byTour) {
      const tour = allTournaments().find(t => t.id === tid);
      const name = tour ? tour.name : (ms[0].tournamentName || 'Torneo');
      const dates = todayStr();
      ms.sort((a, b) => rankMatch(a) - rankMatch(b));
      const cards = ms.map(m => matchCard(m)).join('');
      const chip = state.tour === 'todos' ? '<span class="tour-chip">' + tourLabel(ms[0]) + '</span>' : '';
      const logo = tour && tour.logo
        ? '<img class="th-logo" src="' + esc(tour.logo) + '" alt="" onerror="this.outerHTML=\'<span class=&quot;th-logo th-logo-txt&quot;>' + esc((name || '?').charAt(0).toUpperCase()) + '</span>\'">'
        : '<span class="th-logo th-logo-txt">' + esc((name || '?').charAt(0).toUpperCase()) + '</span>';
      const tierTxt = (tour && tour.tier) || tierLabel(tour && tour.name ? tour.name : name, state.tour === 'wta' ? 'wta' : (state.tour === 'chall' ? 'chall' : 'atp'));
      const tier = tierTxt ? '<span class="th-tier">' + esc(tierTxt) + '</span>' : '';
      const surfTxt = (tour && tour.surface) || guessSurface(name, tour && tour.date);
      const surf = surfTxt ? '<span class="th-surf surf-' + surfClassOf(surfTxt) + '">' + esc(surfShortOf(surfTxt)) + '</span>' : '';
      html += '<div class="tour-block"><div class="tour-head">' + logo + '<span class="t-name">' + esc(name) +
        '</span>' + chip + tier + surf + '<span class="t-date">' + esc(dates) + '</span></div>' + cards + '</div>';
      liveCount += ms.filter(m => m.state === 'in').length;
    }
    el.innerHTML = html;
    const srcLabel = (function () {
      if (state.matches.some(m => String(m.id).indexOf('sf-') === 0)) return 'datos: Sofascore';
      const sm = state.sofaMeta;
      if (!sm || !sm.ts) return '';
      if (sm.err) return '(Sofascore: ' + sm.err + ')';
      if (!(sm.nKept)) return '(Sofascore: ' + sm.nEvents + ' eventos, ninguno de tenis profesional)';
      return '';
    })();
    $('liveMeta').textContent = liveCount + ' partidos en vivo de ' + allMatches().filter(m => m.state === 'in').length + ' en total' + (srcLabel ? ' · ' + srcLabel : '');
  }

  function rankMatch(m) {
    const w = m.state === 'in' ? 0 : m.suspended ? 1 : m.state === 'pre' ? 2 : 3;
    return w;
  }

  /* ---------------- render: finalizados ---------------- */

  function renderNews() {
    const el = $('newsContent');
    const n = state.news;
    if (!n.loaded) {
      el.innerHTML = '<div class="loading">Cargando noticias...</div>';
      return;
    }
    if (n.error || !n.items.length) {
      el.innerHTML = '<div class="error-box">' + esc(n.error || 'No hay noticias disponibles.') + '</div>';
      $('newsMeta').textContent = '';
      return;
    }
    const srcs = {};
    for (const it of n.items) srcs[it.source] = (srcs[it.source] || 0) + 1;
    const srcLabel = Object.keys(srcs).map(s => s + ' (' + srcs[s] + ')').join(' · ');
    $('newsMeta').textContent = n.items.length + ' noticias · ' + srcLabel +
      (n.updated ? ' · act. ' + fmtTime(n.updated) : '');
    const html = n.items.map(it => {
      const ago = timeAgo(it.published);
      const time = ago ? '<span class="news-time">' + esc(ago) + '</span>' : '';
      const desc = it.description ? '<div class="news-desc">' + esc(it.description) + '</div>' : '';
      const thumb = it.image
        ? '<img class="news-thumb" src="' + esc(it.image) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;news-thumb-placeholder&quot;></div>\'">'
        : '';
      return '<a class="news-card" href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">' +
        thumb +
        '<div class="news-body"><div class="news-head"><span class="news-source">' + esc(it.source) + '</span>' + time + '</div>' +
        '<div class="news-title">' + esc(it.title) + '</div>' + desc + '</div></a>';
    }).join('');
    el.innerHTML = '<div class="news-grid">' + html + '</div>';
  }

  function renderVideos() {
    const el = $('videosContent');
    const v = state.videos;
    if (!v.loaded) {
      el.innerHTML = '<div class="loading">Cargando videos...</div>';
      return;
    }
    if (v.error || !v.items.length) {
      el.innerHTML = '<div class="error-box">' + esc(v.error || 'No hay videos disponibles.') + '</div>';
      $('videosMeta').textContent = '';
      return;
    }
    const srcs = {};
    for (const it of v.items) srcs[it.channel] = (srcs[it.channel] || 0) + 1;
    const srcLabel = Object.keys(srcs).map(s => s + ' (' + srcs[s] + ')').join(' · ');
    $('videosMeta').textContent = v.items.length + ' videos · ' + srcLabel +
      (v.updated ? ' · act. ' + fmtTime(v.updated) : '');
    const html = v.items.slice(0, 30).map(it => {
      const ago = timeAgo(it.published);
      const time = ago ? '<span class="video-time">' + esc(ago) + '</span>' : '';
      const thumb = it.thumb ? '<img class="video-thumb" src="' + esc(it.thumb) + '" alt="" loading="lazy" />' : '';
      return '<a class="video-card" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">' +
        '<div class="video-thumb-wrap">' + thumb + '<span class="video-play">&#9654;</span></div>' +
        '<div class="video-body"><div class="video-title">' + esc(it.title) + '</div>' +
        '<div class="video-head"><span class="video-channel">' + esc(it.channel) + '</span>' + time + '</div></div></a>';
    }).join('');
    el.innerHTML = '<div class="videos-grid">' + html + '</div>';
  }

  function timeAgo(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'ahora';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
    return 'hace ' + Math.floor(s / 86400) + ' d';
  }


  function matchCard(m) {
    const comps = m.competitors.slice().sort((a, b) => (a.homeAway === 'home' ? -1 : 1) - (b.homeAway === 'home' ? -1 : 1));
    const cls = m.state === 'in' ? 'match live' : m.state === 'post' ? 'match finished' : 'match upcoming';
    const period = m.state === 'in' && m.period ? '<span class="period">SET ' + m.period + '</span>' : '';
    let pts = livePoints(m);
    if (!pts && m.state === 'in' && m.sofaPts && Date.now() - (m.sofaPtsAt || 0) < 90000) {
      const lab = gameScoreLabel(m.sofaPts.s1, m.sofaPts.s2);
      if (lab[0] || lab[1]) pts = { g0: lab[0], g1: lab[1], serverName: '', serverIdx: m.sofaPts.server1 };
    }
    if (!pts && m.state === 'in' && (m.pts0 || m.pts1)) pts = { g0: m.pts0, g1: m.pts1, serverName: '' };
    const rows = comps.map(p => playerRow(p, m, pts)).join('');
    const note = m.notes && m.state === 'post' ? '<div class="note">' + esc(m.notes) + '</div>' : '';
    const suspNote = m.suspended ? '<div class="note susp-note">' + esc(m.suspReason || 'Partido suspendido') + '</div>' : '';
    const time = m.state === 'pre' ? '<span class="time">' + fmtTime(m.date) + '</span>' : '';
    const itfInfo = m.tour === 'itf'
      ? '<div class="itf-info"><span class="itf-time">' + esc(m.itfTime || '') + '</span></div>'
      : '';
    const points = pts ? '<div class="live-points">' +
      '<span class="lp-label">PUNTO</span>' +
      '<span class="lp-score' + (pointPair(pts.g0, pts.g1) === 'DEUCE' ? ' deuce' : '') + '">' + esc(pointPair(pts.g0, pts.g1) || '—') + '</span>' +
      (pts.serverName ? '<span class="lp-srv">&middot; Saca ' + esc(pts.serverName.split(' ')[0]) + '</span>' : '') +
      '</div>' : '';
    const typeChip = m.type ? '<span class="type-chip">' + (/doubles/i.test(m.type) ? 'DOBLES' : 'SINGLES') + '</span>' : '';
    return '<div class="' + cls + '">' +
      '<div class="m-top"><span class="round">' + esc(ROUND_LABEL[m.round] || m.round) + '</span>' + typeChip + statusBadge(m) + period + '</div>' +
      rows +
      '<div class="scores">' + note + suspNote + time + '</div>' + itfInfo + points + '</div>';
  }

  function playerRow(p, m, pts) {
    const flag = flagImg(p.flag, p.flagAlt);
    const serving = (pts && pts.serverName && matchLiveName(norm(p.name), norm(pts.serverName))) || (pts && pts.serverIdx === (p.homeAway === 'home' ? 1 : 2));
    const ball = serving ? '<span class="serve-ball"></span>' : '';
    const seed = findSeed(p.name, circuitOf(m), m.tournamentName);
    const seedHtml = seed ? '<span class="seed-badge">' + seed + '</span>' : '';
    const sets = p.linescores.map((ls, i) => {
      const liveSet = m.state === 'in' && i === p.linescores.length - 1;
      const cls = 'set' + (ls.winner ? ' win' : '') + (liveSet ? ' live-set' : '');
      const txt = ls.value != null ? ls.value : '';
      const tb = ls.tiebreak ? '<span class="tb">(' + ls.tiebreak + ')</span>' : '';
      return '<span class="' + cls + '">' + txt + tb + '</span>';
    }).join('');
    return '<div class="player-row"><span class="flag">' + flag + '</span>' +
      '<span class="pname' + (p.winner ? ' winner' : '') + '">' + ball + esc(p.name) + seedHtml + '</span>' +
      '<span class="sets">' + (sets || '<span class="set">-</span>') + '</span></div>';
  }

  /* ---------------- render: tournaments ---------------- */

  function renderTournaments() {
    const el = $('tourContent');
    if (!state.tournaments.length) { el.innerHTML = '<div class="loading">Cargando torneos...</div>'; return; }
    const tours = filteredTournaments();
    if (!tours.length) { el.innerHTML = '<div class="error-box">No hay torneos disponibles para ' + state.tour.toUpperCase() + '.</div>'; return; }

    let html = '';
    for (const t of tours) {
      const ms = allMatches().filter(m => m.tournamentId === t.id);
      const live = ms.some(m => m.state === 'in');
      const upcoming = ms.some(m => m.state === 'pre');
      const suspended = ms.some(m => m.suspended);
      const suspMatch = suspended ? ms.find(m => m.suspended && m.suspReason) : null;
      const suspLabel = suspMatch ? esc(suspMatch.suspReason) : 'SUSPENDIDO';
      const st = suspended && !ms.some(m => m.state === 'in' && !m.suspended)
        ? '<span class="tc-status susp">&#9209; ' + suspLabel + '</span>'
        : live ? '<span class="tc-status live">● EN CURSO</span>' : (upcoming ? '<span class="tc-status now">PROXIMO</span>' : '<span class="tc-status done">FINALIZADO</span>');
      const champs = (t.previousWinners || []).map(pw =>
        '<span><b>' + esc(pw.type ? pw.type.text : '') + ':</b> ' + esc(pw.displayName || '—') + '</span>'
      ).join('');
      html += '<div class="tour-card">' +
        '<div class="tc-top"><div><h3>' + esc(t.name) + '</h3>' +
        '<div class="tc-level">' + esc(t.status && t.status.description ? t.status.description : '') + '</div></div>' + st + '</div>' +
        '<div class="tc-dates">Inicio: ' + esc(fmtDate(t.date)) + '</div>' +
        (champs ? '<div class="champs">' + champs + '</div>' : '') +
        '<button class="btn-refresh btn-draw" data-draw="' + esc(t.id) + '">Ver cuadro &rarr;</button>' +
        '</div>';
    }
    el.innerHTML = html;
    $('tourMeta').textContent = tours.length + ' torneo(s)';
    el.querySelectorAll('.btn-draw').forEach(b => b.addEventListener('click', () => {
      state.drawTournamentId = b.getAttribute('data-draw');
      setTab('draws');
    }));
  }

  /* ---------------- render: draws ---------------- */

  function populateDrawSelect() {
    const sel = $('drawSelect');
    const tours = filteredTournaments();
    const prev = state.drawTournamentId;
    const tourById = new Map();
    for (const m of allMatches()) if (!tourById.has(m.tournamentId)) tourById.set(m.tournamentId, m.tour);
    const groups = new Map();
    for (const t of tours) {
      const g = tourById.get(t.id) || 'atp';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(t);
    }
    const order = ['atp', 'wta', 'chall', 'itf'];
    const glabels = { atp: 'ATP', wta: 'WTA', chall: 'CHALLENGER', itf: 'ITF' };
    sel.innerHTML = order.filter(g => groups.has(g)).map(g =>
      '<optgroup label="' + glabels[g] + '">' +
      groups.get(g).sort((a, b) => String(a.name).localeCompare(String(b.name))).map(t => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') +
      '</optgroup>'
    ).join('');
    if (tours.some(t => t.id === prev)) { sel.value = prev; }
    else if (tours.length) { sel.value = tours[0].id; state.drawTournamentId = tours[0].id; }
    sel.disabled = !tours.length;
  }

  function renderDraws() {
    const sel = $('drawSelect');
    const el = $('drawContent');
    populateDrawSelect();
    if (!state.drawTournamentId) { el.innerHTML = '<div class="loading">No hay torneos para mostrar el cuadro.</div>'; return; }

    const selTypes = new Set(selectedTypes());
    let ms = allMatches().filter(m => m.tournamentId === state.drawTournamentId && selTypes.has(m.type));
    if (!ms.length) {
      el.innerHTML = '<div class="error-box">Sin datos de cuadro para este torneo y categoria.</div>';
      $('drawMeta').textContent = '';
      return;
    }

    const roundMap = new Map();
    for (const m of ms) {
      const key = state.mode === 'todos' ? m.type + '|' + m.round : m.round;
      if (!roundMap.has(key)) roundMap.set(key, { type: m.type, matches: [] });
      roundMap.get(key).matches.push(m);
    }
    const keys = Array.from(roundMap.keys()).sort((a, b) => {
      const ra = a.split('|').pop(), rb = b.split('|').pop();
      const ia = ROUND_ORDER.indexOf(ra), ib = ROUND_ORDER.indexOf(rb);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || (a < b ? -1 : 1);
    });

    const tour = allTournaments().find(t => t.id === state.drawTournamentId);
    const drawTypes = new Set(ms.map(m => m.type));
    $('drawMeta').textContent = (tour ? tour.name + ' · ' : '') + Array.from(drawTypes).join(' / ') + ' · ' + ms.length + ' partidos';

    const availRounds = [];
    for (const k of keys) {
      const r = k.split('|')[1] || k;
      if (!availRounds.includes(r)) availRounds.push(r);
    }
    if (state.drawRound !== 'todas' && !availRounds.includes(state.drawRound)) state.drawRound = 'todas';
    const chips = '<div class="round-filter">' +
      '<span class="rf-label">RONDA:</span>' +
      '<button class="round-chip' + (state.drawRound === 'todas' ? ' active' : '') + '" data-round="todas">TODAS</button>' +
      availRounds.map(r => '<button class="round-chip' + (state.drawRound === r ? ' active' : '') + '" data-round="' + esc(r) + '">' + esc(ROUND_LABEL[r] || r) + '</button>').join('') +
      '</div>';

    const visKeys = state.drawRound === 'todas' ? keys : keys.filter(k => (k.split('|')[1] || k) === state.drawRound);
    if (state.drawRound !== 'todas') {
      $('drawMeta').textContent += ' · ronda: ' + (ROUND_LABEL[state.drawRound] || state.drawRound);
    }
    const cols = visKeys.map(key => {
      const grp = roundMap.get(key);
      const round = key.split('|')[1] || key;
      const matches = grp.matches.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const cards = matches.map(m => {
        const comps = m.competitors.slice().sort((a, b) => (a.homeAway === 'home' ? -1 : 1) - (b.homeAway === 'home' ? -1 : 1));
        const rows = comps.map(p => {
          const name = p.name && p.name !== 'TBD' ? esc(p.name) : '<span class="dm-tbd">TBD</span>';
          const sc = p.linescores.map(ls => (ls.value != null ? ls.value : '')).join(' ');
          const tb = p.linescores.map(ls => (ls.tiebreak ? '(' + ls.tiebreak + ')' : '')).join(' ');
          return '<div class="draw-player' + (p.winner ? ' winner' : '') + '">' +
            '<span class="dp-name">' + flagImg(p.flag, p.flagAlt) + name + '</span>' +
            '<span class="dp-score">' + sc + (tb ? '<span class="tb">' + tb + '</span>' : '') + '</span></div>';
        }).join('');
        const st = m.suspended ? '<div class="dm-status" style="color:var(--warn)">&#9209; SUSPENDIDO</div>'
          : m.state === 'in' ? '<div class="dm-status" style="color:var(--live)">● EN VIVO SET ' + (m.period || '') + '</div>'
          : m.state === 'pre' ? '<div class="dm-status">' + fmtTime(m.date) + '</div>' : '';
        return '<div class="draw-match' + ((m.state === 'in' || m.suspended) ? ' live' : '') + '">' + rows + st + '</div>';
      }).join('');
      const typeTag = state.mode === 'todos' ? '<span class="tour-chip chip-sm">' + esc(grp.type) + '</span>' : '';
      return '<div class="draw-col"><h4>' + esc(ROUND_LABEL[round] || round) + typeTag + '</h4>' + (cards || '<div class="draw-empty">-</div>') + '</div>';
    }).join('');

    el.innerHTML = chips + '<div class="draw-board"><div class="draw-cols">' + cols + '</div></div>';
  }

  /* ---------------- render: rankings ---------------- */

  function movementHtml(trend) {
    let num = trend, cls = 'flat', sym = '—';
    if (typeof trend === 'string') {
      if (trend.startsWith('+')) { cls = 'up'; sym = '&uarr;'; num = trend.slice(1); }
      else if (trend.startsWith('-') && trend !== '-') { cls = 'down'; sym = '&darr;'; num = trend.slice(1); }
      else if (trend === '-') { num = ''; sym = '&middot;'; }
      else if (trend) { cls = 'up'; sym = '&uarr;'; }
    } else if (typeof trend === 'number') {
      if (trend > 0) { cls = 'up'; sym = '&uarr;'; }
      else if (trend < 0) { cls = 'down'; sym = '&darr;'; num = Math.abs(trend); }
      else { num = ''; sym = '&middot;'; }
    }
    return '<span class="r-move ' + cls + '">' + sym + (num != null && num !== '' ? ' ' + esc(num) : '') + '</span>';
  }

  function renderRankSection(tour, mode) {
    const tourLabelTxt = tour === 'atp' ? 'ATP' : 'WTA';
    const modeLabel = mode === 'singles' ? 'Singles' : 'Dobles';
    const header = '<div class="rank-section-title">' + tourLabelTxt + ' ' + modeLabel + '</div>';
    let data, sourceNote;
    if (mode === 'singles') {
      data = state.rankSingles[tour];
      sourceNote = 'Fuente: ' + (state.rankSinglesSource || 'ESPN');
    } else {
      const d = state.rankDoubles[tour];
      if (!d) return header + '<div class="loading">Cargando ranking de dobles...</div>';
      if (!d.ok) return header + '<div class="error-box">' + esc(d.error || 'Error al cargar ranking de dobles') + '</div>';
      data = d.players;
      sourceNote = 'Fuente: ' + (d.players.length && d.players[0] ? d.players[0].source : '');
    }

    if (!data || !data.length) return header + '<div class="loading">Cargando ranking...</div>';

    const q = state.rankSearch;
    const filtered = q ? data.filter(r => String(r.name || r.athleteName || '').toLowerCase().indexOf(q) > -1) : data;
    if (!filtered.length) {
      return header + '<div class="error-box">No se encontraron jugadores que coincidan con "' +
        esc(q || '') + '" en ' + tourLabelTxt + ' ' + modeLabel + '.</div>';
    }

    const rows = filtered.map((r, i) => {
      const name = r.name || r.athleteName || '—';
      const flag = mode === 'singles' ? r.flag : flagUrl(r.flag);
      const pts = r.points != null ? Math.round(r.points).toLocaleString('es') : '—';
      const rankTxt = r.rankRaw || r.rank;
      const rankCls = String(rankTxt) === '1' ? 'r-rank top1' : 'r-rank';
      const trend = mode === 'singles' ? r.trend : r.movement;
      return '<tr>' +
        '<td class="' + rankCls + '">' + esc(rankTxt) + '</td>' +
        '<td class="r-name">' + flagImg(flag, r.flagAlt) + esc(name) + '</td>' +
        '<td>' + movementHtml(trend) + '</td>' +
        '<td class="r-pts">' + pts + '<span> pts</span></td>' +
        '</tr>';
    }).join('');

    return header +
      '<div class="rank-table-wrap"><table class="rank-table">' +
      '<thead><tr><th>#</th><th>Jugador</th><th>Mov.</th><th style="text-align:right">Puntos</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="rank-note">' + esc(sourceNote) + ' &middot; Los rankings de dobles se actualizan cada pocos minutos.</div>';
  }

  async function refreshRankingsLive() {
    if (state.rankLiveLoading) return;
    state.rankLiveLoading = true;
    try {
      const jobs = [];
      for (const tour of ['atp', 'wta']) for (const race of [0, 1]) {
        jobs.push(
          (useLocalBackend()
            ? fetchJson('/api/rankings/live?tour=' + tour + '&race=' + race)
            : fetch('https://r.jina.ai/https://live-tennis.eu/en/' + tour + (race ? '-race' : '-live-ranking'), { headers: { 'X-Return-Format': 'html' } }).then(r => { if (!r.ok) throw new Error('jina ' + r.status); return r.text(); }).then(t => parseLtRows(t))
          ).then(j => { state.rankLive[tour + (race ? 'Race' : '')] = (j && j.rows) || j || []; if (j && j.updated) state.rankLiveUpdated = j.updated; }).catch(() => {})
        );
      }
      await Promise.allSettled(jobs);
      state.rankLive.loaded = true;
    } finally { state.rankLiveLoading = false; }
  }

  function parseLtRows(text) {
    const rows = [];
    if (!text) return rows;
    const trRe = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    let m;
    while ((m = trRe.exec(text))) {
      const t = m[0];
      if (!/class="?pn"?/.test(t)) continue;
      const rk = t.match(/class="?rk"?>\s*(\d+)/);
      if (!rk) continue;
      const nm = t.match(/class="?pn"?>\s*([\s\S]*?)<\/td>/);
      let name = nm ? nm[1].replace(/<[^>]+>/g, '') : '';
      name = name.replace(/&nbsp;|&#x2713;|&#10003;/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[^A-Za-zÀ-ÿÑñ]+/, '');
      const co = t.match(/class="?sm"?\s+p="?[\d.]+"?>\s*([A-Z]{3})\s*</);
      const after = co ? co.index + co[0].length : (nm ? nm.index + nm[0].length : 0);
      const pt = t.slice(after).match(/<td>\s*(\d[\d.]*)\s*<\/td>/);
      const mv = t.match(/class="?rdf"?>\s*([+-]?\d+)\s*</);
      rows.push({ rank: parseInt(rk[1], 10), name: name, country: co ? co[1] : '', points: pt ? pt[1] : '', move: mv ? parseInt(mv[1], 10) : 0 });
    }
    return rows;
  }

  function renderLiveRankSection(title, rows, emptyMsg) {
    const header = '<div class="rank-section-title">' + title + '</div>';
    if (!rows) return header + '<div class="loading">Cargando ranking en vivo...</div>';
    if (!rows.length) return header + '<div class="error-box">' + (emptyMsg || 'No hay datos disponibles.') + '</div>';
    const q = state.rankSearch;
    const list = q ? rows.filter(r => (r.name || '').toLowerCase().indexOf(q) > -1) : rows;
    const body = list.length ? list.map(r =>
      '<tr>' +
      '<td class="r-rank">' + r.rank + '</td>' +
      '<td class="r-name">' + esc(r.name) + '</td>' +
      '<td>' + esc(r.country || '') + '</td>' +
      '<td>' + (r.move > 0 ? '<span class="r-move up">&#9650;' + r.move + '</span>' : r.move < 0 ? '<span class="r-move down">&#9660;' + Math.abs(r.move) + '</span>' : '<span class="r-move flat">=</span>') + '</td>' +
      '<td class="r-pts">' + (r.points ? Number(String(r.points).replace(/\./g, '')).toLocaleString('es') : '—') + '<span> pts</span></td>' +
      '</tr>'
    ).join('') : '<tr><td colspan="5" style="padding:10px">No se encontraron jugadores que coincidan con "' + esc(q) + '".</td></tr>';
    return header +
      '<div class="rank-table-wrap"><table class="rank-table">' +
      '<thead><tr><th>#</th><th>Jugador</th><th>País</th><th>Mov.</th><th style="text-align:right">Puntos</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function fmtRankData(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p2 = n => String(n).padStart(2, '0');
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  function renderRankings() {
    const el = $('rankContent');
    if (state.tour === 'chall' || state.tour === 'itf') {
      el.innerHTML = '<div class="error-box">No hay rankings disponibles para ' + state.tour.toUpperCase() + '.</div>';
      $('rankMeta').textContent = '';
      return;
    }
    if ((state.rankView === 'vivo' || state.rankView === 'race') && selectedModes().length === 1 && selectedModes()[0] === 'doubles') {
      el.innerHTML = '<div class="error-box">No existe ranking EN VIVO de dobles en fuentes públicas. Usá OFICIAL para dobles.</div>';
      $('rankMeta').textContent = 'Ranking ' + state.rankView.toUpperCase() + ' · dobles no disponible';
      return;
    }
    if (state.rankView !== 'oficial') {
      const wantAtp = state.tour === 'todos' || state.tour === 'atp';
      const wantWta = state.tour === 'todos' || state.tour === 'wta';
      if (!state.rankLive.loaded && !state.rankLiveLoading) refreshRankingsLive();
      const suffix = state.rankView === 'vivo' ? '' : 'Race';
      const label = state.rankView === 'vivo' ? 'EN VIVO' : 'RACE';
      const html = [];
      if (wantAtp) html.push(renderLiveRankSection('ATP Singles · ' + label, state.rankLive['atp' + suffix]));
      if (wantWta) html.push(renderLiveRankSection('WTA Singles · ' + label, state.rankLive['wta' + suffix]));
      if (selectedModes().includes('doubles')) html.push('<div class="rank-note">El ranking EN VIVO/RACE de dobles no está disponible en fuentes públicas.</div>');
      el.innerHTML = html.join('');
      const n = (state.rankLive.atp.length || 0) + (state.rankLive.wta.length || 0);
      $('rankMeta').textContent = 'Ranking ' + label + ' (live-tennis.eu) · se actualiza automáticamente' +
        (n ? ' · ' + n + ' jugadores' : '') +
        (state.rankLiveUpdated ? ' · datos: ' + fmtRankData(state.rankLiveUpdated) : '') +
        (state.rankSearch ? ' · buscando "' + state.rankSearch + '"' : '');
      return;
    }
    const rTours = selectedTours().filter(t => t === 'atp' || t === 'wta');
    const needsDoubles = selectedModes().includes('doubles') && rTours.some(t => !state.rankDoubles[t]);
    if (needsDoubles && !state.rankDoublesLoading) {
      state.rankDoublesLoading = true;
      refreshRankingsDoubles().then(() => {
        state.rankDoublesLoading = false;
        renderRankings();
      }).catch(() => {
        state.rankDoublesLoading = false;
        renderRankings();
      });
    }
    const html = [];
    for (const t of rTours) for (const m of selectedModes()) html.push(renderRankSection(t, m));
    el.innerHTML = html.join('');
    const total = rTours.length * selectedModes().length;
    $('rankMeta').textContent = 'Rankings · ' + total + ' lista(s)' +
      (state.rankSinglesUpdated ? ' · datos: ' + fmtRankData(state.rankSinglesUpdated) : '') +
      (state.rankSearch ? ' · buscando "' + state.rankSearch + '"' : '');
  }

  /* ---------------- render: ranking Argentina ---------------- */

  function isArgentina(r) {
    const alt = String(r.flagAlt || '').toLowerCase();
    const flag = String(r.flag || '').toLowerCase();
    if (alt.indexOf('argentin') > -1) return true;
    if (/^(ar|arg)$/.test(flag) || flag.indexOf('/arg.') > -1 || flag.indexOf('arg.png') > -1) return true;
    return false;
  }

  function renderArgSection(title, data) {
    const header = '<div class="rank-section-title">' + title + '</div>';
    if (!data) return header + '<div class="loading">Cargando ranking...</div>';
    if (!data.length) return header + '<div class="error-box">No hay ranking disponible.</div>';
    const rows = data.filter(isArgentina).map(r => {
      const name = r.name || '—';
      const pts = r.points != null ? Math.round(r.points).toLocaleString('es') : '—';
      const trend = r.trend != null ? r.trend : r.movement;
      const flag = typeof r.flag === 'string' && /^https?:\/\//.test(r.flag) ? r.flag : flagUrl(r.flag);
      return '<tr>' +
        '<td class="r-rank">' + esc(r.rankRaw || r.rank) + '</td>' +
        '<td class="r-name">' + flagImg(flag, r.flagAlt) + esc(name) + '</td>' +
        '<td>' + movementHtml(trend) + '</td>' +
        '<td class="r-pts">' + pts + '<span> pts</span></td>' +
        '</tr>';
    }).join('');
    return header +
      '<div class="rank-table-wrap"><table class="rank-table">' +
      '<thead><tr><th>#</th><th>Jugador</th><th>Mov.</th><th style="text-align:right">Puntos</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function renderArgentina() {
    const el = $('argContent');
    const needsDoubles = !state.rankDoubles.atp || !state.rankDoubles.wta;
    if (needsDoubles && !state.rankDoublesLoading) {
      state.rankDoublesLoading = true;
      refreshRankingsDoubles().then(() => {
        state.rankDoublesLoading = false;
        renderArgentina();
      }).catch(() => {
        state.rankDoublesLoading = false;
        renderArgentina();
      });
    }
    const html = [
      renderArgSection('ATP Singles · Argentina', state.rankSingles.atp),
      renderArgSection('WTA Singles · Argentina', state.rankSingles.wta),
      renderArgSection('ATP Dobles · Argentina', state.rankDoubles.atp && state.rankDoubles.atp.players),
      renderArgSection('WTA Dobles · Argentina', state.rankDoubles.wta && state.rankDoubles.wta.players)
    ];
    el.innerHTML = html.join('');
    let count = 0;
    for (const d of [state.rankSingles.atp, state.rankSingles.wta, state.rankDoubles.atp && state.rankDoubles.atp.players, state.rankDoubles.wta && state.rankDoubles.wta.players]) {
      if (d) count += d.filter(isArgentina).length;
    }
    $('argMeta').textContent = count + ' jugador(es) de Argentina';
  }

  /* ---------------- render: players ---------------- */

  function taSlug(name) {
    return (name || '').replace(/[^a-zA-Z\s'-]/g, '').replace(/[\s'-]+/g, '').split('').map((c, i) => {
      if (i === 0 || name[i - 1] === ' ' || name[i - 1] === '-' || name[i - 1] === "'") return c.toUpperCase();
      return c.toLowerCase();
    }).join('');
  }

  async function refreshWheelchair() {
    try {
      const url = useLocalBackend() ? 'api/wheelchair' : 'wheelchair.json';
      const j = await fetchJson(url).catch(() => null);
      if (j && (j.ok || j.rankings)) { state.wheelchair = { ...state.wheelchair, data: j, loaded: true }; }
      else { state.wheelchair = { ...state.wheelchair, loaded: true }; }
    } catch (_) { state.wheelchair = { ...state.wheelchair, loaded: true }; }
    if (state.tab === 'wheelchair') {
      if (state.wheelchair.tab === 'live' && !state.wcLive.loaded) refreshWcLive();
      else if (state.wheelchair.tab === 'videos' && !state.wcVideos.loaded) refreshWcVideos();
      render();
    }
  }

  async function refreshWcLive() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const url = 'https://api.sofascore.com/api/v1/sport/tennis/scheduled-tournaments/' + today + '/page/1';
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(resp.status);
      const j = await resp.json();
      const events = [];
      const tours = j.tournaments || [];
      tours.forEach(t => {
        const tName = ((t.tournament || {}).name || '').toLowerCase();
        const catName = ((t.tournament || {}).category || {}).name || '';
        const isWC = tName.indexOf('wheelchair') > -1 || catName.toLowerCase().indexOf('wheelchair') > -1 || tName.indexOf('uniqlo wheel') > -1;
        if (!isWC) return;
        const matches = t.events || [];
        matches.forEach(ev => {
          events.push({
            id: ev.id,
            tournament: (t.tournament || {}).name || '',
            category: catName,
            home: (ev.homeTeam || {}).name || '',
            away: (ev.awayTeam || {}).name || '',
            status: ev.status ? ev.status.type : '',
            statusDesc: ev.status ? ev.status.description : '',
            homeScore: ev.homeScore ? ev.homeScore.current : '',
            awayScore: ev.awayScore ? ev.awayScore.current : '',
            startTimestamp: ev.startTimestamp || 0
          });
        });
      });
      events.sort((a, b) => b.startTimestamp - a.startTimestamp);
      state.wcLive = { events: events, loaded: true, error: '' };
    } catch (e) {
      state.wcLive = { events: [], loaded: true, error: e.message || 'Error loading live scores' };
    }
    if (state.tab === 'wheelchair' && state.wheelchair.tab === 'live') renderWheelchair();
  }

  async function refreshWcVideos() {
    try {
      const j = await fetchJson('wheelchair-videos.json').catch(() => null);
      if (j && j.ok) { state.wcVideos = { items: j.videos || [], loaded: true }; }
      else { state.wcVideos = { items: [], loaded: true }; }
    } catch (_) { state.wcVideos = { items: [], loaded: true }; }
    if (state.tab === 'wheelchair' && state.wheelchair.tab === 'videos') renderWheelchair();
  }

  function renderWheelchair() {
    const el = $('wcContent');
    const meta = $('wcMeta');
    const wc = state.wheelchair;
    const tab = wc.tab;

    if (tab === 'live') {
      const wcLive = state.wcLive;
      if (!wcLive.loaded) { el.innerHTML = '<div class="loading">Cargando partidos en vivo...</div>'; return; }
      if (wcLive.error) {
        el.innerHTML = '<div class="error-box">No se pudieron cargar los partidos en vivo de Sofascore.<br><small>' + esc(wcLive.error) + '</small></div>' +
          '<div style="margin-top:12px"><a href="https://www.sofascore.com/es/tennis/wheelchairs" target="_blank" class="ta-link">Ver en Sofascore &rarr;</a></div>';
        return;
      }
      if (!wcLive.events.length) {
        el.innerHTML = '<div class="loading">No hay partidos de wheelchair tennis en vivo ahora.</div>' +
          '<div style="margin-top:12px"><a href="https://www.sofascore.com/es/tennis/wheelchairs" target="_blank" class="ta-link">Ver calendario completo en Sofascore &rarr;</a></div>';
        return;
      }
      const liveRows = wcLive.events.map(ev => {
        const isLive = ev.status === 1;
        const isFinished = ev.status === 2;
        const statusBadge = isLive ? '<span class="wc-live-badge">LIVE</span>' : (isFinished ? '<span class="wc-finished-badge">FT</span>' : '');
        const scoreHtml = ev.homeScore ? '<span class="wc-score">' + esc(ev.homeScore) + ' - ' + esc(ev.awayScore) + '</span>' : '';
        return '<tr class="' + (isLive ? 'wc-row-live' : '') + '">' +
          '<td>' + esc(ev.tournament) + '</td>' +
          '<td>' + esc(ev.home) + '</td>' +
          '<td>' + esc(ev.away) + '</td>' +
          '<td>' + scoreHtml + '</td>' +
          '<td>' + statusBadge + (ev.statusDesc && !isLive ? ' ' + esc(ev.statusDesc) : '') + '</td>' +
          '</tr>';
      }).join('');
      el.innerHTML = '<div class="rank-table-wrap"><table class="rank-table">' +
        '<thead><tr><th>Torneo</th><th>Jugador 1</th><th>Jugador 2</th><th>Marcador</th><th>Estado</th></tr></thead>' +
        '<tbody>' + liveRows + '</tbody></table></div>' +
        '<div style="margin-top:12px"><a href="https://www.sofascore.com/es/tennis/wheelchairs" target="_blank" class="ta-link">Ver todos los partidos en Sofascore &rarr;</a></div>';
      if (meta) meta.textContent = 'Partidos en vivo de wheelchair tennis (Sofascore)';
      return;
    }

    if (tab === 'videos') {
      const wcVideos = state.wcVideos;
      if (!wcVideos.loaded) { el.innerHTML = '<div class="loading">Cargando videos...</div>'; return; }
      if (!wcVideos.items.length) {
        el.innerHTML = '<div class="loading">No hay videos disponibles.</div>';
        return;
      }
      let html = '<div class="wc-videos-grid">';
      wcVideos.items.forEach(v => {
        const thumb = 'https://img.youtube.com/vi/' + v.youtubeId + '/hqdefault.jpg';
        html += '<a href="https://www.youtube.com/watch?v=' + v.youtubeId + '" target="_blank" rel="noopener" class="wc-video-card">';
        html += '<div class="wc-video-thumb"><img src="' + thumb + '" alt="' + esc(v.title) + '" loading="lazy"><div class="wc-video-play">&#9654;</div></div>';
        html += '<div class="wc-video-info">';
        html += '<div class="wc-video-title">' + esc(v.title) + '</div>';
        html += '<div class="wc-video-event">' + esc(v.event) + '</div>';
        html += '<div class="wc-video-desc">' + esc(v.description) + '</div>';
        html += '</div></a>';
      });
      html += '</div>';
      html += '<div style="margin-top:16px"><a href="https://www.youtube.com/results?search_query=wheelchair+tennis+2026+highlights" target="_blank" class="ta-link">Ver más highlights en YouTube &rarr;</a></div>';
      el.innerHTML = html;
      if (meta) meta.textContent = 'Videos de wheelchair tennis · Highlights y Torneos';
      return;
    }

    if (!wc.loaded || !wc.data) { el.innerHTML = '<div class="loading">Cargando datos wheelchair...</div>'; return; }
    const d = wc.data;
    const flagEmoji = c => { const m = { JPN: '\u{1F1EF}\u{1F1F5}', GBR: '\u{1F1EC}\u{1F1E7}', ESP: '\u{1F1EA}\u{1F1F8}', ARG: '\u{1F1E6}\u{1F1F7}', FRA: '\u{1F1EB}\u{1F1F7}', NED: '\u{1F1F3}\u{1F1F1}', USA: '\u{1F1FA}\u{1F1F8}', BRA: '\u{1F1E7}\u{1F1F7}', CHN: '\u{1F1E8}\u{1F1F3}', RSA: '\u{1F1FF}\u{1F1E6}', ISR: '\u{1F1EE}\u{1F1F1}', COL: '\u{1F1E8}\u{1F1F4}', GER: '\u{1F1E9}\u{1F1EA}', TUR: '\u{1F1F9}\u{1F1F7}', CHI: '\u{1F1E8}\u{1F1F8}', AUS: '\u{1F1E6}\u{1F1FA}', MAS: '\u{1F1F2}\u{1F1FE}' }; return m[c] || ''; };

    if (tab === 'calendar') {
      if (!d.calendar || !d.calendar.length) { el.innerHTML = '<div class="error-box">No hay datos de calendario.</div>'; return; }
      const rows = d.calendar.map(t => {
        const statusCls = t.status === 'Live' ? 'wc-live' : '';
        return '<tr class="' + statusCls + '">' +
          '<td>' + esc(t.date) + '</td>' +
          '<td><b>' + esc(t.name) + '</b></td>' +
          '<td>' + esc(t.location) + '</td>' +
          '<td><span class="wc-cat">' + esc(t.category) + '</span></td>' +
          '<td>' + esc(t.surface) + '</td>' +
          '<td>' + (t.status ? '<span class="wc-status-live">' + esc(t.status) + '</span>' : '') + '</td>' +
          '</tr>';
      }).join('');
      el.innerHTML = '<div class="rank-table-wrap"><table class="rank-table">' +
        '<thead><tr><th>Fecha</th><th>Torneo</th><th>Ubicación</th><th>Categoría</th><th>Superficie</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      if (meta) meta.textContent = 'Calendario UNIQLO Wheelchair Tennis Tour 2026';
      return;
    }

    if (tab === 'results') {
      if (!d.recentResults || !d.recentResults.length) { el.innerHTML = '<div class="error-box">No hay resultados recientes.</div>'; return; }
      const rows = d.recentResults.map(r => {
        return '<tr>' +
          '<td>' + esc(r.date) + '</td>' +
          '<td><b>' + esc(r.tournament) + '</b></td>' +
          '<td>' + esc(r.menSingles || '—') + '</td>' +
          '<td>' + esc(r.womenSingles || '—') + '</td>' +
          '<td>' + esc(r.menDoubles || '—') + '</td>' +
          '<td>' + esc(r.womenDoubles || '—') + '</td>' +
          '</tr>';
      }).join('');
      el.innerHTML = '<div class="rank-table-wrap"><table class="rank-table">' +
        '<thead><tr><th>Fecha</th><th>Torneo</th><th>Singles M</th><th>Singles W</th><th>Dobles M</th><th>Dobles W</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      if (meta) meta.textContent = 'Resultados recientes de Grand Slams y torneos principales';
      return;
    }

    const rankData = d.rankings && d.rankings[tab];
    const labels = { menSingles: 'Singles Men', womenSingles: 'Singles Women', menDoubles: 'Doubles Men', womenDoubles: 'Doubles Women', quad: 'Quad Singles', quadDoubles: 'Quad Doubles' };
    if (!rankData || !rankData.length) { el.innerHTML = '<div class="error-box">No hay ranking disponible para esta categoría.</div>'; return; }
    const hasPoints = rankData[0] && rankData[0].points != null;
    const hasRecord = rankData[0] && rankData[0].record2026;
    const hasTitles = rankData[0] && rankData[0].titles2026 != null;
    const hasMove = rankData[0] && rankData[0].movement != null;
    const thPoints = hasPoints ? '<th style="text-align:right">Puntos</th>' : '';
    const thRecord = hasRecord ? '<th>W-L 2026</th>' : '';
    const thTitles = hasTitles ? '<th>Títulos</th>' : '';
    const rows = rankData.map(r => {
      const pts = r.points != null ? r.points.toLocaleString('es') : '—';
      const rankCls = r.rank === 1 ? 'r-rank top1' : 'r-rank';
      let mvCell = '';
      if (hasMove) {
        const mv = parseInt(r.movement, 10) || 0;
        const mvCls = mv > 0 ? 'up' : (mv < 0 ? 'down' : 'flat');
        const mvTxt = mv > 0 ? ('▲' + mv) : (mv < 0 ? ('▼' + Math.abs(mv)) : '·');
        mvCell = '<td class="r-move ' + mvCls + '">' + mvTxt + '</td>';
      }
      return '<tr>' +
        '<td class="' + rankCls + '">' + esc(r.rank) + '</td>' +
        '<td class="r-name">' + flagEmoji(r.country) + ' ' + esc(r.name) + ' <span class="wc-country">(' + esc(r.country) + ')</span></td>' +
        mvCell +
        (hasTitles ? '<td class="r-r">' + esc(r.titles2026 != null ? r.titles2026 : '—') + '</td>' : '') +
        (hasRecord ? '<td>' + esc(r.record2026 || '—') + '</td>' : '') +
        (hasPoints ? '<td class="r-pts">' + pts + '<span> pts</span></td>' : '') +
        '</tr>';
    }).join('');
    el.innerHTML = '<div class="rank-section-title">' + (labels[tab] || tab) + ' Rankings</div>' +
      '<div class="rank-table-wrap"><table class="rank-table">' +
      '<thead><tr><th>#</th><th>Jugador</th>' +
      (hasMove ? '<th>Mov.</th>' : '') +
      (hasTitles ? '<th>Títulos</th>' : '') +
      (hasRecord ? '<th>W-L 2026</th>' : '') +
      (hasPoints ? '<th style="text-align:right">Puntos</th>' : '<th></th>') +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
    if (meta) meta.textContent = 'UNIQLO Wheelchair Tennis Tour · ' + (labels[tab] || tab) + ' · Actualizado: ' + (d.updated || '--');
  }

  function renderPlayers() {
    const el = $('playersContent');
    if (!state.elo.loaded) { el.innerHTML = '<div class="loading">Cargando jugadores...</div>'; return; }
    const q = state.playerSearch;
    const filterData = (data) => {
      if (!data || !data.length) return [];
      if (q) return data.filter(r => (r.player || '').toLowerCase().indexOf(q) > -1);
      return data;
    };
    const sec = (title, data, circuit) => {
      const filtered = filterData(data);
      const header = '<div class="rank-section-title">' + title + '</div>';
      if (!data || !data.length) return header + '<div class="error-box">No hay datos disponibles.</div>';
      if (q && !filtered.length) return header + '<div class="error-box">No se encontraron jugadores que coincidan con "' + esc(q) + '" en ' + title + '.</div>';
      const rows = filtered.map(r => {
        const slug = taSlug(r.player);
        const href = 'https://www.tennisabstract.com/cgi-bin/player-classic.cgi?p=' + slug;
        return '<tr class="player-row-click" data-href="' + esc(href) + '">' +
          '<td class="r-r">' + esc(r.rank) + '</td>' +
          '<td class="r-name"><a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(r.player) + '</a></td>' +
          '<td class="r-r">' + esc(r.age) + '</td>' +
          '<td class="r-r elo-main">' + esc(r.elo) + '</td>' +
          '</tr>';
      }).join('');
      return header +
        '<div class="rank-table-wrap"><table class="rank-table elo-table">' +
        '<thead><tr><th>#</th><th>Jugador</th><th>Edad</th><th>Puntos</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    };
    const showAtp = state.playerTab === 'todos' || state.playerTab === 'atp';
    const showWta = state.playerTab === 'todos' || state.playerTab === 'wta';
    let html = '';
    if (showAtp) html += sec('ATP', state.elo.atp, 'atp');
    if (showWta) html += sec('WTA', state.elo.wta, 'wta');
    el.innerHTML = html || '<div class="error-box">Sin datos.</div>';
    const atpCount = showAtp ? filterData(state.elo.atp).length : 0;
    const wtaCount = showWta ? filterData(state.elo.wta).length : 0;
    const parts = [];
    if (showAtp) parts.push(atpCount + ' ATP');
    if (showWta) parts.push(wtaCount + ' WTA');
    $('playersMeta').textContent = parts.join(' · ') + (q ? ' · buscando "' + q + '"' : '');
  }

  /* ---------------- render dispatcher ---------------- */

  function render() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('view-' + state.tab).classList.add('active');
    if (state.tab === 'live') renderLive();
    else if (state.tab === 'news') renderNews();
    else if (state.tab === 'videos') renderVideos();
    else if (state.tab === 'tournaments') renderTournaments();
    else if (state.tab === 'draws') renderDraws();
    else if (state.tab === 'rankings') renderRankings();
    else if (state.tab === 'argentina') renderArgentina();
    else if (state.tab === 'players') renderPlayers();
    else if (state.tab === 'h2hsearch') renderH2HSearch();
    else if (state.tab === 'calendar') renderCalendar();
    else if (state.tab === 'wheelchair') renderWheelchair();
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.body.classList.remove('nav-open');
    document.body.classList.toggle('tab-calendar', tab === 'calendar');
    document.body.classList.toggle('tab-argentina', tab === 'argentina');
  document.body.classList.toggle('tab-news', tab === 'news');
  document.body.classList.toggle('tab-videos', tab === 'videos');
    document.body.classList.toggle('tab-wheelchair', tab === 'wheelchair');
    if (tab === 'calendar' && !state.cal.loaded) {
      render();
      refreshCalendar();
      return;
    }
    if (tab === 'videos' && !state.videos.loaded) {
      render();
      refreshVideos();
      return;
    }
    if (tab === 'players' && !state.elo.loaded) {
      render();
      refreshElo();
      if (!state.seeds.loaded) refreshSeeds();
      return;
    }
    if (tab === 'h2hsearch' && !state.elo.loaded) {
      render();
      refreshElo();
      return;
    }
    if (tab === 'wheelchair' && !state.wheelchair.loaded) {
      render();
      refreshWheelchair();
      return;
    }
    render();
    if ((tab === 'rankings' || tab === 'argentina' || tab === 'draws' || tab === 'tournaments' || tab === 'news' || tab === 'videos') && !state.matches.length) {
      refreshAll();
    }
  }

  /* ---------------- clock & countdown ---------------- */

  function tickClock() {
    $('clock').textContent = new Date().toLocaleTimeString('es');
    const dl = $('datelineTxt');
    if (dl) {
      const d = new Date();
      dl.textContent = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    const t = todayStr();
    const els = document.querySelectorAll('.tour-head .t-date');
    for (let i = 0; i < els.length; i++) els[i].textContent = t;
  }
  function tickCountdown() {
    if (!state.refreshing && state.countdown <= 0) {
      refreshAll();
      return;
    }
    if (!state.refreshing) state.countdown--;
    if (state.countdown < 0) state.countdown = 0;
    $('countdown').textContent = state.countdown;
  }

  /* ---------------- H2H ---------------- */

  async function openH2H(teId) {
    const body = $('h2hBody');
    const overlay = $('h2hOverlay');
    if (!body || !overlay) return;
    body.innerHTML = '<div class="h2h-loading">Cargando H2H...</div>';
    overlay.classList.remove('hidden');
    try {
      let j;
      if (useLocalBackend()) {
        j = await fetchJson('api/h2h?matchId=' + encodeURIComponent(teId));
      } else {
        body.innerHTML = '<div class="error-box">H2H no disponible en la version web. Usá la version local para ver el H2H.</div>';
        return;
      }
      renderH2H(body, j);
    } catch (err) {
      body.innerHTML = '<div class="error-box">No se pudo cargar el H2H: ' + esc(err.message) + '</div>';
    }
  }

  async function openH2HByName(p1, p2) {
    const body = $('h2hBody');
    const overlay = $('h2hOverlay');
    if (!body || !overlay) return;
    body.innerHTML = '<div class="h2h-loading">Cargando H2H...</div>';
    overlay.classList.remove('hidden');
    try {
      let j;
      if (useLocalBackend()) {
        j = await fetchJson('api/h2h/byname?p1=' + encodeURIComponent(p1) + '&p2=' + encodeURIComponent(p2));
      } else {
        const res = await fetchTAH2HWeb(p1, p2);
        const rows = (res.meetings || []).map(mt => {
          const s1 = [], s2 = [];
          String(mt.score || '').split(/\s+/).forEach(tok => {
            const m = tok.match(/^(\d+)-(\d+)/);
            if (m) { s1.push(m[1]); s2.push(m[2]); }
          });
          return {
            year: String(mt.date || '').slice(0, 4),
            tournament: mt.tournament,
            round: mt.round,
            surface: mt.surface,
            winner: mt.winner,
            loser: mt.loser,
            sets1: s1,
            sets2: s2
          };
        });
        if (!rows.length) {
          body.innerHTML = '<div class="error-box">Sin enfrentamientos previos entre estos jugadores.</div>';
          return;
        }
        const wins = taCountWins(res.meetings, res.p1);
        j = { ok: true, p1: res.p1, p2: res.p2, h2h: wins + '-' + (res.meetings.length - wins), meetings: rows };
      }
      renderH2H(body, j);
    } catch (err) {
      body.innerHTML = '<div class="error-box">No se pudo cargar el H2H: ' + esc(err.message) + '</div>';
    }
  }

  function renderH2H(body, j) {
    if (!j.ok) { body.innerHTML = '<div class="error-box">' + esc(j.error || 'Error') + '</div>'; return; }
    const title = '<div class="h2h-title">' + esc(j.p1 || '') + ' <span class="h2h-vs">vs</span> ' + esc(j.p2 || '') +
      ' <span class="h2h-count">' + esc(j.h2h) + '</span></div>';
    if (!j.meetings || !j.meetings.length) {
      body.innerHTML = title + '<div class="h2h-empty">Sin enfrentamientos previos.</div>';
      return;
    }
    const rows = j.meetings.map(mc =>
      '<tr><td>' + esc(mc.year) + '</td><td>' + esc(mc.tournament) + '</td>' +
      '<td>' + esc(mc.round) + '</td><td>' + esc(mc.surface) + '</td>' +
      '<td><span class="h2h-win">' + esc(mc.winner) + '</span> ' + esc(mc.loser) + '</td>' +
      '<td class="h2h-set">' + esc(mc.sets1.map((s, i) => s + '-' + (mc.sets2[i] || '')).join(', ')) + '</td></tr>'
    ).join('');
    body.innerHTML = title +
      '<div class="h2h-table-wrap"><table class="h2h-table"><thead><tr>' +
      '<th>A&ntilde;o</th><th>Torneo</th><th>Ronda</th><th>Superficie</th><th>Resultado</th><th>Sets</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function closeH2H() {
    const overlay = $('h2hOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /* ---------------- STATS ---------------- */

  async function openStats(p1, p2) {
    const body = $('statsBody');
    const overlay = $('statsOverlay');
    if (!body || !overlay) return;
    body.innerHTML = '<div class="h2h-loading">Cargando estadísticas...</div>';
    overlay.classList.remove('hidden');
    try {
      let j;
      if (useLocalBackend()) {
        j = await fetchJson('api/stats?p1=' + encodeURIComponent(p1) + '&p2=' + encodeURIComponent(p2));
      } else {
        if (!state.statsCache) {
          state.statsCache = await fetchJson('stats_cache.json').catch(() => ({ pairs: {} }));
        }
        const key1 = p1.toLowerCase().replace(/ /g, '') + '::' + p2.toLowerCase().replace(/ /g, '');
        const key2 = p2.toLowerCase().replace(/ /g, '') + '::' + p1.toLowerCase().replace(/ /g, '');
        const cached = (state.statsCache.pairs || {})[key1] || (state.statsCache.pairs || {})[key2];
        if (cached) { j = cached; }
        else {
          body.innerHTML = '<div class="error-box">Stats no disponibles para este partido en la version web. Intenta con la version local.</div>';
          return;
        }
      }
      renderStats(body, j, p1, p2);
    } catch (err) {
      body.innerHTML = '<div class="error-box">No se pudieron cargar las estadísticas: ' + esc(err.message) + '</div>';
    }
  }

  function renderStats(body, j, p1, p2) {
    if (!j.ok) { body.innerHTML = '<div class="error-box">' + esc(j.error || 'Error') + '</div>'; return; }
    const s = j.stats;
    const num = v => parseInt(v, 10) || 0;
    const pct = (a, b) => { const n = num(a), d = num(b); return d ? ((n / d) * 100).toFixed(1) + '%' : '—'; };
    const dateStr = s.date ? (s.date.slice(0, 4) + '-' + s.date.slice(4, 6) + '-' + s.date.slice(6, 8)) : '';
    const resultCls = s.result === 'W' ? 'stats-win' : 'stats-loss';
    const header = '<div class="stats-title">' + esc(p1) + ' <span class="h2h-vs">vs</span> ' + esc(p2) + '</div>' +
      '<div class="stats-match-info">' +
        '<span class="' + resultCls + '">' + esc(s.result) + '</span> · ' +
        esc(s.tournament) + ' · ' + esc(s.round) + ' · ' + esc(s.surface) + ' · ' + esc(dateStr) +
      '</div>' +
      '<div class="stats-score">' + esc(s.score) + '</div>';
    const rows = [
      ['', esc(p1), esc(p2)],
      ['Aces', esc(s.aces), esc(s.oaces)],
      ['Doble faltas', esc(s.dfs), esc(s.odfs)],
      ['Puntos de saque', esc(s.pts), esc(s.opts)],
      ['1ros en', esc(s.firsts), esc(s.ofirsts)],
      ['1ros ganados', esc(s.fwon), esc(s.ofwon)],
      ['2dos ganados', esc(s.swon), esc(s.oswon)],
      ['Juegos de saque', esc(s.games), esc(s.ogames)],
      ['BP salvados', esc(s.saved) + '/' + esc(s.chances), esc(s.osaved) + '/' + esc(s.ochances)],
      ['%', ''],
      ['Ace%', pct(s.aces, s.pts), pct(s.oaces, s.opts)],
      ['DF%', pct(s.dfs, s.pts), pct(s.odfs, s.opts)],
      ['1st%', pct(s.firsts, s.pts), pct(s.ofirsts, s.opts)],
      ['1st ganados%', pct(s.fwon, s.firsts), pct(s.ofwon, s.ofirsts)],
      ['2nd ganados%', pct(s.swon, num(s.pts) - num(s.firsts)), pct(s.oswon, num(s.opts) - num(s.ofirsts))],
    ];
    const tableRows = rows.map((r, i) => {
      if (r.length === 2) return '<tr class="stats-sep"><td colspan="3">' + r[0] + '</td></tr>';
      return '<tr><td class="stats-label">' + r[0] + '</td><td class="stats-val">' + r[1] + '</td><td class="stats-val">' + r[2] + '</td></tr>';
    }).join('');
    body.innerHTML = header +
      '<table class="stats-table"><thead><tr><th></th><th>' + esc(p1.split(' ').pop()) + '</th><th>' + esc(p2.split(' ').pop()) + '</th></tr></thead>' +
      '<tbody>' + tableRows + '</tbody></table>';
  }

  function closeStats() {
    const overlay = $('statsOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /* ---------------- H2H SEARCH (TennisAbstract) ---------------- */

  function parseMatchmxClient(html, p1, q2norm) {
    const marker = 'var matchmx = ';
    const idx = html.indexOf(marker);
    if (idx < 0) return null;
    let depth = 0, end = -1;
    for (let i = idx + marker.length; i < html.length && i < idx + marker.length + 2000000; i++) {
      const c = html[i];
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) return null;
    let arr;
    try { arr = JSON.parse(html.slice(idx + marker.length, end)); } catch (_) { return null; }
    const norm = s => s.toLowerCase().replace(/[^a-z\u00C0-\u024F\s]/g, '').replace(/\s+/g, ' ').trim();
    const fnM = html.match(/Tennis Abstract:\s*(.+?)\s+Match Results/);
    const realName = fnM ? fnM[1].trim() : p1;
    const sur1 = norm(realName || p1).split(' ').pop();
    const nq1 = norm(p1);
    const meetings = [];
    for (const m of arr) {
      const opp = String(m[11] || '');
      const no = norm(opp);
      if (!no || !(no.indexOf(q2norm) > -1 || q2norm.indexOf(no) > -1)) continue;
      const isWin = String(m[4]) === 'W';
      const nw = norm(isWin ? (realName || p1) : opp);
      const iAmWinner = nw === sur1 || nw === nq1;
      meetings.push({
        date: String(m[0]),
        tournament: String(m[1]),
        surface: String(m[2]),
        round: String(m[8]),
        score: String(m[9]),
        winner: iAmWinner ? (realName || p1) : opp,
        loser: iAmWinner ? opp : (realName || p1)
      });
    }
    return { realName: realName || p1, meetings: meetings };
  }

  function taSlug(name) {
    return name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
  }

  function resolveNameClient(name) {
    const t = (name || '').trim();
    if (!t || t.split(/\s+/).length >= 2) return t;
    const nq = t.toLowerCase();
    const pools = [];
    if (state.elo && state.elo.atp) pools.push(state.elo.atp);
    if (state.elo && state.elo.wta) pools.push(state.elo.wta);
    for (const pool of pools) {
      for (const p of pool) {
        const pn = (p.player || '').toLowerCase();
        if (pn === nq || pn.endsWith(' ' + nq)) return p.player;
      }
    }
    return null;
  }

  async function runH2HSearch() {
    const p1 = ($('h2hP1') && $('h2hP1').value || '').trim();
    const p2 = ($('h2hP2') && $('h2hP2').value || '').trim();
    const content = $('h2hSearchContent');
    if (!content) return;
    if (!p1 || !p2) {
      content.innerHTML = '<div class="error-box">Escrib&iacute; los dos jugadores.</div>';
      return;
    }
    state.h2hSearch = { loading: true, data: null, error: null, searched: true };
    renderH2HSearch();
    try {
      let j;
      if (useLocalBackend()) {
        j = await fetchJson('api/h2h/ta?p1=' + encodeURIComponent(p1) + '&p2=' + encodeURIComponent(p2));
      } else {
        const res = await fetchTAH2HWeb(p1, p2);
        const mtAll = res.meetings;
        if (!mtAll.length) {
          j = { ok: false, error: 'No se encontraron partidos entre ellos.' };
        } else {
          const wins = taCountWins(mtAll, res.p1);
          j = { ok: true, p1: res.p1, p2: res.p2, h2h: wins + '-' + (mtAll.length - wins), source: 'tennisabstract', meetings: mtAll };
        }
      }
      state.h2hSearch.data = j;
      state.h2hSearch.error = j.ok ? null : (j.error || 'Sin resultados');
    } catch (err) {
      const msg = (err && err.message) || '';
      if (msg.indexOf('no-encontrado:') === 0) {
        state.h2hSearch.error = 'Jugador no encontrado: <b>' + esc(msg.split(':')[1]) + '</b>. Escrib&iacute; el nombre completo o verific&aacute; que est&eacute; en la solapa PLAYERS.';
      } else if (msg === 'sin-datos') {
        state.h2hSearch.error = 'No se pudieron obtener datos de TennisAbstract (puede haber l&iacute;mite de consultas). Espera un momento e intenta de nuevo.';
      } else {
        state.h2hSearch.error = useLocalBackend()
          ? ('No se pudo consultar TennisAbstract: ' + err.message)
          : 'Error inesperado. Intenta de nuevo.';
      }
    }
    state.h2hSearch.loading = false;
    renderH2HSearch();
  }

  function parseTaFragClient(text, p1, p2) {
    const norm = s => s.toLowerCase().replace(/[^a-z\u00C0-\u024F\s]/g, '').replace(/\s+/g, ' ').trim();
    const nq1 = norm(p1);
    const sur1 = nq1.split(' ').pop();
    const q2 = norm(p2);
    const slug = taSlug(p1);
    const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const rowRe = /<tr><td[^>]*>\d{1,2}-[A-Za-z]{3}-\d{4}<\/td>[\s\S]*?<\/tr>/g;
    let realName = '';
    const meetings = [];
    let m;
    while ((m = rowRe.exec(text)) !== null) {
      const tds = [];
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let tm;
      while ((tm = tdRe.exec(m[0])) !== null) tds.push(tm[1]);
      if (tds.length < 6) continue;
      const strip = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      const dateRaw = strip(tds[0]);
      const dm = dateRaw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
      if (!dm) continue;
      const mm = months[dm[2]];
      if (!mm) continue;
      const date = dm[3] + mm + dm[1].padStart(2, '0');
      let mi = -1;
      for (let i = 4; i < tds.length; i++) {
        if (tds[i].indexOf('<b>') > -1 || tds[i].indexOf('<a ') > -1) { mi = i; break; }
      }
      if (mi < 0 || mi + 1 >= tds.length) continue;
      const matchCell = tds[mi];
      const score = strip(tds[mi + 1]);
      if (!score || />\s*vs\s*</.test(matchCell)) continue;
      const boldM = matchCell.match(/<b>([^<]+)<\/b>/);
      const linkM = matchCell.match(/<a[^>]*>([^<]+)<\/a>/);
      if (!boldM || !linkM) continue;
      const selfHref = matchCell.match(/href="[^"]*p=([A-Za-z0-9]+)"/);
      if (selfHref && selfHref[1] === slug && !realName) realName = linkM[1].trim();
      meetings.push({
        date: date,
        tournament: strip(tds[1]),
        surface: strip(tds[2]),
        round: strip(tds[3]),
        score: score,
        winner: boldM[1].trim(),
        loser: linkM[1].trim()
      });
    }
    const filtered = [];
    let wins = 0, losses = 0;
    for (const mt of meetings) {
      const nw = norm(mt.winner), nl = norm(mt.loser);
      const iAmWinner = nw === sur1 || nw === nq1;
      const iAmLoser = nl === nq1 || nl === sur1;
      if (!iAmWinner && !iAmLoser) continue;
      const oppName = iAmWinner ? mt.loser : mt.winner;
      const no = norm(oppName);
      if (!(no.includes(q2) || q2.includes(no))) continue;
      const winFull = iAmWinner ? (realName || p1) : mt.winner;
      const loseFull = iAmLoser ? (realName || p1) : mt.loser;
      if (iAmWinner) wins++; else losses++;
      filtered.push({ date: mt.date, tournament: mt.tournament, surface: mt.surface, round: mt.round, score: mt.score, winner: winFull, loser: loseFull });
    }
    if (!filtered.length) return { ok: false, error: 'No se encontraron partidos entre ellos.' };
    return { ok: true, p1: realName || p1, p2: p2, h2h: wins + '-' + losses, source: 'tennisabstract', meetings: filtered };
  }

  function renderH2HSearch() {
    const content = $('h2hSearchContent');
    const meta = $('h2hSearchMeta');
    if (!content) return;
    const hs = state.h2hSearch;
    if (meta) meta.textContent = hs.searched && hs.data && hs.data.ok ? (hs.data.p1 + ' vs ' + hs.data.p2) : '';
    if (hs.loading) {
      content.innerHTML = '<div class="loading">Buscando H2H en TennisAbstract...</div>';
      return;
    }
    if (hs.error) {
      content.innerHTML = '<div class="error-box">' + esc(hs.error).replace(/&lt;br&gt;/g, '<br>') + '</div>';
      return;
    }
    if (!hs.searched) {
      content.innerHTML = '<div class="loading">Escrib&iacute; dos jugadores y presion&aacute; BUSCAR.</div>';
      return;
    }
    const j = hs.data;
    if (!j || !j.ok) {
      content.innerHTML = '<div class="error-box">' + esc((j && j.error) || 'Sin resultados') + '</div>';
      return;
    }
    const rows = j.meetings.map(mc =>
      '<tr><td>' + esc(mc.date) + '</td><td>' + esc(mc.tournament) + '</td>' +
      '<td>' + esc(mc.round) + '</td><td>' + esc(mc.surface) + '</td>' +
      '<td><span class="h2h-win">' + esc(mc.winner) + '</span> ' + esc(mc.loser) + '</td>' +
      '<td class="h2h-set">' + esc(mc.score) + '</td></tr>'
    ).join('');
    content.innerHTML =
      '<div class="h2h-search-result">' +
        '<div class="h2h-title">' + esc(j.p1) + ' <span class="h2h-vs">vs</span> ' + esc(j.p2) +
        ' <span class="h2h-count">' + esc(j.h2h) + '</span></div>' +
        '<div class="h2h-source">Fuente: TennisAbstract &middot; ' + j.meetings.length + ' partidos</div>' +
        '<div class="h2h-table-wrap"><table class="h2h-table"><thead><tr>' +
        '<th>Fecha</th><th>Torneo</th><th>Ronda</th><th>Superficie</th><th>Ganador</th><th>Marcador</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  /* ---------------- wiring ---------------- */

  function init() {
    loadFinishedFromStorage();
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(tickCountdown, 1000);

    $('tabs').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (b) setTab(b.dataset.tab);
    });

    $('segTour').addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      state.tour = b.dataset.tour;
      document.querySelectorAll('#segTour .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      render();
    });

    $('segMode').addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      state.mode = b.dataset.mode;
      document.querySelectorAll('#segMode .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      render();
    });

    $('drawSelect').addEventListener('change', e => {
      state.drawTournamentId = e.target.value;
      state.drawRound = 'todas';
      renderDraws();
    });

    const drawContent = $('drawContent');
    if (drawContent) {
      drawContent.addEventListener('click', e => {
        const chip = e.target.closest('.round-chip');
        if (!chip) return;
        state.drawRound = chip.getAttribute('data-round') || 'todas';
        renderDraws();
      });
    }

    const rankSearch = $('rankSearch');
    if (rankSearch) {
      rankSearch.addEventListener('input', () => {
        state.rankSearch = rankSearch.value.toLowerCase().trim();
        renderRankings();
      });
      const clear = $('rankSearchClear');
      if (clear) clear.addEventListener('click', () => {
        rankSearch.value = '';
        state.rankSearch = '';
        renderRankings();
        rankSearch.focus();
      });
    }

    $('btnRefresh').addEventListener('click', () => {
      if (state.tab === 'calendar') { refreshCalendar(); return; }
      refreshAll(true);
    });

    const segCal = document.getElementById('segCal');
    if (segCal) {
      segCal.addEventListener('click', e => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        state.cal.tab = b.dataset.cal;
        document.querySelectorAll('#segCal .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        renderCalendar();
      });
    }

    const segPlayerTab = document.getElementById('segPlayerTab');
    if (segPlayerTab) {
      segPlayerTab.addEventListener('click', e => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        state.playerTab = b.dataset.playertab;
        document.querySelectorAll('#segPlayerTab .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        renderPlayers();
      });
    }
    const segWC = document.getElementById('segWC');
    if (segWC) {
      segWC.addEventListener('click', e => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        state.wheelchair.tab = b.dataset.wc;
        document.querySelectorAll('#segWC .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        if (b.dataset.wc === 'live') { refreshWcLive(); return; }
        if (b.dataset.wc === 'videos') { refreshWcVideos(); return; }
        renderWheelchair();
      });
    }
    const h2hGo = $('h2hSearchBtn');
    if (h2hGo) h2hGo.addEventListener('click', runH2HSearch);
    ['h2hP1', 'h2hP2'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') runH2HSearch(); });
    });
    const playerSearch = $('playerSearch');
    if (playerSearch) {
      playerSearch.addEventListener('input', () => {
        state.playerSearch = playerSearch.value.toLowerCase().trim();
        renderPlayers();
      });
      const playerClear = $('playerSearchClear');
      if (playerClear) playerClear.addEventListener('click', () => {
        playerSearch.value = '';
        state.playerSearch = '';
        renderPlayers();
        playerSearch.focus();
      });
    }

    const h2hOverlay = document.getElementById('h2hOverlay');
    if (h2hOverlay) {
      h2hOverlay.addEventListener('click', e => {
        if (e.target === h2hOverlay || e.target.closest('.h2h-close')) closeH2H();
      });
    }
    const statsOverlay = document.getElementById('statsOverlay');
    if (statsOverlay) {
      statsOverlay.addEventListener('click', e => {
        if (e.target === statsOverlay || e.target.closest('.h2h-close')) closeStats();
      });
    }

    const segRankView = document.getElementById('segRankView');
    if (segRankView) {
      segRankView.addEventListener('click', e => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        segRankView.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
        state.rankView = b.dataset.rv;
        renderRankings();
      });
    }

    generateFavicon('#c8102e');

    const navToggle = $('navToggle');
    if (navToggle) navToggle.addEventListener('click', () => document.body.classList.toggle('nav-open'));

    const themeToggle = $('themeToggle');
    if (themeToggle) {
      const MODES = ['light', 'dark', 'fluo', 'usopen', 'rosa', 'rosaoscuro', 'verdefluor', 'arcoiris', 'graffiti', 'argentina', 'wimbledon', 'rolandgarros', 'synthwave', 'lectura', 'veamna', 'boom', 'veamtu', 'laser', 'radioactivo', 'obdi', 'mandarina', 'rojo', 'amarillo', 'superamarillo', 'multicolor'];
      const ICONS = { light: '&#9788;', dark: '&#9790;', fluo: '&#10038;', usopen: '&#9670;', rosa: '&#10047;', rosaoscuro: '&#10048;', verdefluor: '&#9827;', arcoiris: '&#9733;', graffiti: '&#10022;', argentina: '&#9737;', wimbledon: '&#9824;', rolandgarros: '&#9825;', synthwave: '&#9650;', lectura: '&#9998;', veamna: '&#9889;', boom: '&#10041;', veamtu: '&#9671;', laser: '&#9830;', radioactivo: '&#9762;', obdi: '&#10052;', mandarina: '&#127818;', rojo: '&#128308;', amarillo: '&#128993;', superamarillo: '&#11088;', multicolor: '&#127752;' };
      const TITLES = { light: 'Modo claro', dark: 'Modo oscuro', fluo: 'Modo flúor', usopen: 'Modo US Open', rosa: 'Modo rosa', rosaoscuro: 'Modo rosa oscuro', verdefluor: 'Modo verde flúor', arcoiris: 'Modo arcoíris', graffiti: 'Modo graffiti', argentina: 'Modo Argentina', wimbledon: 'Modo Wimbledon', rolandgarros: 'Modo Roland Garros', synthwave: 'Modo synthwave', lectura: 'Modo lectura', veamna: 'Modo veamna', boom: 'Modo boom', veamtu: 'Modo veamtu', laser: 'Modo laser', radioactivo: 'Modo radioactivo', obdi: 'Modo obdi', mandarina: 'Modo mandarina', rojo: 'Modo rojo', amarillo: 'Modo amarillo', superamarillo: 'Modo super amarillo', multicolor: 'Modo multicolor' };
      const METACOLORS = { light: '#faf7f2', dark: '#16130e', fluo: '#0b0b12', usopen: '#071a38', rosa: '#ffe3ef', rosaoscuro: '#2b0a1d', verdefluor: '#071008', arcoiris: '#000000', graffiti: '#1b1720', argentina: '#070a10', wimbledon: '#0e1f16', rolandgarros: '#201008', synthwave: '#12081f', lectura: '#f7eedd', veamna: '#000000', boom: '#06001a', veamtu: '#000000', laser: '#0d0006', radioactivo: '#030602', obdi: '#060608', mandarina: '#0d0603', rojo: '#000000', amarillo: '#000000', superamarillo: '#000000', multicolor: '#000000' };
      let mode = 'light';
      try { mode = localStorage.getItem('mhc-mode') || 'light'; } catch (e) {}
      if (MODES.indexOf(mode) === -1) mode = 'light';
      const applyMode = m => {
        document.body.setAttribute('data-mode', m);
        themeToggle.innerHTML = ICONS[m] || ICONS.light;
        themeToggle.title = TITLES[m] || TITLES.light;
        const lbl = document.getElementById('modeLabel');
        if (lbl) lbl.textContent = TITLES[m] || TITLES.light;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', METACOLORS[m] || METACOLORS.light);
      };
      applyMode(mode);
      themeToggle.addEventListener('click', () => {
        const cur = document.body.getAttribute('data-mode');
        const next = MODES[(MODES.indexOf(cur) + 1) % MODES.length];
        applyMode(next);
        try { localStorage.setItem('mhc-mode', next); } catch (e) {}
      });
    }

    refreshAll(true);
  }

  window.__mhcSeeds = { findSeed: findSeed, tourneys: function () { return Object.keys(state.seedByTour || {}); } };

  document.addEventListener('DOMContentLoaded', init);
})();
