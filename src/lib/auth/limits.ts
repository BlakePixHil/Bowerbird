/** A sign-in link lasts 15 minutes, works once, and only the newest one for an email works. */
export const EMAIL_LINK_MINUTES = 15;

/** At most this many links are sent to one email in any 15 minutes. */
export const EMAIL_LINKS_PER_WINDOW = 3;
