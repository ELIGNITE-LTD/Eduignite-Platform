import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  Book,
  BookCategory,
  BookLoan,
  BookRequest,
  CreateBookRequest,
  CreateBookRequestTicket,
  PaginatedResponse,
  ListParams,
  ReviewBookRequestPayload,
  UpdateBookRequest,
} from '../types';

export const libraryService = {
  async getCategories(params?: ListParams): Promise<PaginatedResponse<BookCategory>> {
    const { data } = await apiClient.get(API.LIBRARY.CATEGORIES, { params });
    return data;
  },

  async getBookCategories(params?: ListParams): Promise<PaginatedResponse<BookCategory>> {
    return this.getCategories(params);
  },

  async createCategory(categoryData: Partial<BookCategory>): Promise<BookCategory> {
    const { data } = await apiClient.post(API.LIBRARY.CATEGORIES, categoryData);
    return data;
  },

  async updateCategory(id: string, categoryData: Partial<BookCategory>): Promise<BookCategory> {
    const { data } = await apiClient.patch(API.LIBRARY.CATEGORY_DETAIL(id), categoryData);
    return data;
  },

  async deleteCategory(id: string): Promise<void> {
    await apiClient.delete(API.LIBRARY.CATEGORY_DETAIL(id));
  },

  async getBooks(params?: ListParams): Promise<PaginatedResponse<Book>> {
    const { data } = await apiClient.get(API.LIBRARY.BOOKS, { params });
    return data;
  },

  async getBook(id: string): Promise<Book> {
    const { data } = await apiClient.get(API.LIBRARY.BOOK_DETAIL(id));
    return data;
  },

  async searchBooks(query: string, params?: ListParams): Promise<PaginatedResponse<Book>> {
    const { data } = await apiClient.get(API.LIBRARY.SEARCH, {
      params: { ...params, q: query },
    });
    return data;
  },

  async getLowStockBooks(params?: ListParams): Promise<PaginatedResponse<Book>> {
    const { data } = await apiClient.get(API.LIBRARY.LOW_STOCK, { params });
    return data;
  },

  async createBook(bookData: CreateBookRequest): Promise<Book> {
    const hasFileUpload = Boolean(bookData.cover_file);
    if (hasFileUpload) {
      const formData = new FormData();
      formData.append('title', bookData.title);
      formData.append('author', bookData.author);
      if (bookData.isbn) formData.append('isbn', bookData.isbn);
      if (bookData.category) formData.append('category', bookData.category);
      if (bookData.publisher) formData.append('publisher', bookData.publisher);
      if (bookData.publication_year != null) formData.append('publication_year', String(bookData.publication_year));
      formData.append('total_copies', String(bookData.total_copies));
      formData.append('available_copies', String(bookData.available_copies ?? bookData.total_copies));
      if (bookData.description) formData.append('description', bookData.description);
      if (bookData.digital_copy_url) formData.append('digital_copy_url', bookData.digital_copy_url);
      if (bookData.location) formData.append('location', bookData.location);
      if (bookData.is_active != null) formData.append('is_active', String(bookData.is_active));
      if (bookData.cover_file) formData.append('cover_file', bookData.cover_file);
      const { data } = await apiClient.post(API.LIBRARY.BOOKS, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    }
    const { data } = await apiClient.post(API.LIBRARY.BOOKS, bookData);
    return data;
  },

  async updateBook(id: string, bookData: UpdateBookRequest): Promise<Book> {
    const hasFileUpload = Boolean(bookData.cover_file) || Boolean(bookData.remove_cover_image);
    if (hasFileUpload) {
      const formData = new FormData();
      if (bookData.title != null) formData.append('title', bookData.title);
      if (bookData.author != null) formData.append('author', bookData.author);
      if (bookData.isbn != null) formData.append('isbn', bookData.isbn);
      if (bookData.category != null) formData.append('category', bookData.category);
      if (bookData.publisher != null) formData.append('publisher', bookData.publisher);
      if (bookData.publication_year != null) formData.append('publication_year', String(bookData.publication_year));
      if (bookData.total_copies != null) formData.append('total_copies', String(bookData.total_copies));
      if (bookData.available_copies != null) formData.append('available_copies', String(bookData.available_copies));
      if (bookData.description != null) formData.append('description', bookData.description);
      if (bookData.digital_copy_url != null) formData.append('digital_copy_url', bookData.digital_copy_url);
      if (bookData.location != null) formData.append('location', bookData.location);
      if (bookData.is_active != null) formData.append('is_active', String(bookData.is_active));
      if (bookData.remove_cover_image != null) formData.append('remove_cover_image', String(bookData.remove_cover_image));
      if (bookData.cover_file) formData.append('cover_file', bookData.cover_file);
      const { data } = await apiClient.patch(API.LIBRARY.BOOK_DETAIL(id), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    }
    const { data } = await apiClient.patch(API.LIBRARY.BOOK_DETAIL(id), bookData);
    return data;
  },

  async deleteBook(id: string): Promise<void> {
    await apiClient.delete(API.LIBRARY.BOOK_DETAIL(id));
  },

  async getLoans(params?: ListParams): Promise<PaginatedResponse<BookLoan>> {
    const { data } = await apiClient.get(API.LIBRARY.LOANS, { params });
    return data;
  },

  async getLoan(id: string): Promise<BookLoan> {
    const { data } = await apiClient.get(API.LIBRARY.LOAN_DETAIL(id));
    return data;
  },

  async issueBook(
    bookIdOrPayload: string | { bookId: string; borrowerId: string; dueDate: string },
    borrowerId?: string,
    dueDate?: string
  ): Promise<BookLoan> {
    const payload =
      typeof bookIdOrPayload === 'string'
        ? { bookId: bookIdOrPayload, borrowerId, dueDate }
        : bookIdOrPayload;
    const { data } = await apiClient.post(API.LIBRARY.ISSUE(), {
      book: payload.bookId,
      borrower: payload.borrowerId,
      due_date: payload.dueDate,
    });
    return data;
  },

  async returnBook(loanIdOrPayload: string | { loanId: string; notes?: string }, notes?: string): Promise<BookLoan> {
    const loanId = typeof loanIdOrPayload === 'string' ? loanIdOrPayload : loanIdOrPayload.loanId;
    const payloadNotes = typeof loanIdOrPayload === 'string' ? notes : loanIdOrPayload.notes;
    const { data } = await apiClient.post(API.LIBRARY.RETURN(loanId), {
      notes: payloadNotes,
    });
    return data;
  },

  async getMyLoans(params?: ListParams): Promise<PaginatedResponse<BookLoan>> {
    const { data } = await apiClient.get(API.LIBRARY.MY_LOANS, { params });
    return data;
  },

  async getOverdueLoans(params?: ListParams): Promise<PaginatedResponse<BookLoan>> {
    const { data } = await apiClient.get(API.LIBRARY.OVERDUE, { params });
    return data;
  },

  async getLibraryStats(): Promise<any> {
    const { data } = await apiClient.get(API.LIBRARY.STATS);
    return data;
  },

  async getRequests(params?: ListParams): Promise<PaginatedResponse<BookRequest>> {
    const { data } = await apiClient.get(API.LIBRARY.REQUESTS, { params });
    return data;
  },

  async createRequest(payload: CreateBookRequestTicket): Promise<BookRequest> {
    const { data } = await apiClient.post(API.LIBRARY.REQUESTS, payload);
    return data;
  },

  async approveRequest(id: string, payload?: ReviewBookRequestPayload): Promise<BookRequest> {
    const { data } = await apiClient.post(API.LIBRARY.REQUEST_APPROVE(id), payload || {});
    return data;
  },

  async rejectRequest(id: string, payload?: ReviewBookRequestPayload): Promise<BookRequest> {
    const { data } = await apiClient.post(API.LIBRARY.REQUEST_REJECT(id), payload || {});
    return data;
  },

  async fulfillRequest(id: string, payload?: ReviewBookRequestPayload): Promise<BookRequest> {
    const { data } = await apiClient.post(API.LIBRARY.REQUEST_FULFILL(id), payload || {});
    return data;
  },
};
