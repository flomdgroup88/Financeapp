import { useState, useEffect, useCallback, useRef } from "react";
import { T } from "./theme";
import { hasToken } from "./api";
import { injectCSS } from "./components/ui";

import AuthScreen        from "./screens/AuthScreen";
import DashboardScreen   from "./screens/DashboardScreen";
import HistoryScreen     from "./screens/HistoryScreen";
import BalanceScreen     from "./screens/BalanceScreen";
import ExpensesScreen    from "./screens/ExpensesScreen";
import SubscriptionsScreen from "./screens/SubscriptionsScreen";
import ProfileScreen     from "./screens/ProfileScreen";

import TransactionModal  from "./modals/TransactionModal";
import TransferModal     from "./modals/TransferModal";
import AccountModal      from "./modals/AccountModal";
import SubscriptionModal from "./modals/SubscriptionModal";
import GoalModal         from "./modals/GoalModal";
import SettingsModal     from "./modals/SettingsModal";
import PlannedModal      from "./modals/PlannedModal";

import TopBar            from "./components/TopBar";
import BottomNav         from "./components/BottomNav";
import XPGainPopup       from "./components/XPGainPopup";
import { Toast, AchievementToast } from "./components/ui";

import useXP             from "./hooks/useXP";
import useAchievements   from "./hooks/useAchievements";
import useBootstrap      from "./hooks/useBootstrap";

import { get } from "./api";

injectCSS("app-scroll", `
  .screen-enter { animation: fadeIn 0.2s ease; }
`);

