// Inject click-flash effect on all [data-testid] buttons.
// Usage: agent-browser eval "$(cat scripts/highlight-button.js)"
document.querySelectorAll('[data-testid]').forEach(btn => {
  btn.style.transition = 'transform 0.1s, box-shadow 0.1s';
  btn.addEventListener('click', () => {
    btn.style.transform = 'scale(1.08)';
    btn.style.boxShadow = '0 0 12px 4px rgba(255,0,0,0.7)';
    btn.style.outline = '3px solid red';
    btn.style.outlineOffset = '3px';
  });
});
