import { apiClient } from '../client';
import { API } from '../endpoints';
import { fetchAllPages } from '../fetch-all';
import {
  FeeStructure,
  Payment,
  Invoice,
  PaginatedResponse,
  ListParams,
  CreatePaymentRequest,
  SchoolFeeAssignment,
  StudentSchoolFeeRecord,
  SchoolFeeSummary,
  CreateSchoolFeeAssignmentRequest,
  UpdateStudentSchoolFeeRecordRequest,
  StudentFeeStatusResponse,
  SchoolFeeLedgerResponse,
  FeeActivityResponse,
} from '../types';

export const feesService = {
  async getFeeStructures(params?: ListParams): Promise<PaginatedResponse<FeeStructure>> {
    const { data } = await apiClient.get(API.FEES.STRUCTURES, { params });
    return data;
  },


  /** Every row, following all pages (see fetchAllPages). */
  async getAllFeeStructures(params?: ListParams): Promise<PaginatedResponse<FeeStructure>> {
    const results = await fetchAllPages<FeeStructure>((page, page_size) => this.getFeeStructures({ ...(params ?? {}), page, page_size }));
    return { count: results.length, next: null, previous: null, results };
  },

  // Fee types applicable to the signed-in student, or a parent's children.
  // Returns a flat array of fee items (see backend my_fees).
  /** Every learner a fee type applies to, and whether they have paid it. */
  async getFeeStudentStatus(feeId: string): Promise<any> {
    const { data } = await apiClient.get(API.FEES.FEE_STUDENT_STATUS(feeId));
    return data;
  },

  async getMyFees(): Promise<any[]> {
    const { data } = await apiClient.get(API.FEES.MY_FEES);
    return Array.isArray(data) ? data : (data?.results ?? []);
  },

  async createFeeStructure(feeData: Partial<FeeStructure>): Promise<FeeStructure> {
    const { data } = await apiClient.post(API.FEES.STRUCTURES, feeData);
    return data;
  },

  async updateFeeStructure(id: string, feeData: Partial<FeeStructure>): Promise<FeeStructure> {
    const { data } = await apiClient.patch(API.FEES.STRUCTURE_DETAIL(id), feeData);
    return data;
  },

  async deleteFeeStructure(id: string): Promise<void> {
    await apiClient.delete(API.FEES.STRUCTURE_DETAIL(id));
  },

  // Initiate a Fapshi mobile-money collection for the platform subscription.
  /**
   * Start a mobile money collection. Named for the old gateway so every
   * caller moved at once when EduIgnite switched to Fapshi; the server
   * decides the amount, never this payload.
   */
  async fapshiCollect(payload: {
    phone: string;
    operator?: string;
    student_id?: string;
  }): Promise<any> {
    const { data } = await apiClient.post(API.FEES.FAPSHI_COLLECT, payload);
    return data;
  },

  async fapshiStatus(transactionId: string): Promise<any> {
    const { data } = await apiClient.get(API.FEES.FAPSHI_STATUS(transactionId));
    return data;
  },

  async getPayments(params?: ListParams): Promise<PaginatedResponse<Payment>> {
    const { data } = await apiClient.get(API.FEES.PAYMENTS, { params });
    return data;
  },

  async getMyPayments(params?: ListParams): Promise<PaginatedResponse<Payment>> {
    const { data } = await apiClient.get(API.FEES.MY_PAYMENTS, { params });
    return data;
  },

  async createPayment(paymentData: CreatePaymentRequest): Promise<Payment> {
    const { data } = await apiClient.post(API.FEES.PAYMENTS, paymentData);
    return data;
  },

  /**
   * Every fee this student could be charged, with what is already paid and
   * what is left. The record-payment screen needs it before offering a fee,
   * so a settled one is never offered again.
   */
  /**
   * Every learner against every fee they are charged, with what is paid
   * and what is left. This is what the Fee Records tab reads: the older
   * class-allocation ledger is empty for any school that bills by fee
   * type, which is most of them.
   */
  async getSchoolFeeLedger(): Promise<SchoolFeeLedgerResponse> {
    const { data } = await apiClient.get(API.FEES.SCHOOL_LEDGER);
    return data;
  },

  /** Who recorded what on this school's fees, and when. */
  async getFeeActivity(): Promise<FeeActivityResponse> {
    const { data } = await apiClient.get(API.FEES.FEE_ACTIVITY);
    return data;
  },

  /**
   * `studentId` is a login id by default. Pass `{ pupil: true }` when it is a
   * pupil record id (nursery/primary pupils may have no login at all).
   */
  async getStudentFeeStatus(studentId: string, opts?: { pupil?: boolean }): Promise<StudentFeeStatusResponse> {
    const { data } = await apiClient.get(API.FEES.STUDENT_FEE_STATUS, {
      params: opts?.pupil ? { pupil: studentId } : { student: studentId },
    });
    return data;
  },

  async confirmPayment(idOrPayload: string | { id: string }): Promise<Payment> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const { data } = await apiClient.post(API.FEES.CONFIRM(id), {});
    return data;
  },

  async rejectPayment(idOrPayload: string | { id: string; reason?: string }, reason?: string): Promise<Payment> {
    const id = typeof idOrPayload === 'string' ? idOrPayload : idOrPayload.id;
    const payloadReason = typeof idOrPayload === 'string' ? reason : idOrPayload.reason;
    const { data } = await apiClient.post(API.FEES.REJECT(id), { reason: payloadReason });
    return data;
  },

  async getRevenueReport(params?: ListParams): Promise<any> {
    const { data } = await apiClient.get(API.FEES.REVENUE_REPORT, { params });
    return data;
  },

  async getFinancialOverview(params?: ListParams): Promise<any> {
    const { data } = await apiClient.get(API.FEES.FINANCIAL_OVERVIEW, { params });
    return data;
  },

  async getOutstandingFees(params?: ListParams): Promise<PaginatedResponse<any>> {
    const { data } = await apiClient.get(API.FEES.OUTSTANDING, { params });
    return data;
  },

  async getReceipt(id: string): Promise<Blob> {
    const { data } = await apiClient.get(API.FEES.RECEIPT(id), {
      responseType: 'blob',
    });
    return data;
  },

  async getInvoices(params?: ListParams): Promise<PaginatedResponse<Invoice>> {
    const { data } = await apiClient.get(API.FEES.INVOICES, { params });
    return data;
  },

  async getInvoice(id: string): Promise<Invoice> {
    const { data } = await apiClient.get(API.FEES.INVOICE_DETAIL(id));
    return data;
  },

  async getSchoolFeeAssignments(params?: ListParams): Promise<PaginatedResponse<SchoolFeeAssignment>> {
    const { data } = await apiClient.get(API.FEES.SCHOOL_FEE_ASSIGNMENTS, { params });
    return data;
  },

  async createSchoolFeeAssignment(payload: CreateSchoolFeeAssignmentRequest): Promise<SchoolFeeAssignment> {
    const { data } = await apiClient.post(API.FEES.SCHOOL_FEE_ASSIGNMENTS, payload);
    return data;
  },

  async updateSchoolFeeAssignment(id: string, payload: Partial<CreateSchoolFeeAssignmentRequest>): Promise<SchoolFeeAssignment> {
    const { data } = await apiClient.patch(API.FEES.SCHOOL_FEE_ASSIGNMENT_DETAIL(id), payload);
    return data;
  },

  async getStudentSchoolFees(params?: ListParams): Promise<PaginatedResponse<StudentSchoolFeeRecord>> {
    const { data } = await apiClient.get(API.FEES.STUDENT_SCHOOL_FEES, { params });
    return data;
  },

  async updateStudentSchoolFeeRecord(id: string, payload: UpdateStudentSchoolFeeRecordRequest): Promise<StudentSchoolFeeRecord> {
    const { data } = await apiClient.patch(API.FEES.STUDENT_SCHOOL_FEE_DETAIL(id), payload);
    return data;
  },

  async getSchoolFeeSummary(params?: ListParams): Promise<SchoolFeeSummary> {
    const { data } = await apiClient.get(API.FEES.SCHOOL_FEE_SUMMARY, { params });
    return data;
  },

  async downloadSchoolFeeReportPdf(params?: ListParams): Promise<Blob> {
    const { data } = await apiClient.get(API.FEES.SCHOOL_FEE_REPORT_PDF, {
      params,
      responseType: 'blob',
    });
    return data;
  },
};
