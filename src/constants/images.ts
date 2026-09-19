export const images = {
  coverPlaceholder: "/images/cover-placeholder.svg",
  /**
   * The Talebrim mark, square and trimmed of its transparent padding.
   *
   * 256px so it stays crisp on a 2x display at the 24px the sidebar renders
   * it — the 2795x2552 source would have shipped ~195KB to draw a 24px square.
   * The same artwork is the favicon (`app/favicon.ico`), generated from this
   * file rather than a second export, so the two cannot drift.
   */
  logo: "/images/talebrim-logo.png",
};
