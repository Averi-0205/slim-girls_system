const SUPABASE_URL = 'https://bqohcnqwhruljvnfitex.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CA7Jk-eVHbyYzbhnvlyuBA_ZTkh1H55';
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
let pendingFoodAI = null;
let currentCostPeriod = 'w';

function createDefaultState() {
  return {
    db: {
      food: [],
      customFoods: [],
      bills: [],
      exe: [],
      weight: [],
      habits: {},
      water: {},
      diary: [],
      body: [],
      ai: {
        daily: null,
        cost: {}
      },
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

  const customFoods = (Array.isArray(sourceDb.customFoods) ? sourceDb.customFoods : [])
    .map((item) => ({
      name: String(item?.name || '').trim(),
      kcal: Math.max(0, Math.round(finiteNumber(item?.kcal, 0)))
    }))
    .filter((item) => item.name && item.kcal > 0);

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
  const ai = sourceDb.ai && typeof sourceDb.ai === 'object'
    ? {
        daily: sourceDb.ai.daily && typeof sourceDb.ai.daily === 'object'
          ? {
              text: String(sourceDb.ai.daily.text || ''),
              signature: String(sourceDb.ai.daily.signature || ''),
              generatedAt: sourceDb.ai.daily.generatedAt || null
            }
          : null,
        cost: sourceDb.ai.cost && typeof sourceDb.ai.cost === 'object'
          ? Object.fromEntries(
              Object.entries(sourceDb.ai.cost).map(([period, item]) => [
                period,
                {
                  text: String(item?.text || ''),
                  signature: String(item?.signature || ''),
                  generatedAt: item?.generatedAt || null
                }
              ])
            )
          : {}
      }
    : defaults.db.ai;
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

  return { db: { ...defaults.db, food, customFoods, bills, exe, weight, habits, water, diary, body, ai, profile }, milestones };
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

const FOOD_VISUAL = {
  主食: ['🍚', '#FEF3E2'],
  肉蛋: ['🍖', '#FDECEC'],
  豆奶: ['🥛', '#E8EDFF'],
  蔬菜: ['🥬', '#E5F8EF'],
  水果: ['🍎', '#FDECEC'],
  坚果: ['🥜', '#FEF3E2'],
  油脂: ['🫒', '#FEF3E2'],
  零食: ['🍪', '#F1F3F9'],
  饮料: ['🥤', '#E8EDFF'],
  调味: ['🧂', '#F1F3F9'],
  外卖: ['🥡', '#FEF3E2'],
  自定义: ['✨', '#E8EDFF']
};

let currentFoodResults = [];
let foodSearchTimer = null;
let foodSearchToken = 0;

function foodVisual(category) {
  return FOOD_VISUAL[category] || ['🍽️', '#F1F3F9'];
}

function localFoodMatches(query) {
  const normalized = String(query || '').trim().toLowerCase();
  const custom = DB.customFoods.map((item) => ({
    name: item.name,
    kcal: item.kcal,
    unit: '',
    category: '自定义'
  }));
  const builtin = FOODS.map(([name, kcal]) => ({ name, kcal, unit: '', category: '主食' }));
  const all = custom.concat(builtin);
  return normalized
    ? all.filter((item) => item.name.toLowerCase().includes(normalized))
    : all;
}

function renderFoodOptions(rows) {
  currentFoodResults = rows;
  const box = document.getElementById('foodOpts');
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = '<div class="empty-tip">未找到食物，可在下方创建自定义食物</div>';
    return;
  }
  box.innerHTML = rows.map((item, index) => {
    const [icon] = foodVisual(item.category);
    const unit = item.unit ? ` · ${escapeHtml(item.unit)}` : '';
    return `
      <div class="food-opt" onclick="pickFood(${index})">
        <b>${icon} ${escapeHtml(item.name)}</b>
        <span style="font-size:12px;color:var(--text-sub)">${Math.round(finiteNumber(item.kcal, 0))} kcal${unit}</span>
      </div>
    `;
  }).join('');
}

async function searchFoods(query) {
  const keyword = String(query || '').trim();
  const token = ++foodSearchToken;
  renderFoodOptions(localFoodMatches(keyword));

  if (!supabaseClient || !currentUser) return;

  try {
    let request = supabaseClient
      .from('foods')
      .select('name,unit,kcal,protein_g,carbs_g,fat_g,category')
      .limit(keyword ? 40 : 30);

    if (keyword) {
      const safe = keyword.replace(/[,%()]/g, '');
      const compact = safe.replace(/\s+/g, '').toLowerCase();
      const filters = [`name.ilike.%${safe}%`, `alias.ilike.%${safe}%`];
      if (/^[a-z0-9]+$/.test(compact)) filters.push(`pinyin_compact.ilike.%${compact}%`);
      request = request.or(filters.join(','));
    } else {
      request = request.order('id', { ascending: true });
    }

    const { data, error } = await request;
    if (error) throw error;
    if (token !== foodSearchToken) return;

    const custom = DB.customFoods
      .filter((item) => !keyword || item.name.toLowerCase().includes(keyword.toLowerCase()))
      .map((item) => ({ name: item.name, kcal: item.kcal, unit: '', category: '自定义' }));
    const seen = new Set();
    const merged = custom.concat(Array.isArray(data) ? data : []).filter((item) => {
      const key = `${item.name}|${item.unit || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (merged.length) renderFoodOptions(merged);
  } catch (error) {
    console.warn('云端食物库查询失败，已回退到内置食物库', error);
  }
}

function onFoodSearchInput(value) {
  clearTimeout(foodSearchTimer);
  foodSearchTimer = setTimeout(() => searchFoods(value), 200);
}

function pickFood(index) {
  const food = currentFoodResults[index];
  if (!food) return;
  const [icon, bg] = foodVisual(food.category);
  const kcal = Math.round(finiteNumber(food.kcal, 0));
  DB.food.push({
    icon,
    bg,
    name: food.name,
    sub: food.category === '自定义' ? '自定义食物' : `食物库 · ${food.unit || '100g'}`,
    kcal,
    cost: Math.max(0, finiteNumber(document.getElementById('foodCost')?.value, 0)),
    date: todayKey()
  });
  saveDB();
  renderFood();
  renderDashboard();
  closeAll();
  toast(`已记录：${food.name} ${kcal} kcal ✓`);
}

function addCustomFood() {
  const name = document.getElementById('cFoodName')?.value.trim();
  const kcal = finiteNumber(document.getElementById('cFoodKcal')?.value);
  const portion = document.getElementById('cFoodPortion')?.value.trim();
  if (!name || kcal === null || kcal <= 0) {
    toast('请填写食物名称和预估热量');
    return;
  }

  const label = portion ? `${name}（${portion}）` : name;
  DB.customFoods.push({ name: label, kcal: Math.round(kcal) });
  DB.food.push({
    icon: '✨',
    bg: '#E8EDFF',
    name: `自定义 · ${label}`,
    sub: `预估 ${Math.round(kcal)} kcal · 已存入食物库`,
    kcal: Math.round(kcal),
    cost: Math.max(0, finiteNumber(document.getElementById('foodCost')?.value, 0)),
    date: todayKey()
  });
  saveDB();
  renderFood();
  searchFoods('');
  renderDashboard();
  closeAll();
  toast(`自定义食物已保存并记录：${label} ✓`);
}

function addFoodAI() {
  if (!pendingFoodAI) {
    toast('请先上传并识别食物照片');
    return;
  }
  const cost = Math.max(0, finiteNumber(document.getElementById('foodCost')?.value, 0));
  DB.food.push({
    icon: '📷',
    bg: '#E8EDFF',
    name: pendingFoodAI.name,
    sub: pendingFoodAI.sub,
    kcal: pendingFoodAI.kcal,
    cost,
    date: todayKey()
  });
  saveDB();
  renderFood();
  renderDashboard();
  closeAll();
  toast(`识别结果已保存 ${pendingFoodAI.kcal} kcal ✓`);
  pendingFoodAI = null;
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
  drawDual();
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = source;
  });
}

async function compressImageForAI(file) {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const maxSizes = [320, 280, 240, 200];
  const qualities = [0.55, 0.45, 0.35, 0.28];
  let best = source;

  for (const maxSize of maxSizes) {
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of qualities) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length < best.length || best === source) best = dataUrl;
      if (dataUrl.length <= 7800) return dataUrl;
    }
  }

  if (best.length > 8192) throw new Error('图片压缩后仍过大，请重新截图或选择较小的照片');
  return best;
}

async function onFoodPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const preview = document.getElementById('foodPreview');
  const resultBox = document.getElementById('aiFoodResult');
  const resultText = document.getElementById('aiFoodResultText');

  try {
    const previewUrl = await readFileAsDataUrl(file);
    preview.src = previewUrl;
    preview.style.display = 'block';
    toast('DeepSeek 正在识别食物…');
    const imageDataUrl = await compressImageForAI(file);
    const result = await callDeepSeekAnalyze('food-image', {
      imageDataUrl,
      mealType: document.querySelector('#mealType .on')?.textContent || ''
    });

    let parsed = null;
    try {
      parsed = JSON.parse(String(result.text).replace(/^```json\s*|\s*```$/g, '').trim());
    } catch {
      parsed = null;
    }

    const foods = Array.isArray(parsed?.foods) ? parsed.foods : [];
    const detail = foods.length
      ? foods.map((item) => `${item.name || '食物'} ${item.portion || ''} ${Math.round(finiteNumber(item.kcal, 0))} kcal`).join('；')
      : (parsed?.description || result.text);
    const totalKcal = Math.max(0, Math.round(finiteNumber(parsed?.totalKcal, foods.reduce((sum, item) => sum + finiteNumber(item.kcal, 0), 0))));
    if (!totalKcal) throw new Error('没有识别出食物，请换一张更清晰的照片');

    pendingFoodAI = {
      name: foods.length ? foods.map((item) => item.name || '食物').join(' + ') : '照片识别食物',
      sub: `${detail}${parsed?.proteinG !== undefined ? ` · 蛋白${Math.round(parsed.proteinG)}g` : ''}`.slice(0, 180),
      kcal: totalKcal
    };
    resultText.innerHTML = `检测到：<b>${escapeHtml(pendingFoodAI.name)}</b><br>${escapeHtml(detail)}<br>总热量约 <b>${totalKcal} kcal</b>${parsed?.proteinG !== undefined ? ` · 蛋白质 ${Math.round(parsed.proteinG)}g` : ''}`;
    resultBox.style.display = 'block';
  } catch (error) {
    console.error('Food image recognition failed', error);
    pendingFoodAI = null;
    resultText.textContent = `识别失败：${error.message}`;
    resultBox.style.display = 'block';
    toast(`照片识别失败：${error.message}`);
  }
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

function aiSignature(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function formatAiText(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function buildCostAIData(data = buildCostData(currentCostPeriod)) {
  return {
    period: currentCostPeriod,
    labels: data.labels,
    weights: data.rawWeights,
    costs: data.costs,
    totalCost: data.totalCost,
    weightChange: data.weightChange,
    costPerKgLost: data.unitCost
  };
}

async function callDeepSeekAnalyze(action, data) {
  if (!supabaseClient || !currentUser) throw new Error('请先登录后使用 AI 分析');

  const { data: result, error } = await supabaseClient.functions.invoke('deepseek-analyze', {
    body: { action, data }
  });

  if (error) {
    let message = error.message || 'DeepSeek 请求失败';
    try {
      const details = await error.context?.json();
      if (details?.error) message = details.error;
    } catch {
      // Keep the client error when the function response is not JSON.
    }
    if (message.includes('DEEPSEEK_API_KEY')) message = 'Supabase 尚未配置 DeepSeek API Key';
    throw new Error(message);
  }
  if (result?.error) throw new Error(result.error);
  if (!result?.text) throw new Error('DeepSeek 没有返回分析内容');
  return result;
}

async function generateCostAI() {
  const button = document.getElementById('costAiBtn');
  const status = document.getElementById('aiCostStatus');
  const element = document.getElementById('aiCost');
  const data = buildCostData(currentCostPeriod);
  const payload = buildCostAIData(data);
  if (button) {
    button.disabled = true;
    button.textContent = '分析中…';
  }
  if (status) status.textContent = 'DeepSeek 分析中';
  if (element) element.innerHTML = 'DeepSeek 正在分析当前周期数据，请稍候…';

  try {
    const result = await callDeepSeekAnalyze('cost-analysis', payload);
    DB.ai.cost[currentCostPeriod] = {
      text: result.text,
      signature: aiSignature(payload),
      generatedAt: new Date().toISOString()
    };
    saveDB();
    renderAiCost(data);
    toast('消费关联分析已更新');
  } catch (error) {
    console.error('DeepSeek cost analysis failed', error);
    renderAiCost(data);
    toast(`AI 分析失败：${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '重新分析';
    }
  }
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

function renderBills() {
  const element = document.getElementById('billList');
  if (!element) return;
  if (!DB.bills.length) {
    element.innerHTML = '<div class="empty-tip">暂无餐饮消费记录 📄</div>';
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

function dateFromKey(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function parseBillDate(value, reference = new Date()) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);

  match = text.match(/^(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = reference.getFullYear();
  if (month > reference.getMonth() + 1) year -= 1;
  return new Date(year, month - 1, day, 12);
}

function addDays(value, amount) {
  const date = dateFromKey(value);
  if (!date) return null;
  date.setDate(date.getDate() + amount);
  return date;
}

function dateRangeLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildChartBuckets(period) {
  const today = dateFromKey(new Date());
  if (period === 'm') {
    return Array.from({ length: 4 }, (_, index) => {
      const start = addDays(today, -27 + (index * 7));
      return { start, end: addDays(start, 6), label: `第${index + 1}周` };
    });
  }

  if (period === 'q') {
    return Array.from({ length: 4 }, (_, index) => {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - 3 + index, 1, 12);
      const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 12);
      const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 12);
      return { start, end, label: `${monthDate.getMonth() + 1}月` };
    });
  }

  const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, -6 + index);
    return { start: date, end: date, label: `周${weekNames[date.getDay()]}` };
  });
}

function buildCostData(period = currentCostPeriod) {
  const buckets = buildChartBuckets(period);
  const sortedWeights = [...DB.weight].sort((a, b) => a.date.localeCompare(b.date));
  const rawWeights = buckets.map((bucket) => {
    const readings = sortedWeights.filter((item) => {
      const date = dateFromKey(item.date);
      return date && date >= bucket.start && date <= bucket.end;
    });
    return readings.length ? readings[readings.length - 1].value : null;
  });

  let previousWeight = null;
  for (const item of sortedWeights) {
    const date = dateFromKey(item.date);
    if (!date || date >= buckets[0].start) break;
    previousWeight = item.value;
  }

  const chartWeights = [...rawWeights];
  let carry = previousWeight;
  chartWeights.forEach((value, index) => {
    if (Number.isFinite(value)) carry = value;
    else if (Number.isFinite(carry)) chartWeights[index] = carry;
  });
  carry = null;
  for (let index = chartWeights.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(chartWeights[index])) carry = chartWeights[index];
    else if (Number.isFinite(carry)) chartWeights[index] = carry;
  }

  const costs = buckets.map((bucket) => DB.bills.reduce((sum, bill) => {
    const date = parseBillDate(bill.date);
    return date && date >= bucket.start && date <= bucket.end ? sum + finiteNumber(bill.kcost, 0) : sum;
  }, 0));
  const periodStart = buckets[0].start;
  const periodEnd = buckets[buckets.length - 1].end;
  const actualWeights = sortedWeights
    .filter((item) => {
      const date = dateFromKey(item.date);
      return date && date >= periodStart && date <= periodEnd;
    })
    .map((item) => item.value);
  const totalCost = costs.reduce((sum, value) => sum + value, 0);
  const weightChange = actualWeights.length > 1
    ? actualWeights[actualWeights.length - 1] - actualWeights[0]
    : null;
  const weightLost = weightChange !== null && weightChange < 0 ? Math.abs(weightChange) : null;
  const unitCost = weightLost ? totalCost / weightLost : null;

  return {
    labels: buckets.map((bucket) => bucket.label),
    weights: chartWeights.map((value) => Number.isFinite(value) ? value : null),
    rawWeights,
    costs,
    totalCost,
    weightChange,
    unitCost,
    hasWeights: actualWeights.length > 0
  };
}

function setPeriod(element, period) {
  document.querySelectorAll('#periodSel span').forEach((span) => span.classList.remove('on'));
  element.classList.add('on');
  currentCostPeriod = period;
  drawDual();
}

function drawDual() {
  const chart = document.getElementById('dualChart');
  if (!chart) return;
  const data = buildCostData(currentCostPeriod);
  const width = 360;
  const height = 160;
  const padX = 24;
  const padTop = 12;
  const padBottom = 30;
  const plotBottom = height - padBottom;
  const validWeights = data.weights.filter(Number.isFinite);

  if (!validWeights.length && data.totalCost === 0) {
    chart.innerHTML = '<div class="empty-tip">暂无体重或账单数据，记录后会生成真实图表。</div>';
    document.getElementById('stW').textContent = '暂无数据';
    document.getElementById('stC').textContent = '¥0';
    document.getElementById('stU').textContent = '--';
    renderAiCost(data);
    return;
  }

  const weightMin = validWeights.length ? Math.min(...validWeights) - 0.2 : 0;
  const weightMax = validWeights.length ? Math.max(...validWeights) + 0.2 : 1;
  const weightSpan = (weightMax - weightMin) || 1;
  const costMax = Math.max(...data.costs, 1);
  const plotHeight = plotBottom - padTop;
  const step = data.labels.length > 1 ? (width - (padX * 2)) / (data.labels.length - 1) : 0;
  const x = (index) => padX + (index * step);
  const yWeight = (value) => plotBottom - ((value - weightMin) / weightSpan) * plotHeight;
  const barWidth = Math.max(6, Math.min(26, (step || 40) * 0.55));

  let bars = '';
  data.costs.forEach((cost, index) => {
    if (cost <= 0) return;
    const barHeight = Math.max(3, (cost / costMax) * plotHeight);
    bars += `<rect x="${x(index) - barWidth / 2}" y="${plotBottom - barHeight}" width="${barWidth}" height="${barHeight}" rx="3" fill="#FFD37E" opacity=".85"/>`;
  });

  const points = data.weights
    .map((value, index) => Number.isFinite(value) ? `${x(index)},${yWeight(value)}` : null)
    .filter(Boolean);
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="体重与饮食消费趋势图">
    <line x1="${padX}" y1="${plotBottom}" x2="${width - padX}" y2="${plotBottom}" stroke="#E5E8F0"/>
    ${bars}
    ${points.length > 1 ? `<polyline points="${points.join(' ')}" fill="none" stroke="#4F6DF5" stroke-width="2.5" stroke-linecap="round"/>` : ''}
    ${data.weights.map((value, index) => Number.isFinite(value) ? `<circle cx="${x(index)}" cy="${yWeight(value)}" r="3.5" fill="#4F6DF5"/>` : '').join('')}
    ${data.labels.map((label, index) => `<text x="${x(index)}" y="${height - 9}" font-size="10" fill="#8A91A3" text-anchor="middle">${label}</text>`).join('')}
  </svg>`;

  document.getElementById('stW').textContent = data.weightChange === null
    ? '暂无数据'
    : `${data.weightChange <= 0 ? '▼' : '▲'} ${data.weightChange > 0 ? '+' : ''}${data.weightChange.toFixed(1)}kg`;
  document.getElementById('stC').textContent = `¥${data.totalCost.toFixed(0)}`;
  document.getElementById('stU').textContent = data.unitCost === null ? '--' : `¥${data.unitCost.toFixed(0)}`;
  renderAiCost(data);
}

function renderAiCost(data = buildCostData(currentCostPeriod)) {
  const element = document.getElementById('aiCost');
  if (!element) return;
  const status = document.getElementById('aiCostStatus');
  const payload = buildCostAIData(data);
  const cached = DB.ai.cost?.[currentCostPeriod];
  if (cached?.text && cached.signature === aiSignature(payload)) {
    if (status) status.textContent = 'DeepSeek 已分析';
    element.innerHTML = formatAiText(cached.text);
    return;
  }
  if (status) status.textContent = '基于当前记录';
  if (!data.hasWeights && data.totalCost === 0) {
    element.innerHTML = '当前周期还没有体重和饮食消费记录。添加记录后，这里会显示真实汇总。';
    return;
  }

  const periodName = currentCostPeriod === 'm' ? '本月' : currentCostPeriod === 'q' ? '本季度' : '本周';
  if (!data.hasWeights) {
    element.innerHTML = `${periodName}饮食消费合计 <b>¥${data.totalCost.toFixed(0)}</b>，但还没有足够的体重记录，暂时无法计算减重成本。`;
    return;
  }

  const changeText = data.weightChange === null
    ? '体重记录不足两次，暂不计算变化'
    : `体重变化 <b>${data.weightChange > 0 ? '+' : ''}${data.weightChange.toFixed(1)}kg</b>`;
  const unitText = data.unitCost === null
    ? '本期没有形成减重，无法计算每公斤减重成本。'
    : `按当前数据计算，每公斤减重成本约 <b>¥${data.unitCost.toFixed(0)}</b>。`;
  element.innerHTML = `${periodName}${changeText}，饮食消费合计 <b>¥${data.totalCost.toFixed(0)}</b>。<br>${unitText}`;
}

function renderAll() {
  renderFood();
  renderBills();
  renderExe();
  renderWeight();
  renderHabits();
  renderWater();
  renderDashboard();
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
  if (id === 'modal-food') {
    const search = document.getElementById('foodSearch');
    if (search) search.value = '';
    searchFoods('');
  }
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
