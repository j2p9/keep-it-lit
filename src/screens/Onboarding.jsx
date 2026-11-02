import { useEffect, useState } from 'preact/hooks';
import { VAPID_PUBLIC_KEY } from '../config.js';
import { colorOf } from '../lib/colors.js';
import { tick } from '../lib/haptics.js';
import { isIOS, isStandalone } from '../lib/platform.js';
import { enablePush, pushSupported } from '../lib/push.js';
import { allGoals, completeOnboarding, createGoal, profile, session, settings, uid, updateProfile } from '../lib/store.js';
import { cloudConfigured } from '../lib/supabase.js';
import { TEMPLATES, templateHint, withHealth } from '../lib/templates.js';
import { onboardingActive, openOverlay, showToast } from '../lib/ui.js';

function Dots({ step }) {
  return (
    <div class="steps-dots" aria-hidden="true">
      {[0, 1].map((i) => (
        <i key={i} class={i === step ? 'on' : ''} />
      ))}
    </div>
  );
}

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState(() => new Set());
  const [pushOn, setPushOn] = useState(false);
  useEffect(() => {
    onboardingActive.value = true;
  }, []);

  const name = (profile.value?.display_name || '').split(' ')[0];
  const mine = allGoals.value;
  const titles = new Set(mine.map((g) => g.title));
  const total = picked.size + mine.length;

  const toggle = (i) => {
    tick();
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const addPicked = () => {
    for (const i of [...picked].sort((a, b) => a - b)) {
      const tp = withHealth(TEMPLATES[i], settings.peek().health);
      if (titles.has(tp.title)) continue;
      createGoal({
        title: tp.title,
        emoji: tp.emoji,
        color: tp.color,
        target: tp.target || 1,
        unit: tp.unit || null,
        schedule: tp.schedule || 'daily',
        per_week: tp.per_week || 3,
        time_of_day: tp.time_of_day || 'anytime',
        health: tp.health || null,
      });
    }
    setStep(1);
  };

  const finish = () => {
    completeOnboarding();
    onboardingActive.value = false;
  };

  if (step === 0) {
    return (
      <div class="auth">
        <div class="auth-inner" style="max-width:560px;padding-top:calc(var(--safe-top) + 28px)">
          <Dots step={0} />
          <h1 class="onb-title">{name ? `Hi ${name}! ` : ''}What do you want to do every day?</h1>
          <p class="onb-sub">Tap a few to start. You can change them anytime.</p>
          {mine.length > 0 && (
            <div class="hero-chips" style="margin:-6px 0 14px">
              {mine.map((g) => (
                <span key={g.id} class="pill">
                  {g.emoji} {g.title} ✓
                </span>
              ))}
            </div>
          )}
          <div class="tpl-grid">
            {TEMPLATES.map((tp, i) =>
              titles.has(tp.title) ? null : (
                <button
                  key={tp.title}
                  class={`tpl${picked.has(i) ? ' on' : ''}`}
                  style={{ '--c': colorOf(tp.color) }}
                  aria-pressed={picked.has(i)}
                  onClick={() => toggle(i)}
                >
                  <span class="e" aria-hidden="true">
                    {tp.emoji}
                  </span>
                  <span>
                    <span class="t">{tp.title}</span>
                    <span class="s" style="display:block">
                      {templateHint(withHealth(tp, settings.value.health))}
                    </span>
                  </span>
                </button>
              ),
            )}
          </div>
          <button class="btn btn-secondary btn-block" style="margin-top:12px" onClick={() => openOverlay('goalEditor', {})}>
            ✏️ Create your own
          </button>
          <div class="sticky-foot">
            <button class="btn btn-primary btn-block" disabled={!total} onClick={addPicked}>
              {total ? `Continue with ${total} ${total === 1 ? 'goal' : 'goals'}` : 'Pick at least one goal'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const p = profile.value || {};
  const canPush = cloudConfigured && VAPID_PUBLIC_KEY && !session.value.demo && pushSupported() && (!isIOS() || isStandalone());
  const enable = async () => {
    try {
      const r = await enablePush(uid());
      if (r.ok) setPushOn(true);
      else if (r.reason === 'denied') showToast('Notifications are blocked. You can allow them later in iPhone Settings.', { duration: 5000 });
    } catch {
      showToast('Couldn’t turn on notifications. You can try again in Settings.');
    }
  };

  return (
    <div class="auth">
      <div class="auth-inner" style="padding-top:calc(var(--safe-top) + 28px)">
        <Dots step={1} />
        <div class="flame-big" style="display:block;text-align:center;margin-bottom:10px" aria-hidden="true">
          🔥
        </div>
        <h1 class="onb-title" style="text-align:center">
          Never break the chain
        </h1>
        <p class="onb-sub" style="text-align:center">
          Reminders only go out when you still have goals left.
        </p>
        <div class="group" style="margin-bottom:16px">
          <div class="item">
            <span style="font-size:22px" aria-hidden="true">
              ☀️
            </span>
            <div class="item-main">
              <div class="item-label">Daily check-in</div>
              <div class="item-sub">If goals are still left</div>
            </div>
            <input
              type="time"
              class="time-input"
              aria-label="Daily check-in time"
              value={p.reminder_checkin_time || '15:00'}
              onChange={(e) => e.currentTarget.value && updateProfile({ reminder_checkin_time: e.currentTarget.value })}
            />
          </div>
          <div class="item">
            <span style="font-size:22px" aria-hidden="true">
              ⏳
            </span>
            <div class="item-main">
              <div class="item-label">Streak saver</div>
              <div class="item-sub">Last call before your streaks reset</div>
            </div>
            <input
              type="time"
              class="time-input"
              aria-label="Streak saver time"
              value={p.reminder_saver_time || '21:00'}
              onChange={(e) => e.currentTarget.value && updateProfile({ reminder_saver_time: e.currentTarget.value })}
            />
          </div>
        </div>

        {canPush ? (
          pushOn ? (
            <div class="banner">
              <span aria-hidden="true">🔔</span>
              <div>
                <b>Reminders are on</b>
                We’ll nudge you only when it helps.
              </div>
            </div>
          ) : (
            <button class="btn btn-primary btn-block" onClick={enable}>
              🔔 Allow notifications
            </button>
          )
        ) : (
          <div class="banner">
            <span style="font-size:22px" aria-hidden="true">
              📲
            </span>
            <div>
              <b>Reminders need the Home Screen app</b>
              In Safari tap Share, then “Add to Home Screen”. Turn reminders on later in Settings.
            </div>
          </div>
        )}
        <button class={`btn ${pushOn || !canPush ? 'btn-primary' : 'btn-ghost'} btn-block`} style="margin-top:12px" onClick={finish}>
          {pushOn || !canPush ? 'Start my first day 🔥' : 'Not now'}
        </button>
      </div>
    </div>
  );
}
