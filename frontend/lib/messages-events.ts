/** Fired when unread message state may have changed (e.g. after mark-read). */
export const MESSAGES_UNREAD_CHANGED_EVENT = 'ec-doctor:messages-unread-changed';

type UnreadChangedDetail = {
  /** Immediate optimistic reduction applied before the server recount. */
  readDelta?: number;
};

export function notifyMessagesUnreadChanged(detail?: UnreadChangedDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<UnreadChangedDetail>(MESSAGES_UNREAD_CHANGED_EVENT, {
      detail: detail ?? {},
    })
  );
}
