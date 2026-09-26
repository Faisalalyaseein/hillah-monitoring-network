/* Hillah River System - Monitoring Network (draft showcase)
   Plain Leaflet app. Data: data/*.js (exported read-only from CWRM_Master_v1.gpkg). No build step. */
(function () {
'use strict';
const D = window.CWRM;
const C = { navy: '#0B3C5D', blue: '#1F5FA8', hrs: '#174A8B', canal: '#3AA6D6', drain: '#B5651D', mod: '#7A3E0B', ag: '#1E4D0F', dead: '#8C8C8C', p1: '#E8710A', p2: '#2A9D8F', p3: '#7B8794', alert: '#C62828', ok: '#2A9D8F', gov: '#5B5B5B' };
const PCOL = { 1: C.p1, 2: C.p2, 3: C.p3 };
const PLAB = { 1: '1st priority', 2: '2nd priority', 3: '3rd priority' };
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NA = '<span class="na">Not available - to be provided</span>';
const hav = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r; const x = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }; // lat1,lng1,lat2,lng2 -> km
const hav2 = (a, b, c, d) => hav(a, b, c, d);

/* ---------------- stations ---------------- */
const S = D.stations.features.map(f => Object.assign({}, f.properties, { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }));
const byId = Object.fromEntries(S.map(s => [s.id, s]));
S.forEach(s => {
  const x = (D.extra || {})[s.id] || {};
  ['institution', 'parametersCurrent', 'parametersProposed', 'telemetry', 'statusText', 'justification'].forEach(k => { if (x[k]) s[k] = x[k]; });
  if (x.photos && x.photos.length) s.photos = (s.photos || []).concat(x.photos);
  if (!s.justification) s.justification = s.status === 'proposed' ? s.role : (s.linkNote || null);
  s.reqs = ((s.requirements || '').match(/\b(VII|VI|IV|V|III|II|I)\b(?=\s*\()/g) || []);
});
const EXIST = S.filter(s => s.status === 'existing');
S.forEach(s => { s.nearEx = s.status === 'proposed' ? Math.min(...EXIST.map(e => hav(s.lat, s.lng, e.lat, e.lng))) : null; s.gapSite = s.status === 'proposed' && s.nearEx > 2; });
const linkTarget = (s) => s.linked || ((s.linkNote || '').match(/\b((?:H|DA|DI)-\d\d)\b/) || [])[1] || null;
const ORDER = S.slice().sort((a, b) => (a.status === b.status ? 0 : a.status === 'existing' ? -1 : 1) || (a.riverKm ?? 0) - (b.riverKm ?? 0) || a.id.localeCompare(b.id));
const REQ = { I: 'Boundary of the system (upstream / downstream)', II: 'Mandatory offtake / distribution point', III: 'Urban area (upstream / downstream)', IV: 'Density node (spacing)', V: 'Administrative boundary metering', VI: 'Abstraction / sewage impact', VII: 'Regulator / mixing reference' };

/* ---------------- map ---------------- */
const map = L.map('map', { zoomControl: false, minZoom: 6, maxZoom: 18, preferCanvas: true, attributionControl: true }).fitBounds([[31.35, 44.15], [32.85, 45.7]]);
L.control.zoom({ position: 'topleft' }).addTo(map);
L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
['network', 'reaches', 'gaps'].forEach((n, i) => { map.createPane(n).style.zIndex = 420 + i * 10; });
map.getPane('network').style.pointerEvents = 'auto';
const cv = L.canvas({ padding: 0.5, pane: 'network' }), cvR = L.canvas({ padding: 0.5, pane: 'reaches' }), cvG = L.canvas({ padding: 0.5, pane: 'gaps' });
const BASE = {
  light: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 16 }),
  streets: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }),
  imagery: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 19 })
};
let curBase = 'light'; BASE.light.addTo(map);

/* ---- network layers ---- */
const feats = (fc, fn) => ({ type: 'FeatureCollection', features: fc.features.filter(fn) });
const isDead = (s) => s === 'Non Functioning' || s === 'Abandoned';
const cls = (c) => (c == null ? 4 : c);
const net = []; // {layer, overlay, minZoom}
function addNet(fc, overlay, minZoom, style, popup) {
  if (!fc.features.length) return;
  const layer = L.geoJSON(fc, { style: () => style, renderer: cv, pane: 'network', onEachFeature: (f, l) => { if (popup) l.bindPopup(() => popup(f.properties), { closeButton: false }); } });
  net.push({ layer, overlay, minZoom });
}
const canalPopup = (p) => `<b>${esc(p.n || 'Irrigation canal')}</b><br>Class code ${p.c ?? '-'} &middot; ${p.l != null ? (+p.l).toFixed(2) : '-'} km<br>Status: ${esc(p.s || 'not surveyed')}`;
const drainPopup = (p) => `<b>${esc(p.n || 'Drain')}</b>${p.m ? ' (Main Outfall Drain)' : ''}<br>Class code ${p.c ?? '-'} &middot; ${p.l != null ? (+p.l).toFixed(2) : '-'} km<br>Status: ${esc(p.s || 'not surveyed')}`;
const cf = D.canals;
addNet(feats(cf, f => isDead(f.properties.s)), 'canals', 12, { color: C.dead, weight: 1.1, dashArray: '1 4', opacity: .9 }, canalPopup);
[[c => c <= 1, 3.2, 8], [c => c === 2, 2.2, 9], [c => c === 3, 1.5, 10], [c => c >= 4, 1.05, 12]].forEach(([t, w, z]) => addNet(feats(cf, f => !isDead(f.properties.s) && t(cls(f.properties.c))), 'canals', z, { color: C.canal, weight: w, opacity: .95 }, canalPopup));
const df = D.drains;
const under = (f) => /under construction/i.test(f.properties.n || '');
addNet(feats(df, f => isDead(f.properties.s) && !f.properties.m), 'drains', 12, { color: C.dead, weight: 1.1, dashArray: '1 4' }, drainPopup);
addNet(feats(df, f => under(f) && !f.properties.m), 'drains', 9, { color: C.drain, weight: 2.4, dashArray: '8 5' }, drainPopup);
[[f => f.properties.j && !f.properties.m, 4, 8], [f => !f.properties.j && !f.properties.m && cls(f.properties.c) <= 2, 2.6, 9], [f => !f.properties.j && !f.properties.m && cls(f.properties.c) === 3, 1.7, 10], [f => !f.properties.j && !f.properties.m && cls(f.properties.c) >= 4, 1.05, 12]]
  .forEach(([t, w, z]) => addNet(feats(df, f => !isDead(f.properties.s) && !under(f) && t(f)), 'drains', z, { color: C.drain, weight: w, opacity: .95 }, drainPopup));
