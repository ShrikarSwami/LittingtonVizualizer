// Keyboard shortcuts. Everything the mouse can do, plus the things only keys do.

export function installHotkeys(actions) {
  const keys = {
    f: actions.fullscreen,
    arrowright: actions.next,
    arrowleft: actions.back,
    l: actions.lock,
    tab: actions.switchPanel,
    h: actions.hide,
    c: actions.tint,
    '?': actions.help,
    '/': actions.help,
  };
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const action = keys[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    action();
  });

  // Hide the pointer (and the key hints) after a few still seconds.
  let timer = null;
  const wake = () => {
    document.body.classList.remove('idle-cursor');
    document.body.classList.add('show-help');
    clearTimeout(timer);
    timer = setTimeout(() => {
      document.body.classList.add('idle-cursor');
      document.body.classList.remove('show-help');
    }, 3000);
  };
  window.addEventListener('mousemove', wake);
  wake();
}
