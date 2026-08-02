import {
  useMutation,
  useQuery,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { chatService } from '@/lib/api/services/chat.service';
import type {
  Conversation,
  Message,
  GetOrCreateDirectRequest,
  SendMessageRequest,
  MarkConversationReadRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const chatKeys = {
  all: ['chat'] as const,
  conversations: () => [...chatKeys.all, 'conversations'] as const,
  conversation: (id: string) =>
    [...chatKeys.all, 'conversation', id] as const,
  messages: (convId: string) =>
    [...chatKeys.all, 'messages', convId] as const,
};

function getNextCursor(page: any): string | undefined {
  if (page?.next_cursor) return page.next_cursor;
  if (!page?.next) return undefined;
  try {
    const url = new URL(page.next);
    return url.searchParams.get('cursor') || undefined;
  } catch {
    const match = String(page.next).match(/[?&]cursor=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }
}

/**
 * Hook for fetching conversations
 */
export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: () => chatService.getConversations(),
  });
}

/**
 * Hook for fetching a single conversation
 */
export function useConversation(id: string) {
  return useQuery({
    queryKey: chatKeys.conversation(id),
    queryFn: () => chatService.getConversation(id),
    enabled: !!id,
  });
}

/**
 * Hook for fetching messages with cursor pagination
 */
export function useMessages(
  convId: string,
  params?: PaginationParams
) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(convId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      chatService.getMessages(convId, {
        ...params,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => getNextCursor(lastPage),
    enabled: !!convId,
  });
}

/**
 * Hook for getting or creating a direct conversation
 */
export function useGetOrCreateDirect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GetOrCreateDirectRequest) =>
      chatService.getOrCreateDirect(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}

/**
 * Hook for sending a message
 * Appends message to cache optimistically
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageRequest) =>
      chatService.sendMessage(data),
    onSuccess: (response, variables) => {
      const conversationId = variables.conversation_id ?? variables.conversationId ?? "";
      // Optimistically update cache
      queryClient.setQueryData(
        chatKeys.messages(conversationId),
        (oldData: any) => {
          if (!oldData) return undefined;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any, idx: number) => {
              if (idx === 0) {
                return {
                  ...page,
                  results: [response, ...page.results],
                };
              }
              return page;
            }),
          };
        }
      );

      // Invalidate conversations to update last message
      queryClient.invalidateQueries({
        queryKey: chatKeys.conversations(),
      });
    },
  });
}

/**
 * Hook for marking a conversation as read
 */
export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MarkConversationReadRequest) =>
      chatService.markConversationRead(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.conversation(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}

/**
 * Hook for deleting a message
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => chatService.deleteMessage(id),
    onSuccess: () => {
      // Invalidate all message queries
      queryClient.invalidateQueries({ queryKey: chatKeys.all });
    },
  });
}
