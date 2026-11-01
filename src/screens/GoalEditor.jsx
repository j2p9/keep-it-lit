import { useEffect, useState } from 'preact/hooks';
import { colorOf, GOAL_COLORS } from '../lib/colors.js';
import { weekdayLetters } from '../lib/dates.js';
import { ALL_DAYS, scheduleLabel, TIME_SECTIONS } from '../lib/schedule.js';
import { archiveGoal, createGoal, deleteGoal, goals, saveGoal, settings } from '../lib/store.js';
import { EMOJIS, TEMPLATES } from '../lib/templates.js';
import { openOverlay, setUi, showToast } from '../lib/ui.js';
import { Page, Sheet } from '../components/Sheet.jsx';
import { Segmented, Stepper, Switch } from '../components/controls.jsx';

const blank = {
  title: '',
  emoji: '🔥',
  color: 'flame',
  target: 1,
  unit: '',
  schedule: 'daily',
  days: ALL_DAYS,
  per_week: 3,
  time_of_day: 'anytime',
  reminder_time: null,
};

const fields = (g) => ({
  title: g.title || '',
  emoji: g.emoji || '🔥',
  color: g.color || 'flame',
  target: g.target || 1,
  unit: g.unit || '',
  schedule: g.schedule || 'daily',
  days: g.days || ALL_DAYS,
  per_week: g.per_week || 3,
  time_of_day: g.time_of_day || 'anytime',
  reminder_time: g.reminder_time || null,
});

