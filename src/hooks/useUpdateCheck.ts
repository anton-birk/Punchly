import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';

const REPO = 'anton-birk/Punchly';
const LAST_CHECK_KEY = 'punchly_last_update_check';
const DISMISSED_KEY = 'punchly_update_dismissed';
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

export function useUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const lastCheck = parseInt(localStorage.getItem(LAST_CHECK_KEY) ?? '0', 10);
        if (Date.now() - lastCheck < CHECK_INTERVAL_MS) {
          // Still within the check window — re-apply dismissed state from storage.
          const dismissedVersion = localStorage.getItem(DISMISSED_KEY);
          if (!dismissedVersion) return;
          // If there was a stored pending update, re-surface it unless dismissed.
          return;
        }

        const [current, resp] = await Promise.all([
          getVersion(),
          fetch(`https://api.github.com/repos/${REPO}/releases/latest`),
        ]);

        if (!resp.ok || cancelled) return;

        const data = await resp.json();
        const latest: string = (data.tag_name as string).replace(/^v/, '');
        const htmlUrl: string = data.html_url;

        localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

        if (semverGt(latest, current)) {
          const dismissedVersion = localStorage.getItem(DISMISSED_KEY);
          if (!cancelled) {
            setLatestVersion(latest);
            setUpdateAvailable(true);
            if (dismissedVersion === latest) setDismissed(true);
            // store release url for later use via latestVersion + fixed pattern
            localStorage.setItem('punchly_latest_release_url', htmlUrl);
          }
        }
      } catch {
        // Network unavailable or rate-limited — silently skip.
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, latestVersion);
  };

  const releaseUrl =
    localStorage.getItem('punchly_latest_release_url') ??
    `https://github.com/${REPO}/releases/latest`;

  return { updateAvailable: updateAvailable && !dismissed, latestVersion, releaseUrl, dismiss };
}
