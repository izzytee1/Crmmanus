// ── DASHBOARD ──
// The signed-in rep's real work for today, worked out from the lead list (leads). Every list below reads
// real lead fields — status, lastActive, touch, bank, closeDate — and the rep's reminders. Nothing here is invented or made up.
//
// The signed-in rep is user. Team leads is the one card not limited to them: the other reps' ENGAGED,
// CONTRACT and closed-won leads, with the company and rep name only, so nobody works a lead someone else has.
const dashboard = (() => {
  const DAY = 86400000;
  // A close date ("Sep 30, 2026") starts at midnight Eastern.
  const closeAt = l => { const d = new Date(l.closeDate); return isNaN(d) ? NaN : fromWall(d.getFullYear(), d.getMonth(), d.getDate()); };
  const OPEN_TOUCH_STATES = ['opened', 'clicked'];
  const CLOSED_STAGES = ['closed-won', 'closed-lost'];

  const mine = () => leads.filter(l => l.rep === user.name);
  const isOpenStage = l => !CLOSED_STAGES.includes(l.stage);
  const daysQuiet = l => Math.floor((Date.now() - l.lastActive) / DAY);

  // Engaged or under contract, but gone quiet for 3+ days. 6+ days is shown as urgent.
  function stalled() {
    return mine()
      .filter(l => (l.status === 'ENGAGED' || l.status === 'CONTRACT') && daysQuiet(l) >= 3)
      .sort((a, b) => daysQuiet(b) - daysQuiet(a));
  }
  // Still NEW — no real outreach has started yet. Newest application first.
  function untouched() {
    return mine().filter(l => l.status === 'NEW').sort((a, b) => new Date(b.applied) - new Date(a.applied));
  }
  // An email or text was opened, but nothing came back.
  function openedNoReply() {
    return mine().filter(l => Object.values(l.touch || {}).some(t => OPEN_TOUCH_STATES.includes(t.state)));
  }
  // Still open, with a close date in the next 7 days.
  function closingSoon() {
    const now = Date.now(), soon = now + 7 * DAY;
    return mine()
      .filter(isOpenStage)
      .map(l => ({ l, t: closeAt(l) }))
      .filter(x => x.t && x.t >= now && x.t <= soon)
      .sort((a, b) => a.t - b.t)
      .map(x => x.l);
  }
  // NEW or ATTEMPTED, with a real bank statement on file, ranked by revenue plus ending balance.
  function worthPursuing() {
    return mine()
      .filter(l => l.bank && (l.status === 'NEW' || l.status === 'ATTEMPTED'))
      .sort((a, b) => (b.value + b.bank.balance) - (a.value + a.bank.balance))
      .slice(0, 5);
  }
  // A real bank statement showing 3+ NSFs, or obligations at half or more of deposits.
  function riskFlags() {
    return mine().filter(l => l.bank && (l.bank.nsf >= 3 || l.bank.obligations >= l.bank.deposits * 0.5));
  }
  // The other reps' leads in three groups. Each lead is in one group: closed-won first, then CONTRACT, then ENGAGED.
  function teamTable() {
    const rows = leads
      .filter(l => l.rep && l.rep !== user.name && (l.status === 'ENGAGED' || l.status === 'CONTRACT' || l.stage === 'closed-won'))
      .sort((a, b) => a.company.localeCompare(b.company));
    const body = rows.map(l => {
      const closed = l.stage === 'closed-won', state = closed ? 'closed' : String(l.status || '').toLowerCase();
      return `<tr><td>${esc(l.company)}</td><td>${esc(l.rep)}</td><td><span class="db-team-status" data-state="${esc(state)}">${esc(closed ? 'Closed' : l.status)}</span></td></tr>`;
    }).join('')
      || '<tr><td colspan="3">No team leads.</td></tr>';
    return `<div class="db-table-wrap"><table class="db-table"><thead><tr><th>Company</th><th>Rep</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function totals(stalledCount) {
    const open = mine().filter(isOpenStage);
    const pipelineValue = open.reduce((sum, l) => sum + l.value, 0);
    const now = wall();
    const inThisMonth = l => { const t = closeAt(l); return !isNaN(t) && wall(t).y === now.y && wall(t).mo === now.mo; };
    return {
      pipelineValue,
      closingThisMonth: open.filter(inThisMonth).length,
      winsThisMonth: mine().filter(l => l.stage === 'closed-won' && inThisMonth(l)).length,
      stalledCount
    };
  }

  function row(l, meta, sub) {
    return `<div class="db-row">
      <span class="db-row-top"><span><span class="db-row-company">${esc(l.company)}</span><button class="open-record" type="button" data-lead="${l.id}" title="Open record" aria-label="Open ${esc(l.company)} in Leads">${ic('open', 12)}</button></span><span class="db-row-meta">${meta}</span></span>
      <span class="db-row-sub">${esc(sub)}</span>
    </div>`;
  }
  function card(icon, title, list, emptyText, mapRow) {
    return `<section class="db-card" aria-label="${esc(title)}">
      <div class="db-card-head">${ic(icon, 14)}<h3>${title}</h3><span class="db-count">${list.length}</span></div>
      <div class="db-list">${list.length ? list.map(mapRow).join('') : `<p class="empty db-empty">${esc(emptyText)}</p>`}</div>
    </section>`;
  }
  // Three groups, each with its own colour: what needs attention, where the chances are, and the team.
  const group = (tone, title, cards) => `<section class="db-section" data-tone="${tone}" aria-label="${title}"><h3 class="db-section-title">${title}</h3><div class="db-grid">${cards.join('')}</div></section>`;
  const greeting = () => { const h = wall().h; return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  function render() {
    const stalledList = stalled(), t = totals(stalledList.length);

    $('dbHello').textContent = `${greeting()}, ${user.name}`;
    $('dbDate').textContent = showTime(Date.now(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const stats = [
      { icon: 'layers', label: 'Open pipeline value', val: money(t.pipelineValue) },
      { icon: 'calendar', label: 'Closing this month', val: t.closingThisMonth },
      { icon: 'check', label: 'Wins this month', val: t.winsThisMonth },
      { icon: 'clock', label: 'Stalled leads', val: t.stalledCount, warn: t.stalledCount > 0 }
    ];
    const statHtml = s => `<div class="db-stat${s.warn ? ' warn' : ''}"><div class="db-stat-label">${ic(s.icon, 13)}${s.label}</div><div class="db-stat-val">${s.val}</div></div>`;
    $('dbStats').innerHTML = `<div class="db-stat-group">${stats.slice(0, 2).map(statHtml).join('')}</div><div class="db-stat-group">${stats.slice(2).map(statHtml).join('')}</div>`;

    $('dbGrid').innerHTML = [
      group('attention', 'Needs attention', [
        card('calendar', 'Follow-ups due', reminders.dueToday(), 'No follow-ups due today.', r =>
          row(reminders.leadOf(r), `<span class="db-quiet${r.at <= Date.now() ? ' urgent' : ''}">${esc(reminders.whenText(r))}</span>`, r.text)),
        card('clock', 'Stalled leads', stalledList, 'No stalled leads right now.', l =>
          row(l, `<span class="db-quiet${daysQuiet(l) >= 6 ? ' urgent' : ''}">${daysQuiet(l)}d quiet</span>`, `${fullName(l)} · ${l.status}`)),
        card('alert', 'Risk flags', riskFlags(), 'No risk flags right now.', l =>
          row(l, l.bank.nsf >= 3 ? `${l.bank.nsf} NSF` : 'High obligations', `Balance ${money(l.bank.balance)}`))
      ]),
      group('chances', 'Opportunities', [
        card('user', 'New, untouched', untouched(), 'No new leads waiting.', l =>
          row(l, money(l.value), `${fullName(l)} · applied ${l.applied ? fmtDate(l.applied) : '—'}`)),
        card('mailopen', 'Opened, no reply', openedNoReply(), 'Nothing opened without a reply.', l =>
          row(l, timeAgo(l.lastActive), fullName(l))),
        card('calendar', 'Closing soon', closingSoon(), 'Nothing closing in the next 7 days.', l =>
          row(l, l.closeDate, `${money(l.value)} · ${l.stage}`)),
        card('star', 'Worth pursuing', worthPursuing(), 'No strong untouched leads right now.', l =>
          row(l, money(l.value), `Ending balance ${money(l.bank.balance)}`))
      ]),
      `<section class="db-section" data-tone="team" aria-label="Team"><h3 class="db-section-title">Team</h3>${teamTable()}</section>`
    ].join('');
  }

  $('dbGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-lead]');
    if (b) openLead(Number(b.dataset.lead));
  });

  return { render };
})();
