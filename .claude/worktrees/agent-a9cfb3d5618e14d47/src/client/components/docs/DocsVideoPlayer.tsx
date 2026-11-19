// [SCOPE 044 / T005] BEGIN — DocsVideoPlayer (embedded S3 video + poster)
interface DocsVideoPlayerProps {
  videourl?: string | null;
  posterurl?: string | null;
  title?: string;
}

/**
 * Responsive HTML5 video player for the public Docs detail page. Both the video
 * and poster are optional: when there is no videourl, nothing renders (the doc
 * shows text only); when there is no posterurl, the browser's default first-frame
 * placeholder is used. Video/poster are served from the public-read `wxkanban`
 * S3 bucket.
 */
export function DocsVideoPlayer({ videourl, posterurl, title }: DocsVideoPlayerProps) {
  if (!videourl) {
    return null;
  }

  return (
    <div className="mt-8 w-full overflow-hidden rounded-xl border border-border bg-black/5">
      <video
        controls
        preload="metadata"
        poster={posterurl || undefined}
        className="aspect-video w-full"
        aria-label={title ? `How-to video: ${title}` : "How-to video"}
      >
        <source src={videourl} />
        Your browser does not support embedded video.
      </video>
    </div>
  );
}
// [SCOPE 044 / T005] END