export function GoalEditor({ goalId, template, draft, onClose }) {
  const existing = goalId ? goals.value[goalId] : null;
  const [f, setF] = useState(() => draft?.f || (existing ? fields(existing) : { ...blank, ...(template ? fields(template) : {}) }));
  const [prior, setPrior] = useState(draft?.prior || 0);
  const [emojiInput, setEmojiInput] = useState('');
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const ws = settings.value.weekStart;

  // Keep an unsaved draft so iOS closing the app in the background doesn't lose it.
  useEffect(() => {
    setUi({ draft: { goalId: goalId || null, f, prior } });
  }, [f, prior]);
  const close = () => {
    setUi({ draft: null });
    onClose();
  };

  const counted = f.target > 1;
  const valid = f.title.trim() && (f.schedule !== 'weekdays' || f.days.length);

  const save = () => {
    if (!valid) return;
    const data = {
      ...f,
      title: f.title.trim().slice(0, 60),
      unit: counted ? f.unit.trim().slice(0, 20) || null : null,
      target: counted ? f.target : 1,
      days: f.schedule === 'weekdays' ? [...f.days].sort() : ALL_DAYS,
    };
    if (existing) {
      saveGoal({ id: existing.id, ...data });
      showToast(`${data.emoji} Saved`);
    } else {
      createGoal(data, prior);
      showToast(`${data.emoji} ${data.title} added`);
    }
    close();
  };

  const toggleDay = (d) => set({ days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] });
  const order = Array.from({ length: 7 }, (_, i) => (ws + i) % 7);
  const letters = weekdayLetters(ws);

  return (
    <Page
      title={existing ? 'Edit goal' : 'New goal'}
      from="bottom"
      backLabel="Cancel"
      onBack={close}
      right={
        <button class="bar-btn right" disabled={!valid} onClick={save}>
          Save
        </button>
      }
    >
      <div class="goal-preview" style={{ '--c': colorOf(f.color) }}>
        <div class="goal-icon" aria-hidden="true">
          {f.emoji}
        </div>
        <div style="min-width:0">
          <div class="name">{f.title.trim() || 'Your new goal'}</div>
          <div class="muted" style="font-size:14px;margin-top:2px">
            {scheduleLabel(f)}
            {counted ? ` · ${f.target}${f.unit ? ` ${f.unit}` : ''}` : ''}
          </div>
        </div>
      </div>

      <label class="field">
        <span class="label">Name</span>
        <input
          class="input"
          maxLength={60}
          placeholder="e.g. Drink water"
          value={f.title}
          onInput={(e) => set({ title: e.currentTarget.value })}
        />
      </label>

      <div class="form-group">
        <span class="label">Icon</span>
        <div class="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} type="button" class={f.emoji === e ? 'on' : ''} aria-label={e} onClick={() => set({ emoji: e })}>
              {e}
            </button>
          ))}
        </div>
        <input
          class="input"
          style="margin-top:10px"
          placeholder="Or type any emoji"
          value={emojiInput}
          onInput={(e) => {
            const v = e.currentTarget.value.trim();
            setEmojiInput(v);
            const first = [...new Intl.Segmenter().segment(v)][0]?.segment;
            if (first && /\p{Extended_Pictographic}/u.test(first)) set({ emoji: first });
          }}
        />
      </div>

      <div class="form-group">
        <span class="label">Color</span>
        <div class="swatches">
          {Object.entries(GOAL_COLORS).map(([key, hex]) => (
            <button
              key={key}
              type="button"
              class={`swatch${f.color === key ? ' on' : ''}`}
              style={{ '--sw': hex }}
              aria-label={key}
              aria-pressed={f.color === key}
              onClick={() => set({ color: key })}
            />
          ))}
        </div>
      </div>

      <div class="form-group">
        <span class="label">How do you track it?</span>
        <Segmented
          label="Tracking"
          options={[
            ['check', 'Check it off'],
            ['count', 'Count it'],
          ]}
          value={counted ? 'count' : 'check'}
          onChange={(v) => set({ target: v === 'count' ? Math.max(2, f.target, 8) : 1 })}
        />
        {counted && (
          <div class="row-between" style="margin-top:14px;flex-wrap:wrap">
            <Stepper value={f.target} min={2} max={999} onChange={(v) => set({ target: v })} label="Daily target" />
            <input
              class="input"
              style="flex:1;min-width:140px"
              maxLength={20}
              placeholder="glasses, pages, minutes…"
              value={f.unit}
              onInput={(e) => set({ unit: e.currentTarget.value })}
            />
          </div>
        )}
      </div>

      <div class="form-group">
        <span class="label">How often?</span>
        <Segmented
          label="Repeat"
          options={[
            ['daily', 'Every day'],
            ['weekdays', 'Some days'],
            ['weekly', 'Per week'],
          ]}
          value={f.schedule}
          onChange={(v) => set({ schedule: v, days: v === 'weekdays' && f.days.length === 7 ? [1, 2, 3, 4, 5] : f.days })}
        />
        {f.schedule === 'weekdays' && (
          <div class="days-pick" style="margin-top:12px" role="group" aria-label="Days">
            {order.map((d, i) => (
              <button key={d} type="button" class={f.days.includes(d) ? 'on' : ''} aria-pressed={f.days.includes(d)} onClick={() => toggleDay(d)}>
                {letters[i]}
              </button>
            ))}
          </div>
        )}
        {f.schedule === 'weekly' && (
          <div class="row-between" style="margin-top:12px">
            <span class="muted">Times per week</span>
            <Stepper value={f.per_week} min={1} max={7} onChange={(v) => set({ per_week: v })} label="Times per week" />
          </div>
        )}
      </div>

      <div class="form-group">
        <span class="label">Best time of day</span>
        <Segmented
          label="Time of day"
          options={TIME_SECTIONS.map((s) => [s.key, s.label])}
          value={f.time_of_day}
          onChange={(v) => set({ time_of_day: v })}
        />
      </div>

      <div class="form-group">
        <div class="row-between">
          <div>
            <div style="font-weight:650">Reminder</div>
            <div class="muted" style="font-size:13px">Only if this goal isn’t done yet</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            {f.reminder_time && (
              <input
                type="time"
                class="time-input"
                value={f.reminder_time}
                aria-label="Reminder time"
                onChange={(e) => set({ reminder_time: e.currentTarget.value || null })}
              />
            )}
            <Switch label="Reminder" on={Boolean(f.reminder_time)} onChange={(on) => set({ reminder_time: on ? '09:00' : null })} />
          </div>
        </div>
      </div>

      {!existing && f.schedule !== 'weekly' && (
        <div class="form-group">
          <div class="row-between">
            <div>
              <div style="font-weight:650">Already doing this?</div>
              <div class="muted" style="font-size:13px">Days in a row so far. We’ll carry your streak over.</div>
            </div>
            <Stepper value={prior} min={0} max={365} onChange={setPrior} label="Days in a row so far" />
          </div>
        </div>
      )}

      <button class="btn btn-primary btn-block" disabled={!valid} onClick={save} style="margin-top:6px">
        {existing ? 'Save changes' : 'Add goal'}
      </button>

      {existing && (
        <div class="stack" style="margin-top:22px">
          <button
            class="btn btn-secondary btn-block"
            onClick={() => {
              archiveGoal(existing);
              showToast(`${existing.emoji} Archived. Its history is kept.`);
              close();
            }}
          >
            Archive goal
          </button>
          <button
            class="btn btn-danger btn-block"
            onClick={() => {
              if (!confirm(`Delete “${existing.title}” and its history? This can’t be undone.`)) return;
              deleteGoal(existing);
              showToast('Goal deleted');
              close();
            }}
          >
            Delete goal
          </button>
        </div>
      )}
    </Page>
  );
}

/** "Add a goal" picker: one-tap templates, or start from scratch. */
export function Templates({ onClose }) {
  const have = new Set(Object.values(goals.value).filter((g) => !g.deleted_at && !g.archived_on).map((g) => g.title));
  const pick = (template) => {
    onClose();
    openOverlay('goalEditor', { template });
  };
  return (
    <Sheet onClose={onClose} title="Add a goal" sub="Pick a starting point. You can tweak everything.">
      <button class="btn btn-secondary btn-block" style="margin-bottom:14px" onClick={() => pick(null)}>
        ✏️ Create your own
      </button>
      <div class="tpl-grid">
        {TEMPLATES.filter((t) => !have.has(t.title)).map((t) => (
          <button key={t.title} class="tpl" style={{ '--c': colorOf(t.color) }} onClick={() => pick(t)}>
            <span class="e" aria-hidden="true">
              {t.emoji}
            </span>
            <span>
              <span class="t">{t.title}</span>
              <span class="s" style="display:block">
                {t.schedule === 'weekly' ? `${t.per_week}× a week` : t.target > 1 ? `${t.target} ${t.unit}` : t.hint || 'Every day'}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
