// =============================================================
//  data.js — Supabase(온라인 DB)와 주고받는 부분
//  화면(app.js)은 여기 있는 함수만 불러 써요.
//  - 읽기: 받아온 데이터를 메모리에 들고 있다가 바로 돌려줌
//  - 쓰기: 화면에 먼저 반영하고, 뒤에서 서버에 저장 (실패하면 알려주고 다시 불러옴)
// =============================================================
(function () {
  const cfg = window.STUDYMATE_CONFIG;
  // 로그인 유지: 브라우저에 로그인 정보를 저장하고(persistSession), 만료 전에 자동으로 연장(autoRefreshToken).
  // 직접 로그아웃하거나 브라우저 데이터를 지우기 전까지는 컴퓨터를 껐다 켜도 로그인이 유지돼요.
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage },
  });
  // 아이디로 로그인하기 위해 내부적으로만 쓰는 이메일 형식 (실제 메일은 안 보냄)
  const toEmail = (username) => `${username.trim().toLowerCase()}@studymate.local`;

  const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#30B0C7', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#A2845E', '#8E8E93'];
  const REACTIONS = [
    { e: '🔥', label: '대단해' },
    { e: '👏', label: '수고했어' },
    { e: '❤️', label: '응원해' },
    { e: '😂', label: '또 공부하냐' },
    { e: '😭', label: '고생했어' },
  ];
  const VIS = {
    public: { icon: '🌎', label: '전체 공개' },
    followers: { icon: '👥', label: '팔로워만' },
    private: { icon: '🔒', label: '나만 보기' },
  };

  // ---------- 날짜 도우미 ----------
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => fmtDate(new Date());
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); };
  const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return fmtDate(new Date(y, m, 0)); };
  function monthsBetween(from, to) {
    const out = []; let [y, m] = from.slice(0, 7).split('-').map(Number);
    const last = to.slice(0, 7);
    for (;;) { const ym = `${y}-${pad(m)}`; out.push(ym); if (ym >= last) break; m++; if (m > 12) { m = 1; y++; } }
    return out;
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

  // ---------- 보안: 서버에서 온 값 중 화면에 그대로 들어가는 것은 형식을 검사 ----------
  // (나쁜 코드를 프로필 사진·색·시간에 숨겨서 친구 화면에서 실행시키는 공격(XSS) 막기)
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8E8E93');
  const safeTime = (t) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t || '') ? t : '');
  const safeAvatar = (a) => {
    if (!a) return '';
    if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a)) return a;
    if ([...a].length <= 4 && !/[<>"'&]/.test(a)) return a; // 이모지
    return '';
  };

  // ---------- DB 행 ↔ 앱 객체 변환 ----------
  const fromProfile = (r) => ({ id: r.id, username: r.username, nickname: r.nickname, avatar: safeAvatar(r.avatar), bio: r.bio, defaultVis: r.default_vis, needsSetup: r.needs_setup });
  const fromCat = (r) => ({ id: r.id, userId: r.user_id, name: r.name, emoji: r.emoji, color: safeColor(r.color), order: r.sort });
  const fromTodo = (r) => ({ id: r.id, userId: r.user_id, categoryId: r.category_id, date: r.date, title: r.title, time: safeTime(r.time), visibility: r.visibility, done: r.done, doneAt: r.done_at ? Date.parse(r.done_at) : null, order: r.sort, createdAt: Date.parse(r.created_at) });
  const fromReaction = (r) => ({ todoId: r.todo_id, userId: r.user_id, emoji: r.emoji, at: Date.parse(r.created_at) });
  const fromNotif = (r) => ({ id: r.id, toUserId: r.to_user, fromUserId: r.from_user, type: r.type, todoId: r.todo_id, todoTitle: r.todo_title, emoji: r.emoji, read: r.read, at: Date.parse(r.created_at) });
  const TODO_COLS = { categoryId: 'category_id', date: 'date', title: 'title', time: 'time', visibility: 'visibility', done: 'done', order: 'sort' };
  function todoPatch(p) {
    const out = {};
    for (const [k, col] of Object.entries(TODO_COLS)) if (k in p) out[col] = p[k];
    if ('doneAt' in p) out.done_at = p.doneAt ? new Date(p.doneAt).toISOString() : null;
    return out;
  }

  // ---------- 메모리에 들고 있는 데이터 ----------
  let meId = null;
  let users = new Map(), follows = [], cats = new Map(), todos = new Map(), reactions = [], notifs = [];
  let loadedMonths = new Set(), loadedCatUsers = new Set();
  const loading = new Set();
  let onChange = () => {};

  function clearAll() {
    meId = null; users = new Map(); follows = []; cats = new Map(); todos = new Map(); reactions = []; notifs = [];
    loadedMonths = new Set(); loadedCatUsers = new Set(); loading.clear();
  }

  // 서버 저장이 실패하면 알려주고 서버 상태로 다시 맞춤
  function send(promise, what = '저장') {
    promise.then(({ error }) => {
      if (error) { console.error(error); alert(`${what}에 실패했어요. 인터넷 연결을 확인해주세요.\n(${error.message})`); S.refresh(); }
    });
  }
  function must({ data, error }) { if (error) throw error; return data; }

  async function loadBase() {
    const [p, f, n] = await Promise.all([
      sb.from('profiles').select('*').limit(2000),
      sb.from('follows').select('follower,following').limit(10000),
      sb.from('notifications').select('*').eq('to_user', meId).order('created_at', { ascending: false }).limit(100),
    ]);
    users = new Map(must(p).map((r) => [r.id, fromProfile(r)]));
    follows = must(f).map((r) => ({ from: r.follower, to: r.following }));
    notifs = must(n).map(fromNotif);
  }

  // key = "userId|YYYY-MM"
  async function fetchMonths(keys) {
    const byMonth = {};
    keys.forEach((k) => { const [u, ym] = k.split('|'); (byMonth[ym] ||= []).push(u); });
    const rows = (await Promise.all(Object.entries(byMonth).map(([ym, ids]) =>
      sb.from('todos').select('*').in('user_id', ids).gte('date', ym + '-01').lte('date', monthEnd(ym)).limit(5000).then(must)))).flat();
    const ids = rows.map((r) => r.id);
    let rx = [];
    for (let i = 0; i < ids.length; i += 150) {
      rx = rx.concat(must(await sb.from('reactions').select('*').in('todo_id', ids.slice(i, i + 150))));
    }
    return { todos: rows.map(fromTodo), reactions: rx.map(fromReaction) };
  }
  async function fetchCats(userIds) {
    if (!userIds.length) return [];
    return must(await sb.from('categories').select('*').in('user_id', userIds)).map(fromCat);
  }

  const S = {
    COLORS, REACTIONS, VIS, today, fmtDate, parseDate, addDays, safeColor,
    ready: false,

    // 처음 열 때: 로그인 상태면 데이터 불러오기
    async init(changeCallback) {
      onChange = changeCallback || onChange;
      // 구글 로그인 후 돌아왔는데 실패했으면 주소에 에러가 붙어 와요 → 화면에 보여주기
      const params = new URLSearchParams(location.hash.slice(1) + '&' + location.search.slice(1));
      if (params.get('error_description')) {
        S.loginError = '로그인에 실패했어요: ' + params.get('error_description').replace(/\+/g, ' ');
        history.replaceState(null, '', location.pathname);
      }
      const { data } = await sb.auth.getSession();
      if (data.session) {
        meId = data.session.user.id;
        // 인터넷이 잠깐 끊겨도 로그아웃되지 않게: 몇 번 다시 시도
        let loaded = false;
        for (let i = 0, wait = 1000; i < 6 && !loaded; i++, wait *= 2) {
          try { await loadBase(); loaded = true; }
          catch (e) { console.error(e); await new Promise((r) => setTimeout(r, wait)); }
        }
        if (!loaded) alert('인터넷 연결이 불안정해서 불러오지 못했어요. 잠시 후 새로고침해 주세요. (로그인은 그대로 유지돼요)');
        else if (!users.has(meId)) { await sb.auth.signOut(); clearAll(); } // 계정이 정말 없어졌을 때만 로그아웃
        else await S.prefetch([meId], today(), today());
      }
      S.ready = true;
      // 30초마다 + 창으로 돌아올 때마다 친구들 새 소식 불러오기
      setInterval(() => meId && !document.hidden && S.refresh(), 30000);
      window.addEventListener('focus', () => meId && S.refresh());
    },

    // 화면에 필요한 사람·기간의 데이터가 없으면 서버에서 가져옴. 새로 가져왔으면 true
    async prefetch(userIds, from, to) {
      if (!meId) return false;
      const months = monthsBetween(from, to);
      const keys = [];
      userIds.forEach((u) => months.forEach((ym) => { const k = `${u}|${ym}`; if (!loadedMonths.has(k) && !loading.has(k)) keys.push(k); }));
      const catUsers = userIds.filter((u) => !loadedCatUsers.has(u) && !loading.has('cat|' + u));
      if (!keys.length && !catUsers.length) return false;
      keys.forEach((k) => loading.add(k)); catUsers.forEach((u) => loading.add('cat|' + u));
      try {
        const [got, gotCats] = await Promise.all([keys.length ? fetchMonths(keys) : { todos: [], reactions: [] }, fetchCats(catUsers)]);
        got.todos.forEach((t) => todos.set(t.id, t));
        const newIds = new Set(got.todos.map((t) => t.id));
        reactions = reactions.filter((r) => !newIds.has(r.todoId)).concat(got.reactions);
        gotCats.forEach((c) => cats.set(c.id, c));
        keys.forEach((k) => loadedMonths.add(k)); catUsers.forEach((u) => loadedCatUsers.add(u));
        return true;
      } catch (e) { console.error(e); return false; }
      finally { keys.forEach((k) => loading.delete(k)); catUsers.forEach((u) => loading.delete('cat|' + u)); }
    },

    // 이미 본 데이터를 전부 서버 최신 상태로 다시 받기
    async refresh() {
      if (!meId) return;
      try {
        await loadBase();
        const keys = [...loadedMonths];
        const [got, gotCats] = await Promise.all([keys.length ? fetchMonths(keys) : { todos: [], reactions: [] }, fetchCats([...loadedCatUsers])]);
        todos = new Map(got.todos.map((t) => [t.id, t]));
        reactions = got.reactions;
        cats = new Map(gotCats.map((c) => [c.id, c]));
        onChange();
      } catch (e) { console.error(e); }
    },

    // ---------- 회원 ----------
    me() { return users.get(meId) || null; },
    user(id) { return users.get(id) || null; },

    async signup({ username, password, nickname }) {
      username = (username || '').trim().toLowerCase(); nickname = (nickname || '').trim();
      if (!username || !password || !nickname) throw new Error('모든 항목을 입력해주세요.');
      if (!/^[a-z0-9_]{4,16}$/.test(username)) throw new Error('아이디는 영어 소문자·숫자·_ 로 4~16자예요.');
      if (password.length < 8) throw new Error('비밀번호는 8자 이상이어야 해요.');
      const { data: taken, error: e1 } = await sb.rpc('name_taken', { p_username: username, p_nickname: nickname });
      if (e1) throw new Error('서버에 연결하지 못했어요. (' + e1.message + ')');
      if (taken === 'username') throw new Error('이미 사용 중인 아이디예요.');
      if (taken === 'nickname') throw new Error('이미 사용 중인 닉네임이에요.');
      const { data, error } = await sb.auth.signUp({ email: toEmail(username), password, options: { data: { username, nickname } } });
      if (error) throw new Error(error.message.includes('registered') ? '이미 사용 중인 아이디예요.' : '가입에 실패했어요. (' + error.message + ')');
      if (!data.session) throw new Error('가입은 됐지만 로그인이 안 됐어요. Supabase에서 "Confirm email"을 꺼야 해요.');
      meId = data.user.id;
      await loadBase();
    },

    async login(username, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(username || ''), password: password || '' });
      if (error) throw new Error('아이디 또는 비밀번호가 맞지 않아요.');
      meId = data.user.id;
      await loadBase();
    },

    // 구글 로그인: 구글 화면으로 갔다가 이 사이트로 돌아옴
    async loginWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
      if (error) throw new Error('구글 로그인을 시작하지 못했어요. (' + error.message + ')');
    },

    // 소셜 로그인으로 처음 온 사람: 닉네임·아이디 정하기
    async finishSetup({ username, nickname }) {
      username = (username || '').trim().toLowerCase(); nickname = (nickname || '').trim();
      if (!username || !nickname) throw new Error('모든 항목을 입력해주세요.');
      if (!/^[a-z0-9_]{4,16}$/.test(username)) throw new Error('아이디는 영어 소문자·숫자·_ 로 4~16자예요.');
      if (nickname.length > 12) throw new Error('닉네임은 12자까지예요.');
      const { data: taken, error: e1 } = await sb.rpc('name_taken', { p_username: username, p_nickname: nickname });
      if (e1) throw new Error('서버에 연결하지 못했어요. (' + e1.message + ')');
      if (taken === 'username') throw new Error('이미 사용 중인 아이디예요.');
      if (taken === 'nickname') throw new Error('이미 사용 중인 닉네임이에요.');
      const { error } = await sb.from('profiles').update({ username, nickname, needs_setup: false }).eq('id', meId);
      if (error) throw new Error('저장하지 못했어요. (' + error.message + ')');
      Object.assign(users.get(meId), { username, nickname, needsSetup: false });
    },

    async logout() { await sb.auth.signOut(); clearAll(); },

    updateProfile(patch) {
      const me = S.me();
      if (patch.nickname !== undefined) {
        patch.nickname = patch.nickname.trim();
        if (!patch.nickname) throw new Error('닉네임을 입력해주세요.');
        if ([...users.values()].some((u) => u.id !== me.id && u.nickname === patch.nickname)) throw new Error('이미 사용 중인 닉네임이에요.');
      }
      Object.assign(me, patch);
      const row = {};
      if ('nickname' in patch) row.nickname = patch.nickname;
      if ('bio' in patch) row.bio = patch.bio;
      if ('avatar' in patch) row.avatar = patch.avatar;
      if ('defaultVis' in patch) row.default_vis = patch.defaultVis;
      send(sb.from('profiles').update(row).eq('id', me.id), '프로필 저장');
    },

    // ---------- 카테고리 ----------
    categories(userId) { return [...cats.values()].filter((c) => c.userId === userId).sort((a, b) => a.order - b.order); },
    category(id) { return cats.get(id) || null; },
    addCategory(data) {
      const order = Math.max(-1, ...S.categories(meId).map((c) => c.order)) + 1;
      const c = { id: uuid(), userId: meId, name: data.name.trim(), emoji: data.emoji || '📌', color: data.color || COLORS[5], order };
      cats.set(c.id, c);
      send(sb.from('categories').insert({ id: c.id, user_id: meId, name: c.name, emoji: c.emoji, color: c.color, sort: order }), '카테고리 저장');
      return c;
    },
    updateCategory(id, patch) {
      Object.assign(cats.get(id), patch);
      send(sb.from('categories').update({ name: patch.name, emoji: patch.emoji, color: patch.color }).eq('id', id), '카테고리 저장');
    },
    deleteCategory(id) {
      const gone = new Set([...todos.values()].filter((t) => t.categoryId === id).map((t) => t.id));
      gone.forEach((tid) => todos.delete(tid));
      reactions = reactions.filter((r) => !gone.has(r.todoId));
      cats.delete(id);
      send(sb.from('categories').delete().eq('id', id), '카테고리 삭제');
    },
    moveCategory(id, dir) {
      const list = S.categories(meId);
      const i = list.findIndex((c) => c.id === id), j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i].order, list[j].order] = [list[j].order, list[i].order];
      send(sb.from('categories').update({ sort: list[i].order }).eq('id', list[i].id), '순서 저장');
      send(sb.from('categories').update({ sort: list[j].order }).eq('id', list[j].id), '순서 저장');
    },

    // ---------- 할 일 / 일정 ----------
    todo(id) { return todos.get(id) || null; },
    todosOn(userId, date) { return [...todos.values()].filter((t) => t.userId === userId && t.date === date).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt); },
    todosBetween(userId, from, to) { return [...todos.values()].filter((t) => t.userId === userId && t.date >= from && t.date <= to); },
    addTodo({ categoryId, title, date, time = '', visibility }) {
      title = (title || '').trim(); if (!title) return null;
      const me = S.me();
      const order = S.todosOn(meId, date).filter((t) => t.categoryId === categoryId).length;
      const t = { id: uuid(), userId: meId, categoryId, date, title, time, visibility: visibility || me.defaultVis, done: false, doneAt: null, order, createdAt: Date.now() };
      todos.set(t.id, t);
      send(sb.from('todos').insert({ id: t.id, user_id: meId, ...todoPatch(t) }), '할 일 저장');
      return t;
    },
    updateTodo(id, patch) {
      Object.assign(todos.get(id), patch);
      send(sb.from('todos').update(todoPatch(patch)).eq('id', id), '할 일 저장');
    },
    toggleTodo(id) { const t = todos.get(id); S.updateTodo(id, { done: !t.done, doneAt: !t.done ? Date.now() : null }); },
    deleteTodo(id) {
      todos.delete(id); reactions = reactions.filter((r) => r.todoId !== id);
      send(sb.from('todos').delete().eq('id', id), '할 일 삭제');
    },

    // 공개 범위 규칙 (서버에서도 똑같이 막고 있어요): 나 → 전부 / 🌎 → 누구나 / 👥 → 나를 팔로우하는 사람 / 🔒 → 본인만
    canSee(viewerId, t) {
      if (t.userId === viewerId) return true;
      if (t.visibility === 'public') return true;
      if (t.visibility === 'followers') return S.isFollowing(viewerId, t.userId);
      return false;
    },

    // ---------- 팔로우 ----------
    isFollowing(a, b) { return follows.some((f) => f.from === a && f.to === b); },
    follow(b) {
      if (b === meId || S.isFollowing(meId, b)) return;
      follows.push({ from: meId, to: b });
      // 팔로우하면 '팔로워만' 일정도 보이게 되니 그 친구 데이터를 다시 받음
      loadedMonths = new Set([...loadedMonths].filter((k) => !k.startsWith(b + '|')));
      sb.from('follows').insert({ follower: meId, following: b }).then(({ error }) => {
        if (error) { alert('팔로우에 실패했어요. (' + error.message + ')'); S.refresh(); } else onChange();
      });
    },
    unfollow(b) {
      follows = follows.filter((f) => !(f.from === meId && f.to === b));
      send(sb.from('follows').delete().eq('follower', meId).eq('following', b), '언팔로우');
    },
    followers(id) { return follows.filter((f) => f.to === id).map((f) => users.get(f.from)).filter(Boolean); },
    following(id) { return follows.filter((f) => f.from === id).map((f) => users.get(f.to)).filter(Boolean); },
    searchUsers(q) {
      q = q.trim().toLowerCase(); if (!q) return [];
      return [...users.values()].filter((u) => u.id !== meId && (u.nickname.toLowerCase().includes(q) || u.username.includes(q)));
    },
    recommend() {
      const result = []; const seen = new Set([meId]);
      S.following(meId).forEach((u) => seen.add(u.id));
      S.followers(meId).forEach((u) => { if (!seen.has(u.id)) { seen.add(u.id); result.push({ user: u, reason: '나를 팔로우해요' }); } });
      S.following(meId).forEach((f) => S.following(f.id).forEach((u) => { if (!seen.has(u.id)) { seen.add(u.id); result.push({ user: u, reason: `${f.nickname}님이 팔로우해요` }); } }));
      users.forEach((u) => { if (!seen.has(u.id)) { seen.add(u.id); result.push({ user: u, reason: '새로운 친구' }); } });
      return result.slice(0, 15);
    },

    // ---------- 공감 이모티콘 ----------
    reactionSummary(todoId) {
      const list = reactions.filter((r) => r.todoId === todoId);
      return REACTIONS.map((R) => {
        const rs = list.filter((r) => r.emoji === R.e);
        return { ...R, count: rs.length, mine: rs.some((r) => r.userId === meId), names: rs.map((r) => users.get(r.userId)?.nickname).filter(Boolean) };
      });
    },
    toggleReaction(todoId, emoji) {
      const ex = reactions.find((r) => r.todoId === todoId && r.userId === meId && r.emoji === emoji);
      if (ex) {
        reactions = reactions.filter((r) => r !== ex);
        send(sb.from('reactions').delete().eq('todo_id', todoId).eq('user_id', meId).eq('emoji', emoji), '이모티콘 취소');
      } else {
        reactions.push({ todoId, userId: meId, emoji, at: Date.now() });
        send(sb.from('reactions').insert({ todo_id: todoId, user_id: meId, emoji }), '이모티콘');
      }
    },

    // ---------- 알림 ----------
    notifications() { return notifs; },
    unreadCount() { return notifs.filter((n) => !n.read).length; },
    markAllRead() {
      if (!notifs.some((n) => !n.read)) return;
      notifs.forEach((n) => { n.read = true; });
      send(sb.from('notifications').update({ read: true }).eq('to_user', meId).eq('read', false), '알림');
    },

    // ---------- 통계 (최근 30일) ----------
    stats(userId) {
      const t = today();
      const mine = S.todosBetween(userId, addDays(t, -29), t);
      const week = []; for (let i = 6; i >= 0; i--) week.push(addDays(t, -i));
      const weekTodos = mine.filter((x) => x.date >= week[0]);
      const doneDates = new Set(mine.filter((x) => x.done).map((x) => x.date));
      let streak = 0, d = doneDates.has(t) ? t : addDays(t, -1);
      while (doneDates.has(d)) { streak++; d = addDays(d, -1); }
      const ids = new Set(mine.map((x) => x.id));
      return {
        totalDone: mine.filter((x) => x.done).length,
        weekRate: weekTodos.length ? Math.round((weekTodos.filter((x) => x.done).length / weekTodos.length) * 100) : 0,
        streak,
        cheers: reactions.filter((r) => ids.has(r.todoId)).length,
        daily: week.map((date) => ({ date, done: mine.filter((x) => x.date === date && x.done).length })),
        byCategory: S.categories(userId).map((c) => ({ cat: c, done: weekTodos.filter((x) => x.categoryId === c.id && x.done).length })),
      };
    },
  };

  window.Store = S;
})();
