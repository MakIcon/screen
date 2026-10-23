const RELEASES_URL = "https://github.com/MakIcon/screen/releases";

/** Keep custom release tags from the manifest instead of assuming v<version>. */
export function launcherReleaseUrl(version: string, manifest: Record<string, unknown>): string {
  const platforms = manifest.platforms;
  const downloads = [
    manifest,
    ...(platforms && typeof platforms === "object" ? Object.values(platforms) : []),
  ];
  for (const download of downloads) {
    if (!download || typeof download !== "object" || !("url" in download)) continue;
    if (typeof download.url !== "string") continue;
    try {
      const url = new URL(download.url);
      const release = /^(\/[^/]+\/[^/]+\/releases)\/download\/([^/]+)\//.exec(url.pathname);
      if (url.origin === "https://github.com" && release) {
        return `${url.origin}${release[1]}/tag/${release[2]}`;
      }
    } catch {
      // Older manifests may omit the download metadata exposed to the frontend.
    }
  }
  return `${RELEASES_URL}/tag/v${encodeURIComponent(version)}`;
}
