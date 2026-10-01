const SUPABASE_URL = 'https://vuvqlrlezvejifexmtqd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_leglNCuMiQgKdbXpG2Mk3w_aEzvU4bD';
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

const FOODS = [
  ['米饭 100g', 116],
  ['鸡胸肉 100g', 133],
  ['鸡蛋 1个', 76],
  ['苹果 1个', 95],
  ['牛奶 250ml', 163],
  ['牛肉 100g', 125],
  ['香蕉 1根', 105],
  ['红薯 100g', 86],
  ['面条 100g', 137],
  ['酸奶 200g', 144],
  ['西兰花 100g', 34],
  ['玉米 1根', 112]
];
const HABITS = [
  ['💧', '喝水', '8杯'],
  ['🏃', '运动', '30′'],
  ['😴', '早睡', '23:00'],
  ['🧘', '冥想', '10′'],
  ['🥗', '蔬菜', '300g'],
  ['🚶', '万步', '10k'],
  ['📵', '少糖', '✓'],
  ['📖', '日记', '1条']
];

let DB = createDefaultState().db;
let MS = [];
let currentUser = null;
let hydrated = false;
let authMode = 'login';
let syncTimer = null;
let syncBusy = false;
let syncAgain = false;
let toastTimer = null;
let pendingBills = [];
let currentCostPeriod = 'w';

