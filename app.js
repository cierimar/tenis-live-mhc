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

  function applyTheme(t) {
    state.theme = t || 'oscuro';
    document.body.setAttribute('data-theme', state.theme);
    try { localStorage.setItem('mhc-theme', state.theme); } catch (e) {}
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
            type: c.type ? c.type.text : '',
            round: c.round ? c.round.displayName : '',
            tournamentId: tid,
            tournamentName: ev.name || '',
            tour: circuit,
            venue: c.venue && c.venue.fullName ? c.venue.fullName : '',
            notes: c.notes && c.notes.text ? c.notes.text : '',
            competitors: (c.competitors || []).map(p => ({
              homeAway: p.homeAway,
              winner: !!p.winner,
              order: p.order,
              name: p.athlete && p.athlete.displayName ? p.athlete.displayName : 'TBD',
              flag: p.athlete && p.athlete.flag ? p.athlete.flag.href : '',
              flagAlt: p.athlete && p.athlete.flag ? p.athlete.flag.alt : '',
              linescores: (p.linescores || []).map(ls => ({
                value: ls.value,
                tiebreak: ls.tiebreak,
                winner: !!ls.winner
              }))
            }))
          });
        }
      }
    }
    return { matches, tournaments: Array.from(tourMap.values()) };
  }

  async function refreshScoreboards() {
    const [atp, wta] = await Promise.all([
      fetchJson(ESPN + '/atp/scoreboard'),
      fetchJson(ESPN + '/wta/scoreboard')
    ]);
    const a = normalizeScoreboard(atp, 'atp');
    const w = normalizeScoreboard(wta, 'wta');
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
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (Array.isArray(raw && raw.matches)) {
      for (const m of raw.matches) {
        out.push({
          status: m.status,
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
        if (m.Type !== 'singles') continue;
        out.push({
          status: m.MatchStatus,
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
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    for (const t of (j.tournaments || [])) {
      tournaments.push({ id: t.id, name: t.name, date: t.date, status: null, previousWinners: [] });
      for (const m of (t.matches || [])) {
        matches.push({
          id: m.id,
          date: null,
          state: m.state || 'pre',
          period: null,
          type: m.type || "Men's Singles",
          round: m.round || '',
          tournamentId: t.id,
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

  function parseItf(j) {
    const matches = [], tournaments = [];
    for (const t of (j.tournaments || [])) {
      tournaments.push({ id: t.id, name: t.name, date: null, status: null, previousWinners: [] });
      for (const m of (t.matches || [])) {
        const sex = t.cat === 'm' ? 'Men' : 'Women';
        const inPlay = !!m.score && m.score.trim() !== '0-0';
        matches.push({
          id: t.id + '-' + (m.p1 || 'x') + '-' + (m.p2 || 'x'),
          date: null,
          state: inPlay ? 'in' : 'pre',
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
          itfScore: m.score,
          itfTime: m.time
        });
      }
    }
    return { matches, tournaments };
  }

  async function refreshItfLive() {
    if (!useLocalBackend()) { state.itfLive = { tournaments: [], matches: [] }; return; }
    try {
      const j = await fetchJson('api/itf/live');
      state.itfLive = parseItf(j);
    } catch (err) {
      state.itfLive = { tournaments: [], matches: [] };
    }
  }

  function livePoints(m) {
    if (m.state !== 'in' || m.type !== "Men's Singles") return null;
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const names = m.competitors.map(p => norm(p.name)).filter(Boolean);
    if (names.length < 2) return null;
    const hit = [...state.atpLive, ...state.challPoints].find(e => e.status === 'P' &&
      (e.p1 === names[0] || e.p1 === names[1] || e.p2 === names[0] || e.p2 === names[1]));
    if (!hit) return null;
    const side0 = hit.p1 === names[0] && hit.p2 === names[1];
    const g0 = side0 ? hit.g1 : hit.g2;
    const g1 = side0 ? hit.g2 : hit.g1;
    const serverName = hit.server === 1 ? hit.p1 : hit.server === 2 ? hit.p2 : '';
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
      fetchJson('rankings/atp_doubles.json'),
      fetchJson('rankings/wta_doubles.json')
    ]);
    state.rankDoubles.atp = atp;
    state.rankDoubles.wta = wta;
  }

  async function refreshAll(force) {
    if (state.refreshing) return;
    state.refreshing = true;
    try {
      await Promise.all([refreshScoreboards(), refreshRankingsSingles(), refreshAtpLive(), refreshChallLive()]);
      if (useLocalBackend()) {
        refreshItfLive().then(() => {
          if (state.tab === 'live' || state.tab === 'tournaments') render();
        });
      }
      const wantsDoubles = state.mode === 'doubles' || state.mode === 'todos';
      if (state.tab === 'rankings' && wantsDoubles) {
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
    return state.itfLive && state.itfLive.matches ? [...state.matches, ...state.itfLive.matches] : [...state.matches];
  }
  function allTournaments() {
    return state.itfLive && state.itfLive.tournaments ? [...state.tournaments, ...state.itfLive.tournaments] : [...state.tournaments];
  }
  function filteredMatches() {
    const types = new Set(selectedTypes());
    return allMatches().filter(m => types.has(m.type));
  }
  function filteredTournaments() {
    const types = new Set(selectedTypes());
    const ids = new Set(allMatches().filter(m => types.has(m.type)).map(m => m.tournamentId));
    return allTournaments().filter(t => ids.has(t.id));
  }

  /* ---------------- render: live ---------------- */

  function statusBadge(m) {
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
      const tour = state.tournaments.find(t => t.id === tid);
      const name = tour ? tour.name : (ms[0].tournamentName || 'Torneo');
      const dates = tour && tour.date ? fmtDate(tour.date) : '';
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
    const w = m.state === 'in' ? 0 : m.state === 'pre' ? 1 : 2;
    return w;
  }

  function matchCard(m) {
    const comps = m.competitors.slice().sort((a, b) => (a.homeAway === 'home' ? -1 : 1) - (b.homeAway === 'home' ? -1 : 1));
    const cls = m.state === 'in' ? 'match live' : m.state === 'post' ? 'match finished' : 'match upcoming';
    const period = m.state === 'in' && m.period ? '<span class="period">SET ' + m.period + '</span>' : '';
    const rows = comps.map(p => playerRow(p, m)).join('');
    const note = m.notes && m.state === 'post' ? '<div class="note">' + esc(m.notes) + '</div>' : '';
    const time = m.state === 'pre' ? '<span class="time">' + fmtTime(m.date) + '</span>' : '';
    const itfInfo = m.tour === 'itf'
      ? '<div class="itf-info"><span class="itf-time">' + esc(m.itfTime || '') + '</span>' +
        (m.itfScore ? '<span class="itf-score">' + esc(m.itfScore) + '</span>' : '') +
        (m.round ? '<span class="itf-round">' + esc(m.round) + '</span>' : '') + '</div>' : '';
    const pts = livePoints(m);
    const points = pts ? '<div class="live-points">' +
      '<span class="lp-label">PUNTO</span>' +
      '<span class="lp-score' + (pointPair(pts.g0, pts.g1) === 'DEUCE' ? ' deuce' : '') + '">' + esc(pointPair(pts.g0, pts.g1) || '—') + '</span>' +
      (pts.serverName ? '<span class="lp-srv">&middot; Saca ' + esc(pts.serverName.split(' ')[0]) + '</span>' : '') +
      '</div>' : '';
    return '<div class="' + cls + '">' +
      '<div class="m-top"><span class="round">' + esc(ROUND_LABEL[m.round] || m.round) + '</span>' + statusBadge(m) + period + '</div>' +
      rows +
      '<div class="scores">' + note + time + '</div>' + itfInfo + points + '</div>';
  }

  function playerRow(p, m) {
    const flag = flagImg(p.flag, p.flagAlt);
    const sets = p.linescores.map((ls, i) => {
      const liveSet = m.state === 'in' && i === p.linescores.length - 1;
      const cls = 'set' + (ls.winner ? ' win' : '') + (liveSet ? ' live-set' : '');
      const txt = ls.value != null ? ls.value : '';
      const tb = ls.tiebreak ? '<span class="tb">(' + ls.tiebreak + ')</span>' : '';
      return '<span class="' + cls + '">' + txt + tb + '</span>';
    }).join('');
    return '<div class="player-row"><span class="flag">' + flag + '</span>' +
      '<span class="pname' + (p.winner ? ' winner' : '') + '">' + esc(p.name) + '</span>' +
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
      const st = live ? '<span class="tc-status live">● EN CURSO</span>' : (upcoming ? '<span class="tc-status now">PROXIMO</span>' : '<span class="tc-status done">FINALIZADO</span>');
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
        const st = m.state === 'in' ? '<div class="dm-status" style="color:var(--live)">● EN VIVO SET ' + (m.period || '') + '</div>'
          : m.state === 'pre' ? '<div class="dm-status">' + fmtTime(m.date) + '</div>' : '';
        return '<div class="draw-match' + (m.state === 'in' ? ' live' : '') + '">' + rows + st + '</div>';
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

    const rows = data.map((r, i) => {
      const name = r.name || r.athleteName || '—';
      const flag = mode === 'singles' ? r.flag : flagUrl(r.flag);
      const pts = r.points != null ? Math.round(r.points).toLocaleString('es') : '—';
      const rankTxt = r.rankRaw || r.rank;
      const rankCls = i === 0 ? 'r-rank top1' : 'r-rank';
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
    $('rankMeta').textContent = 'Rankings · ' + total + ' lista(s)';
  }

  /* ---------------- render dispatcher ---------------- */

  function render() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('view-' + state.tab).classList.add('active');
    if (state.tab === 'live') renderLive();
    else if (state.tab === 'tournaments') renderTournaments();
    else if (state.tab === 'draws') renderDraws();
    else if (state.tab === 'rankings') renderRankings();
    else if (state.tab === 'calendar') renderCalendar();
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.body.classList.toggle('tab-calendar', tab === 'calendar');
    if (tab === 'calendar' && !state.cal.loaded) {
      render();
      refreshCalendar();
      return;
    }
    render();
    if ((tab === 'rankings' || tab === 'draws' || tab === 'tournaments') && !state.matches.length) {
      refreshAll();
    }
  }

  /* ---------------- clock & countdown ---------------- */

  function tickClock() {
    $('clock').textContent = new Date().toLocaleTimeString('es');
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

  /* ---------------- wiring ---------------- */

  function init() {
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