addNet(feats(df, f => f.properties.m), 'drains', 0, { color: C.mod, weight: 5, opacity: .95 }, drainPopup);

const lyGov = L.geoJSON(D.governorates, { pane: 'network', renderer: cv, interactive: false, style: { color: C.gov, weight: 1.3, dashArray: '9 4 2 4', fill: false, opacity: .8 } });
const lyProj = L.geoJSON(D.projects, {
  pane: 'network', renderer: cv,
  style: f => ({ color: C.ag, weight: 2, dashArray: f.properties.status === 'Partially Developed' ? null : '7 5', fillColor: C.ag, fillOpacity: .03, opacity: .9 }),
  onEachFeature: (f, l) => l.bindTooltip(`<b>${esc(f.properties.name)}</b> (${esc(f.properties.code)})<br>${esc(f.properties.status)} &middot; ${Math.round(f.properties.ha).toLocaleString()} ha`, { sticky: true })
});
const lyReach = L.geoJSON(D.reaches, { pane: 'reaches', renderer: cvR, style: { color: C.hrs, weight: 4.2, opacity: 1, lineCap: 'round' }, onEachFeature: (f, l) => l.bindTooltip(`<b>${esc(f.properties.branch)}</b> reach ${f.properties.order} &middot; ${(+f.properties.km).toFixed(1)} km`, { sticky: true }) });
const lyEuph = L.geoJSON(D.euphrates, { pane: 'reaches', renderer: cvR, interactive: false, style: { color: C.blue, weight: 4.2, opacity: .95 } });
const lyMod = L.layerGroup(D.modStations.features.map(f => L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { radius: 6, color: '#fff', weight: 1.5, fillColor: '#6C7A89', fillOpacity: 1 }).bindTooltip(`<b>${esc(f.properties.name)}</b><br>Station along the Main Outfall Drain (source: project KML; status not stated)`)));
const lyRef = L.layerGroup(D.refPoints.features.map(f => L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { radius: 4.5, color: '#fff', weight: 1.2, fillColor: '#8E6FB0', fillOpacity: 1 }).bindTooltip(`<b>${esc(f.properties.name)}</b><br>Project reference point (drain / water user association / village)`)));

/* labels: governorates and rivers */
function ringCenter(g) { const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]); let best = null, ba = -1; rings.forEach(r => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; r.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }); const a = (x1 - x0) * (y1 - y0); if (a > ba) { ba = a; best = [(y0 + y1) / 2, (x0 + x1) / 2]; } }); return best; }
const lyGovLab = L.layerGroup();
D.governorates.features.forEach(f => { const c = ringCenter(f.geometry); if (c && c[0] > 30.4 && c[0] < 33.8 && c[1] > 43.3 && c[1] < 46.8) L.marker(c, { interactive: false, icon: L.divIcon({ className: '', html: `<div class="gov-label" style="white-space:nowrap;transform:translate(-50%,-50%)">${esc(f.properties.en.toUpperCase())}</div>` }) }).addTo(lyGovLab); });
const lyRivLab = L.layerGroup();
(function () {
  const byBranch = {}; D.reaches.features.forEach(f => { const b = f.properties.branch; if (!byBranch[b] || f.properties.km > byBranch[b].km) byBranch[b] = { km: f.properties.km, g: f.geometry }; });
  Object.entries(byBranch).forEach(([b, o]) => { const line = o.g.coordinates[Math.floor(o.g.coordinates.length / 2)]; const pts = line || o.g.coordinates[0]; const p = pts[Math.floor(pts.length / 2)]; L.marker([p[1], p[0]], { interactive: false, icon: L.divIcon({ className: '', html: `<div class="riv-label" style="color:${C.hrs};white-space:nowrap;transform:translate(8px,-14px)">${esc(b)}</div>` }) }).addTo(lyRivLab); });
  const eg = D.euphrates.features[0].geometry.coordinates; const el = eg[Math.floor(eg.length * .55)]; const ep = el[Math.floor(el.length / 2)];
  L.marker([ep[1], ep[0]], { interactive: false, icon: L.divIcon({ className: '', html: `<div class="riv-label" style="color:${C.blue};white-space:nowrap;transform:translate(-70px,-6px)">Euphrates River</div>` }) }).addTo(lyRivLab);
})();