function createDefaultState() {
  return {
    db: {
      food: [],
      bills: [],
      exe: [],
      weight: [],
      habits: {},
      water: {},
      diary: [],
      body: [],
      profile: {
        height: 165,
        currentWeight: null,
        targetWeight: 60,
        targetDate: '',
        deficit: 500,
        tdee: 1850
      }
    },
    milestones: []
  };
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeColor(value) {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : '#F1F3F9';
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeState(raw) {
  const defaults = createDefaultState();
  const source = raw && typeof raw === 'object' ? raw : {};
  const sourceDb = source.db && typeof source.db === 'object' ? source.db : {};
  const sourceProfile = sourceDb.profile && typeof sourceDb.profile === 'object'
    ? sourceDb.profile
    : {};

  const food = (Array.isArray(sourceDb.food) ? sourceDb.food : []).map((item) => ({
    icon: item?.icon || '🍽️',
    bg: safeColor(item?.bg),
    name: String(item?.name || '饮食记录'),
    sub: String(item?.sub || '手动添加'),
    kcal: Math.max(0, Math.round(finiteNumber(item?.kcal, 0))),
    cost: Math.max(0, finiteNumber(item?.cost, 0)),
    date: /^\d{4}-\d{2}-\d{2}$/.test(item?.date || '') ? item.date : todayKey()
  }));

  const bills = (Array.isArray(sourceDb.bills) ? sourceDb.bills : []).map((item) => ({
    date: String(item?.date || ''),
    name: String(item?.name || '餐饮消费'),
    kcost: Math.max(0, finiteNumber(item?.kcost, 0)),
    src: String(item?.src || '导入')
  }));

  const exe = (Array.isArray(sourceDb.exe) ? sourceDb.exe : []).map((item) => ({
    icon: item?.icon || '🏃',
    bg: safeColor(item?.bg || '#E8EDFF'),
    name: String(item?.name || '运动记录'),
    sub: String(item?.sub || '手动记录'),
    kcal: Math.max(0, Math.round(finiteNumber(item?.kcal, 0))),
    date: /^\d{4}-\d{2}-\d{2}$/.test(item?.date || '') ? item.date : todayKey()
  }));

  const weight = (Array.isArray(sourceDb.weight) ? sourceDb.weight : [])
    .map((item) => {
      const value = finiteNumber(typeof item === 'number' ? item : item?.value);
      if (value === null || value <= 0) return null;
      return {
        value,
        date: /^\d{4}-\d{2}-\d{2}$/.test(item?.date || '') ? item.date : todayKey(),
        note: String(item?.note || '')
      };
    })
    .filter(Boolean);

  const body = (Array.isArray(sourceDb.body)
    ? sourceDb.body
    : sourceDb.body && typeof sourceDb.body === 'object'
      ? [sourceDb.body]
      : []
  ).map((item) => ({
    date: /^\d{4}-\d{2}-\d{2}$/.test(item?.date || '') ? item.date : todayKey(),
    waist: finiteNumber(item?.waist),
    hip: finiteNumber(item?.hip),
    thigh: finiteNumber(item?.thigh),
    fat: finiteNumber(item?.fat)
  }));

  const diary = (Array.isArray(sourceDb.diary) ? sourceDb.diary : []).map((item) => ({
    date: /^\d{4}-\d{2}-\d{2}$/.test(item?.date || '') ? item.date : todayKey(),
    text: String(item?.text || ''),
    createdAt: item?.createdAt || new Date().toISOString()
  })).filter((item) => item.text.trim());

  const habits = sourceDb.habits && typeof sourceDb.habits === 'object'
    ? Object.fromEntries(
        Object.entries(sourceDb.habits).map(([date, values]) => [
          date,
          Array.isArray(values) ? [...new Set(values.map(Number).filter((value) => value >= 0 && value < HABITS.length))] : []
        ])
      )
    : {};

  const water = sourceDb.water && typeof sourceDb.water === 'object'
    ? Object.fromEntries(
        Object.entries(sourceDb.water).map(([date, value]) => [date, Math.max(0, Math.round(finiteNumber(value, 0)))])
      )
    : {};

  const latestWeight = weight.length ? weight[weight.length - 1].value : null;
  const profile = {
    ...defaults.db.profile,
    ...sourceProfile,
    height: finiteNumber(sourceProfile.height, defaults.db.profile.height),
    currentWeight: finiteNumber(sourceProfile.currentWeight, latestWeight),
    targetWeight: finiteNumber(sourceProfile.targetWeight, defaults.db.profile.targetWeight),
    targetDate: /^\d{4}-\d{2}-\d{2}$/.test(sourceProfile.targetDate || '') ? sourceProfile.targetDate : '',
    deficit: [300, 500, 700].includes(Number(sourceProfile.deficit)) ? Number(sourceProfile.deficit) : 500,
    tdee: finiteNumber(sourceProfile.tdee, defaults.db.profile.tdee)
  };

  const milestones = (Array.isArray(source.milestones) ? source.milestones : []).map((item) => ({
    type: String(item?.type || '🏅 累计减重'),
    val: Math.max(1, finiteNumber(item?.val, 1)),
    unit: String(item?.unit || 'kg'),
    reward: String(item?.reward || '达成奖励'),
    rtype: String(item?.rtype || '🎁 实物奖励'),
    done: Boolean(item?.done),
    cur: Math.max(0, finiteNumber(item?.cur, 0))
  }));

  return { db: { ...defaults.db, food, bills, exe, weight, habits, water, diary, body, profile }, milestones };
}

function getTodayFood() {
  return DB.food.filter((item) => item.date === todayKey());
}

function getTodayExercise() {
  return DB.exe.filter((item) => item.date === todayKey());
}

function getMetrics() {
  const latestWeight = DB.weight.length
    ? DB.weight[DB.weight.length - 1].value
    : finiteNumber(DB.profile.currentWeight, 0);
  const height = finiteNumber(DB.profile.height, 165);
  const bmr = latestWeight > 0
    ? Math.round((10 * latestWeight) + (6.25 * height) - (5 * 30) - 161)
    : null;
  const tdee = bmr ? Math.round(bmr * 1.35) : finiteNumber(DB.profile.tdee, 1850);
  const deficit = finiteNumber(DB.profile.deficit, 500);
  return { bmr, tdee, deficit, intakeTarget: Math.max(1000, tdee - deficit) };
}

function applyState(state) {
  const normalized = normalizeState(state);
  DB = normalized.db;
  MS = normalized.milestones;
}

function currentState() {
  return JSON.parse(JSON.stringify({ db: DB, milestones: MS }));
}

function setSyncStatus(message, kind = '') {
  const element = document.getElementById('syncStatus');
  if (!element) return;
  element.innerHTML = `<span class="sync-dot ${kind}"></span>${escapeHtml(message)}`;
}

function saveLocalCache() {
  if (!currentUser) return;
  try {
    localStorage.setItem(`qingying_cache_${currentUser.id}`, JSON.stringify(currentState()));
  } catch (error) {
    console.warn('本地缓存失败', error);
  }
}

function readLocalCache(userId) {
  try {
    const raw = localStorage.getItem(`qingying_cache_${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readLegacyState() {
  try {
    const legacyDb = JSON.parse(localStorage.getItem('qingying') || 'null');
    const legacyMilestones = JSON.parse(localStorage.getItem('qingying_ms') || 'null');
    if (!legacyDb && !legacyMilestones) return null;
    return { db: legacyDb || {}, milestones: legacyMilestones || [] };
  } catch {
    return null;
  }
}

function queueCloudSave(delay = 250) {
  if (!currentUser || !hydrated) return;
  saveLocalCache();
  setSyncStatus('正在同步…', 'saving');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(persistCloudState, delay);
}

async function persistCloudState() {
  if (!currentUser || !hydrated || !supabaseClient) return;
  if (syncBusy) {
    syncAgain = true;
    return;
  }

  syncBusy = true;
  try {
    do {
      syncAgain = false;
      const userId = currentUser.id;
      const state = currentState();
      const { error } = await supabaseClient
        .from('slim_girls_state')
        .upsert({
          user_id: userId,
          state,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      if (error) throw error;
      if (!currentUser || currentUser.id !== userId) return;
    } while (syncAgain);
    saveLocalCache();
    setSyncStatus('已同步到云端');
  } catch (error) {
    console.error('Supabase 同步失败', error);
    setSyncStatus('同步失败，数据已保存在本机', 'error');
    toast('云端同步失败，请检查数据库表与网络');
  } finally {
    syncBusy = false;
  }
}

function saveDB() {
  queueCloudSave();
}

function saveMS() {
  queueCloudSave();
}

function renderFood() {
  const element = document.getElementById('foodList');
  const today = todayKey();
  const rows = DB.food
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.date === today);

  if (!rows.length) {
    element.innerHTML = '<div class="empty-tip">今天还没记录饮食，点右上角添加 🍽️</div>';
    return;
  }

  const totalCost = rows.reduce((sum, { item }) => sum + finiteNumber(item.cost, 0), 0);
  element.innerHTML = rows.map(({ item, index }) => `
    <div class="item">
      <div class="icon" style="background:${safeColor(item.bg)}">${escapeHtml(item.icon)}</div>
      <div class="info"><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.sub)}</span></div>
      <div class="right">${item.kcal}<span>kcal · ¥${finiteNumber(item.cost, 0).toFixed(1)}</span></div>
      <button class="btn ghost small" onclick="delFood(${index})">✕</button>
    </div>
  `).join('') + (totalCost > 0
    ? `<div class="stat-row" style="margin-top:6px"><span>今日餐饮花费</span><span style="font-weight:700;color:var(--accent)">¥ ${totalCost.toFixed(2)}</span></div>`
    : '');
}

function renderExe() {
  const element = document.getElementById('exeList');
  const today = todayKey();
  const rows = DB.exe
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.date === today);

  if (!rows.length) {
    element.innerHTML = '<div class="empty-tip">今天还没有运动记录，加油！🏃</div>';
    return;
  }

  element.innerHTML = rows.map(({ item, index }) => `
    <div class="item">
      <div class="icon" style="background:${safeColor(item.bg)}">${escapeHtml(item.icon)}</div>
      <div class="info"><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.sub)}</span></div>
      <div class="right">${item.kcal}<span>kcal</span></div>
      <button class="btn ghost small" onclick="delExe(${index})">✕</button>
    </div>
  `).join('');
}

function delFood(index) {
  DB.food.splice(index, 1);
  saveDB();
  renderFood();
  renderDashboard();
  toast('已删除');
}

function delExe(index) {
  DB.exe.splice(index, 1);
  saveDB();
  renderExe();
  renderDashboard();
  toast('已删除');
}

function renderFoodOpts(query = '') {
  const normalized = String(query).trim();
  const rows = FOODS
    .map((food, index) => ({ food, index }))
    .filter(({ food }) => !normalized || food[0].includes(normalized));

  document.getElementById('foodOpts').innerHTML = rows.map(({ food, index }) => `
    <div class="food-opt" onclick="pickFood(${index})">
      <b>${escapeHtml(food[0])}</b>
      <span style="font-size:12px;color:var(--text-sub)">${food[1]} kcal</span>
    </div>
  `).join('') || '<div class="empty-tip">未找到食物，可创建自定义食物</div>';
}

function pickFood(index) {
  const food = FOODS[index];
  if (!food) return;
  DB.food.push({
    icon: '🍽️',
    bg: '#F1F3F9',
    name: food[0],
    sub: '手动添加',
    kcal: food[1],
    cost: Math.max(0, finiteNumber(document.getElementById('foodCost')?.value, 0)),
    date: todayKey()
  });
  saveDB();
  renderFood();
  renderDashboard();
  closeAll();
  toast(`已记录：${food[0]} ${food[1]} kcal ✓`);
}

function addFoodAI() {
  DB.food.push({
    icon: '🥗',
    bg: '#E8EDFF',
    name: 'AI识别 · 鸡胸沙拉+糙米饭',
    sub: '拍照识别 · 420g · 蛋白35g',
    kcal: 480,
    cost: 28,
    date: todayKey()
  });
  saveDB();
  renderFood();
  renderDashboard();
  closeAll();
  toast('识别结果已保存 480 kcal ✓');
}

function addExeAI() {
  DB.exe.push({
    icon: '⌚',
    bg: '#E8EDFF',
    name: '户外跑步 5.2km（截图识别）',
    sub: '32分钟 · 心率148',
    kcal: 320,
    date: todayKey()
  });
  saveDB();
  renderExe();
  renderDashboard();
  closeAll();
  toast('运动数据已保存并同步');
}

function addExe() {
  const minutes = Math.max(1, Math.round(finiteNumber(document.getElementById('exeMin').value, 30)));
  const kcal = Math.max(0, Math.round(finiteNumber(document.getElementById('exeKcal').value, 200)));
  const type = document.querySelector('#exeType .on')?.textContent || '跑步';
  DB.exe.push({
    icon: '🏃',
    bg: '#E8EDFF',
    name: `${type} ${minutes}分钟`,
    sub: '手动记录',
    kcal,
    date: todayKey()
  });
  saveDB();
  renderExe();
  renderDashboard();
  closeAll();
  toast(`已记录运动 ${kcal} kcal ✓`);
}

function saveWeight() {
  const value = finiteNumber(document.getElementById('wInput').value);
  if (value === null || value <= 0) {
    toast('请输入有效体重');
    return;
  }

  const date = todayKey();
  const note = document.querySelector('#weightNote .on')?.textContent || '';
  const existingIndex = DB.weight.findIndex((item) => item.date === date);
  const record = { value, date, note };
  if (existingIndex >= 0) DB.weight[existingIndex] = record;
  else DB.weight.push(record);
  DB.weight.sort((a, b) => a.date.localeCompare(b.date));
  DB.profile.currentWeight = value;
  saveDB();
  renderWeight();
  renderProfile();
  renderDashboard();
  closeAll();
  toast('体重已保存到云端 ⚖️');
}

function renderWeight() {
  const latest = DB.weight.length ? DB.weight[DB.weight.length - 1] : null;
  const previous = DB.weight.length > 1 ? DB.weight[DB.weight.length - 2] : null;
  const nowElement = document.getElementById('wNow');
  const deltaElement = document.getElementById('wDelta');

  if (!latest) {
    nowElement.innerHTML = '--<small> kg</small>';
    deltaElement.className = 'delta down';
    deltaElement.textContent = '还没有体重记录';
  } else {
    nowElement.innerHTML = `${latest.value.toFixed(1)}<small> kg</small>`;
    if (previous) {
      const delta = latest.value - previous.value;
      deltaElement.className = `delta ${delta <= 0 ? 'down' : 'up'}`;
      deltaElement.textContent = `${delta <= 0 ? '▼' : '▲'} 较上次 ${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg`;
    } else {
      deltaElement.className = 'delta down';
      deltaElement.textContent = '首次记录已保存';
    }
  }

  const target = finiteNumber(DB.profile.targetWeight, 60);
  const current = latest?.value ?? finiteNumber(DB.profile.currentWeight, null);
  const start = DB.weight[0]?.value ?? current;
  let progress = 0;
  if (current !== null && start !== null && start !== target) {
    progress = Math.max(0, Math.min(100, ((start - current) / (start - target)) * 100));
  }

  document.getElementById('wTarget').textContent = `目标 ${target.toFixed(1)} kg`;
  document.getElementById('wRemain').textContent = current === null
    ? '记录后计算'
    : current <= target
      ? '已达成目标 🎉'
      : `还需 -${(current - target).toFixed(1)} kg`;
  document.getElementById('wDate').textContent = DB.profile.targetDate
    ? `目标日期 ${DB.profile.targetDate}`
    : '未设置日期';
  document.getElementById('wProgress').style.width = `${progress.toFixed(0)}%`;
}

function onFoodPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const image = document.getElementById('foodPreview');
    image.src = event.target.result;
    image.style.display = 'block';
    toast('正在识别…');
    setTimeout(() => {
      document.getElementById('aiFoodResult').style.display = 'block';
    }, 900);
  };
  reader.readAsDataURL(file);
}

function onWatchShot(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const image = document.getElementById('watchPreview');
    image.src = event.target.result;
    image.style.display = 'block';
    toast('正在识别…');
    setTimeout(() => {
      document.getElementById('aiWatchResult').style.display = 'block';
    }, 900);
  };
  reader.readAsDataURL(file);
}

function renderHabits() {
  const completed = new Set(DB.habits[todayKey()] || []);
  document.getElementById('habitGrid').innerHTML = HABITS.map((habit, index) => `
    <div class="habit ${completed.has(index) ? 'on' : ''}" onclick="toggleHabit(${index})">
      <span class="ic">${habit[0]}</span>
      <p>${habit[1]}</p>
      <small>${habit[2]}</small>
    </div>
  `).join('');
}

function toggleHabit(index) {
  const date = todayKey();
  const completed = new Set(DB.habits[date] || []);
  if (completed.has(index)) completed.delete(index);
  else completed.add(index);
  DB.habits[date] = [...completed].sort((a, b) => a - b);
  saveDB();
  renderHabits();
  toast(completed.has(index) ? '打卡成功 ✓' : '已取消');
}

function renderWater() {
  const amount = finiteNumber(DB.water[todayKey()], 0);
  const target = 2000;
  document.getElementById('waterText').textContent = `今日 ${amount} / ${target} ml`;
  document.getElementById('waterProgress').style.width = `${Math.min(100, amount / target * 100)}%`;
}

function addWater(amount) {
  const value = Math.max(0, Math.round(finiteNumber(amount, 0)));
  if (!value) return;
  const date = todayKey();
  DB.water[date] = finiteNumber(DB.water[date], 0) + value;
  saveDB();
  renderWater();
  toast(`饮水 +${value}ml 💧`);
}

function saveWater() {
  const amount = finiteNumber(document.getElementById('waterInput').value);
  if (amount === null || amount <= 0) {
    toast('请输入有效饮水量');
    return;
  }
  addWater(amount);
  document.getElementById('waterInput').value = '';
  closeAll();
}

function saveDiary() {
  const textarea = document.getElementById('diaryText');
  const text = textarea.value.trim();
  if (!text) {
    toast('请先写下一点内容');
    return;
  }
  DB.diary.push({ date: todayKey(), text, createdAt: new Date().toISOString() });
  textarea.value = '';
  saveDB();
  toast('日记已保存到云端 ✨');
}

function renderDashboard() {
  const foodCalories = getTodayFood().reduce((sum, item) => sum + item.kcal, 0);
  const exerciseCalories = getTodayExercise().reduce((sum, item) => sum + item.kcal, 0);
  const metrics = getMetrics();
  const calorieTarget = metrics.intakeTarget;
  const deficit = Math.max(0, metrics.tdee - foodCalories + exerciseCalories);
  const gapTarget = Math.max(1, metrics.deficit);

  setRing('ringCal', 'ringCalText', foodCalories, calorieTarget);
  setRing('ringExe', 'ringExeText', exerciseCalories, 400);
  setRing('ringGap', 'ringGapText', deficit, gapTarget);

  const element = document.getElementById('aiSummary');
  if (!foodCalories && !exerciseCalories) {
    element.innerHTML = '今天还没有记录。添加饮食和运动后，这里会实时汇总你的热量数据。';
    return;
  }

  const remaining = calorieTarget - foodCalories;
  element.innerHTML = `
    今天已摄入 <b>${foodCalories} kcal</b>，运动消耗 <b>${exerciseCalories} kcal</b>。
    当前热量缺口约 <b>${deficit} kcal</b>。<br>
    ${remaining > 0
      ? `按当前计划，今天还可摄入约 <b>${remaining} kcal</b>。`
      : `今天已超过计划摄入 <b>${Math.abs(remaining)} kcal</b>，可通过轻度活动平衡。`}
  `;
}

function setRing(circleId, textId, value, target) {
  const circle = document.getElementById(circleId);
  const text = document.getElementById(textId);
  const safeTarget = Math.max(1, Number(target) || 1);
  const ratio = Math.max(0, Math.min(1, Number(value) / safeTarget));
  circle.style.strokeDashoffset = String(169.6 * (1 - ratio));
  text.innerHTML = `${Math.round(value)}<span>/${Math.round(safeTarget)}</span>`;
}

function renderProfile() {
  const profile = DB.profile;
  const metrics = getMetrics();
  const email = currentUser?.email || '';
  const displayName = currentUser?.user_metadata?.display_name || email.split('@')[0] || '轻盈用户';

  document.getElementById('profileName').textContent = displayName;
  document.getElementById('profileMeta').textContent = email
    ? `${email} · 云端同步`
    : '登录账户 · 数据已加密隔离';
  document.getElementById('profileHeight').value = profile.height ?? '';
  document.getElementById('profileWeight').value = profile.currentWeight ?? '';
  document.getElementById('profileTarget').value = profile.targetWeight ?? '';
  document.getElementById('profileTargetDate').value = profile.targetDate || '';
  document.getElementById('profileDeficit').value = String(profile.deficit || 500);
  document.getElementById('profileBmr').textContent = `基础代谢 BMR：${metrics.bmr ?? '--'} kcal`;
  document.getElementById('profileTdee').textContent = `每日总消耗 TDEE：${metrics.tdee} kcal`;
}

function saveProfile() {
  const height = finiteNumber(document.getElementById('profileHeight').value);
  const weight = finiteNumber(document.getElementById('profileWeight').value);
  const targetWeight = finiteNumber(document.getElementById('profileTarget').value);
  const targetDate = document.getElementById('profileTargetDate').value;
  const deficit = finiteNumber(document.getElementById('profileDeficit').value, 500);

  if (height === null || height < 100 || targetWeight === null || targetWeight <= 0) {
    toast('请填写有效的身高和目标体重');
    return;
  }

  DB.profile = {
    ...DB.profile,
    height,
    currentWeight: weight,
    targetWeight,
    targetDate: /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : '',
    deficit,
    tdee: getMetrics().tdee
  };

  if (weight !== null && weight > 0) {
    const date = todayKey();
    const existingIndex = DB.weight.findIndex((item) => item.date === date);
    const record = { value: weight, date, note: '档案同步' };
    if (existingIndex >= 0) DB.weight[existingIndex] = record;
    else DB.weight.push(record);
    DB.weight.sort((a, b) => a.date.localeCompare(b.date));
  }

  saveDB();
  renderProfile();
  renderWeight();
  renderDashboard();
  toast('档案已更新并同步 ✓');
}

function renderBodyMetrics() {
  const latest = DB.body.length ? DB.body[DB.body.length - 1] : {};
  document.getElementById('bodyWaist').value = latest.waist ?? '';
  document.getElementById('bodyHip').value = latest.hip ?? '';
  document.getElementById('bodyThigh').value = latest.thigh ?? '';
  document.getElementById('bodyFat').value = latest.fat ?? '';
}

function saveBodyMetrics() {
  const date = todayKey();
  const record = {
    date,
    waist: finiteNumber(document.getElementById('bodyWaist').value),
    hip: finiteNumber(document.getElementById('bodyHip').value),
    thigh: finiteNumber(document.getElementById('bodyThigh').value),
    fat: finiteNumber(document.getElementById('bodyFat').value)
  };
  const existingIndex = DB.body.findIndex((item) => item.date === date);
  if (existingIndex >= 0) DB.body[existingIndex] = record;
  else DB.body.push(record);
  saveDB();
  closeAll();
  toast('围度与体脂已保存 ✓');
}

function renderMS() {
  const rows = MS.map((milestone, index) => {
    const target = Math.max(1, finiteNumber(milestone.val, 1));
    const percent = Math.min(100, Math.round(finiteNumber(milestone.cur, 0) / target * 100));
    return `
      <div class="item">
        <div class="icon" style="background:${milestone.done ? '#E5F8EF' : '#F1F3F9'}">${milestone.done ? '✅' : '🏆'}</div>
        <div class="info">
          <b>${escapeHtml(milestone.type)} ${target}${escapeHtml(milestone.unit)}</b>
          <span>奖励：${escapeHtml(milestone.reward)} · ${escapeHtml(milestone.rtype)}</span>
          <div class="progress ${milestone.done ? 'green' : 'orange'}"><i style="width:${percent}%"></i></div>
          <div class="stat-row"><span>进度 ${finiteNumber(milestone.cur, 0)}/${target}${escapeHtml(milestone.unit)}</span><span>${percent}%</span></div>
        </div>
        <button class="btn ghost small" onclick="delMS(${index})">✕</button>
      </div>
    `;
  }).join('');

  document.getElementById('msList').innerHTML = rows || '<div class="empty-tip">还没有里程碑，点击下面按钮创建 🏆</div>';
  document.getElementById('msListModal').innerHTML = rows || '<div class="empty-tip">还没有里程碑，点击下面按钮创建 🏆</div>';
}

function delMS(index) {
  MS.splice(index, 1);
  saveMS();
  renderMS();
  toast('已删除里程碑');
}

function addMilestone() {
  const value = finiteNumber(document.getElementById('msVal').value);
  const reward = document.getElementById('msReward').value.trim();
  if (value === null || value <= 0 || !reward) {
    toast('请填写目标数值和奖励');
    return;
  }

  MS.push({
    type: document.querySelector('#msType .on')?.textContent || '🏅 累计减重',
    val: value,
    unit: document.getElementById('msUnit').value,
    reward,
    rtype: document.querySelector('#msRType .on')?.textContent || '🎁 实物奖励',
    done: false,
    cur: 0
  });
  saveMS();
  renderMS();
  closeAll();
  toast('里程碑已创建并同步 🏆');
}

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return null;

  const header = lines[0];
  const isAlipay = header.includes('交易分类');
  const isWechat = header.includes('商品') && header.includes('收/支');
  if (!isAlipay && !isWechat) return null;

  const rows = [];
  for (const line of lines.slice(1)) {
    const columns = line.split(',').map((value) => value.trim().replace(/^"|"$/g, ''));
    if (isAlipay) {
      const time = columns[2] || columns[3];
      const item = columns[8];
      const amount = columns[9];
      const direction = columns[10];
      const status = columns[11];
      const category = columns[12];
      if (direction !== '支出' || String(status || '').includes('退款')) continue;
      if (!String(category || '').match(/餐饮|美食|食品/)) continue;
      rows.push({
        date: String(time || '').slice(5, 10),
        name: item,
        kcost: parseFloat(amount) || 0,
        src: 'CSV'
      });
    } else {
      const time = columns[0];
      const item = columns[3];
      const direction = columns[4];
      const amount = columns[5];
      const status = columns[7];
      if (direction !== '支出' || status !== '支付成功') continue;
      if (!String(item || '').match(/餐|饭|面|粉|奶茶|咖啡|小吃|超市|便利|菜|肉|水果|外卖|零食/)) continue;
      rows.push({
        date: String(time || '').slice(5, 10),
        name: item,
        kcost: parseFloat(String(amount || '').replace(/[¥￥,]/g, '')) || 0,
        src: 'CSV'
      });
    }
  }
  return rows;
}

function onCsvFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const rows = parseCsv(event.target.result);
    const box = document.getElementById('csvResult');
    box.style.display = 'block';
    if (!rows) {
      pendingBills = [];
      document.getElementById('csvMsg').innerHTML = '⚠️ 未识别出账单格式。请使用支付宝「账单导出」或微信「下载账单-个人对账」生成的 CSV 文件。';
      return;
    }
    pendingBills = rows;
    const total = rows.reduce((sum, item) => sum + item.kcost, 0);
    document.getElementById('csvMsg').innerHTML = `
      ✅ 解析成功：共 <b>${rows.length}</b> 条餐饮消费，合计 <b>¥${total.toFixed(2)}</b><br>
      <span style="font-size:11px;opacity:.7">样例：${rows.slice(0, 3).map((item) => `${escapeHtml(item.date)} ${escapeHtml(item.name)} ¥${item.kcost}`).join('；')}${rows.length > 3 ? ' …' : ''}</span>
    `;
  };
  reader.readAsText(file, 'GBK');
}

function confirmCsv() {
  if (!pendingBills.length) {
    toast('没有可导入的条目');
    return;
  }
  DB.bills = DB.bills.concat(pendingBills);
  pendingBills = [];
  saveDB();
  renderBills();
  drawDual();
  document.getElementById('csvResult').style.display = 'none';
  toast('账单已导入并同步 ✓');
}

function onBillShot(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const image = document.getElementById('billPreview');
    image.src = event.target.result;
    image.style.display = 'block';
    toast('正在运行截图识别演示…');
    setTimeout(() => {
      const rows = [
        { date: '10-01', name: '黄焖鸡米饭', kcost: 22, src: '截图演示' },
        { date: '10-01', name: '瑞幸咖啡', kcost: 15, src: '截图演示' },
        { date: '09-30', name: '水果捞', kcost: 18, src: '截图演示' }
      ];
      pendingBills = rows;
      document.getElementById('csvResult').style.display = 'block';
      document.getElementById('csvMsg').innerHTML = `
        🔍 <b>截图识别演示结果：</b>检测到 ${rows.length} 条餐饮消费，合计 <b>¥${rows.reduce((sum, item) => sum + item.kcost, 0)}</b><br>
        <span style="font-size:11px;opacity:.7">${rows.map((item) => `${item.date} ${escapeHtml(item.name)} ¥${item.kcost}`).join('；')}</span>
      `;
    }, 900);
  };
  reader.readAsDataURL(file);
}

function renderBills() {
  const element = document.getElementById('billList');
  if (!element) return;
  if (!DB.bills.length) {
    element.innerHTML = '<div class="empty-tip">暂无账单，试试上方 CSV 导入 📄</div>';
    document.getElementById('billMonthTotal').textContent = '共 ¥0';
    return;
  }

  const total = DB.bills.reduce((sum, item) => sum + item.kcost, 0);
  document.getElementById('billMonthTotal').textContent = `共 ¥${total.toFixed(0)} · ${DB.bills.length}笔`;
  element.innerHTML = DB.bills.map((bill, index) => `
    <div class="item">
      <div class="icon" style="background:#F1F3F9">🧾</div>
      <div class="info"><b>${escapeHtml(bill.name)}</b><span>${escapeHtml(bill.date)} · 来源：${escapeHtml(bill.src)}</span></div>
      <div class="right">¥${bill.kcost.toFixed(1)}<span></span></div>
      <button class="btn ghost small" onclick="delBill(${index})">✕</button>
    </div>
  `).join('');
}

function delBill(index) {
  DB.bills.splice(index, 1);
  saveDB();
  renderBills();
  drawDual();
  toast('已删除');
}

const COST_DATA = {
  w: { labels: ['一', '二', '三', '四', '五', '六', '日'], w: [68.5, 68.4, 68.4, 68.3, 68.1, 68.3, 68.2], c: [62, 45, 58, 70, 155, 96, 0], wChg: '-0.3kg', cTot: '¥486', unit: '¥1,620' },
  m: { labels: ['第1周', '第2周', '第3周', '第4周'], w: [69.4, 69.0, 68.7, 68.2], c: [520, 486, 610, 435], wChg: '-1.2kg', cTot: '¥2,051', unit: '¥1,709' },
  q: { labels: ['7月', '8月', '9月', '10月'], w: [71.5, 70.6, 69.4, 68.2], c: [1980, 2240, 2051, 486], wChg: '-3.3kg', cTot: '¥6,757', unit: '¥2,048' }
};

function setPeriod(element, period) {
  document.querySelectorAll('#periodSel span').forEach((span) => span.classList.remove('on'));
  element.classList.add('on');
  currentCostPeriod = period;
  drawDual();
}

function drawDual() {
  const chart = document.getElementById('dualChart');
  if (!chart) return;
  const data = COST_DATA[currentCostPeriod] || COST_DATA.w;
  const width = 360;
  const height = 130;
  const padding = 8;
  const weightMin = Math.min(...data.w) - 0.2;
  const weightMax = Math.max(...data.w) + 0.2;
  const costMax = Math.max(...data.c, 1);
  const x = (index) => padding + (index * (width - (2 * padding))) / (data.labels.length - 1);
  const yWeight = (value) => height - ((value - weightMin) / (weightMax - weightMin)) * (height - 24) - 8;
  const barWidth = Math.min(26, ((width - (2 * padding)) / data.labels.length) * 0.5);

  let bars = '';
  data.c.forEach((cost, index) => {
    const barHeight = Math.max(3, (cost / costMax) * (height - 24));
    bars += `<rect x="${x(index) - barWidth / 2}" y="${height - barHeight - 8}" width="${barWidth}" height="${barHeight}" rx="3" fill="#FFD37E" opacity=".85"/>`;
  });

  const points = data.w.map((value, index) => `${x(index)},${yWeight(value)}`);
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <line x1="${padding}" y1="${height - 8}" x2="${width - padding}" y2="${height - 8}" stroke="#E5E8F0"/>
    ${bars}
    <polyline points="${points.join(' ')}" fill="none" stroke="#4F6DF5" stroke-width="2.5" stroke-linecap="round"/>
    ${data.w.map((value, index) => `<circle cx="${x(index)}" cy="${yWeight(value)}" r="3.5" fill="#4F6DF5"/>`).join('')}
    ${data.labels.map((label, index) => `<text x="${x(index)}" y="${height + 4}" font-size="9" fill="#8A91A3" text-anchor="middle">${label}</text>`).join('')}
  </svg>`;

  document.getElementById('stW').textContent = data.wChg;
  document.getElementById('stC').textContent = data.cTot;
  document.getElementById('stU').textContent = data.unit;
  renderAiCost();
}

function renderAiCost() {
  const element = document.getElementById('aiCost');
  if (!element) return;
  const text = {
    w: '本周体重 <b>-0.3kg</b>，饮食消费 <b>¥486</b>。周六消费突增（¥155）次日体重回升 +0.2kg，符合「高消费日→高盐高油→水分滞留」模式，属正常波动，不必焦虑。建议将高消费餐安排在中午，晚餐清淡即可快速回落。',
    m: '本月体重 <b>-1.2kg</b>，花费 <b>¥2,051</b>，每公斤减重成本 <b>¥1,709</b>。第 3 周消费最高（¥610）但体重仍下降，说明该周运动量增加有效对冲。外食占比 62%，若自己做饭比例提升到 50%，预计月省 <b>¥380</b> 且减重速度可加快 15%。',
    q: '本季度累计减重 <b>3.3kg</b>，饮食总消费 <b>¥6,757</b>。相关性分析：消费周与体重周变化呈 <b>弱正相关（r=0.34）</b>——消费每增加 ¥100，次周体重平均 +0.05kg，但影响 3 天内消退。真正影响体重的是消费结构：奶茶/外卖占比 &gt;40% 的周，体重下降率降低 <b>40%</b>。建议：保留消费额度，优先把奶茶换成咖啡/茶。'
  };
  element.innerHTML = text[currentCostPeriod] || text.w;
}

function renderAll() {
  renderFood();
  renderBills();
  renderExe();
  renderWeight();
  renderHabits();
  renderWater();
  renderDashboard();
  renderFoodOpts();
  renderMS();
  renderProfile();
  renderBodyMetrics();
  drawDual();
}

function go(page, button) {
  document.querySelectorAll('.page').forEach((element) => element.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.tabbar button').forEach((element) => element.classList.remove('active'));
  button.classList.add('active');
  window.scrollTo(0, 0);
}

function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeAll() {
  document.querySelectorAll('.modal-mask').forEach((element) => element.classList.remove('show'));
}

function maskClose(event, element) {
  if (event.target === element) element.classList.remove('show');
}

function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.style.display = 'none';
  }, 1800);
}

