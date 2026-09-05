export const CASE_FLICK_MIN_DISTANCE_PX = 18;
export const CASE_FLICK_AXIS_RATIO = 1.25;

export function classifyCaseFlick(deltaX, deltaY, uppercase) {
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < CASE_FLICK_MIN_DISTANCE_PX) return "tap";
  if (Math.abs(deltaY) < CASE_FLICK_MIN_DISTANCE_PX) return "cancel";
  if (Math.abs(deltaY) < Math.abs(deltaX) * CASE_FLICK_AXIS_RATIO) return "cancel";
  return (uppercase && deltaY > 0) || (!uppercase && deltaY < 0) ? "alternate" : "cancel";
}

export function alternateCaseLetter(letter, uppercase) {
  return uppercase ? letter.toLowerCase() : letter.toUpperCase();
}