/* ---- overlay switches ---- */
const ON = { reaches: true, euph: true, canals: true, drains: true, proj: false, gov: true, mod: false, ref: false };
function syncNet() {
  const z = map.getZoom();
  net.forEach(n => { const want = ON[n.overlay] && z >= n.minZoom; if (want && !map.hasLayer(n.layer)) n.layer.addTo(map); if (!want && map.hasLayer(n.layer)) map.removeLayer(n.layer); });
  const set = (l, on) => { if (on && !map.hasLayer(l)) l.addTo(map); if (!on && map.hasLayer(l)) map.removeLayer(l); };
  set(lyGov, ON.gov); set(lyGovLab, ON.gov && z <= 10); set(lyProj, ON.proj); set(lyEuph, ON.euph); set(lyMod, ON.mod); set(lyRef, ON.ref);
  set(lyRivLab, (ON.reaches || ON.euph) && z >= 8 && z <= 12);
  set(lyReach, ON.reaches && view !== 'gaps');
  set(gapLayer, ON.reaches && view === 'gaps');
  map.getPane('network').style.opacity = view === 'gaps' ? 0.4 : 0.85;
}
function buildLayerPanel() {
  const el = $('#layers');
  const row = (k, label, sw) => `<label><input type="checkbox" data-k="${k}" ${ON[k] ? 'checked' : ''}>${sw}<span>${label}</span></label>`;
  const line = (c, w = 3, d = '') => `<i class="line" style="border-color:${c};border-top-width:${w}px;${d ? 'border-top-style:dashed' : ''}"></i>`;
  el.innerHTML = `<div class="hd" id="lyHd"><span>Map layers</span><span id="lyCaret">&#9662;</span></div><div class="bd" id="lyBd">
    <h4>Network</h4>${row('reaches', 'Hillah River system (branches)', line(C.hrs, 4))}${row('euph', 'Euphrates River', line(C.blue, 4))}${row('canals', 'Irrigation canals', line(C.canal, 2))}${row('drains', 'Drainage canals (incl. MOD)', line(C.drain, 2))}
    <h4>Context</h4>${row('proj', 'Irrigation projects', line(C.ag, 2, 1))}${row('gov', 'Governorate boundaries', line(C.gov, 1, 1))}
    <h4>Other source points</h4>${row('mod', 'MOD stations (status not stated)', '<i class="line" style="border-color:#6C7A89;border-top-width:6px;width:10px"></i>')}${row('ref', 'Project reference points', '<i class="line" style="border-color:#8E6FB0;border-top-width:6px;width:10px"></i>')}
    <h4>Basemap</h4><div class="bm"><button data-b="light" class="on">Light</button><button data-b="streets">Streets</button><button data-b="imagery">Imagery</button></div>
    <div class="note" style="margin-top:6px">Canals and drains show more detail as you zoom in.</div></div>`;
  el.addEventListener('change', e => { const k = e.target.dataset.k; if (k) { ON[k] = e.target.checked; syncNet(); } });
  el.addEventListener('click', e => {
    const b = e.target.closest('button[data-b]');
    if (b) { map.removeLayer(BASE[curBase]); curBase = b.dataset.b; BASE[curBase].addTo(map).bringToBack(); el.querySelectorAll('.bm button').forEach(x => x.classList.toggle('on', x === b)); }
    if (e.target.closest('#lyHd')) { const bd = $('#lyBd'); bd.style.display = bd.style.display === 'none' ? '' : 'none'; $('#lyCaret').innerHTML = bd.style.display === 'none' ? '&#9656;' : '&#9662;'; }
  });
}

/* ---------------- views ---------------- */
let view = 'master', selected = null, radius = 25;
const F = { status: new Set(['existing', 'proposed']), priority: new Set([1, 2, 3]), branch: new Set(['H', 'DA', 'DI']), req: '', q: '' };
const VIEWS = {
  current: { label: 'Current network', dot: C.navy, title: 'Current network', desc: 'The three existing stage / telemetry stations of the Hillah River system. Source texts and photo captions in the design document show that all three need rehabilitation, relocation or a repaired transmitter.', note: 'Condition is taken from the source status texts and the photo captions of the design document; it should be confirmed on site.', inView: s => s.status === 'existing' },
  gaps: { label: 'Identified gaps', dot: C.alert, title: 'Identified monitoring gaps', desc: 'River stretches beyond the coverage radius of any existing station are shown in red; stretches within it in green. Proposed sites without an existing station nearby are the gap locations to be filled.', note: 'Indicative: straight-line distance to existing stations, radius adjustable. The gap rule is a working assumption to be confirmed.', inView: s => true },
  phase1: { label: 'Phase 1 priorities', dot: C.p1, title: 'Phase 1 priorities', desc: 'Stations of 1st priority. Three of the four sit at or next to an existing station (upgrade / relocation); one (Daghara DS) is a new site. Dashed lines link an existing station to its proposed successor.', note: 'Assumption: Phase 1 = 1st-priority stations of the design (V01). To be confirmed.', inView: s => s.status === 'existing' || s.priority === 1 },
  master: { label: 'Long-term master plan', dot: C.p2, title: 'Long-term master plan', desc: 'The optimised network of 14 proposed stations along the Hillah main channel and the Daghara and Diwaniyah / Rumaitha branches, coloured by implementation priority, with the three existing stations.', note: 'Design: Monitoring network design V01 (2026-08-17), Table 12.', inView: s => true }
};
const pass = (s) => F.status.has(s.status) && (s.status === 'existing' || F.priority.has(s.priority)) && F.branch.has(s.branchKey) && (!F.req || s.reqs.includes(F.req)) &&
  (!F.q || (s.id + ' ' + s.name + ' ' + (s.role || '')).toLowerCase().includes(F.q.toLowerCase()));
