import { z } from 'zod';

export const iMessageConversationSchema = z.object({
  id: z.string(),
  /** Display name if the chat has one, else the raw handle (phone/email). */
  label: z.string(),
  /** Truncated snippet of the last message; a placeholder when the source row has no plain text. */
  lastMessage: z.string(),
  isFromMe: z.boolean(),
  timestamp: z.string(),
  unreadCount: z.number().int().min(0),
});

export const iMessageDataSchema = z.object({
  conversations: z.array(iMessageConversationSchema),
});

export type IMessageConversation = z.infer<typeof iMessageConversationSchema>;
export type IMessageData = z.infer<typeof iMessageDataSchema>;
