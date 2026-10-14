// =============================================================
//  app.js — 화면 그리기 + 버튼 동작
//  구조: state(현재 상태) → render()가 화면 전체를 다시 그림
//  버튼에는 data-action="이름"을 붙이고, 아래 actions 객체에서 처리해요.
// =============================================================
(function () {
  const S = window.Store;

  const $app = document.getElementById('app');
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const weekStartOf = (date) => S.addDays(date, -S.parseDate(date).getDay());

  const st = {
    tab: 'today',            // today | feed | friends | my
    view: null,              // {type:'profile', userId, date, month} | {type:'notifs'}
    selDate: S.today(),
    calMonth: S.today().slice(0, 7),
    feedMode: 'week',        // today | week
    feedScope: (() => { try { return localStorage.getItem('studymate_feed_scope') || 'auto'; } catch (e) { return 'auto'; } })(), // fav | all | auto
    feedShowQuiet: false,    // 일정 없는 친구도 펼쳐 보기
    wkOpen: new Set(),       // 피드 주간 표에서 [더보기]로 펼친 사람
    weekStart: weekStartOf(S.today()),
    friendsTab: 'following', // following | followers
    q: '',
    modal: null,
    stickerMode: false,      // 오늘 탭에서 스티커 붙이는 중
    sticker: { tab: 'art', pick: 'a:bunny', size: 2 },
    authMode: 'login',
    authError: '',
    groupId: null,           // 그룹 탭에서 보고 있는 그룹
    gMonth: S.today().slice(0, 7),
    gDate: S.today(),
    groupForm: null,         // 'create' | 'join' | null
    showCode: null,          // 초대 코드를 보여주는 그룹 id (평소엔 숨김)
  };

  // 다른 계정으로 바뀔 때 비워 둘 화면 상태
  const FRESH = { stickerMode: false, pop: null, feedShowQuiet: false, groupId: null, showCode: null, groupForm: null, q: '' };

  // 눌러야 펼쳐지는 작은 창: 버튼(label) + 펼친 내용(panel)
  function pop(key, label, panel, cls = '') {
    const open = st.pop === key;
    return `<div class="pop-wrap ${open ? 'open' : ''}">
      <button class="pop-btn ${cls}" data-action="pop" data-key="${key}" aria-expanded="${open}">${label}<span class="chev">▾</span></button>
      ${open ? `<div class="pop-panel">${panel}</div>` : ''}
    </div>`;
  }

  // ---------- 작은 도우미 ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDay = (date) => { const d = S.parseDate(date); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`; };
  const fmtShort = (date) => { const d = S.parseDate(date); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const timeAgo = (ts) => { const s = (Date.now() - ts) / 1000; if (s < 60) return '방금'; if (s < 3600) return `${Math.floor(s / 60)}분 전`; if (s < 86400) return `${Math.floor(s / 3600)}시간 전`; return `${Math.floor(s / 86400)}일 전`; };
  const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99') || a.order - b.order;

  function avatar(u, size = 40) {
    if (!u) return '';
    const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.5)}px`;
    if (u.avatar && u.avatar.startsWith('data:image/')) return `<img class="avatar" style="${style}" src="${esc(u.avatar)}" alt="">`;
    if (u.avatar) return `<span class="avatar" style="${style}">${esc(u.avatar)}</span>`;
    const hue = [...u.nickname].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    return `<span class="avatar letter" style="${style};background:hsl(${hue} 60% 55%)">${esc(u.nickname[0])}</span>`;
  }

  // ---------- 테마 (색·화면 모드, 이 브라우저에 저장) ----------
  const THEMES = [['라벤더', '#5E5CE6'], ['블루', '#007AFF'], ['민트', '#30B0C7'], ['그린', '#34C759'], ['옐로', '#F5B400'],
    ['오렌지', '#FF9500'], ['코랄', '#FF6B6B'], ['핑크', '#FF2D55'], ['퍼플', '#AF52DE'], ['그레이', '#8E8E93']];
  const DEFAULT_THEME = THEMES[0][1];
  function loadTheme() {
    let t = {};
    try { t = JSON.parse(localStorage.getItem('studymate_theme')) || {}; } catch (e) { /* 무시 */ }
    if (t.color && !/^#[0-9a-f]{6}$/i.test(t.color)) delete t.color;
    return t;
  }
  function applyTheme(t = loadTheme()) {
    const root = document.documentElement;
    root.style.setProperty('--theme', t.color || DEFAULT_THEME);
    if (t.mode === 'light' || t.mode === 'dark') root.dataset.mode = t.mode; else delete root.dataset.mode;
  }
  function saveTheme(patch) {
    const t = { ...loadTheme(), ...patch };
    try { localStorage.setItem('studymate_theme', JSON.stringify(t)); } catch (e) { /* 저장 못 해도 이번엔 적용 */ }
    applyTheme(t);
  }
  applyTheme();

  // ---------- 달력 꾸미기 (서버에 저장 → 친구가 내 달력을 볼 때도 그대로 보임) ----------
  // 테마는 여기에 한 줄 + style.css 에 .calendar[data-deco="이름"] 규칙만 추가하면 늘어나요
  const CAL_DECOS = [['none', '기본', '📅'], ['simple', '심플', '◻️'],
    ['flower', '봄', '🌸'], ['summer', '여름 숲', '🌲'], ['autumn', '가을', '🍁'], ['winter', '겨울', '⛄'],
    ['ocean', '바다', '🌊'], ['mint', '민트', '🍃'], ['lemon', '레몬트리', '🍋'], ['apple', '사과나무', '🍎'], ['peach', '복숭아', '🍑'],
    ['hanyang', '한양 블루', '🦁'],
    ['bunny', '토끼 풀밭', '🐰'], ['cat', '고양이', '🐱'], ['dog', '멍뭉이', '🐶']];
  // 그림 스티커 (icons/stickers/이름.svg). 이모티콘도 스티커로 붙일 수 있어요
  const ART_STICKERS = ['dog-ears', 'dog-desk', 'dog-derp', 'dog-cry', 'dog-zoom', 'bunny', 'cat', 'ribbon', 'star', 'heart', 'cloud'];
  const MAX_STICKERS = 40;
  const validSticker = (k) => k && typeof k.s === 'string' && (ART_STICKERS.includes(k.s.slice(2)) && k.s.startsWith('a:') || S.isEmoji(k.s))
    && Number.isFinite(k.x) && Number.isFinite(k.y) && [1, 2, 3].includes(k.z);
  // 배경 사진은 한 번만 이미지로 바꿔 두고 재사용 (매번 큰 글자를 다시 그리지 않게)
  const bgUrls = new Map();
  function bgUrl(dataUrl) {
    if (!bgUrls.has(dataUrl)) {
      try {
        const bin = atob(dataUrl.split(',')[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        bgUrls.set(dataUrl, URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })));
      } catch (e) { return ''; }
    }
    return bgUrls.get(dataUrl);
  }
  // 예전에 이 브라우저에만 저장했던 꾸미기를 서버로 한 번 옮김
  let calMigrated = false;
  function migrateLocalCal(c) {
    if (calMigrated || !c.none) return;
    calMigrated = true;
    try {
      const old = JSON.parse(localStorage.getItem('studymate_cal'));
      localStorage.removeItem('studymate_cal');
      if (!old) return;
      const patch = {};
      if (CAL_DECOS.some(([k]) => k === old.deco)) patch.deco = old.deco;
      if (typeof old.bg === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(old.bg)) patch.bg = old.bg;
      if (old.op) patch.op = Math.min(100, Math.max(5, +old.op || 35));
      if (Object.keys(patch).length) S.saveCalStyle(patch);
    } catch (e) { /* 무시 */ }
  }
  function myCal() {
    const c = S.calStyle(S.me().id);
    if (S.calStyleLoaded(S.me().id)) migrateLocalCal(c);
    return c;
  }
  // 달력 하나에 붙일 꾸미기 (테마·배경·스티커)
  function calDeco(userId, { stickers = true, editing = false } = {}) {
    const c = userId === S.me().id ? myCal() : S.calStyle(userId);
    const deco = CAL_DECOS.some(([k]) => k === c.deco) ? c.deco : 'none';
    const bg = c.bg ? bgUrl(c.bg) : '';
    const op = Math.min(100, Math.max(5, +c.op || 35)) / 100;
    const list = stickers ? c.stickers.filter(validSticker) : [];
    const layer = list.length || editing
      ? `<div class="sticker-layer ${editing ? 'edit' : ''}">${list.map((k, i) => stickerHtml(k, i, editing)).join('')}</div>` : '';
    return {
      attrs: `data-deco="${deco}" data-owner="${esc(userId)}" ${bg ? `data-bg style="--cal-bg-img:url('${bg}');--cal-bg-op:${op}"` : ''}`,
      layer,
    };
  }
  function stickerFace(key) {
    return key.startsWith('a:') ? `<img src="icons/stickers/${key.slice(2)}.svg" alt="" draggable="false">` : `<span>${esc(key)}</span>`;
  }
  function stickerHtml(k, i, editing) {
    const x = Math.min(100, Math.max(0, k.x)), y = Math.min(100, Math.max(0, k.y)), r = Math.min(30, Math.max(-30, +k.r || 0));
    return `<div class="sticker z${k.z}" data-i="${i}" style="left:${x}%;top:${y}%;--r:${r}deg">${stickerFace(k.s)}${editing ? `<button class="sticker-x" data-action="sticker-del" data-i="${i}" aria-label="스티커 떼기">✕</button>` : ''}</div>`;
  }

  // ---------- 데스크톱 알림 (맥·윈도우 브라우저 알림, 이 브라우저에 설정 저장) ----------
  const NOTIFY_KEY = 'studymate_notify';
  const canNotify = () => 'Notification' in window;
  function loadNotify() {
    let n = {};
    try { n = JSON.parse(localStorage.getItem(NOTIFY_KEY)) || {}; } catch (e) { /* 무시 */ }
    return { on: !!n.on, push: !!n.push, reaction: n.reaction !== false, follow: n.follow !== false };
  }
  function saveNotify(patch) {
    try { localStorage.setItem(NOTIFY_KEY, JSON.stringify({ ...loadNotify(), ...patch })); } catch (e) { /* 무시 */ }
  }
  function notifText(n) {
    const from = S.user(n.fromUserId);
    const name = from ? from.nickname : '친구';
    if (n.type === 'follow') return { title: '새 팔로워', body: `${name}님이 회원님을 팔로우하기 시작했어요.` };
    return { title: `${n.emoji} ${name}`, body: `${n.todoTitle ? `‘${n.todoTitle}’에 ` : ''}${n.emoji} 반응을 남겼어요.` };
  }
  function showDesktop(title, body, tag) {
    try {
      const x = new Notification(title, { body, tag, icon: 'icons/icon-192.png' });
      x.onclick = () => { window.focus(); st.view = { type: 'notifs' }; st.modal = null; render(); S.markAllRead(); x.close(); };
    } catch (e) { console.error(e); }
  }
  // ---------- 푸시 알림 (앱이 꺼져 있어도) ----------
  const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && canNotify();
  let swReg = null, pushKey = null;
  if (canPush()) {
    navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch((e) => console.error(e));
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data === 'open-notifs' && S.me()) { st.view = { type: 'notifs' }; st.modal = null; render(); S.markAllRead(); }
    });
  }
  function preparePush() {
    if (canPush() && !pushKey) S.pushPublicKey().then((k) => { pushKey = k; }).catch((e) => console.error(e));
  }
  const b64ToBytes = (b64) => {
    const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  };
  async function currentPushSub() {
    if (!swReg) return null;
    try { return await swReg.pushManager.getSubscription(); } catch (e) { return null; }
  }
  async function turnOffNotify() {
    saveNotify({ on: false, push: false });
    const sub = await currentPushSub();
    if (sub) { try { await S.removePushSubscription(sub.endpoint); } catch (e) { /* 무시 */ } await sub.unsubscribe().catch(() => {}); }
  }

  S.onNotify = (list) => {
    const pref = loadNotify();
    if (!pref.on || pref.push || !canNotify() || Notification.permission !== 'granted') return;
    const wanted = list.filter((n) => (n.type === 'follow' ? pref.follow : pref.reaction));
    if (!wanted.length) return;
    if (wanted.length > 3) { showDesktop('갓생메이트', `새 알림이 ${wanted.length}개 있어요.`, 'many'); return; }
    wanted.forEach((n) => { const t = notifText(n); showDesktop(t.title, t.body, n.id); });
  };

  const ICON = {
    today: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    feed: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
    friends: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.4 0 4.2 1.6 4.5 4.5"/></svg>',
    my: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c.6-4 3.8-6.5 8-6.5s7.4 2.5 8 6.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    group: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="9.5" cy="15" r="1.6"/><circle cx="14.5" cy="15" r="1.6"/></svg>',
  };
  const TABS = [['today', '오늘'], ['feed', '피드'], ['friends', '친구'], ['group', '그룹'], ['my', 'MY']];

  // 화면에 필요한 데이터가 아직 없으면 서버에서 받아온 뒤 다시 그림
  function need(ids, from, to) { S.prefetch(ids, from, to).then((changed) => { if (changed) render(); }); }

  // =============================================================
  //  위젯: 작은 창으로 띄워 바탕화면 구석에 두는 달력 / 오늘 할 일
  //  주소 뒤에 ?w=cal 또는 ?w=todo, &size=s|m|l, &op=배경 진하기(20~100)
  // =============================================================
  const WIDGET = (() => {
    const q = new URLSearchParams(location.search);
    const w = q.get('w');
    if (w !== 'cal' && w !== 'todo') return null;
    const size = ['s', 'm', 'l'].includes(q.get('size')) ? q.get('size') : 'm';
    const op = Math.min(100, Math.max(20, Number(q.get('op')) || 100));
    return { w, size, op };
  })();
  const WIDGET_SIZES = { cal: { s: [260, 250], m: [340, 340], l: [460, 470] }, todo: { s: [240, 300], m: [300, 400], l: [360, 520] } };
  if (WIDGET) {
    document.documentElement.classList.add('widget-mode');
    document.documentElement.style.setProperty('--w-op', WIDGET.op / 100);
    document.title = WIDGET.w === 'cal' ? '갓생 달력' : '오늘 할 일';
  }
  function widgetUrl(w, size, op) {
    return `${location.origin}${location.pathname}?w=${w}&size=${size}&op=${op}`;
  }

  function renderWidget() {
    const me = S.me();
    const { w, size } = WIDGET;
    if (w === 'cal') {
      const month = st.calMonth;
      const [y, m] = month.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      const start = S.addDays(S.fmtDate(first), -first.getDay());
      const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);
      need([me.id], start, S.addDays(start, weeks * 7 - 1));
      const cats = Object.fromEntries(S.categories(me.id).map((c) => [c.id, c]));
      const max = { s: 0, m: 2, l: 3 }[size];
      const t0 = S.today();
      let cells = '';
      for (let i = 0; i < weeks * 7; i++) {
        const date = S.addDays(start, i);
        const d = S.parseDate(date);
        const list = S.todosOn(me.id, date).sort(byTime);
        const marks = max
          ? list.slice(0, max).map((t) => `<div class="w-chip ${t.done ? 'done' : ''}" style="--c:${cats[t.categoryId]?.color || '#8E8E93'}">${esc(t.title)}</div>`).join('') + (list.length > max ? `<div class="w-more">+${list.length - max}</div>` : '')
          : `<div class="w-dots">${list.slice(0, 4).map((t) => `<i style="--c:${cats[t.categoryId]?.color || '#8E8E93'}" class="${t.done ? 'done' : ''}"></i>`).join('')}</div>`;
        cells += `<div class="w-cell ${d.getMonth() + 1 !== m ? 'out' : ''} ${date === t0 ? 'today' : ''} ${d.getDay() === 0 ? 'sun' : ''}"><span class="num">${d.getDate()}</span>${marks}</div>`;
      }
      return `<div class="widget w-cal size-${size}">
        <div class="w-head"><b>${y}.${m}</b>
          <span><button data-action="cal-move" data-scope="today" data-dir="-1" aria-label="이전 달">‹</button><button data-action="cal-today" data-scope="today">오늘</button><button data-action="cal-move" data-scope="today" data-dir="1" aria-label="다음 달">›</button></span></div>
        <div class="w-week">${WEEK.map((x) => `<span>${x}</span>`).join('')}</div>
        <div class="w-grid">${cells}</div>
      </div>`;
    }
    // 오늘 할 일
    const date = S.today();
    need([me.id], date, date);
    const cats = Object.fromEntries(S.categories(me.id).map((c) => [c.id, c]));
    const todos = S.todosOn(me.id, date).sort(byTime);
    const done = todos.filter((t) => t.done).length;
    const firstCat = S.categories(me.id)[0];
    return `<div class="widget w-todo size-${size}">
      <div class="w-head"><b>${fmtDay(date)}</b><span class="w-count">${done}/${todos.length}</span></div>
      <div class="progress"><div style="width:${todos.length ? Math.round((done / todos.length) * 100) : 0}%"></div></div>
      <ul class="w-list">${todos.map((t) => `<li class="${t.done ? 'done' : ''}" style="--c:${cats[t.categoryId]?.color || '#8E8E93'}">
        <button class="check ${t.done ? 'on' : ''}" data-action="toggle" data-id="${t.id}" aria-label="완료">${t.done ? '✓' : ''}</button>
        <span class="w-title">${t.time ? `<b>${esc(t.time)}</b>` : ''}${esc(t.title)}</span></li>`).join('') || '<li class="w-empty">오늘 할 일이 없어요</li>'}</ul>
      ${firstCat ? `<form class="w-add" data-form="quick-add" data-cat="${firstCat.id}"><input name="title" placeholder="+ 할 일 추가" maxlength="80" autocomplete="off"></form>` : ''}
    </div>`;
  }

  // =============================================================
  //  화면 그리기
  // =============================================================
  function render() {
    if (!S.ready) { $app.innerHTML = '<div class="auth"><div class="auth-logo">📚</div><p class="muted">불러오는 중…</p></div>'; return; }
    const me = S.me();
    if (!me) { $app.innerHTML = renderAuth(); return; }
    if (me.needsSetup) { $app.innerHTML = renderSetup(); return; }
    if (WIDGET) { $app.innerHTML = renderWidget(); return; }
    let body;
    if (st.view?.type === 'profile') body = renderProfile(st.view.userId);
    else if (st.view?.type === 'notifs') body = renderNotifs();
    else body = ({ today: renderToday, feed: renderFeed, friends: renderFriends, group: renderGroup, my: renderMy })[st.tab]();
    $app.innerHTML = `<div class="shell">${renderSidebar()}<div class="main">${body}</div></div>${renderTabbar()}${st.modal ? renderModal() : ''}`;
  }

  function header(title, { back = false } = {}) {
    const unread = S.unreadCount();
    return `<header class="topbar">
      ${back ? `<button class="icon-btn" data-action="back" aria-label="뒤로">${ICON.back}</button>` : ''}
      <h1>${title}</h1>
      ${back ? '' : `<button class="icon-btn bell" data-action="open-notifs" aria-label="알림">${ICON.bell}${unread ? `<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}</button>`}
    </header>`;
  }

  // 맥북 같은 넓은 화면: 왼쪽 사이드바 / 폰: 아래 탭바
  function renderSidebar() {
    const me = S.me();
    return `<aside class="sidebar">
      <div class="brand">📚 갓생메이트</div>
      <nav>${TABS.map(([k, label]) => `<button class="${!st.view && st.tab === k ? 'on' : ''}" data-action="tab" data-tab="${k}">${ICON[k]}<span>${label}</span></button>`).join('')}</nav>
      <button class="side-me" data-action="tab" data-tab="my">${avatar(me, 32)}<span>${esc(me.nickname)}</span></button>
    </aside>`;
  }

  function renderTabbar() {
    return `<nav class="tabbar">${TABS.map(([k, label]) => `<button class="${!st.view && st.tab === k ? 'on' : ''}" data-action="tab" data-tab="${k}">${ICON[k]}<span>${label}</span></button>`).join('')}</nav>`;
  }

  // ---------- 로그인 / 회원가입 ----------
  function renderAuth() {
    const signup = st.authMode === 'signup';
    return `<div class="auth">
      <div class="auth-logo">📚</div>
      <h1 class="auth-title">갓생메이트</h1>
      <p class="auth-sub">오늘 할 일과 일정을 친구와 함께</p>
      <form class="auth-form" data-form="${signup ? 'signup' : 'login'}">
        ${signup ? '<input name="nickname" placeholder="닉네임" maxlength="12" autocomplete="nickname">' : ''}
        <input name="username" placeholder="아이디${signup ? ' (영어 소문자·숫자 4~16자)' : ''}" maxlength="16" autocomplete="username" autocapitalize="off" spellcheck="false">
        <input name="password" type="password" placeholder="비밀번호${signup ? ' (8자 이상)' : ''}" autocomplete="${signup ? 'new-password' : 'current-password'}">
        ${st.authError ? `<p class="error">${esc(st.authError)}</p>` : ''}
        <button class="btn primary big" type="submit" ${st.busy ? 'disabled' : ''}>${st.busy ? '잠시만요…' : signup ? '가입하기' : '로그인'}</button>
      </form>
      <div class="or"><span>또는</span></div>
      <button class="btn google big" data-action="google-login" ${st.busy ? 'disabled' : ''}>
        <svg viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
        Google로 계속하기</button>
      <button class="link" data-action="auth-mode">${signup ? '이미 계정이 있어요 → 로그인' : '처음이에요 → 회원가입'}</button>
      <div class="demo-hint">친구에게 이 사이트 주소를 보내고<br>각자 가입한 뒤 서로 팔로우하세요 🙌</div>
    </div>`;
  }

  // ---------- 소셜 로그인 후 처음: 닉네임·아이디 정하기 ----------
  function renderSetup() {
    return `<div class="auth">
      <div class="auth-logo">👋</div>
      <h1 class="auth-title">환영해요!</h1>
      <p class="auth-sub">친구들이 나를 찾을 수 있게 정해주세요</p>
      <form class="auth-form" data-form="setup">
        <input name="nickname" placeholder="닉네임 (친구에게 보이는 이름)" maxlength="12">
        <input name="username" placeholder="아이디 (영어 소문자·숫자 4~16자)" maxlength="16" autocapitalize="off" spellcheck="false">
        ${st.authError ? `<p class="error">${esc(st.authError)}</p>` : ''}
        <button class="btn primary big" type="submit" ${st.busy ? 'disabled' : ''}>${st.busy ? '잠시만요…' : '시작하기'}</button>
      </form>
      <button class="link" data-action="logout">다른 계정으로 로그인</button>
    </div>`;
  }

  // ---------- 캘린더 (오늘 탭, 친구 프로필에서 같이 씀) ----------
  // sources: [{ userId, color?, tag? }] — color가 있으면 그 색(친구 겹쳐보기), 없으면 카테고리 색
  function renderCalendar({ scope, month, selDate, sources, top = '', owner = null, editing = false }) {
    const me = S.me();
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const start = S.addDays(S.fmtDate(first), -first.getDay());
    const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);
    const end = S.addDays(start, weeks * 7 - 1);
    need(sources.map((src) => src.userId), start, end);

    const byDate = {};
    sources.forEach((src) => {
      const cats = Object.fromEntries(S.categories(src.userId).map((c) => [c.id, c]));
      S.todosBetween(src.userId, start, end).filter((t) => S.canSee(me.id, t)).forEach((t) => {
        (byDate[t.date] ||= []).push({ t, color: src.color || cats[t.categoryId]?.color || '#8E8E93', tag: src.tag || '', mine: src.userId === me.id, order: cats[t.categoryId]?.order ?? 0 });
      });
    });
    const t0 = S.today();

    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const date = S.addDays(start, i);
      const d = S.parseDate(date);
      const list = (byDate[date] || []).sort((a, b) => (a.t.time || '99').localeCompare(b.t.time || '99') || b.mine - a.mine || a.order - b.order);
      const chips = list.slice(0, 4).map(({ t, color, tag }) => `<div class="chip ${t.done ? 'done' : ''}" style="--c:${color}">${tag ? `<i>${esc(tag)}</i>` : ''}${t.time ? `<b>${esc(t.time)}</b>` : ''}${esc(t.title)}</div>`).join('');
      cells += `<button class="cal-cell ${d.getMonth() + 1 !== m ? 'out' : ''} ${date === selDate ? 'sel' : ''} ${date === t0 ? 'today' : ''} ${d.getDay() === 0 ? 'sun' : ''}" data-action="select-date" data-scope="${scope}" data-date="${date}">
        <span class="num">${d.getDate()}</span>${chips}${list.length > 4 ? `<div class="more">+${list.length - 4}개</div>` : ''}
      </button>`;
    }
    const deco = owner ? calDeco(owner, { editing }) : { attrs: '', layer: '' };
    return `<section class="card calendar" ${deco.attrs}>
      <div class="cal-head">
        <h3>${y}년 ${m}월</h3>
        <div class="cal-nav">
          ${scope === 'today' && !editing ? '<button class="icon-btn sm" data-action="sticker-mode" title="달력 꾸미기" aria-label="달력 꾸미기">🎀</button>' : ''}
          <button class="btn sm ghost" data-action="cal-today" data-scope="${scope}">오늘</button>
          <button class="icon-btn sm" data-action="cal-move" data-scope="${scope}" data-dir="-1" aria-label="이전 달">‹</button>
          <button class="icon-btn sm" data-action="cal-move" data-scope="${scope}" data-dir="1" aria-label="다음 달">›</button>
        </div>
      </div>
      ${top}
      <div class="cal-week">${WEEK.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      ${deco.layer}
    </section>`;
  }

  // ---------- 오늘 탭: 내 캘린더 + 선택한 날 (친구 일정은 친구 페이지에서) ----------
  function renderToday() {
    const me = S.me();
    const cal = (st.stickerMode ? renderStickerTray() : '') + renderCalendar({ scope: 'today', month: st.calMonth, selDate: st.selDate, sources: [{ userId: me.id }], owner: me.id, editing: st.stickerMode });

    const todos = S.todosOn(me.id, st.selDate);
    const done = todos.filter((t) => t.done).length;
    const isToday = st.selDate === S.today();
    return `${header('오늘')}
    <main class="page split">
      <div class="col-main">${cal}</div>
      <div class="col-side">
        <div class="day-head">
          <h2>${fmtDay(st.selDate)}</h2>
          ${isToday ? '<span class="pill">오늘</span>' : ''}
        </div>
        <div class="card summary">
          <div class="label">${isToday ? '오늘 할 일' : '할 일'}</div>
          <div class="big-num">${done} <span>/ ${todos.length} 완료</span></div>
          <div class="progress"><div style="width:${todos.length ? Math.round((done / todos.length) * 100) : 0}%"></div></div>
        </div>
        ${S.categories(me.id).map((c) => renderCategory(c, todos.filter((t) => t.categoryId === c.id), { own: true })).join('')}
        <button class="btn ghost full" data-action="open-cats">카테고리 관리</button>
      </div>
    </main>`;
  }

  // 카테고리 카드 (내 화면 / 친구 프로필)
  function renderCategory(c, todos, { own }) {
    if (!own && !todos.length) return '';
    const done = todos.filter((t) => t.done).length;
    return `<section class="cat" style="--c:${c.color}">
      <header class="cat-head">
        <span class="cat-name">${esc(c.emoji)} ${esc(c.name)}</span>
        ${todos.length ? `<span class="cat-count">${done}/${todos.length}</span>` : ''}
      </header>
      <ul class="todos">${todos.map((t) => renderTodo(t, c, own)).join('')}</ul>
      ${own ? `<form class="quick-add" data-form="quick-add" data-cat="${c.id}"><span class="plus">+</span><input name="title" placeholder="할 일 추가" maxlength="80" autocomplete="off"></form>` : ''}
    </section>`;
  }

  // 할 일 한 줄. showCat: 카테고리 이름을 옆에 작게 표시 (친구 목록용)
  function renderTodo(t, cat, own, showCat = false) {
    const summary = S.reactionSummary(t.id);
    let reacts = '';
    if (own) {
      if (summary.length) reacts = `<div class="reacts readonly">${summary.map((r) => `<span class="react" title="${esc(r.names.join(', '))}">${esc(r.e)}<b>${r.count}</b></span>`).join('')}</div>`;
    } else if (t.done) {
      // 받은 이모티콘만 보여주고, 새로 달 때는 [☺︎+] 버튼 → 이모티콘 창이 뜸
      reacts = `<div class="reacts">
        ${summary.map((r) => `<button class="react ${r.mine ? 'on' : ''}" data-action="react" data-id="${t.id}" data-e="${esc(r.e)}" title="${esc(r.names.join(', '))}">${esc(r.e)}<b>${r.count}</b></button>`).join('')}
        <button class="react add" data-action="emoji-open" data-id="${t.id}" title="이모티콘 달기" aria-label="이모티콘 달기">☺︎<b>+</b></button>
      </div>`;
    }
    const check = own
      ? `<button class="check ${t.done ? 'on' : ''}" data-action="toggle" data-id="${t.id}" aria-label="완료">${t.done ? '✓' : ''}</button>`
      : `<span class="check ${t.done ? 'on' : ''}">${t.done ? '✓' : ''}</span>`;
    return `<li class="todo ${t.done ? 'done' : ''}" style="--c:${cat?.color || '#8E8E93'}">
      ${check}
      <div class="todo-main">
        <div class="todo-line" ${own ? `data-action="edit-todo" data-id="${t.id}"` : ''}>
          ${t.time ? `<span class="todo-time">${esc(t.time)}</span>` : ''}
          <span class="todo-title">${esc(t.title)}</span>
          ${showCat && cat ? `<span class="todo-cat">${esc(cat.emoji)} ${esc(cat.name)}</span>` : ''}
          ${own ? `<span class="todo-meta" title="${S.VIS[t.visibility].label}">${S.VIS[t.visibility].icon}</span>` : ''}
        </div>
        ${reacts}
      </div>
    </li>`;
  }

  // ---------- 피드 ----------
  function renderFeed() {
    const seg = `<div class="segment two">
      <button class="${st.feedMode === 'week' ? 'on' : ''}" data-action="feed-mode" data-mode="week">이번 주 한눈에</button>
      <button class="${st.feedMode === 'today' ? 'on' : ''}" data-action="feed-mode" data-mode="today">오늘 응원하기</button>
    </div>`;
    const me = S.me();
    if (!S.following(me.id).length) {
      return `${header('피드')}<main class="page"><div class="empty">
        <div class="empty-emoji">👀</div><p>아직 팔로우한 친구가 없어요.<br>친구를 팔로우하면 일정이 여기 보여요!</p>
        <button class="btn primary" data-action="tab" data-tab="friends">친구 찾으러 가기</button></div></main>`;
    }
    const favCount = feedFriends('fav').length;
    const scope = feedScopeNow();
    const filter = `<div class="feed-filter">
      <button class="chip-btn ${scope === 'fav' ? 'on' : ''}" data-action="feed-scope" data-scope="fav">즐겨찾기${favCount ? ` ${favCount}` : ''}</button>
      <button class="chip-btn ${scope === 'all' ? 'on' : ''}" data-action="feed-scope" data-scope="all">전체 ${S.following(me.id).length}</button>
      <span class="muted small grow">${scope === 'fav' ? '친구 이름 옆 ☆ 를 눌러 즐겨찾기' : ''}</span>
    </div>`;
    const body = scope === 'fav' && !favCount
      ? `<div class="empty"><div class="empty-emoji">⭐</div><p>아직 즐겨찾기한 친구가 없어요.<br>친구 이름 옆 <b>☆</b> 를 누르면 그 친구만 모아 볼 수 있어요.</p>
          <button class="btn outline" data-action="feed-scope" data-scope="all">전체 보기</button></div>`
      : st.feedMode === 'week' ? renderWeekBoard() : renderTodayFeed();
    return `${header('피드')}<main class="page">${seg}${filter}${body}</main>`;
  }

  // 피드에 보일 친구: 즐겨찾기만 / 팔로잉 전체
  function feedFriends(scope = feedScopeNow()) {
    const list = S.following(S.me().id);
    return scope === 'fav' ? list.filter((u) => S.isFavorite(u.id)) : list;
  }
  // 처음엔 즐겨찾기가 있으면 즐겨찾기, 없으면 전체
  function feedScopeNow() {
    if (st.feedScope === 'fav' || st.feedScope === 'all') return st.feedScope;
    return S.following(S.me().id).some((u) => S.isFavorite(u.id)) ? 'fav' : 'all';
  }
  // ☆ 즐겨찾기 버튼 (팔로우한 친구에게만)
  function favBtn(u, size = '') {
    if (u.id === S.me().id || !S.isFollowing(S.me().id, u.id)) return '';
    const on = S.isFavorite(u.id);
    return `<button class="star-btn ${size} ${on ? 'on' : ''}" data-action="fav" data-id="${u.id}" title="${on ? '즐겨찾기 해제' : '즐겨찾기'}" aria-label="${on ? '즐겨찾기 해제' : '즐겨찾기'}" aria-pressed="${on}">${on ? '★' : '☆'}</button>`;
  }
  // 일정 없는 친구는 접어 두는 줄
  function quietRow(quiet, what) {
    if (!quiet.length) return '';
    if (st.feedShowQuiet) return `<button class="link small quiet-toggle" data-action="feed-quiet">${what} 없는 친구 접기 ▴</button>`;
    return `<button class="quiet-row" data-action="feed-quiet">
      <span class="quiet-avatars">${quiet.slice(0, 5).map((u) => avatar(u, 24)).join('')}</span>
      <span>${what} 없는 친구 ${quiet.length}명 더 보기 ▾</span></button>`;
  }

  // 친구들 × 7일 표: 누가 언제 뭐 하는지 한눈에
  function renderWeekBoard() {
    const me = S.me();
    const days = Array.from({ length: 7 }, (_, i) => S.addDays(st.weekStart, i));
    const friends = feedFriends();
    need([me.id, ...friends.map((u) => u.id)], days[0], days[6]);
    const t0 = S.today();
    // 이번 주에 보이는 일정이 하나도 없는 친구는 아래로 접어 둠
    const has = (u) => days.some((d) => S.todosOn(u.id, d).some((t) => S.canSee(me.id, t)));
    const active = friends.filter(has), quiet = friends.filter((u) => !has(u));
    const people = [me, ...active, ...(st.feedShowQuiet ? quiet : [])];
    // 한 사람당 하루 3칸까지만 보이고, 더 있으면 [더보기]로 펼침
    const SHOW = 3;
    const rows = people.map((u) => {
      const cats = Object.fromEntries(S.categories(u.id).map((c) => [c.id, c]));
      const open = st.wkOpen.has(u.id);
      const lists = days.map((date) => S.todosOn(u.id, date).filter((t) => S.canSee(me.id, t)).sort(byTime));
      const more = lists.some((l) => l.length > SHOW);
      const cells = days.map((date, i) => {
        const list = lists[i];
        const shown = open ? list : list.slice(0, SHOW);
        const hidden = list.length - shown.length;
        return `<div class="wk-cell ${date === t0 ? 'today' : ''} ${open ? 'open' : ''}">${shown.map((t) => `<div class="wk-item ${t.done ? 'done' : ''}" style="--c:${cats[t.categoryId]?.color || '#8E8E93'}" title="${esc(t.title)}">${t.time ? `<b>${esc(t.time)}</b>` : ''}${esc(t.title)}</div>`).join('')}${hidden > 0 ? `<button class="wk-more" data-action="wk-open" data-id="${u.id}">+${hidden}개</button>` : ''}</div>`;
      }).join('');
      return `<div class="wk-name ${u.id === me.id ? '' : 'link-row'}"><span class="wk-who" ${u.id === me.id ? '' : `data-action="open-profile" data-id="${u.id}"`}>${avatar(u, 30)}<span>${u.id === me.id ? '나' : esc(u.nickname)}</span></span>${favBtn(u, 'sm')}${more ? `<button class="wk-toggle" data-action="wk-open" data-id="${u.id}">${open ? '접기 ▴' : '더보기 ▾'}</button>` : ''}</div>${cells}`;
    }).join('');
    const end = days[6];
    return `<div class="week-nav">
        <button class="icon-btn sm" data-action="week-move" data-dir="-1" aria-label="지난주">‹</button>
        <b>${fmtShort(st.weekStart)} – ${fmtShort(end)}</b>
        <button class="icon-btn sm" data-action="week-move" data-dir="1" aria-label="다음 주">›</button>
        ${st.weekStart !== weekStartOf(t0) ? '<button class="btn sm ghost" data-action="week-today">이번 주</button>' : ''}
      </div>
      <div class="week-scroll"><div class="week-board">
        <div class="wk-corner"></div>
        ${days.map((d) => `<div class="wk-day ${d === t0 ? 'today' : ''} ${S.parseDate(d).getDay() === 0 ? 'sun' : ''}">${WEEK[S.parseDate(d).getDay()]} <b>${S.parseDate(d).getDate()}</b></div>`).join('')}
        ${rows}
      </div></div>
      ${quietRow(quiet, '이번 주 일정')}
      <p class="hint">나만 보기 일정은 친구에게 보이지 않아요. 이름을 누르면 친구 캘린더로 가요.</p>`;
  }

  function renderTodayFeed() {
    const me = S.me();
    const date = S.today();
    const friends = feedFriends();
    need(friends.map((u) => u.id), date, date);
    const all = friends.map((u) => {
      const todos = S.todosOn(u.id, date).filter((t) => S.canSee(me.id, t)).sort(byTime);
      return { u, todos, done: todos.filter((t) => t.done).length, last: Math.max(0, ...todos.map((t) => t.doneAt || 0)) };
    }).sort((a, b) => b.last - a.last || b.todos.length - a.todos.length);
    const people = all.filter((p) => p.todos.length || st.feedShowQuiet);
    const quiet = all.filter((p) => !p.todos.length).map((p) => p.u);
    return `<p class="page-sub">${fmtDay(date)} · 친구가 끝낸 일에 이모티콘을 남겨보세요</p>
      ${!people.length && quiet.length && !st.feedShowQuiet ? '<p class="muted center small">오늘은 아직 일정을 올린 친구가 없어요</p>' : ''}
      <div class="feed-grid">${people.map(({ u, todos, done }) => {
        const cats = Object.fromEntries(S.categories(u.id).map((c) => [c.id, c]));
        const pct = todos.length ? Math.round((done / todos.length) * 100) : 0;
        return `<article class="card feed-card">
          <header class="feed-head" data-action="open-profile" data-id="${u.id}">
            ${avatar(u, 44)}
            <div class="grow"><div class="name">${esc(u.nickname)}</div><div class="sub">${todos.length ? `${done}/${todos.length} 완료` : '공개된 일정 없음'}</div></div>
            ${todos.length ? `<div class="ring" style="--p:${pct}"><span>${pct}%</span></div>` : ''}
          </header>
          ${favBtn(u)}
          <ul class="todos">${todos.map((t) => renderTodo(t, cats[t.categoryId], false, true)).join('')}</ul>
        </article>`;
      }).join('')}</div>
      ${quietRow(quiet, '오늘 일정')}`;
  }

  // ---------- 친구 ----------
  function renderFriends() {
    const me = S.me();
    const tabs = [['following', `팔로잉 ${S.following(me.id).length}`], ['followers', `팔로워 ${S.followers(me.id).length}`]];
    return `${header('친구')}<main class="page narrow">
      <div class="search"><span>🔍</span><input id="search-input" placeholder="닉네임 또는 아이디 검색" value="${esc(st.q)}" autocomplete="off"></div>
      <div class="segment two">${tabs.map(([k, l]) => `<button class="${st.friendsTab === k ? 'on' : ''}" data-action="friends-tab" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="friend-list">${renderFriendList()}</div>
    </main>`;
  }

  function renderFriendList() {
    const me = S.me();
    let rows;
    if (st.q.trim()) {
      const found = S.searchUsers(st.q);
      if (!found.length) return '<p class="muted center">검색 결과가 없어요</p>';
      rows = found.map((u) => ({ u, sub: u.bio }));
    } else rows = (st.friendsTab === 'following' ? S.following(me.id) : S.followers(me.id)).map((u) => ({ u, sub: u.bio }));
    if (!rows.length) return `<p class="muted center">${st.friendsTab === 'following' ? '아직 팔로우한 친구가 없어요. 위 검색창에 친구 닉네임이나 아이디를 검색해 보세요!' : '아직 팔로워가 없어요.'}</p>`;
    return `<ul class="user-list">${rows.map(({ u, sub }) => userRow(u, sub)).join('')}</ul>`;
  }

  function followBtn(u) {
    const me = S.me();
    if (u.id === me.id) return '';
    if (S.isFollowing(me.id, u.id)) return `<button class="btn sm outline" data-action="unfollow" data-id="${u.id}">팔로잉</button>`;
    return `<button class="btn sm primary" data-action="follow" data-id="${u.id}">${S.isFollowing(u.id, me.id) ? '맞팔로우' : '팔로우'}</button>`;
  }

  function userRow(u, sub) {
    return `<li class="user-row">
      <div class="user-main" data-action="open-profile" data-id="${u.id}">${avatar(u, 44)}
        <div class="grow"><div class="name">${esc(u.nickname)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div></div>
      ${favBtn(u)}${followBtn(u)}
    </li>`;
  }

  // ---------- 친구 프로필: 친구 캘린더 + 선택한 날 ----------
  function renderProfile(userId) {
    const u = S.user(userId);
    if (!u) { st.view = null; return renderToday(); }
    const me = S.me();
    const { date, month } = st.view;
    const todos = S.todosOn(u.id, date).filter((t) => S.canSee(me.id, t));
    const done = todos.filter((t) => t.done).length;
    const cal = renderCalendar({ scope: 'profile', month, selDate: date, sources: [{ userId: u.id }], owner: u.id });
    const hiddenHint = !S.isFollowing(me.id, u.id) ? '<p class="hint">팔로우하면 “👥 팔로워만” 공개한 일정도 볼 수 있어요.</p>' : '';
    return `${header(esc(u.nickname), { back: true })}<main class="page">
      <section class="profile-card card">
        ${avatar(u, 64)}
        <div class="grow">
          <div class="name lg">${esc(u.nickname)}</div>
          ${u.bio ? `<div class="sub">${esc(u.bio)}</div>` : ''}
          <div class="counts"><span><b>${S.followers(u.id).length}</b> 팔로워</span><span><b>${S.following(u.id).length}</b> 팔로잉</span></div>
        </div>
        ${favBtn(u)}${followBtn(u)}
      </section>
      <div class="split">
        <div class="col-main">${cal}</div>
        <div class="col-side">
          <div class="day-head"><h2>${fmtDay(date)}</h2></div>
          ${todos.length ? `<div class="card summary"><div class="label">할 일</div><div class="big-num">${done} <span>/ ${todos.length} 완료</span></div>
              <div class="progress"><div style="width:${Math.round((done / todos.length) * 100)}%"></div></div></div>
            ${S.categories(u.id).map((c) => renderCategory(c, todos.filter((t) => t.categoryId === c.id).sort(byTime), { own: false })).join('')}`
            : '<div class="empty small-empty"><div class="empty-emoji">🫥</div><p>이 날 공개된 일정이 없어요</p></div>'}
          ${hiddenHint}
        </div>
      </div>
    </main>`;
  }

  // ---------- 알림 ----------
  function renderNotifs() {
    const list = S.notifications();
    return `${header('알림', { back: true })}<main class="page narrow">
      ${list.length ? `<ul class="notif-list">${list.map((n) => {
        const from = S.user(n.fromUserId); if (!from) return '';
        let text;
        if (n.type === 'follow') text = `<b>${esc(from.nickname)}</b>님이 회원님을 팔로우하기 시작했어요.`;
        else text = `<b>${esc(from.nickname)}</b>님이 ${n.todoTitle ? `‘${esc(n.todoTitle)}’에 ` : ''}${esc(n.emoji)} 반응을 남겼어요.`;
        return `<li class="notif ${n.read ? '' : 'unread'}">
          <div class="user-main" data-action="open-profile" data-id="${from.id}">${avatar(from, 40)}<div class="grow"><div>${text}</div><div class="sub">${timeAgo(n.at)}</div></div></div>
          ${n.type === 'follow' ? followBtn(from) : ''}
        </li>`;
      }).join('')}</ul>` : '<div class="empty"><div class="empty-emoji">🔔</div><p>아직 알림이 없어요</p></div>'}
    </main>`;
  }

  // ---------- MY ----------
  function renderMy() {
    const me = S.me();
    if (st.hasPw === undefined) { st.hasPw = null; S.hasPassword().then((v) => { st.hasPw = v; render(); }); }
    need([me.id], S.addDays(S.today(), -29), S.today());
    const s = S.stats(me.id);
    const max = Math.max(1, ...s.daily.map((d) => d.done));
    const catMax = Math.max(1, ...s.byCategory.map((c) => c.done));
    return `${header('MY')}<main class="page narrow">
      <section class="profile-card card">
        ${avatar(me, 72)}
        <div class="grow">
          <div class="name lg">${esc(me.nickname)}</div>
          <div class="sub">${esc(me.bio || '@' + me.username)}</div>
          <div class="counts">
            <button data-action="goto-friends" data-tab="followers"><b>${S.followers(me.id).length}</b> 팔로워</button>
            <button data-action="goto-friends" data-tab="following"><b>${S.following(me.id).length}</b> 팔로잉</button>
          </div>
        </div>
        <button class="btn sm outline" data-action="edit-profile">편집</button>
      </section>

      <h3 class="section-title">통계</h3>
      <div class="stat-grid">
        <div class="card stat"><div class="label">연속 달성</div><div class="big-num">${s.streak}<span>일</span></div></div>
        <div class="card stat"><div class="label">이번 주 달성률</div><div class="big-num">${s.weekRate}<span>%</span></div></div>
        <div class="card stat"><div class="label">받은 공감 (30일)</div><div class="big-num">${s.cheers}<span>개</span></div></div>
        <div class="card stat"><div class="label">완료 (30일)</div><div class="big-num">${s.totalDone}<span>개</span></div></div>
      </div>

      <div class="card">
        <div class="label">최근 7일 완료한 할 일</div>
        <div class="bars">${s.daily.map((d) => `<div class="bar-col">
          <div class="bar-val">${d.done || ''}</div>
          <div class="bar" style="height:${Math.max(2, (d.done / max) * 100)}%"></div>
          <div class="bar-label ${d.date === S.today() ? 'on' : ''}">${WEEK[S.parseDate(d.date).getDay()]}</div></div>`).join('')}</div>
      </div>

      ${s.byCategory.length ? `<div class="card"><div class="label">카테고리별 완료 (7일)</div>
        ${s.byCategory.map(({ cat, done }) => `<div class="hbar"><span class="hbar-name">${esc(cat.emoji)} ${esc(cat.name)}</span>
          <div class="hbar-track"><div style="width:${(done / catMax) * 100}%;background:${cat.color}"></div></div><span class="hbar-val">${done}개</span></div>`).join('')}
      </div>` : ''}

      <h3 class="section-title">알림</h3>
      <div class="card settings">${renderNotifySettings()}</div>

      <h3 class="section-title">꾸미기</h3>
      <div class="card settings">
        ${renderThemeSettings()}
        ${renderCalSettings()}
      </div>

      <h3 class="section-title">위젯</h3>
      <div class="card settings">
        <button class="set-row" data-action="open-widget"><span>바탕화면 위젯 만들기</span><span class="chev">›</span></button>
      </div>

      <h3 class="section-title">일정</h3>
      <div class="card settings">
        <label class="set-row"><span>새 할 일 기본 공개범위</span>
          <select data-change="default-vis">${Object.entries(S.VIS).map(([k, v]) => `<option value="${k}" ${me.defaultVis === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select></label>
        <button class="set-row" data-action="open-cats"><span>카테고리 관리</span><span class="chev">›</span></button>
      </div>

      <h3 class="section-title">계정</h3>
      <div class="card settings">
        ${st.hasPw ? '<button class="set-row" data-action="open-password"><span>비밀번호 바꾸기</span><span class="chev">›</span></button>' : ''}
        <button class="set-row" data-action="logout"><span>로그아웃</span><span class="chev">›</span></button>
        <button class="set-row danger small-row" data-action="open-delete-account"><span>회원 탈퇴</span><span class="chev">›</span></button>
      </div>
      <p class="muted center small">갓생메이트 v0.3 · @${esc(me.username)}</p>
    </main>`;
  }

  function renderNotifySettings() {
    if (!canNotify()) return '<div class="set-row"><span>데스크톱 알림</span><span class="muted small">이 브라우저는 알림을 지원하지 않아요</span></div>';
    const n = loadNotify();
    const denied = Notification.permission === 'denied';
    const on = n.on && Notification.permission === 'granted';
    return `<div class="set-row"><span>데스크톱 알림</span>
        <span class="row-btns"><span class="muted small">${denied ? '차단됨' : on && n.push ? '앱 꺼도 받기' : ''}</span>
        <button class="toggle ${on ? 'on' : ''}" data-action="notify-toggle" role="switch" aria-checked="${on}" aria-label="데스크톱 알림"><i></i></button></span></div>
      ${on ? `<div class="set-sub">
        <label><input type="checkbox" data-change="notify-reaction" ${n.reaction ? 'checked' : ''}> 공감 이모티콘</label>
        <label><input type="checkbox" data-change="notify-follow" ${n.follow ? 'checked' : ''}> 새 팔로워</label>
        <button class="link small" data-action="notify-test">알림 시험해 보기</button>
      </div>` : ''}
      ${denied ? `<details class="set-help"><summary>알림 다시 켜는 방법 보기</summary>
        · <b>Safari</b>: 메뉴 Safari → 설정 → 웹사이트 → 알림 → 이 사이트를 '허용'<br>
        · <b>Chrome</b>: 주소창 왼쪽 아이콘 → 사이트 설정 → 알림 '허용'<br>
        · <b>맥</b>: 시스템 설정 → 알림 → 브라우저 알림 켜기<br>· <b>윈도우</b>: 설정 → 시스템 → 알림 → 브라우저 알림 켜기<br>· <b>폰</b>: 홈 화면에 추가한 갓생메이트의 알림 허용</details>` : ''}`;
  }

  function renderCalSettings() {
    const c = myCal();
    const n = c.stickers.filter(validSticker).length;
    const cur = CAL_DECOS.find(([k]) => k === c.deco) || CAL_DECOS[0];
    const list = `<div class="deco-list" role="listbox">${CAL_DECOS.map(([k, name, icon]) => `<button class="${c.deco === k ? 'on' : ''}" data-action="cal-deco" data-deco="${k}" role="option" aria-selected="${c.deco === k}"><span class="ic">${icon}</span>${name}${c.deco === k ? '<span class="check">✓</span>' : ''}</button>`).join('')}</div>`;
    return `<div class="set-row"><span>달력 테마</span>
        ${pop('deco', `<span>${cur[2]}</span>${cur[1]}`, list)}</div>
      <button class="set-row" data-action="sticker-mode"><span>스티커 붙이기</span><span class="muted small">${n ? `${n}개 붙어 있음 ` : ''}<span class="chev">›</span></span></button>
      <div class="set-row"><span>달력 배경 사진</span>
        <span class="row-btns">${c.bg ? '<button class="btn sm ghost" data-action="cal-bg-remove">지우기</button>' : ''}
          <label class="btn sm outline">${c.bg ? '바꾸기' : '고르기'}<input type="file" accept="image/*" data-change="cal-bg" hidden></label></span></div>
      ${c.bg ? `<label class="deco-op"><span class="muted small">사진 진하기</span><input type="range" min="5" max="100" step="5" value="${c.op}" data-change="cal-op" aria-label="배경 사진 진하기"><b>${c.op}%</b></label>` : ''}`;
  }

  // 스티커 붙이기 판 (오늘 탭 달력 위에 뜸)
  function renderStickerTray() {
    const t = st.sticker;
    const groups = emojiGroups();
    const tabs = [['art', '🐰', '그림'], ['recent', '🕘', '최근'], ...groups.map(([icon, name], i) => ['g' + i, icon, name])];
    const items = t.tab === 'art' ? ART_STICKERS.map((k) => 'a:' + k)
      : t.tab === 'recent' ? recentEmojis()
      : groups[+t.tab.slice(1)][2];
    return `<section class="card sticker-tray">
      <div class="tray-head"><b>스티커 붙이기</b>
        <span class="muted small grow">고른 다음 달력을 누르면 붙어요 · 끌어서 옮기기 · ✕ 로 떼기</span>
        ${myCal().stickers.filter(validSticker).length ? '<button class="btn sm ghost" data-action="sticker-clear">모두 떼기</button>' : ''}
        <button class="btn sm primary" data-action="sticker-done">완료</button></div>
      <div class="emoji-tabs">${tabs.map(([k, icon, name]) => `<button type="button" class="${t.tab === k ? 'on' : ''}" data-action="sticker-tab" data-tab="${k}" title="${name}" aria-label="${name}">${icon}</button>`).join('')}</div>
      <div class="emoji-grid scroll tray-grid">${items.map((k) => `<button type="button" class="${t.pick === k ? 'on' : ''}" data-action="sticker-pick" data-s="${esc(k)}">${stickerFace(k)}</button>`).join('')}</div>
      <div class="tray-size"><span class="muted small">크기</span>${[[1, '작게'], [2, '보통'], [3, '크게']].map(([z, l]) => `<button class="${t.size === z ? 'on' : ''}" data-action="sticker-size" data-z="${z}">${l}</button>`).join('')}</div>
    </section>`;
  }

  function renderThemeSettings() {
    const t = loadTheme();
    const cur = t.color || DEFAULT_THEME;
    const preset = THEMES.find(([, c]) => c === cur);
    const panel = `<div class="swatch-grid">
        ${THEMES.map(([name, c]) => `<button class="${c === cur ? 'on' : ''}" style="--sw:${c}" data-action="theme" data-color="${c}"><i></i>${name}</button>`).join('')}
        <label class="${preset ? '' : 'on'}"><i class="rainbow"></i>직접 고르기<input type="color" value="${cur}" data-change="theme-color" aria-label="색 직접 고르기"></label>
      </div>`;
    return `<div class="set-row"><span>테마 색</span>${pop('theme', `<i class="dot" style="background:${cur}"></i>${preset ? preset[0] : '내 색'}`, panel)}</div>
      <label class="set-row"><span>화면 모드</span>
        <select data-change="theme-mode">
          ${[['auto', '자동 (기기 설정 따라)'], ['light', '밝게'], ['dark', '어둡게']].map(([v, l]) => `<option value="${v}" ${(t.mode || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>`;
  }

  // =============================================================
  //  그룹 (약속 잡기) — 개인 할 일과 완전히 별개
  //  그룹 멤버끼리 개인 일정을 공유하는 방. 달력에 비어 있는 날 = 다 같이 만날 수 있는 날
  // =============================================================
  const GROUP_COLORS = ['#FF6B6B', '#4D96FF', '#6BCB77', '#FFB400', '#B983FF', '#FF8FB1', '#2EC4B6', '#FF9F45', '#8D99AE', '#A0522D'];

  function renderGroup() {
    if (!S.groupsReady()) {
      if (!st.groupLoading) {
        st.groupLoading = true; st.groupFailed = false;
        S.ensureGroups().then((ok) => { st.groupLoading = false; st.groupFailed = !ok && !S.groupsReady(); render(); });
      }
      return `${header('그룹')}<main class="page">${st.groupFailed
        ? '<div class="empty"><p>그룹을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p><button class="btn outline" data-action="g-retry">다시 시도</button></div>'
        : '<p class="muted center">불러오는 중…</p>'}</main>`;
    }
    const list = S.groups();
    if (st.groupId && !S.group(st.groupId)) st.groupId = null;
    if (!st.groupId && list.length) st.groupId = list[0].id;
    const g = st.groupId ? S.group(st.groupId) : null;

    const chips = `<div class="g-chips">
      ${list.map((x) => `<button class="g-chip ${x.id === st.groupId ? 'on' : ''}" data-action="g-select" data-id="${x.id}">${esc(x.name)}</button>`).join('')}
      <button class="g-chip add" data-action="g-form" data-form="create">+ 새 그룹</button>
      <button class="g-chip add" data-action="g-form" data-form="join">코드로 참여</button>
    </div>`;
    const form = st.groupForm === 'create'
      ? `<form class="card g-form" data-form="g-create"><b>새 그룹 만들기</b>
          <input name="name" placeholder="그룹 이름 (예: 고등학교 친구들)" maxlength="20" autocomplete="off" required>
          <div class="modal-actions"><button type="button" class="btn ghost" data-action="g-form" data-form="">취소</button><button class="btn primary" ${st.busy ? 'disabled' : ''}>만들기</button></div></form>`
      : st.groupForm === 'join'
        ? `<form class="card g-form" data-form="g-join"><b>코드로 참여하기</b>
            <input name="code" placeholder="친구에게 받은 6자리 코드" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" required>
            <div class="modal-actions"><button type="button" class="btn ghost" data-action="g-form" data-form="">취소</button><button class="btn primary" ${st.busy ? 'disabled' : ''}>참여하기</button></div></form>`
        : '';

    if (!g) {
      return `${header('그룹')}<main class="page">${chips}${form || `<div class="empty">
        <div class="empty-emoji">🤝</div>
        <p>친구들과 일정을 공유하는 방이에요.<br>각자 일정을 달력에 적으면, <b>비어 있는 날</b>에 만나면 돼요.</p>
        <button class="btn primary" data-action="g-form" data-form="create">+ 그룹 만들기</button>
        <button class="btn ghost" data-action="g-form" data-form="join">코드로 참여</button></div>`}</main>`;
    }

    const me = S.me();
    const isOwner = S.isGroupOwner(g.id);
    const members = S.groupMembers(g.id);
    const colorOf = Object.fromEntries(members.map((m) => [m.userId, m.color]));
    const myColor = colorOf[me.id] || GROUP_COLORS[0];
    const busyToday = S.busyBetween(g.id, st.gDate, st.gDate).sort((a, b) => a.createdAt - b.createdAt);

    return `${header('그룹')}<main class="page">${chips}${form}
      <section class="card g-head">
        <div class="g-title"><h2>${esc(g.name)}</h2>
          <div class="g-code-box">
            ${st.showCode === g.id
              ? `<button class="g-code" data-action="g-copy" title="눌러서 복사">초대 코드 <b>${esc(g.code)}</b> 📋</button>
                 <button class="link small" data-action="g-code-hide">숨기기</button>`
              : '<button class="g-code" data-action="g-code-show">초대 코드 보기</button>'}
            ${isOwner ? '<button class="link small" data-action="g-code-new">코드 바꾸기</button>' : ''}
          </div></div>
        <div class="g-members">${members.map((m) => `<span class="g-member" style="--c:${m.color}"><i></i>${m.userId === g.createdBy ? '👑 ' : ''}${esc(m.user.nickname)}${m.userId === me.id ? ' (나)' : ''}${isOwner && m.userId !== me.id ? `<button class="g-kick" data-action="g-kick" data-id="${m.userId}" title="내보내기" aria-label="${esc(m.user.nickname)} 내보내기">✕</button>` : ''}</span>`).join('')}</div>
        <div class="g-mycolor"><span class="label">내 색</span>
          ${pop('g-color', `<i class="dot" style="background:${myColor}"></i>바꾸기`, `<div class="swatch-grid dots">
            ${GROUP_COLORS.map((c) => `<button class="${c === myColor ? 'on' : ''}" style="--sw:${c}" data-action="g-color" data-color="${c}" aria-label="색 ${c}"><i></i></button>`).join('')}
            <label class="${GROUP_COLORS.includes(myColor) ? '' : 'on'}" title="직접 고르기"><i class="rainbow"></i><input type="color" value="${myColor}" data-change="g-color" aria-label="색 직접 고르기"></label>
          </div>`, 'sm')}
        </div>
      </section>
      <div class="split">
        <div class="col-main">${renderGroupCalendar(g, colorOf)}</div>
        <div class="col-side">
          <div class="day-head"><h2>${fmtDay(st.gDate)}</h2></div>
          <section class="card">
            ${busyToday.length
              ? `<ul class="busy-list">${busyToday.map((b) => {
                  const u = S.user(b.userId);
                  return `<li style="--c:${colorOf[b.userId] || '#8E8E93'}"><i></i><b>${esc(u ? u.nickname : '?')}</b><span>${esc(b.label)}</span>
                    ${b.userId === me.id ? `<button class="icon-btn sm" data-action="g-busy-del" data-id="${b.id}" aria-label="지우기">✕</button>` : ''}</li>`;
                }).join('')}</ul>`
              : '<p class="muted g-empty">아직 적힌 일정이 없어요</p>'}
            <form class="g-add" data-form="g-busy">
              <span class="dot" style="background:${myColor}"></span>
              <input name="label" placeholder="일정 적기 (예: 알바 10~18시, 7시부터 가능)" maxlength="40" autocomplete="off" required>
              <button class="btn sm primary">추가</button>
            </form>
            <p class="hint">내가 적은 것만 지울 수 있어요. 개인 할 일과는 따로예요.</p>
          </section>
          <button class="btn ghost full g-leave" data-action="g-leave">${isOwner ? '그룹 삭제하기' : '그룹 나가기'}</button>
        </div>
      </div>
    </main>`;
  }

  function renderGroupCalendar(g, colorOf) {
    const [y, m] = st.gMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const start = S.addDays(S.fmtDate(first), -first.getDay());
    const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);
    const end = S.addDays(start, weeks * 7 - 1);
    S.prefetchGroup(g.id, start, end).then((changed) => changed && render());
    const byDate = {};
    S.busyBetween(g.id, start, end).forEach((b) => (byDate[b.date] ||= []).push(b));
    const t0 = S.today();
    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const date = S.addDays(start, i);
      const d = S.parseDate(date);
      const list = (byDate[date] || []).sort((a, b) => a.createdAt - b.createdAt);
      const inMonth = d.getMonth() + 1 === m;
      const chips = list.slice(0, 4).map((b) => {
        const u = S.user(b.userId);
        return `<div class="chip" style="--c:${colorOf[b.userId] || '#8E8E93'}"><i>${esc(u ? u.nickname : '?')}</i> ${esc(b.label)}</div>`;
      }).join('');
      cells += `<button class="cal-cell ${inMonth ? '' : 'out'} ${date === st.gDate ? 'sel' : ''} ${date === t0 ? 'today' : ''} ${d.getDay() === 0 ? 'sun' : ''} ${date < t0 ? 'past' : ''}" data-action="g-date" data-date="${date}">
        <span class="num">${d.getDate()}</span>${chips}${list.length > 4 ? `<div class="more">+${list.length - 4}개</div>` : ''}
      </button>`;
    }
    const deco = calDeco(S.me().id, { stickers: false });
    return `<section class="card calendar g-cal" ${deco.attrs}>
      <div class="cal-head">
        <h3>${y}년 ${m}월</h3>
        <div class="cal-nav">
          <button class="btn sm ghost" data-action="g-today">이번 달</button>
          <button class="icon-btn sm" data-action="g-month" data-dir="-1" aria-label="이전 달">‹</button>
          <button class="icon-btn sm" data-action="g-month" data-dir="1" aria-label="다음 달">›</button>
        </div>
      </div>
      <div class="cal-week">${WEEK.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </section>`;
  }

  // 시간 고르기: 오전/오후 · 시 · 분을 따로 골라요 (저장은 "14:30" 형식)
  function timePicker(value) {
    const [h, m] = value ? value.split(':').map(Number) : [null, null];
    const ampm = h === null ? '' : h < 12 ? 'am' : 'pm';
    const h12 = h === null ? '' : (h % 12 || 12);
    const opt = (v, label, sel) => `<option value="${v}" ${sel ? 'selected' : ''}>${label}</option>`;
    return `<div class="time-pick">
      <select name="ampm" aria-label="오전/오후">${opt('', '시간 없음', !ampm)}${opt('am', '오전', ampm === 'am')}${opt('pm', '오후', ampm === 'pm')}</select>
      <select name="hour" aria-label="시">${Array.from({ length: 12 }, (_, i) => i + 1).map((n) => opt(n, `${n}시`, n === (h12 || 9))).join('')}</select>
      <select name="minute" aria-label="분">${[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((n) => opt(n, `${String(n).padStart(2, '0')}분`, n === (m === null ? 0 : m - (m % 5)))).join('')}</select>
    </div>`;
  }
  function readTimePicker(f) {
    if (!f.ampm.value) return '';
    let h = Number(f.hour.value) % 12;
    if (f.ampm.value === 'pm') h += 12;
    return `${String(h).padStart(2, '0')}:${String(Number(f.minute.value)).padStart(2, '0')}`;
  }

  // ---------- 이모티콘 창 ----------
  const RECENT_KEY = 'studymate_recent_emoji';
  function recentEmojis() {
    let r = [];
    try { r = JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { /* 무시 */ }
    r = r.filter(S.isEmoji);
    return [...new Set([...r, ...S.REACTIONS])].slice(0, 16);
  }
  function rememberEmoji(e) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...recentEmojis().filter((x) => x !== e)].slice(0, 16))); } catch (err) { /* 무시 */ }
  }
  // 이모티콘 목록을 한 글자(이모티콘)씩 나눠 둠 (처음 한 번만)
  let emojiCache = null;
  function emojiGroups() {
    if (emojiCache) return emojiCache;
    const seg = 'Segmenter' in Intl ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
    const split = (s) => (seg ? [...seg.segment(s)].map((x) => x.segment) : [...s]);
    emojiCache = (window.EMOJI_GROUPS || []).map(([icon, name, list]) => [icon, name, [...new Set(split(list))].filter(S.isEmoji)]);
    return emojiCache;
  }
  function pickEmoji(e) {
    if (!S.isEmoji(e)) { st.modal.error = '이모티콘 1개만 넣어주세요.'; return; }
    rememberEmoji(e);
    S.toggleReaction(st.modal.id, e);
    st.modal = null;
  }

  // ---------- 팝업(모달) ----------
  function renderModal() {
    const m = st.modal;
    let inner = '';
    if (m.type === 'todo') {
      const t = m.id ? S.todo(m.id) : null;
      const cats = S.categories(S.me().id);
      const vis = t ? t.visibility : S.me().defaultVis;
      inner = `<h2>${t ? '할 일 수정' : '할 일 추가'}</h2>
      <form data-form="todo">
        <label class="field"><span>할 일 / 일정</span><input name="title" value="${esc(t?.title || '')}" maxlength="80" required></label>
        <label class="field"><span>카테고리</span><select name="categoryId">${cats.map((c) => `<option value="${c.id}" ${(t?.categoryId || m.categoryId) === c.id ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>날짜</span><input type="date" name="date" value="${t?.date || st.selDate}" required></label>
        <div class="field"><span>시간 (선택)</span>${timePicker(t?.time || '')}</div>
        <div class="field"><span>공개범위</span><div class="vis-pick">${Object.entries(S.VIS).map(([k, v]) => `<label><input type="radio" name="visibility" value="${k}" ${vis === k ? 'checked' : ''}><span>${v.icon}<br>${v.label}</span></label>`).join('')}</div></div>
        <div class="modal-actions">
          ${t ? `<button type="button" class="btn danger-ghost" data-action="delete-todo" data-id="${t.id}">삭제</button>
                 <button type="button" class="btn ghost" data-action="tomorrow" data-id="${t.id}">내일 하기</button>` : ''}
          <button type="submit" class="btn primary">저장</button>
        </div>
      </form>`;
    } else if (m.type === 'cats') {
      const cats = S.categories(S.me().id);
      inner = `<h2>카테고리 관리</h2>
      <ul class="cat-manage">${cats.map((c, i) => `<li style="--c:${c.color}">
        <span class="dot"></span><span class="grow">${esc(c.emoji)} ${esc(c.name)}</span>
        <button class="icon-btn sm" data-action="cat-move" data-id="${c.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn sm" data-action="cat-move" data-id="${c.id}" data-dir="1" ${i === cats.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn sm ghost" data-action="edit-cat" data-id="${c.id}">수정</button>
      </li>`).join('')}</ul>
      <button class="btn primary full" data-action="edit-cat">+ 새 카테고리</button>`;
    } else if (m.type === 'cat') {
      const c = m.id ? S.category(m.id) : { name: '', emoji: '📌', color: S.COLORS[5] };
      inner = `<h2>${m.id ? '카테고리 수정' : '새 카테고리'}</h2>
      <form data-form="cat">
        <div class="field-row">
          <label class="field emoji-field"><span>이모지</span><input name="emoji" value="${esc(c.emoji)}" maxlength="4"></label>
          <label class="field grow"><span>이름</span><input name="name" value="${esc(c.name)}" maxlength="20" placeholder="예: 병리학, 약속, 알바" required></label>
        </div>
        <div class="field"><span>색상</span><div class="swatches">${S.COLORS.map((col) => `<label><input type="radio" name="color" value="${col}" ${c.color === col ? 'checked' : ''}><span style="background:${col}"></span></label>`).join('')}
          <label class="custom-color" title="직접 고르기"><input type="radio" name="color" value="custom" ${S.COLORS.includes(c.color) ? '' : 'checked'}><span style="--pick:${S.COLORS.includes(c.color) ? 'transparent' : c.color}"></span>
            <input type="color" name="customColor" value="${S.COLORS.includes(c.color) ? '#4F8EF7' : c.color}" data-change="custom-color"></label>
        </div><small class="muted">마지막 동그라미를 누르면 원하는 색을 직접 고를 수 있어요</small></div>
        <div class="modal-actions">
          ${m.id ? `<button type="button" class="btn danger-ghost" data-action="delete-cat" data-id="${m.id}">삭제</button>` : ''}
          <button type="button" class="btn ghost" data-action="open-cats">취소</button>
          <button type="submit" class="btn primary">저장</button>
        </div>
      </form>`;
    } else if (m.type === 'profile') {
      const me = S.me();
      const preview = { ...me, avatar: m.avatar ?? me.avatar };
      inner = `<h2>프로필 편집</h2>
      <form data-form="profile">
        <div class="avatar-edit">${avatar(preview, 88)}
          <div class="avatar-btns">
            <label class="btn sm outline">사진 선택<input type="file" accept="image/*" data-change="avatar-file" hidden></label>
            <div class="emoji-avatars">${['🐰', '🐻', '🦊', '🐧', '🐱', '🐶', '🐼', '🐯'].map((e) => `<button type="button" data-action="avatar-emoji" data-e="${e}">${e}</button>`).join('')}</div>
            <button type="button" class="link small" data-action="avatar-emoji" data-e="">기본 이미지로</button>
          </div>
        </div>
        <label class="field"><span>닉네임</span><input name="nickname" value="${esc(me.nickname)}" maxlength="12" required></label>
        <label class="field"><span>한 줄 소개</span><input name="bio" value="${esc(me.bio)}" maxlength="40" placeholder="예: 의대 본과 2학년 🩺"></label>
        ${m.error ? `<p class="error">${esc(m.error)}</p>` : ''}
        <div class="modal-actions"><button type="button" class="btn ghost" data-action="close-modal">취소</button><button type="submit" class="btn primary">저장</button></div>
      </form>`;
    } else if (m.type === 'emoji') {
      const mine = new Set(S.reactionSummary(m.id).filter((r) => r.mine).map((r) => r.e));
      const cell = (e) => `<button type="button" class="${mine.has(e) ? 'on' : ''}" data-action="emoji-pick" data-e="${esc(e)}">${esc(e)}</button>`;
      const groups = emojiGroups();
      inner = `<h2>이모티콘 달기</h2>
      <form data-form="emoji-custom" class="emoji-input">
        <input name="e" placeholder="이모티콘 직접 입력" autocomplete="off" aria-label="이모티콘 직접 입력">
        <button class="btn sm primary">달기</button>
      </form>
      ${m.error ? `<p class="error">${esc(m.error)}</p>` : ''}
      <div class="emoji-label">최근 사용</div>
      <div class="emoji-grid recent">${recentEmojis().map(cell).join('')}</div>
      <div class="emoji-tabs">${groups.map(([icon, name], i) => `<button type="button" class="${m.group === i ? 'on' : ''}" data-action="emoji-group" data-g="${i}" title="${name}" aria-label="${name}">${icon}</button>`).join('')}</div>
      <div class="emoji-label">${groups[m.group][1]}</div>
      <div class="emoji-grid scroll">${groups[m.group][2].map(cell).join('')}</div>
      <p class="muted small">이미 단 이모티콘을 다시 누르면 취소돼요 · 한 할 일에 10개까지</p>`;
    } else if (m.type === 'password') {
      inner = `<h2>비밀번호 바꾸기</h2>
      <form data-form="password">
        <label class="field"><span>지금 비밀번호</span><input type="password" name="current" autocomplete="current-password" required></label>
        <label class="field"><span>새 비밀번호 (8자 이상)</span><input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
        <label class="field"><span>새 비밀번호 한 번 더</span><input type="password" name="next2" autocomplete="new-password" minlength="8" required></label>
        ${m.error ? `<p class="error">${esc(m.error)}</p>` : ''}
        <div class="modal-actions"><button type="button" class="btn ghost" data-action="close-modal">취소</button><button type="submit" class="btn primary" ${st.busy ? 'disabled' : ''}>바꾸기</button></div>
      </form>`;
    } else if (m.type === 'widget') {
      const opt = (k, v, label) => `<button type="button" class="${m[k] === v ? 'on' : ''}" data-action="w-set" data-k="${k}" data-v="${v}">${label}</button>`;
      inner = `<h2>바탕화면 위젯</h2>
      <div class="field"><span>종류</span><div class="seg-pick">${opt('w', 'cal', '달력')}${opt('w', 'todo', '오늘 할 일')}</div></div>
      <div class="field"><span>크기</span><div class="seg-pick">${opt('size', 's', '작게')}${opt('size', 'm', '보통')}${opt('size', 'l', '크게')}</div></div>
      <div class="field"><span>배경 진하기</span><div class="seg-pick">${opt('op', 100, '100%')}${opt('op', 85, '85%')}${opt('op', 70, '70%')}${opt('op', 50, '50%')}</div></div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-action="w-copy">주소 복사</button><button type="button" class="btn primary" data-action="w-open">위젯 열기</button></div>
      <details class="set-help"><summary>바탕화면에 계속 두는 방법</summary>
        <b>Chrome</b>: 위젯 창에서 주소를 복사해 새 탭에 붙여넣기 → 오른쪽 위 ⋮ → 전송, 저장, 공유 → <b>바로가기 만들기</b> → '창으로 열기' 체크 → 만들기.<br>
        이제 Dock·Launchpad에서 위젯만 따로 열 수 있어요. 창 크기를 줄여 화면 구석에 두세요.<br>
        <b>Safari</b>: 위젯 주소를 연 상태에서 메뉴 파일 → <b>Dock에 추가</b>.<br>
        · 위젯 창도 다른 창처럼 움직이는 창이라, 다른 창 뒤로 갈 수 있어요.</details>`;
    } else if (m.type === 'delete-account') {
      inner = `<h2>회원 탈퇴</h2>
      <form data-form="delete-account">
        <p class="set-help">탈퇴하면 <b>할 일, 카테고리, 받은 공감, 팔로우, 그룹 일정</b>이 모두 지워지고 <b>되돌릴 수 없어요.</b><br>
          내가 방장인 그룹은 다른 멤버에게 방장이 넘어가요. (혼자 있는 그룹은 삭제돼요)</p>
        ${st.hasPw ? '<label class="field"><span>비밀번호 확인</span><input type="password" name="password" autocomplete="current-password" required></label>' : ''}
        <label class="field"><span>확인을 위해 <b>탈퇴</b> 라고 입력해주세요</span><input name="confirm" autocomplete="off" required></label>
        ${m.error ? `<p class="error">${esc(m.error)}</p>` : ''}
        <div class="modal-actions"><button type="button" class="btn ghost" data-action="close-modal">취소</button><button type="submit" class="btn danger-ghost" ${st.busy ? 'disabled' : ''}>탈퇴하기</button></div>
      </form>`;
    }
    return `<div class="modal-bg" data-action="close-modal"><div class="sheet" data-stop>${inner}</div></div>`;
  }

  // =============================================================
  //  버튼 동작
  // =============================================================
  const monthOf = (date) => date.slice(0, 7);
  const shiftMonth = (month, dir) => { const [y, m] = month.split('-').map(Number); return S.fmtDate(new Date(y, m - 1 + dir, 1)).slice(0, 7); };

  const actions = {
    'google-login'() { authRun(() => S.loginWithGoogle()); return false; },
    'auth-mode'() { st.authMode = st.authMode === 'login' ? 'signup' : 'login'; st.authError = ''; },
    tab({ tab }) { st.tab = tab; st.view = null; st.stickerMode = false; window.scrollTo(0, 0); },
    back() { st.view = null; },
    'open-notifs'() { st.view = { type: 'notifs' }; render(); S.markAllRead(); return false; },
    'open-profile'({ id }) {
      if (id === S.me().id) { st.view = null; st.tab = 'my'; }
      else st.view = { type: 'profile', userId: id, date: S.today(), month: monthOf(S.today()) };
      st.modal = null; window.scrollTo(0, 0);
    },

    'select-date'({ scope, date }) {
      if (scope === 'profile') { st.view.date = date; st.view.month = monthOf(date); }
      else { st.selDate = date; st.calMonth = monthOf(date); }
    },
    'cal-move'({ scope, dir }) {
      if (scope === 'profile') st.view.month = shiftMonth(st.view.month, +dir);
      else st.calMonth = shiftMonth(st.calMonth, +dir);
    },
    'cal-today'({ scope }) {
      const t = S.today();
      if (scope === 'profile') Object.assign(st.view, { date: t, month: monthOf(t) });
      else { st.selDate = t; st.calMonth = monthOf(t); }
    },
    theme({ color }) { saveTheme({ color }); st.pop = null; },
    'notify-toggle'() {
      const n = loadNotify();
      if (n.on && Notification.permission === 'granted') { turnOffNotify().then(render); return false; }
      if (Notification.permission === 'denied') { alert('브라우저가 알림을 막고 있어요. 아래 안내대로 허용한 뒤 다시 눌러주세요.'); return false; }
      const pageOnly = () => Notification.requestPermission().then((p) => {
        if (p === 'granted') { saveNotify({ on: true, push: false }); showDesktop('갓생메이트', '알림이 켜졌어요! (앱이 켜져 있을 때 와요)', 'hello'); }
        else saveNotify({ on: false, push: false });
      });
      // 푸시 등록은 버튼 누른 그 순간에 바로 불러야 사파리도 허용 창을 띄워줘요
      const job = swReg && pushKey
        ? swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(pushKey) })
          .then(async (sub) => {
            await S.savePushSubscription(sub, n);
            saveNotify({ on: true, push: true });
            showDesktop('갓생메이트', '알림이 켜졌어요! 앱을 꺼도 알림이 와요 🎉', 'hello');
          })
          .catch((e) => { console.error(e); if (Notification.permission !== 'denied') return pageOnly(); saveNotify({ on: false, push: false }); })
        : pageOnly();
      job.finally(render);
      return false;
    },
    'notify-test'() { showDesktop('갓생메이트', '알림이 잘 와요! 👍', 'test'); return false; },
    'feed-mode'({ mode }) { st.feedMode = mode; },
    'feed-scope'({ scope }) { st.feedScope = scope; st.feedShowQuiet = false; try { localStorage.setItem('studymate_feed_scope', scope); } catch (e) { /* 무시 */ } },
    'feed-quiet'() { st.feedShowQuiet = !st.feedShowQuiet; },
    'wk-open'({ id }) { if (st.wkOpen.has(id)) st.wkOpen.delete(id); else st.wkOpen.add(id); },
    fav({ id }) { S.toggleFavorite(id); },

    // 그룹
    'g-retry'() { st.groupFailed = false; },
    'g-select'({ id }) { st.groupId = id; st.groupForm = null; st.showCode = null; },
    'g-code-show'() { st.showCode = st.groupId; },
    'g-code-hide'() { st.showCode = null; },
    'g-code-new'() {
      if (!confirm('초대 코드를 새로 바꿀까요? 지금 코드로는 더 이상 들어올 수 없어요. (이미 들어온 사람은 그대로예요)')) return false;
      S.newGroupCode(st.groupId).then(() => { st.showCode = st.groupId; render(); }, (e) => alert(e.message));
      return false;
    },
    'g-kick'({ id }) {
      const u = S.user(id);
      if (!confirm(`${u ? u.nickname : '이 사람'}님을 그룹에서 내보낼까요?\n그 사람이 적은 일정도 지워지고, 초대 코드도 새로 바뀌어요.`)) return false;
      S.kickMember(st.groupId, id).then(() => render(), (e) => alert('내보내지 못했어요: ' + e.message));
      return false;
    },
    'g-form'({ form }) { st.groupForm = form || null; },
    'g-date'({ date }) { st.gDate = date; if (date.slice(0, 7) !== st.gMonth) st.gMonth = date.slice(0, 7); },
    'g-month'({ dir }) { st.gMonth = shiftMonth(st.gMonth, +dir); },
    'g-today'() { st.gMonth = S.today().slice(0, 7); st.gDate = S.today(); },
    'g-color'({ color }) { S.setGroupColor(st.groupId, color); st.pop = null; },
    'g-busy-del'({ id }) { S.deleteBusy(id); },
    'g-copy'() {
      const g = S.group(st.groupId); if (!g) return false;
      navigator.clipboard?.writeText(g.code).then(() => alert(`코드 ${g.code} 를 복사했어요. 친구에게 보내주세요!`), () => alert(`코드: ${g.code}`));
      return false;
    },
    'g-leave'() {
      const g = S.group(st.groupId); if (!g) return false;
      if (S.isGroupOwner(g.id)) {
        if (!confirm(`'${g.name}' 그룹을 삭제할까요?\n모든 멤버와 일정이 지워지고 되돌릴 수 없어요.`)) return false;
        S.deleteGroup(g.id).then(() => { st.groupId = null; render(); }, (e) => alert('삭제하지 못했어요: ' + e.message));
        return false;
      }
      if (!confirm(`'${g.name}' 그룹에서 나갈까요? 내가 적은 일정도 같이 지워져요.`)) return false;
      S.leaveGroup(g.id).then(() => { st.groupId = null; render(); }, (e) => alert('나가지 못했어요: ' + e.message));
      return false;
    },
    'week-move'({ dir }) { st.weekStart = S.addDays(st.weekStart, 7 * dir); },
    'week-today'() { st.weekStart = weekStartOf(S.today()); },

    toggle({ id }) { S.toggleTodo(id); },
    'edit-todo'({ id }) { st.modal = { type: 'todo', id }; },
    'delete-todo'({ id }) { if (confirm('이 할 일을 삭제할까요?')) { S.deleteTodo(id); st.modal = null; } else return false; },
    tomorrow({ id }) { const t = S.todo(id); if (t) S.updateTodo(id, { date: S.addDays(t.date, 1), done: false, doneAt: null }); st.modal = null; },
    react({ id, e }) { S.toggleReaction(id, e); },
    'emoji-open'({ id }) { st.modal = { type: 'emoji', id, group: 0 }; },
    'emoji-group'({ g }) { st.modal.group = +g; },
    'emoji-pick'({ e }) { pickEmoji(e); },

    'friends-tab'({ tab }) { st.friendsTab = tab; st.q = ''; },
    'goto-friends'({ tab }) { st.tab = 'friends'; st.friendsTab = tab; st.q = ''; },
    follow({ id }) { S.follow(id); },
    unfollow({ id }) { S.unfollow(id); },

    'open-cats'() { st.modal = { type: 'cats' }; },
    'edit-cat'({ id }) { st.modal = { type: 'cat', id }; },
    'cat-move'({ id, dir }) { S.moveCategory(id, +dir); },
    'delete-cat'({ id }) {
      if (S.categories(S.me().id).length <= 1) { alert('카테고리는 최소 1개 있어야 해요.'); return false; }
      if (!confirm('카테고리를 삭제하면 안의 할 일도 모두 삭제돼요. 삭제할까요?')) return false;
      S.deleteCategory(id); st.modal = { type: 'cats' };
    },

    'edit-profile'() { st.modal = { type: 'profile' }; },
    'avatar-emoji'({ e }) { st.modal.avatar = e; },
    'close-modal'() { st.modal = null; },
    'cal-deco'({ deco }) { S.saveCalStyle({ deco }); st.pop = null; },
    pop({ key }) { st.pop = st.pop === key ? null : key; },
    'cal-bg-remove'() { S.saveCalStyle({ bg: '' }); },
    'sticker-mode'() { st.stickerMode = true; st.tab = 'today'; st.view = null; window.scrollTo(0, 0); },
    'sticker-done'() { st.stickerMode = false; },
    'sticker-tab'({ tab }) { st.sticker.tab = tab; },
    'sticker-pick'({ s }) { st.sticker.pick = s; },
    'sticker-size'({ z }) { st.sticker.size = +z; },
    'sticker-del'({ i }) { S.saveCalStyle({ stickers: myCal().stickers.filter(validSticker).filter((_, j) => j !== +i) }); },
    'sticker-clear'() {
      if (!confirm('달력에 붙인 스티커를 모두 뗄까요?')) return false;
      S.saveCalStyle({ stickers: [] });
    },
    'open-password'() { st.modal = { type: 'password' }; },
    'open-delete-account'() { st.modal = { type: 'delete-account' }; },
    'open-widget'() { st.modal = { type: 'widget', w: 'cal', size: 'm', op: 100 }; },
    'w-set'({ k, v }) { st.modal[k] = k === 'op' ? +v : v; },
    'w-open'() {
      const { w, size, op } = st.modal;
      const [width, height] = WIDGET_SIZES[w][size];
      const win = window.open(widgetUrl(w, size, op), 'gsm-widget-' + w, `popup,width=${width},height=${height}`);
      if (!win) alert('팝업이 막혔어요. 주소창 오른쪽의 팝업 차단 아이콘을 눌러 허용해 주세요.');
      return false;
    },
    'w-copy'() {
      const { w, size, op } = st.modal;
      navigator.clipboard?.writeText(widgetUrl(w, size, op)).then(() => alert('위젯 주소를 복사했어요.'), () => alert(widgetUrl(w, size, op)));
      return false;
    },
    logout() {
      if (!confirm('로그아웃할까요?')) return false;
      Object.assign(st, { tab: 'today', view: null, modal: null, authMode: 'login', authError: '', hasPw: undefined, ...FRESH });
      // 로그아웃하면 이 기기로 오던 푸시도 끊음 (다음 사람이 내 알림을 받지 않게)
      turnOffNotify().finally(() => S.logout().then(render));
      return false;
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (st.pop && !e.target.closest('.pop-wrap')) { st.pop = null; if (!el) { render(); return; } }
    if (!el) return;
    // 팝업 안쪽 클릭은 바깥(배경) 닫기로 번지지 않게
    if (el.dataset.action === 'close-modal' && el.classList.contains('modal-bg') && e.target.closest('[data-stop]')) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    if (fn(el.dataset, el) !== false) render();
  });

  // 로그인/가입은 서버 응답을 기다려야 해서 따로 처리
  async function authRun(fn) {
    if (st.busy) return;
    st.busy = true; st.authError = ''; render();
    try { await fn(); Object.assign(st, { tab: 'today', view: null, selDate: S.today(), calMonth: S.today().slice(0, 7) }); preparePush(); }
    catch (err) { st.authError = err.message; }
    st.busy = false; render();
  }

  // 비밀번호 바꾸기·탈퇴도 서버 응답을 기다림 (실패하면 팝업 안에 이유 표시)
  async function modalRun(fn) {
    if (st.busy) return;
    st.busy = true; st.modal.error = ''; render();
    try { await fn(); }
    catch (err) { if (st.modal) st.modal.error = err.message; }
    st.busy = false; render();
  }

  // 그룹 만들기·참여는 서버 응답을 기다림
  async function groupRun(fn) {
    if (st.busy) return;
    st.busy = true; render();
    try { const id = await fn(); st.groupId = id; st.groupForm = null; }
    catch (err) { alert(err.message); }
    st.busy = false; render();
  }

  // ---------- 폼 제출 ----------
  const forms = {
    login(f) {
      authRun(() => S.login(f.username.value, f.password.value));
      return false;
    },
    setup(f) {
      authRun(() => S.finishSetup({ username: f.username.value, nickname: f.nickname.value }));
      return false;
    },
    signup(f) {
      authRun(() => S.signup({ username: f.username.value, password: f.password.value, nickname: f.nickname.value }));
      return false;
    },
    'quick-add'(f) {
      const catId = f.dataset.cat;
      if (S.addTodo({ categoryId: catId, title: f.title.value, date: WIDGET ? S.today() : st.selDate })) {
        render();
        document.querySelector(`form[data-cat="${catId}"] input`)?.focus(); // 연속 입력
      }
      return false;
    },
    'g-create'(f) {
      groupRun(() => S.createGroup(f.name.value));
      return false;
    },
    'g-join'(f) {
      groupRun(() => S.joinGroup(f.code.value));
      return false;
    },
    'g-busy'(f) {
      if (!st.groupId || !f.label.value.trim()) return false;
      S.addBusy(st.groupId, st.gDate, f.label.value);
      render();
      document.querySelector('form[data-form="g-busy"] input')?.focus();
      return false;
    },
    todo(f) {
      const data = { title: f.title.value.trim(), categoryId: f.categoryId.value, date: f.date.value, time: readTimePicker(f), visibility: f.visibility.value };
      if (!data.title) return false;
      if (st.modal.id) S.updateTodo(st.modal.id, data); else S.addTodo(data);
      st.modal = null;
    },
    cat(f) {
      const data = { name: f.name.value.trim(), emoji: f.emoji.value.trim() || '📌', color: f.color.value === 'custom' ? f.customColor.value : f.color.value || S.COLORS[5] };
      if (!data.name) return false;
      if (st.modal.id) S.updateCategory(st.modal.id, data); else S.addCategory(data);
      st.modal = { type: 'cats' };
    },
    'emoji-custom'(f) {
      const v = f.e.value.trim();
      const seg = 'Segmenter' in Intl ? [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(v)] : [v];
      if (seg.length !== 1) { st.modal.error = '이모티콘 1개만 넣어주세요.'; return; }
      pickEmoji(v);
    },
    password(f) {
      if (f.next.value !== f.next2.value) { st.modal.error = '새 비밀번호가 서로 달라요.'; return; }
      modalRun(async () => {
        await S.changePassword(f.current.value, f.next.value);
        st.modal = null;
        alert('비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.');
      });
      return false;
    },
    'delete-account'(f) {
      if (f.confirm.value.trim() !== '탈퇴') { st.modal.error = '"탈퇴" 라고 정확히 입력해주세요.'; return; }
      const pw = f.password?.value;
      modalRun(async () => {
        await S.deleteAccount(pw);
        await turnOffNotify().catch(() => {}); // 이 기기 푸시 등록도 정리
        Object.assign(st, { tab: 'today', view: null, modal: null, authMode: 'login', authError: '', hasPw: undefined, ...FRESH });
        alert('탈퇴가 완료됐어요. 그동안 고마웠어요!');
      });
      return false;
    },
    profile(f) {
      try {
        const patch = { nickname: f.nickname.value, bio: f.bio.value.trim() };
        if (st.modal.avatar !== undefined) patch.avatar = st.modal.avatar;
        S.updateProfile(patch); st.modal = null;
      } catch (err) { st.modal.error = err.message; }
    },
  };

  document.addEventListener('submit', (e) => {
    const f = e.target; const fn = forms[f.dataset.form];
    if (!fn) return;
    e.preventDefault();
    if (fn(f) !== false) render();
  });

  // ---------- 입력/변경 ----------
  document.addEventListener('input', (e) => {
    if (e.target.id === 'search-input') {
      st.q = e.target.value;
      document.getElementById('friend-list').innerHTML = renderFriendList(); // 입력창 포커스 유지
    }
  });

  document.addEventListener('change', async (e) => {
    const k = e.target.dataset.change;
    if (k === 'custom-color') {
      const wrap = e.target.closest('.custom-color');
      wrap.querySelector('input[type=radio]').checked = true;
      wrap.querySelector('span').style.setProperty('--pick', e.target.value);
    }
    if (k === 'g-color') { S.setGroupColor(st.groupId, e.target.value); render(); }
    if (k === 'notify-reaction' || k === 'notify-follow') {
      saveNotify(k === 'notify-reaction' ? { reaction: e.target.checked } : { follow: e.target.checked });
      if (loadNotify().push) { const sub = await currentPushSub(); if (sub) S.updatePushPrefs(sub.endpoint, loadNotify()); }
    }
    if (k === 'theme-color') { saveTheme({ color: e.target.value }); render(); }
    if (k === 'theme-mode') { saveTheme({ mode: e.target.value }); }
    if (k === 'default-vis') { S.updateProfile({ defaultVis: e.target.value }); }
    if (k === 'cal-op') { S.saveCalStyle({ op: +e.target.value }); }
    if (k === 'cal-bg' && e.target.files[0]) {
      try { S.saveCalStyle({ bg: await resizeImage(e.target.files[0], 1000, false) }); render(); }
      catch { alert('이미지를 불러오지 못했어요.'); }
    }
    if (k === 'avatar-file' && e.target.files[0]) {
      try { st.modal.avatar = await resizeImage(e.target.files[0]); render(); }
      catch { alert('이미지를 불러오지 못했어요.'); }
    }
  });

  // 스티커: 빈 곳을 누르면 붙이고, 붙은 스티커는 끌어서 옮김
  document.addEventListener('pointerdown', (e) => {
    const layer = e.target.closest('.sticker-layer.edit');
    if (!layer || e.target.closest('.sticker-x')) return;
    if (!S.calStyleLoaded(S.me().id)) return; // 내 꾸미기를 다 불러온 뒤에만 (기존 스티커가 날아가지 않게)
    e.preventDefault();
    const box = layer.getBoundingClientRect();
    const pos = (ev) => ({ x: Math.round(((ev.clientX - box.left) / box.width) * 1000) / 10, y: Math.round(((ev.clientY - box.top) / box.height) * 1000) / 10 });
    const list = myCal().stickers.filter(validSticker);
    const el = e.target.closest('.sticker');
    if (!el) {
      if (list.length >= MAX_STICKERS) { alert(`스티커는 ${MAX_STICKERS}개까지 붙일 수 있어요.`); return; }
      const { x, y } = pos(e);
      S.saveCalStyle({ stickers: [...list, { s: st.sticker.pick, x, y, z: st.sticker.size, r: Math.round(Math.random() * 20 - 10) }] });
      render();
      return;
    }
    const i = +el.dataset.i;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    el.classList.add('dragging');
    let moved = null;
    const move = (ev) => { moved = pos(ev); el.style.left = Math.min(100, Math.max(0, moved.x)) + '%'; el.style.top = Math.min(100, Math.max(0, moved.y)) + '%'; };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.classList.remove('dragging');
      if (moved) {
        const x = Math.min(100, Math.max(0, moved.x)), y = Math.min(100, Math.max(0, moved.y));
        S.saveCalStyle({ stickers: list.map((k, j) => (j === i ? { ...k, x, y } : k)) });
        render();
      }
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });

  // 진하기 막대를 움직이는 동안 바로 미리보기
  document.addEventListener('input', (e) => {
    if (e.target.dataset.change !== 'cal-op') return;
    document.querySelectorAll(`.calendar[data-owner="${S.me().id}"]`).forEach((c) => c.style.setProperty('--cal-bg-op', e.target.value / 100));
    const b = e.target.parentElement.querySelector('b'); if (b) b.textContent = e.target.value + '%';
  });

  // 프로필 사진: 192px 정사각형 / 달력 배경: 긴 쪽 1200px (자르지 않음)
  function resizeImage(file, size = 192, square = true) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          if (square) {
            c.width = c.height = size;
            const s = Math.min(img.width, img.height);
            c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
          } else {
            const k = Math.min(1, size / Math.max(img.width, img.height));
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          }
          resolve(c.toDataURL('image/jpeg', square ? 0.85 : 0.72));
        };
        img.onerror = reject; img.src = r.result;
      };
      r.onerror = reject; r.readAsDataURL(file);
    });
  }

  // Esc로 팝업 닫기
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.modal) { st.modal = null; render(); } });

  // 시작: 로그인 상태 확인 → 화면 그리기
  render();
  S.init(() => {
    // 30초마다 새 소식이 오면 다시 그림 (단, 뭔가 입력 중일 땐 방해하지 않게 건너뜀)
    const el = document.activeElement;
    if (st.modal || (el && /INPUT|SELECT|TEXTAREA/.test(el.tagName))) return;
    render();
  }).then(() => {
    if (S.loginError) st.authError = S.loginError;
    // 푸시 알림을 눌러서 앱이 열린 경우 → 알림 화면으로
    if (location.hash === '#notifs') { history.replaceState(null, '', location.pathname); if (S.me()) { st.view = { type: 'notifs' }; S.markAllRead(); } }
    if (S.me()) preparePush();
    render();
  });
})();
