import { lazy, Suspense, useEffect, useState } from "react";
import { UpdaterGateDialog } from "../components/UpdaterGateDialog";
import { useAppUpdater } from "../hooks/useAppUpdater";
import { appUpdaterService } from "../services/updater/updater-service";
import { MatchHistoryWindow } from "../pages/MatchHistoryWindow";
import type { DevControlIdentity } from "../dev-control/protocol";

const App = lazy(() => import("./App").then(module => ({ default: module.App })));
const DevControlWindow = import.meta.env.MODE === "dev-control"
  ? lazy(() => import("../pages/DevControlWindow").then(module => ({ default: module.DevControlWindow })))
  : null;

export function AppBootstrap() {
  const [identity, setIdentity] = useState<DevControlIdentity | null | undefined>(undefined);
  const [identityError, setIdentityError] = useState<string | null>(null);
  useEffect(() => {
    if (import.meta.env.MODE !== "dev-control") return;
    let active = true;
    void import("../dev-control/transport").then(module => module.getDevControlIdentity()).then(value => {
      if (active) setIdentity(value);
    }).catch(cause => { if (active) setIdentityError(String(cause)); });
    return () => { active = false; };
  }, []);
  if (import.meta.env.MODE === "dev-control") {
    if (identityError) return <main role="alert">専用の開発起動を確認できません。{identityError}</main>;
    if (identity === undefined) return <main role="status">専用の開発起動を確認しています…</main>;
    if (identity?.role === "controller" && DevControlWindow) return <Suspense fallback={<p>操作窓を読み込んでいます…</p>}><DevControlWindow identity={identity} /></Suspense>;
  }
  return <Suspense fallback={<p>アプリを読み込んでいます…</p>}><NormalAppBootstrap /></Suspense>;
}

function NormalAppBootstrap() {
  const isMatchHistoryWindow =
    new URLSearchParams(window.location.search).get("view") === "match-history";
  const snapshot = useAppUpdater((state) => state);

  useEffect(() => {
    if (isMatchHistoryWindow) {
      return;
    }
    void appUpdaterService.bootstrap();
  }, [isMatchHistoryWindow]);

  if (isMatchHistoryWindow) {
    return <MatchHistoryWindow />;
  }

  if (snapshot.phase === "continue-app" || snapshot.phase === "done") {
    return <App />;
  }

  return (
    <UpdaterGateDialog
      snapshot={snapshot}
      onStartUpdate={() => {
        void appUpdaterService.installAvailableUpdate();
      }}
    />
  );
}
