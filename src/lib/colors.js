// Goal colors, tuned to read well on both the dark and light themes.
export const GOAL_COLORS = {
  flame: '#FF7A1A',
  red: '#FF453A',
  pink: '#FF3D8B',
  purple: '#BF5AF2',
  indigo: '#6E6BFF',
  blue: '#2F8CFF',
  cyan: '#32C5F4',
  teal: '#22C9AE',
  green: '#34C759',
  lime: '#9ED63A',
  yellow: '#FFC233',
  brown: '#C08457',
};

export const colorOf = (key) => GOAL_COLORS[key] || GOAL_COLORS.flame;