export default function App() {
  const [authed, setAuthed]       = useState(hasToken());
  const [tab, setTab]             = useState("dashboard");
  const [profileOpen, setProfile] = useState(false);

  // Bootstrap
  const { data: bootstrap, loading: bsLoading, refresh: refreshBootstrap } = useBootstrap();

  // XP
  const xpData = useXP(bootstrap?.gamification);

  // Toasts
  const [toasts, setToasts]         = useState([]);
  const [xpPopup, setXpPopup]       = useState(null);
  const [achToast, setAchToast]     = useState(null);

  function addToast(msg, type = "info") {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
  }
  function removeToast(id) {
    setToasts(t => t.filter(x => x.id !== id));
  }

  // Achievements
  const achievements = useAchievements((ach) => {
    setAchToast(ach);
  });

  // Sync XP from bootstrap
  useEffect(() => {
    if (bootstrap?.gamification) xpData.sync(bootstrap.gamification);
  }, [bootstrap?.gamification?.xp_total]);

  // ── Modal state ────────────────────────────────────────────────────
  const [txModal, setTxModal]           = useState({ open: false, tx: null });
  const [transferModal, setTransferModal] = useState(false);
  const [accountModal, setAccountModal] = useState({ open: false, account: null });
  const [subModal, setSubModal]         = useState({ open: false, sub: null });
  const [goalModal, setGoalModal]       = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [plannedModal, setPlannedModal] = useState({ open: false, planned: null });

  // ── Handlers ────────────────────────────────────────────────────────
  function openTx(tx = null) {
    setTxModal({ open: true, tx });
  }

  async function onTxSaved(txData) {
    if (txData) {
      // Award XP
      const { xpGained, newStreak } = await xpData.recordTransaction();
      if (xpGained > 0) {
        setXpPopup({ amount: xpGained, newXp: xpData.xp + xpGained });
      }

      // Achievement checks
      // Streak checks
      if (newStreak >= 3)  achievements.checkAndUnlock("streak_3");
      if (newStreak >= 7)  achievements.checkAndUnlock("streak_7");
      if (newStreak >= 14) achievements.checkAndUnlock("streak_14");
      if (newStreak >= 30) achievements.checkAndUnlock("streak_30");
    }
    refreshBootstrap();
    addToast("Транзакция сохранена", "success");
  }

  function onAccountSaved() {
    refreshBootstrap();
    addToast("Счёт сохранён", "success");
    achievements.checkAndUnlock("reserve_exists");
  }

  function onSubSaved() {
    refreshBootstrap();
    addToast("Подписка сохранена", "success");
  }

  function onTransferSaved() {
    refreshBootstrap();
    addToast("Перевод выполнен", "success");
    achievements.checkAndUnlock("transfer_first");
  }

  function onGoalSaved() {
    refreshBootstrap();
    achievements.checkAndUnlock("goal_created");
  }

  function onPlannedSaved() {
    refreshBootstrap();
    addToast("Поступление сохранено", "success");
  }

  // ── Auth ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handle = () => setAuthed(false);
    window.addEventListener("auth:logout", handle);
    return () => window.removeEventListener("auth:logout", handle);
  }, []);

  if (!authed) {
    return <AuthScreen onAuth={() => { setAuthed(true); refreshBootstrap(); }} />;
  }

  // ── Loading ─────────────────────────────────────────────────────────
  if (bsLoading && !bootstrap) {
    return (
      <div style={{
        height: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", background: T.bg0, gap: 16,
      }}>
        <div style={{ fontSize: 40 }}>🔐</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          <span style={{ color: T.em }}>V</span><span style={{ color: T.text }}>ault</span>
        </div>
        <div style={{
          width: 200, height: 3, background: T.bg3, borderRadius: 2, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: "40%", background: T.em, borderRadius: 2,
            animation: "ticker 1s ease-in-out infinite alternate",
          }} />
        </div>
      </div>
    );
  }

  // ── Profile tab ─────────────────────────────────────────────────────
  const showProfile = profileOpen;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: T.bg0, position: "relative" }}>
      {/* Top bar */}
      <TopBar
        xpData={xpData}
        onAdd={() => openTx(null)}
        onProfile={() => setProfile(true)}
      />

      {/* Screens */}
      <div className="screen-enter">
        {showProfile ? (
          <ProfileScreen
            xpData={xpData}
            achievements={achievements}
            bootstrap={bootstrap}
            onOpenSettings={() => setSettingsModal(true)}
          />
        ) : tab === "dashboard" ? (
          <DashboardScreen
            bootstrap={bootstrap}
            onAddTransaction={() => openTx(null)}
            onOpenGoals={() => setGoalModal(true)}
            onOpenSettings={() => setSettingsModal(true)}
            onNavigate={(tab) => { setProfile(false); setTab(tab); }}
          />
        ) : tab === "history" ? (
          <HistoryScreen
            bootstrap={bootstrap}
            onOpenEditTransaction={(tx) => openTx(tx)}
          />
        ) : tab === "balance" ? (
          <BalanceScreen
            bootstrap={bootstrap}
            onRefresh={refreshBootstrap}
            onOpenTransfer={() => setTransferModal(true)}
            onOpenAddAccount={(acc) => setAccountModal({ open: true, account: acc })}
            onOpenEditAccount={(acc) => setAccountModal({ open: true, account: acc })}
            onOpenPlanned={(p) => setPlannedModal({ open: true, planned: p })}
          />
        ) : tab === "expenses" ? (
          <ExpensesScreen bootstrap={bootstrap} onRefresh={refreshBootstrap} />
        ) : tab === "subs" ? (
          <SubscriptionsScreen
            bootstrap={bootstrap}
            onRefresh={refreshBootstrap}
            onOpenSubscription={(sub) => setSubModal({ open: true, sub })}
          />
        ) : null}
      </div>

      {/* Bottom nav */}
      <BottomNav
        activeTab={showProfile ? "__profile__" : tab}
        onChange={(t) => { setProfile(false); setTab(t); }}
        onFAB={() => openTx(null)}
      />

      {/* ── Modals ─────────────────────────────────────────────────── */}
      <TransactionModal
        open={txModal.open}
        onClose={() => setTxModal({ open: false, tx: null })}
        onSaved={onTxSaved}
        transaction={txModal.tx}
        bootstrap={bootstrap}
      />

      <TransferModal
        open={transferModal}
        onClose={() => setTransferModal(false)}
        onSaved={onTransferSaved}
        bootstrap={bootstrap}
      />

      <AccountModal
        open={accountModal.open}
        onClose={() => setAccountModal({ open: false, account: null })}
        onSaved={onAccountSaved}
        account={accountModal.account}
      />

      <SubscriptionModal
        open={subModal.open}
        onClose={() => setSubModal({ open: false, sub: null })}
        onSaved={onSubSaved}
        subscription={subModal.sub}
        bootstrap={bootstrap}
      />

      <GoalModal
        open={goalModal}
        onClose={() => setGoalModal(false)}
        onSaved={onGoalSaved}
        bootstrap={bootstrap}
      />

      <SettingsModal
        open={settingsModal}
        onClose={() => setSettingsModal(false)}
        bootstrap={bootstrap}
        onRefresh={refreshBootstrap}
        onLogout={() => setAuthed(false)}
      />

      <PlannedModal
        open={plannedModal.open}
        onClose={() => setPlannedModal({ open: false, planned: null })}
        onSaved={onPlannedSaved}
        planned={plannedModal.planned}
        bootstrap={bootstrap}
      />

      {/* Profile sheet */}
      {showProfile && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "transparent",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setProfile(false); }}
        />
      )}

      {/* ── Toasts / Popups ─────────────────────────────────────────── */}
      {xpPopup && (
        <XPGainPopup
          amount={xpPopup.amount}
          newXp={xpPopup.newXp}
          onDone={() => setXpPopup(null)}
        />
      )}

      {achToast && (
        <AchievementToast
          achievement={achToast}
          onClose={() => setAchToast(null)}
        />
      )}

      {toasts.map(t => (
        <Toast key={t.id} message={t.msg} type={t.type} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  );
}
