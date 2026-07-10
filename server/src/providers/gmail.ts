import { google } from 'googleapis';
import { gmailSchema, type GmailData } from '@personal-dashboard/shared';
import { readGmailToken, writeGmailToken } from '../gmailToken.js';
import type { Provider } from '../scheduler.js';

const THREAD_COUNT = 8;

/** "Some Name <a@b.c>" → "Some Name"; bare addresses pass through. */
function fromDisplay(raw: string): string {
  const match = raw.match(/^\s*"?([^"<]+?)"?\s*</);
  return (match ? match[1] : raw).trim();
}

export function createGmailProvider(
  oauth: { clientId: string; clientSecret: string } | undefined,
): Provider<GmailData> {
  return {
    id: 'gmail',
    schema: gmailSchema,
    refreshMs: 5 * 60_000,
    timeoutMs: 20_000,
    isConfigured: () => oauth !== undefined && readGmailToken() !== undefined,
    async fetch(signal) {
      const token = readGmailToken();
      if (!oauth || !token) throw new Error('gmail is not configured');

      const auth = new google.auth.OAuth2(oauth.clientId, oauth.clientSecret);
      auth.setCredentials(token);
      // Google rotates access tokens on refresh — persist so restarts reuse them.
      auth.on('tokens', (fresh) => writeGmailToken({ ...readGmailToken(), ...fresh }));
      const gmail = google.gmail({ version: 'v1', auth });

      // gmail.metadata scope forbids `q` — list by label and use label counters.
      const [inboxLabel, threadList] = await Promise.all([
        gmail.users.labels.get({ userId: 'me', id: 'INBOX' }, { signal }),
        gmail.users.threads.list(
          { userId: 'me', labelIds: ['INBOX'], maxResults: THREAD_COUNT },
          { signal },
        ),
      ]);

      const threads = await Promise.all(
        (threadList.data.threads ?? []).map((thread) =>
          gmail.users.threads.get(
            {
              userId: 'me',
              id: thread.id!,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
            },
            { signal },
          ),
        ),
      );

      return {
        unreadThreads: inboxLabel.data.threadsUnread ?? 0,
        threads: threads.map(({ data }) => {
          const messages = data.messages ?? [];
          const last = messages[messages.length - 1];
          const header = (name: string) =>
            last?.payload?.headers?.find(
              (h) => h.name?.toLowerCase() === name.toLowerCase(),
            )?.value ?? '';
          return {
            id: data.id ?? '',
            from: fromDisplay(header('From')) || '(unknown sender)',
            subject: header('Subject') || '(no subject)',
            date: last?.internalDate
              ? new Date(Number(last.internalDate)).toISOString()
              : new Date(0).toISOString(),
            unread: messages.some((message) => message.labelIds?.includes('UNREAD')),
            url: `https://mail.google.com/mail/u/0/#inbox/${data.id}`,
          };
        }),
      };
    },
  };
}