function setAuthMode(mode) {
  authMode = mode === 'register' ? 'register' : 'login';
  document.getElementById('tabLogin').classList.toggle('on', authMode === 'login');
  document.getElementById('tabRegister').classList.toggle('on', authMode === 'register');
  document.getElementById('authSubmitBtn').textContent = authMode === 'login' ? '登录并同步' : '创建账号';
  document.getElementById('authPassword').autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
  document.getElementById('authHint').textContent = authMode === 'login'
    ? '没有账号？切换到“注册”创建账号。'
    : '注册后可能需要前往邮箱完成确认。';
  hideAuthMessage();
}

function showAuthMessage(message, success = false) {
  const element = document.getElementById('authError');
  element.textContent = message;
  element.className = `auth-error show${success ? ' success' : ''}`;
}

function hideAuthMessage() {
  const element = document.getElementById('authError');
  element.classList.remove('show');
  element.textContent = '';
}

function setAuthBusy(busy) {
  const button = document.getElementById('authSubmitBtn');
  button.disabled = busy;
  button.textContent = busy ? '请稍候…' : authMode === 'login' ? '登录并同步' : '创建账号';
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  hideAuthMessage();

  if (!supabaseClient) {
    showAuthMessage('Supabase 客户端加载失败，请刷新页面后重试。');
    return;
  }

  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || password.length < 6) {
    showAuthMessage('请输入有效邮箱，密码至少 6 位。');
    return;
  }

  setAuthBusy(true);
  try {
    if (authMode === 'register') {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.href.split('#')[0] }
      });
      if (error) throw error;
      if (data.session) {
        await activateSession(data.session);
      } else {
        setAuthMode('login');
        showAuthMessage('注册成功，请前往邮箱点击确认链接后再登录。', true);
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await activateSession(data.session);
    }
  } catch (error) {
    console.error('认证失败', error);
    const message = error?.message?.includes('Invalid login credentials')
      ? '邮箱或密码错误，请重新输入。'
      : error?.message?.includes('Email not confirmed')
        ? '邮箱尚未确认，请先完成邮件确认。'
        : error?.message || '登录失败，请稍后重试。';
    showAuthMessage(message);
  } finally {
    setAuthBusy(false);
  }
}

