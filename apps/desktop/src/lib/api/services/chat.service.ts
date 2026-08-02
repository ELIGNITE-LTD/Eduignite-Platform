import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  Conversation,
  Message,
  PaginatedResponse,
  ListParams,
  RelatedChatUser,
  SendMessageRequest,
  TeacherGroupClassOption,
  CreateTeacherGroupRequest,
} from '../types';

export const chatService = {
  async getConversations(params?: ListParams): Promise<PaginatedResponse<Conversation>> {
    const { data } = await apiClient.get(API.CHAT.CONVERSATIONS, { params });
    return data;
  },

  async getConversation(id: string): Promise<Conversation> {
    const { data } = await apiClient.get(API.CHAT.CONVERSATION_DETAIL(id));
    return data;
  },

  async getOrCreateDirect(userIdOrPayload: string | { userId: string }): Promise<Conversation> {
    const userId = typeof userIdOrPayload === 'string' ? userIdOrPayload : userIdOrPayload.userId;
    const { data } = await apiClient.post(API.CHAT.DIRECT, { user_id: userId });
    return data;
  },

  async getRelatedUsers(): Promise<RelatedChatUser[]> {
    const { data } = await apiClient.get(API.CHAT.RELATED_USERS);
    return Array.isArray(data) ? data : data?.results ?? [];
  },

  async getTeacherGroupOptions(): Promise<TeacherGroupClassOption[]> {
    const { data } = await apiClient.get(API.CHAT.TEACHER_GROUP_OPTIONS);
    return Array.isArray(data) ? data : data?.results ?? [];
  },

  async createTeacherGroup(payload: CreateTeacherGroupRequest): Promise<Conversation> {
    const { data } = await apiClient.post(API.CHAT.CREATE_TEACHER_GROUP, payload);
    return data;
  },

  async getMessages(
    conversationId: string,
    params?: ListParams
  ): Promise<PaginatedResponse<Message>> {
    const { data } = await apiClient.get(API.CHAT.MESSAGES(conversationId), { params });
    return data;
  },

  async sendMessage(
    conversationIdOrPayload: string | SendMessageRequest,
    maybeMessageData?: SendMessageRequest
  ): Promise<Message> {
    const conversationId =
      typeof conversationIdOrPayload === 'string'
        ? conversationIdOrPayload
        : conversationIdOrPayload.conversation_id ?? conversationIdOrPayload.conversationId ?? '';
    const messageData =
      typeof conversationIdOrPayload === 'string' ? maybeMessageData : conversationIdOrPayload;
    const { data } = await apiClient.post(API.CHAT.MESSAGES_BASE, {
      ...messageData,
      conversation_id: conversationId,
    });
    return data;
  },

  /**
   * Send a message with a picture or document attached. Same endpoint as
   * sendMessage, but the file travels as a base64 data URL in JSON
   * (attachment_data/attachment_name), which the backend decodes into the
   * message's attachment file — works identically on web, desktop and mobile.
   */
  async sendAttachmentMessage(
    conversationId: string,
    file: File,
    text = ''
  ): Promise<Message> {
    const isImage = file.type.startsWith('image/');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsDataURL(file);
    });
    const { data } = await apiClient.post(API.CHAT.MESSAGES_BASE, {
      conversation_id: conversationId,
      text: text || (isImage ? '📷 Photo' : `📄 ${file.name}`),
      message_type: isImage ? 'image' : 'file',
      attachment_data: dataUrl,
      attachment_name: file.name,
    });
    return data;
  },

  async markConversationRead(
    conversationIdOrPayload: string | { id: string }
  ): Promise<Conversation> {
    const conversationId =
      typeof conversationIdOrPayload === 'string'
        ? conversationIdOrPayload
        : conversationIdOrPayload.id;
    const { data } = await apiClient.post(API.CHAT.MARK_READ(conversationId), {});
    return data;
  },

  async updateConversationSettings(conversationId: string, payload: Partial<Conversation>): Promise<Conversation> {
    const { data } = await apiClient.patch(API.CHAT.SETTINGS(conversationId), payload);
    return data;
  },

  async addParticipant(conversationId: string, userId: string): Promise<any> {
    const { data } = await apiClient.post(API.CHAT.ADD_PARTICIPANT(conversationId), { user_id: userId });
    return data;
  },

  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    await apiClient.post(API.CHAT.REMOVE_PARTICIPANT(conversationId), { user_id: userId });
  },

  async setParticipantRole(conversationId: string, userId: string, role: 'admin' | 'member'): Promise<any> {
    const { data } = await apiClient.post(API.CHAT.SET_ROLE(conversationId), { user_id: userId, role });
    return data;
  },

  async setTyping(conversationId: string, isTyping: boolean): Promise<{ typing: { user_id: string; user_name: string }[] }> {
    const { data } = await apiClient.post(API.CHAT.TYPING(conversationId), { is_typing: isTyping });
    return data;
  },

  async getTyping(conversationId: string): Promise<{ typing: { user_id: string; user_name: string }[] }> {
    const { data } = await apiClient.get(API.CHAT.TYPING(conversationId));
    return data;
  },

  async reactToMessage(messageId: string, emoji: string): Promise<Message> {
    const { data } = await apiClient.post(API.CHAT.REACT(messageId), { emoji });
    return data;
  },

  async deleteMessage(messageId: string): Promise<void> {
    await apiClient.delete(API.CHAT.DELETE_MESSAGE(messageId));
  },
};
