/**
 * A wheel must commit even when Android does not emit momentum-end after a
 * slow drag. A quiet-scroll fallback uses the latest offset, never the stale
 * drag-end offset from before a fling.
 */
export function createWheelSelection(options: {
  itemHeight: number;
  itemCount: () => number;
  commit: (index: number) => void;
  preview?: (index: number) => void;
  schedule?: (fn: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dragging = false;
  let moving = false;
  let offset = 0;
  let disposed = false;
  const clear = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const selectedIndex = () => Math.max(0, Math.min(
    Math.round(offset / options.itemHeight), Math.max(0, options.itemCount() - 1),
  ));
  const settle = () => {
    clear();
    if (disposed || dragging) return;
    moving = false;
    options.commit(selectedIndex());
  };
  const afterQuietScroll = () => {
    clear();
    timer = schedule(settle, 180);
  };
  return {
    isMoving: () => moving || dragging,
    dragBegin() {
      clear();
      dragging = true;
      moving = true;
    },
    scroll(y: number) {
      offset = y;
      if (moving || dragging) options.preview?.(selectedIndex());
      if (!dragging) afterQuietScroll();
    },
    dragEnd(y: number) {
      offset = y;
      dragging = false;
      options.preview?.(selectedIndex());
      afterQuietScroll();
    },
    momentumBegin() {
      moving = true;
      // Keep the fallback armed: some devices omit momentum-end.
      afterQuietScroll();
    },
    momentumEnd(y: number) {
      offset = y;
      settle();
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
