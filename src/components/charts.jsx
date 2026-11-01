import { colorOf } from '../lib/colors.js';
import { addDays, formatDay, formatMonth, startOfWeek } from '../lib/dates.js';

/** Health-style bar chart of completion (0..1). Bars at 100% get the flame gradient. */
export function BarChart({ data, selected, onSelect, height = 150 }) {
  const W = 320;
  const labelH = 18;
  const chartH = height - labelH;
  const gap = data.length > 12 ? 2.5 : 9;
  const bw = (W - gap * (data.length - 1)) / data.length;
  const vals = data.filter((d) => d.value != null);
  const avg = vals.length ? vals.reduce((s, d) => s + d.value, 0) / vals.length : null;
  const y = (v) => chartH - v * (chartH - 6);
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Completion chart">
      {[0.5, 1].map((g) => (
        <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="var(--line-strong)" stroke-dasharray="2 5" />
      ))}
      {data.map((d, i) => {
        const v = d.value ?? 0;
        const h = d.value == null ? 3 : Math.max(5, v * (chartH - 6));
        const x = i * (bw + gap);
        const fill = d.value == null ? 'var(--ring-track)' : v >= 1 ? 'url(#kil-flame)' : 'var(--accent)';
        const dim = selected != null && selected !== i;
        return (
          <g key={d.key} onClick={() => onSelect?.(i)} style="cursor:pointer">
            <rect x={x - gap / 2} y="0" width={bw + gap} height={chartH} fill="transparent" />
            <rect
              class="bar"
              x={x}
              y={chartH - h}
              width={bw}
              height={h}
              rx={Math.min(6, bw / 2)}
              fill={fill}
              opacity={dim ? 0.3 : d.value == null || v >= 1 ? 1 : 0.5 + v * 0.5}
            />
            {d.label && (
              <text x={x + bw / 2} y={height - 3} text-anchor="middle" font-size="11" font-weight="600" fill="var(--text-3)">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
      {avg != null && (
        <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} stroke="var(--text-2)" stroke-width="1.3" stroke-dasharray="5 4" />
      )}
    </svg>
  );
}

/** GitHub-style history grid for one goal (HabitKit-style). */
export function Heatmap({ goal, streak, lookup, today, weekStart = 0, weeks = 26 }) {
  const color = colorOf(goal.color);
  const cell = 11;
  const gap = 3;
  const top = 16;
  const lastWeek = startOfWeek(today, weekStart);
  const first = addDays(lastWeek, -7 * (weeks - 1));
  const width = weeks * (cell + gap) - gap;
  const height = top + 7 * (cell + gap) - gap;
  const labels = [];
  const cells = [];
  for (let w = 0; w < weeks; w += 1) {
    const wk = addDays(first, w * 7);
    if (w === 0 || wk.slice(5, 7) !== addDays(wk, -7).slice(5, 7)) {
      if (w < weeks - 2) labels.push([w, formatMonth(wk, { month: 'short' })]);
    }
    for (let d = 0; d < 7; d += 1) {
      const day = addDays(wk, d);
      if (day > today) continue;
      const c = lookup(goal.id, day);
      const st = streak?.status.get(day);
      let fill = 'var(--ring-track)';
      let opacity = day < goal.start_on || st === 'off' ? 0.35 : 1;
      if (c?.skipped) {
        fill = 'var(--text-3)';
        opacity = 0.35;
      } else if (st === 'frozen') {
        fill = 'var(--ice)';
        opacity = 0.85;
      } else if (c?.count > 0) {
        fill = color;
        opacity = Math.max(0.3, Math.min(1, c.count / goal.target));
      }
      cells.push(
        <rect key={day} x={w * (cell + gap)} y={top + d * (cell + gap)} width={cell} height={cell} rx="3" fill={fill} opacity={opacity}>
          <title>{formatDay(day, { month: 'short', day: 'numeric' })}</title>
        </rect>,
      );
    }
  }
  return (
    <svg class="heatmap" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${goal.title} history`}>
      {labels.map(([w, m]) => (
        <text key={w} x={w * (cell + gap)} y="10" font-size="10" font-weight="600" fill="var(--text-3)">
          {m}
        </text>
      ))}
      {cells}
    </svg>
  );
}
