import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { ordersService } from '@/lib/api/services/orders.service';
import type {
  Order,
  OrderStats,
  CreateOrderRequest,
  ProcessOrderRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const ordersKeys = {
  all: ['orders'] as const,
  lists: () => [...ordersKeys.all, 'list'] as const,
  list: (params?: PaginationParams) =>
    [...ordersKeys.lists(), { ...params }] as const,
  stats: () => [...ordersKeys.all, 'stats'] as const,
};

/**
 * Hook for fetching paginated orders
 */
export function useOrders(params?: PaginationParams) {
  return useQuery({
    queryKey: ordersKeys.list(params),
    queryFn: () => ordersService.getOrders(params),
  });
}

/**
 * Hook for fetching order statistics
 */
export function useOrderStats() {
  return useQuery({
    queryKey: ordersKeys.stats(),
    queryFn: () => ordersService.getOrderStats(),
  });
}

/**
 * Hook for creating an order
 * No authentication required - public endpoint
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOrderRequest) =>
      ordersService.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.stats() });
    },
  });
}

/**
 * Hook for processing an order
 */
export function useProcessOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProcessOrderRequest) =>
      ordersService.processOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.stats() });
    },
  });
}