const visible = () => ORDER.filter(s => VIEWS[view].inView(s) && pass(s));
const emph = (s) => (view === 'phase1' && s.priority === 1) || (view === 'gaps' && s.gapSite);
function colorOf(s) { if (s.status === 'existing') return C.navy; if (view === 'gaps') return s.gapSite ? C.alert : '#7B8794'; return PCOL[s.priority]; }

/* ---- markers ---- */
const mk = {}; const mkLayer = L.layerGroup().addTo(map);
function icon(s) {
  const ex = s.status === 'existing', size = ex ? 26 : ({ 1: 26, 2: 23, 3: 20 }[s.priority] || 22), col = colorOf(s), sel = selected === s.id;
  const pulse = emph(s) ? `<span class="pulse" style="border-color:${col}"></span>` : '';
  const att = s.attention ? '<span class="att">!</span>' : '';
  const html = `<div class="mk ${sel ? 'sel' : ''}" style="width:${size}px;height:${size}px">${pulse}<svg viewBox="-13 -13 26 26" width="${size}" height="${size}"><path d="M0-10.5L10.5 0L0 10.5L-10.5 0Z" fill="${ex ? C.navy : '#fff'}" stroke="${ex ? '#fff' : col}" stroke-width="${ex ? 2.2 : 3.2}" stroke-linejoin="round"/></svg>${att}</div>`;
  const nudge = (!ex && s.nearEx != null && s.nearEx < 0.5) ? [-15, -12] : [0, 0]; // proposed site at an existing station: draw beside it
  return L.divIcon({ html, className: 'mk-wrap', iconSize: [size, size], iconAnchor: [size / 2 + nudge[0], size / 2 + nudge[1]] });
}
function labelHtml(s) { return map.getZoom() >= 11 ? `${esc(s.id)} &middot; ${esc(s.name)}` : esc(s.id); }
S.forEach(s => { const m = L.marker([s.lat, s.lng], { icon: icon(s), keyboard: true, title: s.id + ' ' + s.name, riseOnHover: true }); m.on('click', () => select(s.id)); m.bindTooltip(labelHtml(s), { permanent: true, direction: 'right', offset: [12, 0], className: 'stn-label' }); mk[s.id] = m; });
const conLayer = L.layerGroup().addTo(map);
const gapLayer = L.layerGroup();

/* ---- coverage / gaps ---- */
let gapStats = { total: 0, covered: 0, gap: 0 };
function computeGaps() {
  gapLayer.clearLayers(); let tot = 0, cov = 0;
  D.reaches.features.forEach(f => {
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    lines.forEach(ln => {
      let run = [], runCov = null;
      const flush = () => { if (run.length > 1) L.polyline(run, { pane: 'gaps', renderer: cvG, color: runCov ? C.ok : C.alert, weight: 6, opacity: .95, dashArray: runCov ? null : '3 8', lineCap: runCov ? 'round' : 'butt' }).bindTooltip(runCov ? `Within ${radius} km of an existing station` : `Beyond ${radius} km of any existing station`, { sticky: true }).addTo(gapLayer); };
      for (let i = 0; i < ln.length - 1; i++) {
        const a = ln[i], b = ln[i + 1], mlat = (a[1] + b[1]) / 2, mlng = (a[0] + b[0]) / 2, len = hav(a[1], a[0], b[1], b[0]);
        const dmin = Math.min(...EXIST.map(e => hav(mlat, mlng, e.lat, e.lng))), c = dmin <= radius;
        tot += len; if (c) cov += len;
        if (runCov === null) { runCov = c; run = [[a[1], a[0]]]; }
        if (c !== runCov) { flush(); runCov = c; run = [[a[1], a[0]]]; }
        run.push([b[1], b[0]]);
      }
      flush();
    });
  });
  EXIST.forEach(e => L.circle([e.lat, e.lng], { radius: radius * 1000, pane: 'gaps', renderer: cvG, color: C.navy, weight: 1.2, dashArray: '4 6', fillColor: C.navy, fillOpacity: .04, interactive: false }).addTo(gapLayer));
  gapStats = { total: tot, covered: cov, gap: tot - cov };
}