async function loadCloudState() {
  setSyncStatus('正在读取云端数据…', 'saving');
  const { data, error } = await supabaseClient
    .from('slim_girls_state')
    .select('state')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      throw new Error('数据库表不存在，请先在 Supabase SQL Editor 执行 schema.sql。');
    }
    throw error;
  }

  const hasCloudState = Boolean(data?.state);
  const state = hasCloudState
    ? data.state
    : readLocalCache(currentUser.id) || readLegacyState() || createDefaultState();

  applyState(state);
  hydrated = true;
  renderAll();
  if (!hasCloudState) await persistCloudState();
  else setSyncStatus('已同步到云端');
}

async function activateSession(session) {
  if (!session?.user) return;
  if (currentUser?.id === session.user.id && hydrated) {
    document.getElementById('authGate').hidden = true;
    document.body.classList.remove('auth-locked');
    return;
  }

  currentUser = session.user;
  hydrated = false;
  document.getElementById('authGate').hidden = false;
  document.body.classList.add('auth-locked');

  try {
    await loadCloudState();
    document.getElementById('authGate').hidden = true;
    document.body.classList.remove('auth-locked');
  } catch (error) {
    console.error('加载云端数据失败', error);
    currentUser = null;
    hydrated = false;
    DB = createDefaultState().db;
    MS = [];
    document.getElementById('authGate').hidden = false;
    document.body.classList.add('auth-locked');
    showAuthMessage(error?.message || '读取云端数据失败，请稍后重试。');
  }
}

