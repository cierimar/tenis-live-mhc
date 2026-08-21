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
    cal: { atp: [], wta: [], loaded: false, tab: 'todos' },
    rankSingles: { atp: null, wta: null },
    rankDoubles: { atp: null, wta: null },
    rankDoublesLoading: false,
    rankSearch: '',
    news: { items: [], loaded: false, error: '' },
    videos: { items: [], loaded: false, error: '' },
    elo: { atp: null, wta: null, loaded: false },
    eloTab: 'todos',
    eloSearch: '',
    eloTop: 0,
    playerTab: 'todos',
    playerSearch: '',
    playerCountry: '',
    birthdays: { data: null, loaded: false },
    bdTab: 'all',
    currentTour: { data: null, loaded: false, tab: 'women' },
    wheelchair: { data: null, loaded: false, tab: 'menSingles' },
    wcLive: { events: [], loaded: false, error: '' },
    wcVideos: { items: [], loaded: false },
    seeds: { singles: {}, doubles: {}, loaded: false },
    seedMap: {},
    seedMapATP: {},
    seedMapWTA: {},
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

  function applyTheme(t) {
    state.theme = t || 'oscuro';
    document.body.setAttribute('data-theme', state.theme);
    try { localStorage.setItem('mhc-theme', state.theme); } catch (e) {}
    setTimeout(function() {
      var a = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      if (a) generateFavicon(a);
    }, 50);
  }

  function applyFont(f) {
    state.font = f || 'defecto';
    document.body.setAttribute('data-font', state.font);
    try { localStorage.setItem('mhc-font', state.font); } catch (e) {}
  }

  function applyFsize(f) {
    state.fsize = f || 'normal';
    document.body.setAttribute('data-fsize', state.fsize);
    try { localStorage.setItem('mhc-fsize', state.fsize); } catch (e) {}
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
    if (m.tour === 'chall') return 'chall';
    if (m.tour === 'itf') return 'itf';
    if (m.tour === 'atp' || m.tour === 'wta') return m.tour;
    if (!m.type) return m.tour || 'atp';
    return m.type.indexOf("Men") === 0 ? 'atp' : 'wta';
  }
  function tourLabel(m) {
    const t = tourOf(m);
    if (t === 'chall') return 'CHALL';
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
          const tid = String(c.tournamentId || ev.id);
          if (!tourMap.has(tid)) {
            tourMap.set(tid, {
              id: tid,
              name: ev.name || '',
              date: ev.date,
              status: ev.status ? ev.status.type : null,
              previousWinners: ev.previousWinners || []
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

  async function refreshScoreboards() {
    const [atp, wta] = await Promise.all([
      fetchJson(ESPN + '/atp/scoreboard').catch(() => null),
      fetchJson(ESPN + '/wta/scoreboard').catch(() => null)
    ]);
    const a = atp ? normalizeScoreboard(atp, 'atp') : { matches: [], tournaments: [] };
    const w = wta ? normalizeScoreboard(wta, 'wta') : { matches: [], tournaments: [] };
    const tmap = new Map();
    const mmap = new Map();
    for (const src of [a, w]) {
      for (const t of src.tournaments) tmap.set(t.id, t);
      for (const m of src.matches) if (!mmap.has(m.id)) mmap.set(m.id, m);
    }
    state.tournaments = Array.from(tmap.values());
    state.matches = Array.from(mmap.values());
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

  async function refreshRankingsSingles() {
    const [atp, wta] = await Promise.all([
      fetchJson(ESPN + '/atp/rankings'),
      fetchJson(ESPN + '/wta/rankings')
    ]);
    state.rankSingles.atp = normalizeEspnRank(atp);
    state.rankSingles.wta = normalizeEspnRank(wta);
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
    if (state.tab === 'elo' || state.tab === 'players') render();
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
    const [atp, wta] = await Promise.all([
      fetchJson('api/rankings/atp?type=doubles'),
      fetchJson('api/rankings/wta?type=doubles')
    ]);
    state.rankDoubles.atp = atp;
    state.rankDoubles.wta = wta;
  }

  function buildSeedMaps(seeds) {
    const atp = {}, wta = {}, all = {};
    if (!seeds || !seeds.singles) return { atp, wta, all };
    for (const [key, seed] of Object.entries(seeds.singles)) {
      const norm = key.replace(/^(ATP|WTA)::/, '').toLowerCase().replace(/-/g, ' ').replace(/\./g, '').trim();
      const compact = norm.replace(/\s+/g, '');
      const prefix = key.startsWith('ATP::') ? 'atp' : key.startsWith('WTA::') ? 'wta' : null;
      if (prefix) {
        prefix === 'atp' ? (atp[norm] = seed, atp[compact] = seed) : (wta[norm] = seed, wta[compact] = seed);
      }
      all[norm] = seed;
      all[compact] = seed;
    }
    if (seeds.doubles) {
      for (const [key, seed] of Object.entries(seeds.doubles)) {
        const norm = key.replace(/^(ATP|WTA)::/, '').toLowerCase().replace(/-/g, ' ').replace(/\./g, '').trim();
        const compact = norm.replace(/\s+/g, '');
        const prefix = key.startsWith('ATP::') ? 'atp' : key.startsWith('WTA::') ? 'wta' : null;
        if (prefix) {
          prefix === 'atp' ? (atp[norm] = seed, atp[compact] = seed) : (wta[norm] = seed, wta[compact] = seed);
        }
        all[norm] = seed;
        all[compact] = seed;
      }
    }
    return { atp, wta, all };
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
      }
    } catch (_) {}
  }

  function circuitOf(m) {
    if (!m || !m.type) return null;
    return m.type.indexOf('Men') > -1 ? 'atp' : m.type.indexOf('Women') > -1 ? 'wta' : null;
  }

  function findSeed(name, circuit) {
    if (!name) return null;
    const n = name.toLowerCase().replace(/-/g, ' ').replace(/\./g, '').replace(/\s+/g, ' ').trim();
    const parts = n.split(' ').filter(Boolean);
    const circuitMap = circuit === 'atp' ? state.seedMapATP : circuit === 'wta' ? state.seedMapWTA : null;
    const maps = circuitMap ? [circuitMap, state.seedMap] : [state.seedMap];
    for (const map of maps) {
      if (!map || !Object.keys(map).length) continue;
      if (map[n]) return map[n];
      if (parts.length >= 2) {
        const two = parts.slice(-2).join(' ');
        if (map[two]) return map[two];
      }
      const last = parts[parts.length - 1];
      const candidates = Object.entries(map).filter(([k]) => k === last);
      if (candidates.length === 1) return candidates[0][1];
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

  async function refreshAll(force) {
    if (state.refreshing) return;
    state.refreshing = true;
    try {
      snapshotLiveMatches();
      await Promise.allSettled([refreshScoreboards(), refreshRankingsSingles(), refreshAtpLive(), refreshChallLive(), refreshNews(), refreshVideos(), refreshSeeds(), refreshElo(), refreshTennisExplorerResults(), refreshCurrentTour(), refreshWheelchair()]);
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
        ? ['api/calendar/atp', 'api/calendar/wta']
        : ['calendar_atp.json', 'calendar_wta.json'];
      const [a, w] = await Promise.all([
        fetchJson(urls[0]).catch(() => ({ tournaments: [] })),
        fetchJson(urls[1]).catch(() => ({ tournaments: [] }))
      ]);
      state.cal.atp = a.tournaments || [];
      state.cal.wta = w.tournaments || [];
      state.cal.loaded = true;
      if (state.tab === 'calendar') render();
    } catch (err) {
      state.cal.loaded = true;
      if (state.tab === 'calendar') render();
    }
  }

  function calLevelLabel(t) {
    if (t.circuit === 'atp') return t.level === 'main' ? 'ATP' : 'CHALL';
    return t.level === 'main' ? 'WTA' : 'WTA 125';
  }

  function renderCalendar() {
    const el = $('calContent');
    if (!state.cal.loaded) { el.innerHTML = '<div class="loading">Cargando calendario...</div>'; return; }
    if (!state.cal.atp.length && !state.cal.wta.length) {
      el.innerHTML = '<div class="error-box">No se pudo cargar el calendario.</div>';
      $('calMeta').textContent = '';
      return;
    }
    const circuits = state.cal.tab === 'todos' ? ['atp', 'wta'] : [state.cal.tab];
    const list = [];
    for (const c of circuits) for (const t of state.cal[c]) list.push(t);
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
    return [...state.matches, ...chall, ...itf];
  }
  function allTournaments() {
    const chall = state.challLive && state.challLive.tournaments ? state.challLive.tournaments : [];
    const itf = state.itfLive && state.itfLive.tournaments ? state.itfLive.tournaments : [];
    return [...state.tournaments, ...chall, ...itf];
  }
  function filteredMatches() {
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
    const list = filteredMatches();
    const el = $('liveContent');
    if (!state.matches.length) { el.innerHTML = '<div class="loading">Cargando partidos...</div>'; return; }
    if (state.tour === 'itf') {
      if (!useLocalBackend()) {
        el.innerHTML = '<div class="error-box">ITF en vivo solo está disponible en la versión local (PC con el servidor).</div>';
        return;
      }
      if (!state.itfLive.matches.length) { el.innerHTML = '<div class="loading">Cargando partidos ITF...</div>'; return; }
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
      html += '<div class="tour-block"><div class="tour-head"><span class="t-name">' + esc(name) +
        '</span>' + chip + '<span class="t-date">' + esc(dates) + '</span></div>' + cards + '</div>';
      liveCount += ms.filter(m => m.state === 'in').length;
    }
    el.innerHTML = html;
    $('liveMeta').textContent = liveCount + ' partidos en vivo de ' + allMatches().filter(m => m.state === 'in').length + ' en total';
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
      return '<a class="news-card" href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">' +
        '<div class="news-head"><span class="news-source">' + esc(it.source) + '</span>' + time + '</div>' +
        '<div class="news-title">' + esc(it.title) + '</div>' + desc + '</a>';
    }).join('');
    el.innerHTML = html;
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
    const pts = livePoints(m);
    const rows = comps.map(p => playerRow(p, m, pts)).join('');
    const note = m.notes && m.state === 'post' ? '<div class="note">' + esc(m.notes) + '</div>' : '';
    const suspNote = m.suspended ? '<div class="note susp-note">' + esc(m.suspReason || 'Partido suspendido') + '</div>' : '';
    const time = m.state === 'pre' ? '<span class="time">' + fmtTime(m.date) + '</span>' : '';
    let h2hBtn = '';
    let statsBtn = '';
    if (m.tour === 'itf') {
      h2hBtn = m.teId ? '<button class="itf-h2h" data-teid="' + esc(m.teId) + '">H2H ' + esc(m.h2h || '0-0') + '</button>' : '';
    } else if (comps.length === 2 && m.state !== 'in') {
      const p1n = comps[0].name || '';
      const p2n = comps[1].name || '';
      if (p1n && p2n) {
        h2hBtn = '<button class="m-h2h" data-p1="' + esc(p1n) + '" data-p2="' + esc(p2n) + '">H2H</button>';
        statsBtn = '<button class="m-stats" data-p1="' + esc(p1n) + '" data-p2="' + esc(p2n) + '">STATS</button>';
      }
    }
    const itfInfo = m.tour === 'itf'
      ? '<div class="itf-info"><span class="itf-time">' + esc(m.itfTime || '') + '</span>' + h2hBtn + '</div>'
      : ((h2hBtn || statsBtn) ? '<div class="m-h2h-wrap">' + h2hBtn + statsBtn + '</div>' : '');
    const points = pts ? '<div class="live-points">' +
      '<span class="lp-label">PUNTO</span>' +
      '<span class="lp-score' + (pointPair(pts.g0, pts.g1) === 'DEUCE' ? ' deuce' : '') + '">' + esc(pointPair(pts.g0, pts.g1) || '—') + '</span>' +
      (pts.serverName ? '<span class="lp-srv">&middot; Saca ' + esc(pts.serverName.split(' ')[0]) + '</span>' : '') +
      '</div>' : '';
    return '<div class="' + cls + '">' +
      '<div class="m-top"><span class="round">' + esc(ROUND_LABEL[m.round] || m.round) + '</span>' + statusBadge(m) + period + '</div>' +
      rows +
      '<div class="scores">' + note + suspNote + time + '</div>' + itfInfo + points + '</div>';
  }

  function playerRow(p, m, pts) {
    const flag = flagImg(p.flag, p.flagAlt);
    const serving = pts && pts.serverName && matchLiveName(norm(p.name), norm(pts.serverName));
    const ball = serving ? '<span class="serve-ball"></span>' : '';
    const seed = findSeed(p.name, circuitOf(m));
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
    sel.innerHTML = tours.map(t => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('');
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
      const ta = tourOf(ms[0]) === 'atp' ? 'a' : 'w';
      const [r1] = a.split('|'), [r2] = b.split('|');
      const ia = ROUND_ORDER.indexOf(r1), ib = ROUND_ORDER.indexOf(r2);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || (a < b ? -1 : 1);
    });

    const tour = allTournaments().find(t => t.id === state.drawTournamentId);
    const drawTypes = new Set(ms.map(m => m.type));
    $('drawMeta').textContent = (tour ? tour.name + ' · ' : '') + Array.from(drawTypes).join(' / ') + ' · ' + ms.length + ' partidos';

    const cols = keys.map(key => {
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

    el.innerHTML = '<div class="draw-board"><div class="draw-cols">' + cols + '</div></div>';
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
      sourceNote = 'Fuente: ESPN';
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

  function renderRankings() {
    const el = $('rankContent');
    if (state.tour === 'chall' || state.tour === 'itf') {
      el.innerHTML = '<div class="error-box">No hay rankings disponibles para ' + state.tour.toUpperCase() + '.</div>';
      $('rankMeta').textContent = '';
      return;
    }
    const needsDoubles = selectedModes().includes('doubles') && selectedTours().some(t => !state.rankDoubles[t]);
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
    for (const t of selectedTours()) for (const m of selectedModes()) html.push(renderRankSection(t, m));
    el.innerHTML = html.join('');
    const total = selectedTours().length * selectedModes().length;
    $('rankMeta').textContent = 'Rankings · ' + total + ' lista(s)' +
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

  /* ---------------- render: ranking anual (elo) ---------------- */

  function renderElo() {
    const el = $('eloContent');
    if (!state.elo.loaded) { el.innerHTML = '<div class="loading">Cargando ranking Elo...</div>'; return; }
    const q = state.eloSearch;
    const topN = state.eloTop;
    const filterData = (data) => {
      if (!data || !data.length) return [];
      let d = data;
      if (topN > 0) d = d.slice(0, topN);
      if (q) d = d.filter(r => (r.player || '').toLowerCase().indexOf(q) > -1);
      return d;
    };
    const sec = (title, data) => {
      const header = '<div class="rank-section-title">' + title + '</div>';
      const filtered = filterData(data);
      if (!data || !data.length) return header + '<div class="error-box">No hay datos Elo disponibles.</div>';
      if (q && !filtered.length) return header + '<div class="error-box">No se encontraron jugadores que coincidan con "' + esc(q) + '" en ' + title + '.</div>';
      const rows = filtered.map(r => {
        return '<tr>' +
          '<td class="r-r">' + esc(r.rank) + '</td>' +
          '<td class="r-name">' + esc(r.player) + '</td>' +
          '<td class="r-r">' + esc(r.age) + '</td>' +
          '<td class="r-r elo-main">' + esc(r.elo) + '</td>' +
          '</tr>';
      }).join('');
      return header +
        '<div class="rank-table-wrap"><table class="rank-table elo-table">' +
        '<thead><tr><th>#</th><th>Jugador</th><th>Edad</th><th>Puntos</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    };
    const showAtp = state.eloTab === 'todos' || state.eloTab === 'atp';
    const showWta = state.eloTab === 'todos' || state.eloTab === 'wta';
    let html = '';
    if (showAtp) html += sec('ATP Singles', state.elo.atp);
    if (showWta) html += sec('WTA Singles', state.elo.wta);
    el.innerHTML = html || '<div class="error-box">Sin datos.</div>';
    const atpCount = showAtp && state.elo.atp ? filterData(state.elo.atp).length : 0;
    const wtaCount = showWta && state.elo.wta ? filterData(state.elo.wta).length : 0;
    const parts = [];
    if (showAtp) parts.push(atpCount + ' jugadores ATP');
    if (showWta) parts.push(wtaCount + ' jugadores WTA');
    $('eloMeta').textContent = parts.join(' · ') + (q ? ' · buscando "' + q + '"' : '');
  }

  /* ---------------- render: players ---------------- */

  function taSlug(name) {
    return (name || '').replace(/[^a-zA-Z\s'-]/g, '').replace(/[\s'-]+/g, '').split('').map((c, i) => {
      if (i === 0 || name[i - 1] === ' ' || name[i - 1] === '-' || name[i - 1] === "'") return c.toUpperCase();
      return c.toLowerCase();
    }).join('');
  }

  async function refreshBirthdays() {
    try {
      const url = useLocalBackend() ? 'api/birthdays' : 'birthdays.json';
      const j = await fetchJson(url).catch(() => null);
      if (j && j.ok) { state.birthdays = { data: j, loaded: true }; } else { state.birthdays = { data: null, loaded: true }; }
    } catch (_) { state.birthdays = { data: null, loaded: true }; }
    if (state.tab === 'birthdays') renderBirthdays();
  }

  function renderBirthdays() {
    const el = $('birthdaysContent');
    const meta = $('birthdaysMeta');
    const bd = state.birthdays;
    if (!bd.loaded || !bd.data) { el.innerHTML = '<div class="loading">Cargando cumpleaños...</div>'; return; }
    let players = bd.data.players || [];
    if (state.bdTab === 'atp') players = players.filter(p => p.gender === 'M');
    else if (state.bdTab === 'wta') players = players.filter(p => p.gender === 'W');
    const active = players.filter(p => p.currentRank > 0);
    const inactive = players.filter(p => !p.currentRank);
    if (meta) meta.textContent = bd.data.date + ' · ' + players.length + ' cumpleañeros';
    let html = '';
    if (active.length) {
      html += '<div class="tour-block"><div class="tour-head"><span class="tour-label">ACTIVOS</span></div>';
      html += '<div class="bd-table"><table class="elo-table"><thead><tr><th>#</th><th>Jugador</th><th>País</th><th>Edad</th><th>Ranking Actual</th><th>Mejor Ranking</th></tr></thead><tbody>';
      active.forEach((p, i) => {
        const slug = taSlug(p.name);
        const isW = p.gender === 'W';
        const url = isW ? 'https://www.tennisabstract.com/cgi-bin/wplayer.cgi?p=' + slug : 'https://www.tennisabstract.com/cgi-bin/player.cgi?p=' + slug;
        const genderBadge = isW ? '<span class="gender-badge gender-w">W</span>' : '<span class="gender-badge gender-m">M</span>';
        html += '<tr><td>' + (i + 1) + '</td><td>' + genderBadge + ' <a href="' + url + '" target="_blank" class="ta-link">' + esc(p.name) + '</a></td><td>' + esc(p.country) + '</td><td>' + p.age + '</td><td>' + (p.currentRank || '-') + '</td><td>' + (p.peakRank || '-') + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
    }
    if (inactive.length) {
      html += '<div class="tour-block"><div class="tour-head"><span class="tour-label">RETIRADOS / HISTÓRICOS</span></div>';
      html += '<div class="bd-table"><table class="elo-table"><thead><tr><th>#</th><th>Jugador</th><th>País</th><th>Edad</th><th>Mejor Ranking</th></tr></thead><tbody>';
      inactive.forEach((p, i) => {
        const slug = taSlug(p.name);
        const isW = p.gender === 'W';
        const url = isW ? 'https://www.tennisabstract.com/cgi-bin/wplayer.cgi?p=' + slug : 'https://www.tennisabstract.com/cgi-bin/player.cgi?p=' + slug;
        const genderBadge = isW ? '<span class="gender-badge gender-w">W</span>' : '<span class="gender-badge gender-m">M</span>';
        html += '<tr><td>' + (i + 1) + '</td><td>' + genderBadge + ' <a href="' + url + '" target="_blank" class="ta-link">' + esc(p.name) + '</a></td><td>' + esc(p.country) + '</td><td>' + p.age + '</td><td>' + (p.peakRank || '-') + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
    }
    if (!html) html = '<div class="loading">No hay cumpleaños de hoy.</div>';
    el.innerHTML = html;
  }

  async function refreshCurrentTour() {
    try {
      const url = useLocalBackend() ? 'api/current-tour' : 'current-tour.json';
      const j = await fetchJson(url).catch(() => null);
      if (j && j.ok) { state.currentTour = { ...state.currentTour, data: j, loaded: true }; }
      else { state.currentTour = { ...state.currentTour, loaded: true }; }
    } catch (_) { state.currentTour = { ...state.currentTour, loaded: true }; }
    if (state.tab === 'currenttour') render();
  }

  async function refreshWheelchair() {
    try {
      const url = useLocalBackend() ? 'api/wheelchair' : 'wheelchair.json';
      const j = await fetchJson(url).catch(() => null);
      if (j && j.ok) { state.wheelchair = { ...state.wheelchair, data: j, loaded: true }; }
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

  function renderCurrentTour() {
    const el = $('ctContent');
    const meta = $('ctMeta');
    const ct = state.currentTour;
    if (!ct.loaded || !ct.data) { el.innerHTML = '<div class="loading">Cargando torneos actuales...</div>'; return; }
    const t = ct.data.tour || {};
    const list = t[ct.tab] || [];
    if (meta) meta.textContent = 'Actualizado: ' + (ct.data.updated || '--');
    if (!list.length) { el.innerHTML = '<div class="loading">No hay torneos activos en esta categoría.</div>'; return; }
    let html = '';
    list.forEach(tour => {
      html += '<div class="ct-card">';
      html += '<div class="ct-card-head"><a href="' + esc(tour.url) + '" target="_blank" class="ta-link">' + esc(tour.name) + '</a></div>';
      html += '<div class="ct-card-fav">Favorito: <b>' + esc(tour.favorite) + '</b> (' + tour.favoritePct + '%)</div>';
      if (tour.detail) {
        if (tour.detail.completed) {
          const cHtml = tour.detail.completed;
          if (cHtml && cHtml.trim() && cHtml.trim() !== '&nbsp;') {
            html += '<div class="ct-section"><div class="ct-section-title">Resultados</div>';
            html += '<div class="ct-matches">' + cHtml + '</div></div>';
          }
        }
        if (tour.detail.upcoming) {
          const uHtml = tour.detail.upcoming;
          if (uHtml && uHtml.trim() && uHtml.trim() !== '&nbsp;') {
            html += '<div class="ct-section"><div class="ct-section-title">Próximos partidos</div>';
            html += '<div class="ct-matches">' + uHtml + '</div></div>';
          }
        }
        if (tour.detail.forecast) {
          html += '<div class="ct-section"><div class="ct-section-title">Forecast</div>';
          html += '<div class="ct-forecast">' + tour.detail.forecast + '</div></div>';
        }
      }
      html += '</div>';
    });
    el.innerHTML = html;
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
    const labels = { menSingles: 'Singles Men', womenSingles: 'Singles Women', menDoubles: 'Doubles Men', womenDoubles: 'Doubles Women', quad: 'Quad Singles' };
    if (!rankData || !rankData.length) { el.innerHTML = '<div class="error-box">No hay ranking disponible para esta categoría.</div>'; return; }
    const hasPoints = rankData[0] && rankData[0].points != null;
    const hasRecord = rankData[0] && rankData[0].record2026;
    const hasTitles = rankData[0] && rankData[0].titles2026 != null;
    const thPoints = hasPoints ? '<th style="text-align:right">Puntos</th>' : '';
    const thRecord = hasRecord ? '<th>W-L 2026</th>' : '';
    const thTitles = hasTitles ? '<th>Títulos</th>' : '';
    const rows = rankData.map(r => {
      const pts = r.points != null ? r.points.toLocaleString('es') : '—';
      const rankCls = r.rank === 1 ? 'r-rank top1' : 'r-rank';
      return '<tr>' +
        '<td class="' + rankCls + '">' + esc(r.rank) + '</td>' +
        '<td class="r-name">' + flagEmoji(r.country) + ' ' + esc(r.name) + ' <span class="wc-country">(' + esc(r.country) + ')</span></td>' +
        (hasTitles ? '<td class="r-r">' + esc(r.titles2026 != null ? r.titles2026 : '—') + '</td>' : '') +
        (hasRecord ? '<td>' + esc(r.record2026 || '—') + '</td>' : '') +
        (hasPoints ? '<td class="r-pts">' + pts + '<span> pts</span></td>' : '') +
        '</tr>';
    }).join('');
    el.innerHTML = '<div class="rank-section-title">' + (labels[tab] || tab) + ' Rankings</div>' +
      '<div class="rank-table-wrap"><table class="rank-table">' +
      '<thead><tr><th>#</th><th>Jugador' + (hasTitles ? '</th><th>Títulos</th>' : '') +
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
    else if (state.tab === 'elo') renderElo();
    else if (state.tab === 'players') renderPlayers();
    else if (state.tab === 'h2hsearch') renderH2HSearch();
    else if (state.tab === 'birthdays') renderBirthdays();
    else if (state.tab === 'calendar') renderCalendar();
    else if (state.tab === 'currenttour') renderCurrentTour();
    else if (state.tab === 'wheelchair') renderWheelchair();
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.body.classList.toggle('tab-calendar', tab === 'calendar');
    document.body.classList.toggle('tab-argentina', tab === 'argentina');
    document.body.classList.toggle('tab-elo', tab === 'elo');
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
    if (tab === 'elo' && !state.elo.loaded) {
      render();
      refreshElo();
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
    if (tab === 'birthdays' && !state.birthdays.loaded) {
      render();
      refreshBirthdays();
      return;
    }
    if (tab === 'currenttour' && !state.currentTour.loaded) {
      render();
      refreshCurrentTour();
      return;
    }
    if (tab === 'wheelchair' && !state.wheelchair.loaded) {
      render();
      refreshWheelchair();
      return;
    }
    render();
    if ((tab === 'rankings' || tab === 'argentina' || tab === 'draws' || tab === 'tournaments' || tab === 'news' || tab === 'videos' || tab === 'elo') && !state.matches.length) {
      refreshAll();
    }
  }

  /* ---------------- clock & countdown ---------------- */

  function tickClock() {
    $('clock').textContent = new Date().toLocaleTimeString('es');
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
        if (!state.h2hCache) {
          state.h2hCache = await fetchJson('h2h_cache.json').catch(() => ({ pairs: {} }));
        }
        const key1 = p1.toLowerCase().replace(/ /g, '') + '::' + p2.toLowerCase().replace(/ /g, '');
        const key2 = p2.toLowerCase().replace(/ /g, '') + '::' + p1.toLowerCase().replace(/ /g, '');
        const cached = (state.h2hCache.pairs || {})[key1] || (state.h2hCache.pairs || {})[key2];
        if (cached) { j = cached; }
        else {
          body.innerHTML = '<div class="error-box">H2H no disponible para este partido en la version web. Intenta con la version local.</div>';
          return;
        }
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
        const rp1 = resolveNameClient(p1);
        const rp2 = resolveNameClient(p2);
        if (!rp1) throw new Error('no-encontrado:' + p1);
        if (!rp2) throw new Error('no-encontrado:' + p2);
        const q2norm = rp2.toLowerCase().replace(/[^a-z\u00C0-\u024F\s]/g, '').replace(/\s+/g, ' ').trim();
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
        if (!result.meetings || !result.meetings.length) return { ok: false, error: 'No se encontraron partidos entre ellos.' };
        let wins = 0;
        const nSelf = rp1.toLowerCase();
        for (const mt of result.meetings) if ((mt.winner || '').toLowerCase().indexOf(nSelf.split(' ').pop()) > -1) wins++;
        return { ok: true, p1: result.realName || rp1, p2: rp2, h2h: wins + '-' + (result.meetings.length - wins), source: 'tennisabstract', meetings: result.meetings };
      }
        if (!text || text.indexOf('<tr') < 0) throw new Error('sin-datos');
        j = parseTaFragClient(text, rp1, rp2);
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
      renderDraws();
    });

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

    const segElo = document.getElementById('segElo');
    if (segElo) {
      segElo.addEventListener('click', e => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        state.eloTab = b.dataset.elotab;
        document.querySelectorAll('#segElo .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        render();
      });
    }
    const segEloTop = document.getElementById('segEloTop');
    if (segEloTop) {
      segEloTop.addEventListener('click', e => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        state.eloTop = parseInt(b.dataset.elotop, 10) || 0;
        document.querySelectorAll('#segEloTop .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        render();
      });
    }
    const eloSearch = $('eloSearch');
    if (eloSearch) {
      eloSearch.addEventListener('input', () => {
        state.eloSearch = eloSearch.value.toLowerCase().trim();
        render();
      });
      const eloClear = $('eloSearchClear');
      if (eloClear) eloClear.addEventListener('click', () => {
        eloSearch.value = '';
        state.eloSearch = '';
        render();
        eloSearch.focus();
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
    const segBirthdays = document.getElementById('segBirthdays');
    if (segBirthdays) {
      segBirthdays.addEventListener('click', e => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        state.bdTab = b.dataset.bdtab;
        document.querySelectorAll('#segBirthdays .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        renderBirthdays();
      });
    }
    const segCT = document.getElementById('segCT');
    if (segCT) {
      segCT.addEventListener('click', e => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        state.currentTour.tab = b.dataset.ct;
        document.querySelectorAll('#segCT .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        renderCurrentTour();
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
    document.addEventListener('click', e => {
      const itfBtn = e.target.closest('.itf-h2h');
      if (itfBtn) { openH2H(itfBtn.getAttribute('data-teid')); return; }
      const h2hBtn = e.target.closest('.m-h2h');
      if (h2hBtn) { openH2HByName(h2hBtn.getAttribute('data-p1'), h2hBtn.getAttribute('data-p2')); return; }
      const statsBtn = e.target.closest('.m-stats');
      if (statsBtn) { openStats(statsBtn.getAttribute('data-p1'), statsBtn.getAttribute('data-p2')); }
    });

    let savedTheme = 'oscuro';
    try { savedTheme = localStorage.getItem('mhc-theme') || 'oscuro'; } catch (e) {}
    applyTheme(savedTheme);
    $('themeSelect').value = state.theme;
    $('themeSelect').addEventListener('change', e => applyTheme(e.target.value));

    let savedFont = 'defecto';
    try { savedFont = localStorage.getItem('mhc-font') || 'defecto'; } catch (e) {}
    applyFont(savedFont);
    $('fontSelect').value = state.font;
    $('fontSelect').addEventListener('change', e => applyFont(e.target.value));

    let savedFsize = 'normal';
    try { savedFsize = localStorage.getItem('mhc-fsize') || 'normal'; } catch (e) {}
    applyFsize(savedFsize);
    $('fsizeSelect').value = state.fsize;
    $('fsizeSelect').addEventListener('change', e => applyFsize(e.target.value));

    refreshAll(true);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
