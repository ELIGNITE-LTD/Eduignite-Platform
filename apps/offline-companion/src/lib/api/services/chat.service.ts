import { apiClient } from "../client";
import { API } from "../endpoints";
import type { ChatMessage, ConversationDetail, RelatedChatUser } from "../types";

/**
 * "Chat with EduIgnite" over the shared, generic peer-to-peer chat backend
 * (backend/apps/chat) — there is no separate support-ticket system. A
 * school's related-users list already includes EduIgnite's two founders
 * (CEO and CTO — see backend/apps/chat/relations.py's SCHOOL_ADMIN branch,
 * which adds both PRIMARY_FOUNDER_ROLES with no distinction between them,
 * matching this project's CEO/CTO parity rule) for SCHOOL_ADMIN accounts.
 * This service just wraps the existing related-users / get-or-create-direct
 * / messages endpoints apps/mobile already uses — no new backend surface.
 *
 * Requires the school's "chat" app entitlement, same as apps/mobile.
 */
export const chatService = {
  async getRelatedUsers(): Promise<RelatedChatUser[]> {
    const { data } = await apiClient.get(API.CHAT.RELATED_USERS);
    return data;
  },

  async getOrCreateDirectConversation(userId: string): Promise<ConversationDetail> {
    const { data } = await apiClient.post(API.CHAT.GET_OR_CREATE_DIRECT, { user_id: userId });
    return data;
  },

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    const { data } = await apiClient.get(API.CHAT.CONVERSATION_DETAIL(conversationId));
    return data;
  },

  async sendMessage(conversationId: string, text: string): Promise<ChatMessage> {
    const { data } = await apiClient.post(API.CHAT.MESSAGES, {
      conversation_id: conversationId,
      text,
    });
    return data;
  },

  async markRead(conversationId: string): Promise<void> {
    await apiClient.post(API.CHAT.MARK_READ(conversationId), {});
  },
};