function deactivateSession() {
  currentUser = null;
  hydrated = false;
  DB = createDefaultState().db;
  MS = [];
  document.getElementById('authGate').hidden = false;
  document.body.classList.add('auth-locked');
  setSyncStatus('等待登录');
}

async function signOutUser() {
  if (!supabaseClient) return;
  if (!window.confirm('确定要退出当前账号吗？云端数据不会被删除。')) return;
  await supabaseClient.auth.signOut({ scope: 'local' });
  deactivateSession();
}

async function clearAllData() {
  if (!currentUser) return;
  if (!window.confirm('确定清空当前账号的全部记录吗？此操作无法撤销。')) return;
  const reset = createDefaultState();
  DB = reset.db;
  MS = reset.milestones;
  saveLocalCache();
  renderAll();
  clearTimeout(syncTimer);
  await persistCloudState();
  toast('当前账号的数据已清空');
}

function initializeDate() {
  const now = new Date();
  const weeks = ['日', '一', '二', '三', '四', '五', '六'];
  document.getElementById('hdDate').textContent = `${now.getMonth() + 1}月${now.getDate()}日 星期${weeks[now.getDay()]}`;
}

function initializeQuickTags() {
  document.querySelectorAll('.quick').forEach((group) => {
    group.addEventListener('click', (event) => {
      if (event.target.tagName !== 'SPAN') return;
      group.querySelectorAll('span').forEach((span) => span.classList.remove('on'));
      event.target.classList.add('on');
    });
  });
}

async function initializeApp() {
  initializeDate();
  initializeQuickTags();
  renderAll();

  if (!supabaseClient) {
    showAuthMessage('Supabase 客户端加载失败，请检查网络后刷新页面。');
    return;
  }

  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) {
    showAuthMessage(error.message);
    return;
  }
  if (session) await activateSession(session);

  supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
    setTimeout(() => {
      if (nextSession?.user) activateSession(nextSession);
      else if (currentUser) deactivateSession();
    }, 0);
  });
}

initializeApp();
