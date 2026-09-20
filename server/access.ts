/** Public deployments can simulate without gaining access to the operator's keys. */
export function liveEnabled() {
  return (
    process.env.STUDIO_PUBLIC_DEMO !== "1" &&
    (!(process.env.VERCEL || process.env.STUDIO_ORIGIN) ||
      !!process.env.STUDIO_ACCESS_TOKEN?.trim())
  );
}

export const liveDisabledMessage =
  "Live providers are disabled on this public demo. Run locally with your own keys, or protect your deployment with STUDIO_ACCESS_TOKEN.";