/* ---- render ---- */
function stats(vis) {
  const st = (v, l, c = '') => `<div class="stat ${c}"><b>${v}</b><span>${l}</span></div>`;
  const ex = EXIST.length, att = EXIST.filter(s => s.attention).length;
  if (view === 'current') return st(ex, 'Existing stations') + st(att, 'Need rehabilitation / relocation', 'warn') + st(EXIST.filter(s => s.parametersCurrent).length + ' of ' + ex, 'Parameters recorded in source') + st(EXIST.filter(s => /active/i.test(s.telemetry || '') && !/inactive/i.test(s.telemetry || '')).length + ' of ' + ex, 'Transmitter reported active');
  if (view === 'gaps') return st(Math.round(gapStats.gap) + ' km', 'River beyond ' + radius + ' km of an existing station', 'warn') + st(Math.round(100 * gapStats.covered / gapStats.total) + ' %', 'River length within radius', 'good') + st(S.filter(s => s.gapSite).length + ' of 14', 'Proposed sites with no existing station nearby', 'warn') + st(att + ' of ' + ex, 'Existing stations needing rehabilitation', 'warn');
  if (view === 'phase1') { const p1 = S.filter(s => s.priority === 1); return st(p1.length, 'Phase 1 stations (1st priority)') + st(p1.filter(s => !s.gapSite).length, 'At / next to an existing station') + st(p1.filter(s => s.gapSite).length, 'New site') + st(S.filter(s => s.status === 'proposed').length - p1.length, 'Later phases (2nd / 3rd priority)'); }
  const pr = (n) => S.filter(s => s.priority === n).length;
  return st(S.filter(s => s.status === 'proposed').length, 'Proposed stations') + st(pr(1) + ' / ' + pr(2) + ' / ' + pr(3), '1st / 2nd / 3rd priority') + st(ex, 'Existing stations') + st('0 - 212 km', 'Design chainage along the river');
}
function renderList(vis) {
  $('#count').textContent = vis.length + ' of ' + S.filter(s => VIEWS[view].inView(s)).length + ' shown';
  if (!vis.length) { $('#list').innerHTML = '<div id="empty">No station matches the current view and filters.</div>'; return; }
  $('#list').innerHTML = vis.map(s => {
    const col = colorOf(s), ex = s.status === 'existing';
    const sw = `<svg class="sw" viewBox="-13 -13 26 26"><path d="M0-10.5L10.5 0L0 10.5L-10.5 0Z" fill="${ex ? C.navy : '#fff'}" stroke="${ex ? '#fff' : col}" stroke-width="${ex ? 1.5 : 3}"/></svg>`;
    const pills = (s.attention ? '<span class="pill att">Rehabilitate</span> ' : '') + (s.priority ? `<span class="pill p${s.priority}">P${s.priority}</span> ` : '') + (view === 'gaps' && s.gapSite ? '<span class="pill gapp">Gap site</span>' : '');
    return `<div class="item ${selected === s.id ? 'sel' : ''}" data-id="${s.id}">${sw}<div class="t"><b>${esc(s.id)} &middot; ${esc(s.name)}</b><span>${esc(ex ? s.statusText : (s.role || ''))}</span></div><div>${pills}</div></div>`;
  }).join('');
}
function renderLegend() {
  const sym = (fill, stroke, w = 3) => `<svg width="20" height="20" viewBox="-13 -13 26 26"><path d="M0-10.5L10.5 0L0 10.5L-10.5 0Z" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/></svg>`;
  const ln = (c, w, d) => `<svg width="20" height="12"><line x1="0" y1="6" x2="20" y2="6" stroke="${c}" stroke-width="${w}" ${d ? `stroke-dasharray="${d}"` : ''} stroke-linecap="round"/></svg>`;
  const R = (a, b) => `<div class="row">${a}<span>${b}</span></div>`;
  let h = '<h4 class="lg" id="lgH">Stations</h4>' + R(sym(C.navy, '#fff', 2), 'Existing station (! = needs attention)');
  if (view === 'gaps') h += R(sym('#fff', C.alert), 'Gap site - proposed, no existing station nearby') + R(sym('#fff', '#7B8794'), 'Proposed - existing station nearby') + '<h4 style="margin-top:8px">Coverage</h4>' + R(ln(C.ok, 5), `River within ${radius} km of an existing station`) + R(ln(C.alert, 5, '2 8'), 'River beyond that radius');
  else if (view === 'current') { /* existing only */ }
  else if (view === 'phase1') h += R(sym('#fff', C.p1), 'Phase 1 - 1st priority (pulsing)') + R(ln(C.p1, 2, '5 4'), 'Existing station -> proposed successor');
  else h += R(sym('#fff', C.p1), 'Proposed - 1st priority') + R(sym('#fff', C.p2), 'Proposed - 2nd priority') + R(sym('#fff', C.p3), 'Proposed - 3rd priority') + R(ln(C.p1, 2, '5 4'), 'Existing -> proposed successor');
  h += '<h4 style="margin-top:8px">Network</h4>' + R(ln(C.hrs, 4), 'Hillah River system (branches)') + R(ln(C.canal, 2), 'Irrigation canals') + R(ln(C.drain, 2), 'Drainage canals') + R(ln(C.mod, 4), 'Main Outfall Drain');
  $('#legend').innerHTML = h; $('#lgH').onclick = () => $('#legend').classList.toggle('min');
}
function render() {
  const vis = visible(), ids = new Set(vis.map(s => s.id));
  crowded = vis.length > 6; if (typeof lowZoom === 'function') lowZoom();
  if (view === 'gaps') computeGaps();
  mkLayer.clearLayers();
  S.forEach(s => { if (ids.has(s.id)) { mk[s.id].setIcon(icon(s)); mk[s.id].setTooltipContent(labelHtml(s)); mkLayer.addLayer(mk[s.id]); } });
  conLayer.clearLayers();
  if (view === 'phase1' || view === 'master') EXIST.forEach(e => { const t = byId[linkTarget(e)]; if (t && ids.has(e.id) && ids.has(t.id)) L.polyline([[e.lat, e.lng], [t.lat, t.lng]], { color: C.p1, weight: 2.4, dashArray: '5 6', interactive: false }).addTo(conLayer); });
  if (view === 'gaps') { if (!map.hasLayer(gapLayer)) gapLayer.addTo(map); } else if (map.hasLayer(gapLayer)) map.removeLayer(gapLayer);
  syncNet();
  const V = VIEWS[view];
  $('#viewTitle').textContent = V.title; $('#viewDesc').textContent = V.desc; $('#viewNote').textContent = V.note; $('#stats').innerHTML = stats(vis);
  $('#gapctl').hidden = view !== 'gaps';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.v === view));
  renderList(vis); renderLegend();
  if (selected && !ids.has(selected)) closeCard(true); else if (selected) fillCard(true);
  writeHash();
}

