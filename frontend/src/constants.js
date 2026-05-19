export const XP_TABLE = [
  0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000,
  6500, 8500, 11000, 14000, 18000, 23000, 29000, 36000, 45000, 56000,
  70000, 87000, 107000, 132000, 162000, 197000, 238000, 286000, 342000, 407000,
];

export const RANKS = [
  { min: 0,  name: "Новичок",         icon: "🌱" },
  { min: 3,  name: "Трекер",          icon: "📊" },
  { min: 6,  name: "Аналитик",        icon: "🔍" },
  { min: 9,  name: "Стратег",         icon: "♟️" },
  { min: 12, name: "Оптимизатор",     icon: "⚙️" },
  { min: 15, name: "Инвестор",        icon: "💼" },
  { min: 18, name: "Финансист",       icon: "🏦" },
  { min: 21, name: "Магнат",          icon: "🏆" },
  { min: 24, name: "Эксперт",         icon: "🎯" },
  { min: 27, name: "Мастер сейфа",    icon: "🔐" },
];

export function lvlOf(xp) {
  for (let i = XP_TABLE.length - 1; i >= 0; i--) {
    if (xp >= XP_TABLE[i]) return i + 1;
  }
  return 1;
}

export function xpToNext(xp) {
  const lvl = lvlOf(xp);
  if (lvl >= XP_TABLE.length) return 0;
  return XP_TABLE[lvl] - xp;
}

export function xpForLevel(lvl) {
  return XP_TABLE[Math.min(lvl - 1, XP_TABLE.length - 1)] || 0;
}

export function rankOf(lvl) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (lvl >= r.min) rank = r;
  }
  return rank;
}

export const ACHIEVEMENT_DEFS = [
  // Дисциплина
  { id: "streak_3",    icon: "🔥", name: "Три дня",            desc: "Стрик 3 дня",                      color: "#F59E0B" },
  { id: "streak_7",    icon: "🔥", name: "Неделя без пропусков",desc: "Стрик 7 дней",                     color: "#F59E0B" },
  { id: "streak_14",   icon: "⚡", name: "Две недели",          desc: "Стрик 14 дней",                    color: "#EF4444" },
  { id: "streak_30",   icon: "💎", name: "Дисциплинированный",  desc: "Стрик 30 дней",                    color: "#06B6D4" },
  { id: "tx_10",       icon: "📝", name: "10 записей",          desc: "Добавил 10 транзакций",             color: "#10B981" },
  { id: "tx_50",       icon: "📋", name: "50 записей",          desc: "Добавил 50 транзакций",             color: "#10B981" },
  { id: "tx_100",      icon: "📊", name: "100 записей",         desc: "Добавил 100 транзакций",            color: "#3B82F6" },
  { id: "tx_500",      icon: "🏅", name: "500 записей",         desc: "Добавил 500 транзакций",            color: "#F59E0B" },
  { id: "full_day",    icon: "✅", name: "Полный день",          desc: "3+ записей за один день",           color: "#10B981" },
  { id: "full_month",  icon: "🗓️", name: "Идеальный месяц",     desc: "Запись каждый день месяца",         color: "#F59E0B" },
  // Цели
  { id: "goal_created",icon: "🌟", name: "Мечтатель",           desc: "Создал первую цель",                color: "#F59E0B" },
  { id: "goal_25",     icon: "🎯", name: "25% цели",            desc: "Достиг 25% цели накоплений",        color: "#10B981" },
  { id: "goal_50",     icon: "🎯", name: "Половина пути",       desc: "Достиг 50% цели накоплений",        color: "#10B981" },
  { id: "goal_75",     icon: "🎯", name: "Финишная прямая",     desc: "Достиг 75% цели накоплений",        color: "#10B981" },
  { id: "goal_done",   icon: "🏆", name: "Исполнитель",         desc: "Полностью закрыл цель",             color: "#F59E0B" },
  { id: "goal_3",      icon: "💰", name: "Серийный накопитель", desc: "3 активные цели одновременно",      color: "#06B6D4" },
  // Финансовая осознанность
  { id: "budget_set",  icon: "📐", name: "Плановик",            desc: "Задал лимит на категорию",          color: "#3B82F6" },
  { id: "budget_ok_month", icon: "✨", name: "Укложился",       desc: "Ни одна категория не превысила бюджет", color: "#10B981" },
  { id: "saved_positive",  icon: "📈", name: "В плюсе",         desc: "Доходы > расходов за месяц",        color: "#10B981" },
  { id: "saved_10pct",     icon: "💡", name: "Разумный инвестор",desc: "Сохранил 10%+ от дохода",           color: "#F59E0B" },
  { id: "saved_3months",   icon: "🛡️", name: "Подушка безопасности", desc: "Три месяца подряд в плюсе",    color: "#3B82F6" },
  // Оптимизация
  { id: "sub_audit",   icon: "✂️", name: "Ревизор",             desc: "Отключил хотя бы одну подписку",    color: "#EF4444" },
  { id: "no_impulse_7",icon: "🧘", name: "Стальные нервы",      desc: "7 дней без импульсивных трат",      color: "#06B6D4" },
  { id: "clean_categories", icon: "🗂️", name: "Педант",         desc: "Ни одной транзакции без категории", color: "#10B981" },
  // Счета
  { id: "reserve_exists",  icon: "🏦", name: "Подушка",         desc: "Создал резервный счёт",             color: "#3B82F6" },
  { id: "multi_currency",  icon: "💱", name: "Валютчик",        desc: "Счета в 2+ валютах",                color: "#F59E0B" },
  { id: "transfer_first",  icon: "↔️", name: "Перераспределение",desc: "Первый перевод между счетами",     color: "#10B981" },
  { id: "transfer_to_reserve", icon: "🔒", name: "Дальновидный",desc: "Перевод на резервный счёт",         color: "#06B6D4" },
];

export const CURRENCIES = ["RUB", "USD", "EUR", "CNY", "GBP"];

export const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь",
                           "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

export const MONTHS_SHORT = ["Янв","Фев","Мар","Апр","Май","Июн",
                              "Июл","Авг","Сен","Окт","Ноя","Дек"];
