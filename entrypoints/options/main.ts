import {
  autoScrollEnabled,
  youtubeIndicatorEnabled,
  stickyYoutubeEnabled,
  clearSearchCache,
} from '../../utils/storage';

async function init(): Promise<void> {
  const [scroll, indicator, sticky] = await Promise.all([
    autoScrollEnabled.getValue(),
    youtubeIndicatorEnabled.getValue(),
    stickyYoutubeEnabled.getValue(),
  ]);

  bindToggle('auto-scroll', scroll, autoScrollEnabled);
  bindToggle('youtube-indicator', indicator, youtubeIndicatorEnabled);
  bindToggle('sticky-youtube', sticky, stickyYoutubeEnabled);

  document.getElementById('clear-cache')!.addEventListener('click', async () => {
    await clearSearchCache();
    showFeedback('cache-feedback');
  });
}

function bindToggle(
  id: string,
  initialValue: boolean,
  item: { setValue(v: boolean): Promise<void> },
): void {
  const input = document.getElementById(id) as HTMLInputElement;
  input.checked = initialValue;
  input.addEventListener('change', () => item.setValue(input.checked));
}

function showFeedback(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2000);
}

document.addEventListener('DOMContentLoaded', init);