/* ---- filters UI ---- */
function chips(id, items, set, get) {
  $(id).innerHTML = items.map(([v, label, dot]) => `<button type="button" class="chip on" data-v="${v}">${dot ? `<i class="dot" style="background:${dot}"></i>` : ''}${label}</button>`).join('');
  $(id).onclick = e => { const b = e.target.closest('.chip'); if (!b) return; const v = get(b.dataset.v); if (set.has(v)) set.delete(v); else set.add(v); b.classList.toggle('on', set.has(v)); render(); };
}
function buildFilters() {
  chips('#fStatus', [['existing', 'Existing', C.navy], ['proposed', 'Proposed', '#fff']], F.status, v => v);
  chips('#fPriority', [['1', '1st', C.p1], ['2', '2nd', C.p2], ['3', '3rd', C.p3]], F.priority, v => +v);
  chips('#fBranch', [['H', 'Hillah main'], ['DA', 'Daghara'], ['DI', 'Diwaniyah / Rumaitha']], F.branch, v => v);
  $('#req').innerHTML = '<option value="">Any requirement</option>' + Object.entries(REQ).map(([k, v]) => `<option value="${k}">${k} - ${v}</option>`).join('');
  $('#req').onchange = e => { F.req = e.target.value; render(); };
  $('#q').oninput = e => { F.q = e.target.value.trim(); render(); };
  $('#reset').onclick = () => { F.status = new Set(['existing', 'proposed']); F.priority = new Set([1, 2, 3]); F.branch = new Set(['H', 'DA', 'DI']); F.req = ''; F.q = ''; $('#q').value = ''; $('#req').value = ''; buildFilters(); render(); };
  $('#radius').oninput = e => { radius = +e.target.value; $('#radiusVal').textContent = radius; render(); };
}
function buildTabs() {
  $('#tabs').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button type="button" class="tab" data-v="${k}"><i style="background:${v.dot}"></i>${v.label}</button>`).join('');
  $('#tabs').onclick = e => { const b = e.target.closest('.tab'); if (b) setView(b.dataset.v); };
}
function setView(v) { view = v; if (selected && !VIEWS[view].inView(byId[selected])) closeCard(true); render(); fitView(); }
function fitView() { const vis = visible(); if (!vis.length) return; const b = L.latLngBounds(vis.map(s => [s.lat, s.lng])); if (view === 'gaps' || view === 'master') map.fitBounds([[31.35, 44.15], [32.85, 45.7]], { padding: [30, 30], animate: true }); else map.fitBounds(b.pad(.35), { maxZoom: 11, animate: true }); }

/* ---------------- station card ---------------- */
let gi = 0;
const dms = (v, pos, neg) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60; return `${d}&deg;${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0')}" ${v >= 0 ? pos : neg}`; };
function row(k, v) { return `<div class="r"><dt>${k}</dt><dd>${v == null || v === '' ? NA : v}</dd></div>`; }
function fillCard(keepPhoto) {
  const s = byId[selected]; if (!s) return; const ex = s.status === 'existing';
  if (!keepPhoto) gi = 0;
  const t = byId[linkTarget(s)];
  const rev = EXIST.filter(e => linkTarget(e) === s.id);
  const badges = [`<span class="pill ${ex ? 'ex' : 'pr'}">${ex ? 'Existing' : 'Proposed'}</span>`, s.priority ? `<span class="pill p${s.priority}">${PLAB[s.priority]}</span>` : '', s.phase ? `<span class="pill ph">${s.phase}</span>` : '', s.attention ? '<span class="pill att">Needs rehabilitation / relocation</span>' : '', view === 'gaps' && s.gapSite ? '<span class="pill gapp">Gap site</span>' : ''].join('');
  $('#cardHead').innerHTML = `<span class="code">${esc(s.id)}</span><h2>${esc(s.name)}</h2><button class="x" id="cx" type="button" aria-label="Close">&times;</button>`;
  const ph = s.photos || [];
  const gal = ph.length ? `<div class="gal"><img class="main" id="gmain" src="${esc(ph[gi].src)}" alt="${esc(s.id)}"><button class="nav l" id="gl" type="button">&#10094;</button><button class="nav r" id="gr" type="button">&#10095;</button><div class="cap">${esc(ph[gi].caption || '')} &middot; ${gi + 1}/${ph.length}</div></div><div class="thumbs">${ph.map((p, i) => `<img src="${esc(p.src)}" data-i="${i}" class="${i === gi ? 'on' : ''}" alt="">`).join('')}</div>` : '<div class="nophoto">No photographs available for this station</div>';
  const coords = `${s.lat.toFixed(5)}&deg; N, ${s.lng.toFixed(5)}&deg; E <button class="linkbtn" id="cp" type="button">copy</button><br><span class="na" style="font-style:normal">${dms(s.lat, 'N', 'S')}, ${dms(s.lng, 'E', 'W')}</span>`;
  const prio = s.priority ? `${PLAB[s.priority]} (${s.phase}${s.phase === 'Phase 1' ? '*' : ''})` : (t ? `Not assigned - see linked site ${esc(t.id)} (${PLAB[t.priority] || ''})` : null);
  const req = s.requirements ? esc(s.requirements) : null;
  $('#cardBody').innerHTML = `<div class="badges">${badges}</div>${gal}${s.photoNote ? `<div class="src" style="margin-top:6px">${esc(s.photoNote)}</div>` : ''}<dl class="fields">
    ${row('Station ID', esc(s.id))}${row('Coordinates', coords)}${row('River position', s.riverKm != null ? `chainage ${s.riverKm} km from D/S Hindiya Barrage (approx., design)` : null)}${row('Branch', esc(s.branch))}
    ${row('Current status', esc(s.statusText))}${row('Responsible institution', s.institution ? esc(s.institution) : null)}
    ${row('Parameters currently measured', ex ? (s.parametersCurrent ? esc(s.parametersCurrent) : null) : '<span class="na">Not applicable - not yet installed</span>')}
    ${row('Parameters proposed', s.parametersProposed ? esc(s.parametersProposed) : null)}
    ${row('Telemetry / data transmission', s.telemetry ? esc(s.telemetry) : null)}
    ${row('Justification for location', s.justification ? esc(s.justification) : null)}${row('Monitoring requirements met', req)}
    ${row('Implementation priority', prio)}${rev.length ? row('Existing station at / near this site', rev.map(e => `<button class="linkbtn" style="padding:0" data-go="${esc(e.id)}">${esc(e.id)} &middot; ${esc(e.name)}</button>${e.linkNote ? '<br><span class="na" style="font-style:normal">' + esc(e.linkNote) + '</span>' : ''}`).join('<br>')) : ''}${t ? row('Linked site', `<button class="linkbtn" style="padding:0" data-go="${esc(t.id)}">${esc(t.id)} &middot; ${esc(t.name)}</button>${s.linkNote ? '<br><span class="na" style="font-style:normal">' + esc(s.linkNote) + '</span>' : ''}`) : ''}
  </dl>${s.attentionBasis ? `<div class="basis"><b>Basis for "needs attention":</b> ${esc(s.attentionBasis)}</div>` : ''}<div class="src">Source: ${esc(s.source)}${s.priority === 1 ? '<br>* Phase 1 = 1st-priority stations (assumption, to be confirmed).' : ''}</div>`;
  $('#cx').onclick = () => closeCard();
  const m = $('#gmain'); if (m) { m.onclick = () => openLb(ph, gi); $('#gl').onclick = () => { gi = (gi + ph.length - 1) % ph.length; fillCard(true); }; $('#gr').onclick = () => { gi = (gi + 1) % ph.length; fillCard(true); }; }
  $('#cardBody').querySelectorAll('.thumbs img').forEach(i => i.onclick = () => { gi = +i.dataset.i; fillCard(true); });
  const cp = $('#cp'); if (cp) cp.onclick = () => { const txt = `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { cp.textContent = 'copied'; }).catch(() => { cp.textContent = txt; }); };
  $('#cardBody').querySelectorAll('[data-go]').forEach(b => b.onclick = () => select(b.dataset.go));
}
function select(id) {
  const s = byId[id]; if (!s) return;
  if (!VIEWS[view].inView(s)) { view = 'master'; }
  selected = id; document.body.classList.add('card-open'); fillCard(false);
  Object.keys(mk).forEach(k => mk[k].setIcon(icon(byId[k])));
  const z = Math.max(map.getZoom(), 12), cardW = innerWidth > 900 ? 396 : 0, c = map.project([s.lat, s.lng], z).add([cardW / 2, innerWidth > 900 ? 0 : 150]);
  map.flyTo(map.unproject(c, z), z, { duration: .7 });
  if ($('#lyBd')) { $('#lyBd').style.display = 'none'; $('#lyCaret').innerHTML = '&#9656;'; }
  renderList(visible()); const it = $(`.item[data-id="${id}"]`); if (it) it.scrollIntoView({ block: 'nearest' });
  writeHash(); document.body.classList.remove('side-open');
}
function closeCard(silent) { selected = null; document.body.classList.remove('card-open'); Object.keys(mk).forEach(k => mk[k].setIcon(icon(byId[k]))); if (!silent) { renderList(visible()); writeHash(); } }
function step(d) { const v = visible(); if (!v.length) return; let i = v.findIndex(s => s.id === selected); i = (i + d + v.length) % v.length; select(v[i].id); }
$('#prevSt').onclick = () => step(-1); $('#nextSt').onclick = () => step(1);
$('#list').onclick = e => { const it = e.target.closest('.item'); if (it) select(it.dataset.id); };

/* ---- lightbox ---- */
let lb = { ph: [], i: 0 };
function openLb(ph, i) { lb = { ph, i }; showLb(); $('#lb').classList.add('on'); }
function showLb() { const p = lb.ph[lb.i]; $('#lbimg').src = p.src; $('#lbc').textContent = `${p.caption || ''} - ${lb.i + 1}/${lb.ph.length}`; }
$('#lbx').onclick = () => $('#lb').classList.remove('on');
$('#lbl').onclick = () => { lb.i = (lb.i + lb.ph.length - 1) % lb.ph.length; showLb(); };
$('#lbr').onclick = () => { lb.i = (lb.i + 1) % lb.ph.length; showLb(); };
$('#lb').onclick = e => { if (e.target.id === 'lb') $('#lb').classList.remove('on'); };
document.addEventListener('keydown', e => {
  if ($('#lb').classList.contains('on')) { if (e.key === 'Escape') $('#lb').classList.remove('on'); if (e.key === 'ArrowLeft') $('#lbl').click(); if (e.key === 'ArrowRight') $('#lbr').click(); return; }
  if (e.key === 'Escape') { $('#about').classList.remove('on'); if (selected) closeCard(); }
});

/* ---- about ---- */
$('#aboutBtn').onclick = () => { $('#aboutBox').innerHTML = `<button class="closeb" id="abx" type="button">Close</button><h2>About this draft</h2><div class="note">Showcase of the current situation, monitoring gaps and the proposed future monitoring network of the Hillah River system. Internal draft - not for public release.</div>
  <h3>Views</h3><ul><li><b>Current network</b> - existing stations and their reported condition.</li><li><b>Identified gaps</b> - river stretches beyond a chosen radius of any existing station, and proposed sites with no existing station nearby.</li><li><b>Phase 1 priorities</b> - stations of 1st priority and the existing stations they replace.</li><li><b>Long-term master plan</b> - all 14 proposed stations, by priority.</li></ul>
  <h3>Assumptions (to be confirmed)</h3><ul><li>Phase 1 = the four 1st-priority stations of the design (V01); the master plan = all 14 proposed stations.</li><li>"Needs attention" for existing stations comes from the source status text and the photo captions ("damaged", "partially damaged", "needs relocation", "transmitter inactive").</li><li>The gap rule (straight-line radius around existing stations, default 25 km, adjustable) is a working assumption, not a design criterion.</li><li>Photo pairs for H-05 and H-06 were assigned from the order of photographs in the design document.</li><li>Requirement labels I-VII are abbreviated from the wording of the design table.</li></ul>
  <h3>Not yet available (shown as "Not available - to be provided")</h3><ul><li>Responsible institution of each station; parameters proposed for future monitoring; telemetry details of proposed stations.</li><li>Meteorological stations, and the scope of rehabilitation / upgrade per existing station.</li></ul>
  <h3>Data</h3><ul><li>Network, boundaries and stations: CWRM master GeoPackage v1 (curated from MoWR / SWLRI data); stations and photographs: Monitoring network design V01 (2026-08-17).</li><li>"MOD stations" and "project reference points" come from the project map file and their status is not stated.</li><li>Basemaps need an internet connection. To add missing facts, edit <code>data/station_extra.js</code>.</li></ul><div class="partners"><img src="img/giz.png" alt="GIZ" onerror="this.style.display='none'"><img src="img/mowr.png" alt="Ministry of Water Resources" onerror="this.style.display='none'"></div>`;
  $('#about').classList.add('on'); $('#abx').onclick = () => $('#about').classList.remove('on'); };
$('#about').onclick = e => { if (e.target.id === 'about') $('#about').classList.remove('on'); };
$('#sideToggle').onclick = () => document.body.classList.toggle('side-open');

/* ---- url state ---- */
function writeHash() { const h = `#v=${view}${selected ? '&s=' + selected : ''}`; if (location.hash !== h) history.replaceState(null, '', h); }
function readHash() { const m = Object.fromEntries((location.hash.slice(1) || '').split('&').map(x => x.split('='))); if (VIEWS[m.v]) view = m.v; if (m.s && byId[m.s]) selected = m.s; }

/* ---- init ---- */
let crowded = true;
const lowZoom = () => $('#map').classList.toggle('z-low', map.getZoom() < 9 && crowded);
map.on('zoomend', () => { lowZoom(); syncNet(); S.forEach(s => mk[s.id].setTooltipContent(labelHtml(s))); });
buildTabs(); buildFilters(); buildLayerPanel(); readHash(); render();
if (innerWidth < 1250) { $('#lyBd').style.display = 'none'; $('#lyCaret').innerHTML = '&#9656;'; $('#legend').classList.add('min'); }
if (selected) { document.body.classList.add('card-open'); fillCard(false); const s = byId[selected], cw = innerWidth > 900 ? 396 : 0; map.setView(map.unproject(map.project([s.lat, s.lng], 12).add([cw / 2, innerWidth > 900 ? 0 : 150]), 12), 12); if ($('#lyBd')) { $('#lyBd').style.display = 'none'; $('#lyCaret').innerHTML = '&#9656;'; } } else fitView();
lowZoom();
window.__cwrm = { map, select, setView, S };
})();
