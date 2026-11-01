import { Component } from 'preact';
import { useEffect } from 'preact/hooks';
import { isIOS, isStandalone } from './lib/platform.js';
import { firstLoad, needsOnboarding, ready, session } from './lib/store.js';
import { closeOverlay, onboardingActive, openOverlay, overlays, recoveryMode, uiState, welcomeOpen } from './lib/ui.js';
import { Celebration, Splash, TabBar, Toast } from './components/chrome.jsx';
import { GradientDefs } from './components/Ring.jsx';
import { Auth, Install, SetPassword } from './screens/Auth.jsx';
import { AwardSheet, Awards } from './screens/Awards.jsx';
import { Calendar } from './screens/Calendar.jsx';
import { DaySheet, GoalActions } from './screens/DaySheets.jsx';
import { GoalEditor, Templates } from './screens/GoalEditor.jsx';
import { Onboarding } from './screens/Onboarding.jsx';
import { GoalDetail, Progress } from './screens/Progress.jsx';
import { ChangePassword, ManageGoals, Settings } from './screens/Settings.jsx';
import { Today } from './screens/Today.jsx';
import { Welcome } from './screens/Welcome.jsx';

const OVERLAYS = {
  awardDetail: AwardSheet,
  changePassword: ChangePassword,
  daySheet: DaySheet,
  goalActions: GoalActions,
  goalDetail: GoalDetail,
  goalEditor: GoalEditor,
  manageGoals: ManageGoals,
  settings: Settings,
  templates: Templates,
};

function Overlays() {
  return (
    <>
      {overlays.value.map((o) => {
        const View = OVERLAYS[o.type];
        return View ? <View key={o.id} {...o.props} onClose={() => closeOverlay(o.id)} /> : null;
      })}
    </>
  );
}

function Shell() {
  const tab = uiState.value.tab;
  useEffect(() => {
    // Reopen a goal draft that was in progress when iOS closed the app.
    const draft = uiState.peek().draft;
    if (draft) openOverlay('goalEditor', { goalId: draft.goalId, draft });
  }, []);
  return (
    <>
      <div class="statusbar" aria-hidden="true" />
      {tab === 'today' && <Today />}
      {tab === 'calendar' && <Calendar />}
      {tab === 'progress' && <Progress />}
      {tab === 'awards' && <Awards />}
      <TabBar />
    </>
  );
}

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div class="splash" role="alert">
        <div style="padding:24px">
          <div class="flame-big" aria-hidden="true">
            🔥
          </div>
          <p style="margin:14px 0 18px">Something went wrong. Your goals are safe on this phone.</p>
          <button class="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export function App() {
  const s = session.value;
  let body;
  let shell = false;
  if (s.status === 'loading') body = <Splash />;
  else if (recoveryMode.value) body = <SetPassword />;
  else if (s.status === 'signedOut') body = isIOS() && !isStandalone() && !uiState.value.installDismissed ? <Install /> : <Auth />;
  else if (!ready.value || firstLoad.value) body = <Splash text="Loading your goals…" />;
  else if (onboardingActive.value || needsOnboarding.value) body = <Onboarding />;
  else {
    body = <Shell />;
    shell = true;
  }
  return (
    <ErrorBoundary>
      <GradientDefs />
      {body}
      <Overlays />
      {shell && welcomeOpen.value && <Welcome />}
      {shell && !welcomeOpen.value && <Celebration />}
      <Toast />
    </ErrorBoundary>
  );
}
