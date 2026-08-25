import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';

const REPO = 'anton-birk/Punchly';
const DISMISSED_KEY = 'punchly_update_dismissed';

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
  const [releaseUrl, setReleaseUrl] = useState(`https://github.com/${REPO}/releases/latest`);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const [current, resp] = await Promise.all([
          getVersion(),
          fetch(`https://api.github.com/repos/${REPO}/releases/latest`),
        ]);

        if (!resp.ok || cancelled) return;

        const data = await resp.json();
        const latest: string = (data.tag_name as string).replace(/^v/, '');
        const htmlUrl: string = data.html_url;

        if (semverGt(latest, current) && !cancelled) {
          const dismissedVersion = localStorage.getItem(DISMISSED_KEY);
          setLatestVersion(latest);
          setReleaseUrl(htmlUrl);
          setUpdateAvailable(true);
          if (dismissedVersion === latest) setDismissed(true);
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

  return { updateAvailable: updateAvailable && !dismissed, latestVersion, releaseUrl, dismiss };
}
