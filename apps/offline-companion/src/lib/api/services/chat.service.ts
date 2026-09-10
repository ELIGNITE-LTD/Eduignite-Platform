import { apiClient } from "../client";
import { API } from "../endpoints";
import type { ChatMessage, ConversationDetail } from "../types";

/**
 * "Chat with EduIgnite" — a single always-available line between the school
 * and EduIgnite, not general peer-to-peer messaging. Uses a dedicated
 * backend endpoint (POST /chat/contact-eduignite/, backend/apps/chat/views.py's
 * ContactEduIgniteView) rather than the generic related-users / get-or-create-
 * direct flow apps/mobile uses for its own, broader chat feature: that
 * generic flow is gated by the school's optional 'chat' app entitlement and,
 * before a real production fix, only reliably surfaced EduIgnite's founders
 * for a SCHOOL_ADMIN session (not SUB_ADMIN/BURSAR/LIBRARIAN). The dedicated
 * endpoint always works regardless of that entitlement and always includes
 * both founders (CEO and CTO) with equal standing — see
 * backend/apps/chat/relations.py's founder-parity rule.
 */
export const chatService = {
  /** Get-or-create the caller's own conversation with EduIgnite. Idempotent
   * — safe to call every time the Chat tab opens. */
  async contactEduIgnite(): Promise<ConversationDetail> {
    const { data } = await apiClient.post(API.CHAT.CONTACT_EDUIGNITE);
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
