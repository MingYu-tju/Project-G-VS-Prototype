type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
  msRequestFullscreen?: () => void | Promise<void>;
};
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

/** Call directly from the entry button, before awaiting audio or a network connection. */
export function requestMobileFullscreen(): void {
  const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth < 1024;
  const doc = document as FullscreenDocument;
  if (!mobile || doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement) return;
  const root = doc.documentElement as FullscreenRoot;
  const request = root.requestFullscreen ?? root.webkitRequestFullscreen ?? root.msRequestFullscreen;
  try {
    if (request) void Promise.resolve(request.call(root)).catch(() => { /* Fullscreen is optional. */ });
  } catch { /* Some mobile browsers expose the API but do not permit document fullscreen. */ }
}
