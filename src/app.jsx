import { Component } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
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
        if (!View) return null;
        // The wrapper adds no layout; its "closing" class plays the exit animation.
        return (
          <div key={o.id} class={`overlay-wrap${o.closing ? ' closing' : ''}`}>
            <View {...o.props} onClose={() => closeOverlay(o.id)} />
          </div>
        );
      })}
    </>
  );
}

const TAB_ORDER = ['today', 'calendar', 'progress', 'awards'];
const SCREENS = { today: Today, calendar: Calendar, progress: Progress, awards: Awards };

function Shell() {
  const tab = uiState.value.tab;
  // Slide in from the side you're moving toward; just fade on first launch. Worked out only
  // when the tab changes, so other re-renders don't replay the animation.
  const nav = useRef({ tab: null, from: 'none' });
  if (nav.current.tab !== tab) {
    const before = nav.current.tab;
    const from = before == null ? 'none' : TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(before) ? 'right' : 'left';
    nav.current = { tab, from };
  }
  const { from } = nav.current;
  useEffect(() => {
    // Reopen a goal draft that was in progress when iOS closed the app.
    const draft = uiState.peek().draft;
    if (draft) openOverlay('goalEditor', { goalId: draft.goalId, draft });
  }, []);
  const Screen = SCREENS[tab] || Today;
  return (
    <>
      <div class="statusbar" aria-hidden="true" />
      <div key={tab} class={`screen-wrap from-${from}`}>
        <Screen />
      </div>
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
