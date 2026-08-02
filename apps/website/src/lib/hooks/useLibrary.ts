import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { libraryService } from '@/lib/api/services/library.service';
import type {
  BookCategory,
  Book,
  Loan,
  LibraryStats,
  CreateBookRequest,
  UpdateBookRequest,
  IssueBookRequest,
  ReturnBookRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const libraryKeys = {
  all: ['library'] as const,
  categories: () => [...libraryKeys.all, 'categories'] as const,
  books: () => [...libraryKeys.all, 'books'] as const,
  booksList: (params?: PaginationParams) =>
    [...libraryKeys.books(), { ...params }] as const,
  bookSearch: (query: string) =>
    [...libraryKeys.books(), 'search', query] as const,
  lowStock: () => [...libraryKeys.all, 'low-stock'] as const,
  loans: () => [...libraryKeys.all, 'loans'] as const,
  loansList: (params?: PaginationParams) =>
    [...libraryKeys.loans(), { ...params }] as const,
  myLoans: () => [...libraryKeys.all, 'my-loans'] as const,
  overdue: () => [...libraryKeys.all, 'overdue'] as const,
  stats: () => [...libraryKeys.all, 'stats'] as const,
};

/**
 * Hook for fetching book categories
 */
export function useBookCategories() {
  return useQuery({
    queryKey: libraryKeys.categories(),
    queryFn: () => libraryService.getBookCategories(),
  });
}

/**
 * Hook for fetching paginated books
 */
export function useBooks(params?: PaginationParams) {
  return useQuery({
    queryKey: libraryKeys.booksList(params),
    queryFn: () => libraryService.getBooks(params),
  });
}

/**
 * Hook for searching books
 * Enabled only when query length is greater than 2
 */
export function useBookSearch(query: string) {
  return useQuery({
    queryKey: libraryKeys.bookSearch(query),
    queryFn: () => libraryService.searchBooks(query),
    enabled: query.length > 2,
  });
}

/**
 * Hook for fetching low stock books
 */
export function useLowStockBooks() {
  return useQuery({
    queryKey: libraryKeys.lowStock(),
    queryFn: () => libraryService.getLowStockBooks(),
  });
}

/**
 * Hook for fetching paginated loans
 */
export function useLoans(params?: PaginationParams) {
  return useQuery({
    queryKey: libraryKeys.loansList(params),
    queryFn: () => libraryService.getLoans(params),
  });
}

/**
 * Hook for fetching current user's loans
 */
export function useMyLoans() {
  return useQuery({
    queryKey: libraryKeys.myLoans(),
    queryFn: () => libraryService.getMyLoans(),
  });
}

/**
 * Hook for fetching overdue loans
 */
export function useOverdueLoans() {
  return useQuery({
    queryKey: libraryKeys.overdue(),
    queryFn: () => libraryService.getOverdueLoans(),
  });
}

/**
 * Hook for fetching library statistics
 */
export function useLibraryStats() {
  return useQuery({
    queryKey: libraryKeys.stats(),
    queryFn: () => libraryService.getLibraryStats(),
  });
}

/**
 * Hook for creating a new book
 */
export function useCreateBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBookRequest) =>
      libraryService.createBook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.booksList() });
      queryClient.invalidateQueries({ queryKey: libraryKeys.stats() });
    },
  });
}

/**
 * Hook for updating a book
 */
export function useUpdateBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBookRequest }) =>
      libraryService.updateBook(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.booksList() });
      queryClient.invalidateQueries({ queryKey: libraryKeys.lowStock() });
    },
  });
}

/**
 * Hook for deleting a book
 */
export function useDeleteBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => libraryService.deleteBook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.booksList() });
      queryClient.invalidateQueries({ queryKey: libraryKeys.stats() });
    },
  });
}

/**
 * Hook for issuing a book (creating a loan)
 */
export function useIssueBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: IssueBookRequest) =>
      libraryService.issueBook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.loansList() });
      queryClient.invalidateQueries({ queryKey: libraryKeys.myLoans() });
      queryClient.invalidateQueries({ queryKey: libraryKeys.stats() });
    },
  });
}

/**
 * Hook for returning a book
 */
export function useReturnBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ReturnBookRequest) =>
      libraryService.returnBook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.loansList() });
      queryClient.invalidateQueries({ queryKey: libraryKeys.myLoans() });
      queryClient.invalidateQueries({ queryKey: libraryKeys.overdue() });
      queryClient.invalidateQueries({ queryKey: libraryKeys.stats() });
    },
  });
}
