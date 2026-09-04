import * as controlMapping from "./controlMapping";

export const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function angleFromPointer(event: { clientX: number; clientY: number }, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const x = event.clientX - (rect.left + (rect.width / 2));
  const y = event.clientY - (rect.top + (rect.height / 2));
  return controlMapping.normalizeAngle(Math.atan2(x, -y) * (180 / Math.PI));
}
