"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { libraryService } from "@/lib/api/services/library.service";
import { downloadHtmlDocument, escapeHtml } from "@/lib/browser-download";
import { resolveMediaUrl } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowLeft,
  Book,
  BookMarked,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileDown,
  ImagePlus,
  Library,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
  Users,
  XCircle,
} from "lucide-react";

const MANAGEMENT_ROLES = ["LIBRARIAN", "SCHOOL_ADMIN", "SUB_ADMIN", "SUPER_ADMIN", "CEO", "CTO", "COO"];
const LIBRARY_ROLES = [...MANAGEMENT_ROLES, "TEACHER", "STUDENT", "BURSAR"];

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const parseError = (error: any) => {
  const payload = error?.response?.data;
  if (!payload) {
    return error?.message || "Something went wrong.";
  }
  if (typeof payload === "string") {
    return payload;
  }
  if (payload.detail) {
    return String(payload.detail);
  }
  if (typeof payload === "object") {
    return Object.entries(payload)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join(" | ");
  }
  return "Something went wrong.";
};

const getBookCategoryName = (book: any) =>
  book.category_name || (typeof book.category === "object" ? book.category?.name : "") || "General";

const getBookCategoryId = (book: any) =>
  typeof book.category === "object" ? book.category?.id : book.category;

const getLoanBookTitle = (loan: any) =>
  loan.book_title || (typeof loan.book === "object" ? loan.book?.title : "") || "Unknown book";

const getLoanBorrowerName = (loan: any) =>
  loan.borrower_name || (typeof loan.borrower === "object" ? loan.borrower?.name : "") || "Unknown borrower";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
};

const openExternal = (url?: string | null) => {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
};

const emptyBookForm = {
  title: "",
  author: "",
  isbn: "",
  category: "",
  publisher: "",
  publication_year: "",
  total_copies: "5",
  available_copies: "5",
  description: "",
  digital_copy_url: "",
  location: "",
  is_active: true,
};

const buildPrintableDocument = (title: string, sections: Array<{ label: string; value: string }>) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; color: #10243e; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p.meta { margin: 0 0 24px; color: #5c6a7b; font-size: 12px; }
      .row { padding: 12px 0; border-bottom: 1px solid #d8e0ea; }
      .label { font-weight: 700; font-size: 12px; text-transform: uppercase; color: #5c6a7b; margin-bottom: 4px; }
      .value { font-size: 14px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">Generated from EduIgnite library portal on ${escapeHtml(new Date().toLocaleString())}</p>
    ${sections
      .map(
        (section) => `
          <div class="row">
            <div class="label">${escapeHtml(section.label)}</div>
            <div class="value">${escapeHtml(section.value)}</div>
          </div>
        `
      )
      .join("")}
  </body>
</html>`;

export default function LibraryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const isManagement = MANAGEMENT_ROLES.includes(user?.role || "");
  const canAddBooks = ["LIBRARIAN", "SCHOOL_ADMIN", "SUB_ADMIN"].includes(user?.role || "");
  const canAccessLibrary = LIBRARY_ROLES.includes(user?.role || "") && Boolean(user?.school);

  const [books, setBooks] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [myLoans, setMyLoans] = useState<any[]>([]);
  const [managedLoans, setManagedLoans] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<any | null>(null);
  const [editingBook, setEditingBook] = useState<any | null>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | "fulfill" | null>(null);
  const [requestForm, setRequestForm] = useState({
    requestType: "loan" as "loan" | "soft_copy",
    note: "",
  });
  const [reviewForm, setReviewForm] = useState({
    review_note: "",
    due_date: "",
  });
  const [bookForm, setBookForm] = useState(emptyBookForm);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [removeCoverImage, setRemoveCoverImage] = useState(false);

  const loadLibraryData = useCallback(
    async (quiet = false) => {
      if (quiet) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const [booksResponse, categoriesResponse, requestsResponse, myLoansResponse, managedLoansResponse, statsResponse] =
          await Promise.all([
            libraryService.getBooks({ limit: 200 }),
            libraryService.getCategories({ limit: 100 }),
            canAccessLibrary ? libraryService.getRequests({ limit: 200 }) : Promise.resolve([]),
            canAccessLibrary ? libraryService.getMyLoans({ limit: 200 }) : Promise.resolve([]),
            isManagement ? libraryService.getLoans({ limit: 200 }) : Promise.resolve([]),
            canAccessLibrary ? libraryService.getLibraryStats().catch(() => null) : Promise.resolve(null),
          ]);

        setBooks(normalizeList(booksResponse));
        setCategories(normalizeList(categoriesResponse));
        setRequests(normalizeList(requestsResponse));
        setMyLoans(normalizeList(myLoansResponse));
        setManagedLoans(normalizeList(managedLoansResponse));
        setStats(statsResponse);
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Library load failed",
          description: parseError(error),
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [canAccessLibrary, isManagement, toast]
  );

  useEffect(() => {
    loadLibraryData();
  }, [loadLibraryData]);

  useEffect(() => {
    if (!coverPreview.startsWith("blob:")) return;
    return () => {
      URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const resetBookForm = useCallback(() => {
    setBookForm(emptyBookForm);
    setCoverFile(null);
    setCoverPreview("");
    setRemoveCoverImage(false);
    setEditingBook(null);
    setManageDialogOpen(false);
  }, []);

  const openManageDialog = (book?: any | null) => {
    if (book) {
      setEditingBook(book);
      setBookForm({
        title: book.title || "",
        author: book.author || "",
        isbn: book.isbn || "",
        category: getBookCategoryId(book) || "",
        publisher: book.publisher || "",
        publication_year: book.publication_year ? String(book.publication_year) : "",
        total_copies: String(book.total_copies ?? 1),
        available_copies: String(book.available_copies ?? 1),
        description: book.description || "",
        digital_copy_url: book.digital_copy_url || "",
        location: book.location || "",
        is_active: book.is_active !== false,
      });
      setCoverPreview(resolveMediaUrl(book.cover_image) || "");
      setCoverFile(null);
      setRemoveCoverImage(false);
    } else {
      setEditingBook(null);
      setBookForm(emptyBookForm);
      setCoverPreview("");
      setCoverFile(null);
      setRemoveCoverImage(false);
    }
    setManageDialogOpen(true);
  };

  const handleCoverSelection = (file?: File | null) => {
    if (!file) {
      setCoverFile(null);
      return;
    }
    setCoverFile(file);
    setRemoveCoverImage(false);
    const previewUrl = URL.createObjectURL(file);
    setCoverPreview(previewUrl);
  };

  const renderBookFormFields = () => (
    <>
      <div className="space-y-2">
        <Label htmlFor="library-title">Title</Label>
        <Input
          id="library-title"
          value={bookForm.title}
          onChange={(event) => setBookForm((prev) => ({ ...prev, title: event.target.value }))}
          placeholder="Book title"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="library-author">Author</Label>
        <Input
          id="library-author"
          value={bookForm.author}
          onChange={(event) => setBookForm((prev) => ({ ...prev, author: event.target.value }))}
          placeholder="Author name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="library-isbn">ISBN</Label>
        <Input
          id="library-isbn"
          value={bookForm.isbn}
          onChange={(event) => setBookForm((prev) => ({ ...prev, isbn: event.target.value }))}
          placeholder="ISBN"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="library-category">Category</Label>
        <Select
          value={bookForm.category || "__none__"}
          onValueChange={(value) =>
            setBookForm((prev) => ({ ...prev, category: value === "__none__" ? "" : value }))
          }
        >
          <SelectTrigger id="library-category">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No category</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={String(category.id)}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="library-publisher">Publisher</Label>
        <Input
          id="library-publisher"
          value={bookForm.publisher}
          onChange={(event) => setBookForm((prev) => ({ ...prev, publisher: event.target.value }))}
          placeholder="Publisher"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="library-year">Publication Year</Label>
        <Input
          id="library-year"
          type="number"
          min="0"
          value={bookForm.publication_year}
          onChange={(event) => setBookForm((prev) => ({ ...prev, publication_year: event.target.value }))}
          placeholder="2025"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="library-total">Total Copies</Label>
        <Input
          id="library-total"
          type="number"
          min="1"
          value={bookForm.total_copies}
          onChange={(event) => setBookForm((prev) => ({ ...prev, total_copies: event.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="library-available">Available Copies</Label>
        <Input
          id="library-available"
          type="number"
          min="0"
          value={bookForm.available_copies}
          onChange={(event) => setBookForm((prev) => ({ ...prev, available_copies: event.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="library-location">Shelf / Location</Label>
        <Input
          id="library-location"
          value={bookForm.location}
          onChange={(event) => setBookForm((prev) => ({ ...prev, location: event.target.value }))}
          placeholder="Shelf A3, Room 4, etc."
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="library-digital-copy">Soft Copy URL</Label>
        <Input
          id="library-digital-copy"
          value={bookForm.digital_copy_url}
          onChange={(event) => setBookForm((prev) => ({ ...prev, digital_copy_url: event.target.value }))}
          placeholder="https://..."
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="library-cover">Book Cover</Label>
        <Input
          id="library-cover"
          type="file"
          accept="image/*"
          onChange={(event) => handleCoverSelection(event.target.files?.[0] || null)}
        />
        <p className="text-xs text-muted-foreground">
          Upload a book cover directly from this device. This also works for mobile photo pickers.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-28 w-20 items-center justify-center overflow-hidden rounded-2xl border bg-accent/20">
            {coverPreview ? (
              <img src={coverPreview} alt="Book cover preview" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="h-8 w-8 text-primary/30" />
            )}
          </div>
          {coverPreview ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={() => {
                setCoverFile(null);
                setCoverPreview("");
                setRemoveCoverImage(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Remove Cover
            </Button>
          ) : null}
        </div>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="library-description">Description</Label>
        <Textarea
          id="library-description"
          value={bookForm.description}
          onChange={(event) => setBookForm((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="Short summary or notes"
          className="min-h-[120px]"
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="library-active">Catalog Status</Label>
        <Select
          value={bookForm.is_active ? "active" : "archived"}
          onValueChange={(value) => setBookForm((prev) => ({ ...prev, is_active: value === "active" }))}
        >
          <SelectTrigger id="library-active">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active in catalog</SelectItem>
            <SelectItem value="archived">Archived / hidden from borrowers</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const matchesSearch =
        !searchTerm ||
        String(book.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(book.author || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(book.isbn || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" || getBookCategoryName(book).toLowerCase() === categoryFilter.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [books, searchTerm, categoryFilter]);

  const availableCopies = useMemo(
    () => books.reduce((sum, book) => sum + Number(book.available_copies || 0), 0),
    [books]
  );

  const categoriesForFilter = useMemo(() => {
    const names = books.map((book) => getBookCategoryName(book));
    return Array.from(new Set(names)).sort((left, right) => left.localeCompare(right));
  }, [books]);

  const pendingRequests = requests.filter((request) => request.status === "pending");
  const approvedRequests = requests.filter((request) => request.status === "approved");
  const activeLoans = (isManagement ? managedLoans : myLoans).filter((loan) => loan.status === "Active");

  const handleOpenRequestDialog = (book: any, requestType: "loan" | "soft_copy") => {
    setSelectedBook(book);
    setRequestForm({
      requestType,
      note: "",
    });
    setRequestDialogOpen(true);
  };

  const handleSubmitRequest = async () => {
    if (!selectedBook) return;
    setIsSubmittingRequest(true);
    try {
      await libraryService.createRequest({
        book: String(selectedBook.id),
        request_type: requestForm.requestType,
        note: requestForm.note || undefined,
      });
      toast({
        title: "Request submitted",
        description:
          requestForm.requestType === "soft_copy"
            ? "Your soft-copy request has been sent to the library team."
            : "Your loan request has been sent to the library team.",
      });
      setRequestDialogOpen(false);
      setSelectedBook(null);
      setRequestForm({ requestType: "loan", note: "" });
      await loadLibraryData(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Request failed",
        description: parseError(error),
      });
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleOpenReviewDialog = (
    request: any,
    action: "approve" | "reject" | "fulfill"
  ) => {
    const defaultDueDate =
      action === "fulfill" && request.request_type === "loan"
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        : "";
    setSelectedRequest(request);
    setReviewAction(action);
    setReviewForm({
      review_note: "",
      due_date: defaultDueDate,
    });
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!selectedRequest || !reviewAction) return;
    setActiveRequestId(String(selectedRequest.id));
    try {
      const payload = {
        review_note: reviewForm.review_note || undefined,
        due_date:
          reviewAction === "fulfill" && selectedRequest.request_type === "loan"
            ? reviewForm.due_date || undefined
            : undefined,
      };

      if (reviewAction === "approve") {
        await libraryService.approveRequest(String(selectedRequest.id), payload);
      } else if (reviewAction === "reject") {
        await libraryService.rejectRequest(String(selectedRequest.id), payload);
      } else {
        await libraryService.fulfillRequest(String(selectedRequest.id), payload);
      }

      toast({
        title: "Library request updated",
        description: `The request has been ${reviewAction === "reject" ? "rejected" : reviewAction + "d"}.`,
      });
      setReviewDialogOpen(false);
      setSelectedRequest(null);
      setReviewAction(null);
      await loadLibraryData(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: parseError(error),
      });
    } finally {
      setActiveRequestId(null);
    }
  };

  const handleReturnBook = async (loan: any) => {
    setActiveLoanId(String(loan.id));
    try {
      await libraryService.returnBook({ loanId: String(loan.id) });
      toast({
        title: "Book returned",
        description: "The loan has been marked as returned.",
      });
      await loadLibraryData(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Return failed",
        description: parseError(error),
      });
    } finally {
      setActiveLoanId(null);
    }
  };

  const handleSaveBook = async () => {
    if (!bookForm.title.trim() || !bookForm.author.trim()) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Title and author are required.",
      });
      return;
    }

    setActiveRequestId("create-book");
    try {
      const payload = {
        title: bookForm.title.trim(),
        author: bookForm.author.trim(),
        isbn: bookForm.isbn.trim() || undefined,
        category: bookForm.category || undefined,
        publisher: bookForm.publisher.trim() || undefined,
        publication_year: bookForm.publication_year ? Number(bookForm.publication_year) : undefined,
        total_copies: Number(bookForm.total_copies || 0),
        available_copies: Number(bookForm.available_copies || 0),
        description: bookForm.description.trim() || undefined,
        cover_file: coverFile,
        remove_cover_image: removeCoverImage,
        digital_copy_url: bookForm.digital_copy_url.trim() || undefined,
        location: bookForm.location.trim() || undefined,
        is_active: bookForm.is_active,
      };
      if (editingBook) {
        await libraryService.updateBook(String(editingBook.id), payload);
      } else {
        await libraryService.createBook(payload);
      }
      toast({
        title: editingBook ? "Book updated" : "Book added",
        description: "The catalog was updated successfully.",
      });
      resetBookForm();
      await loadLibraryData(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: editingBook ? "Could not update book" : "Could not add book",
        description: parseError(error),
      });
    } finally {
      setActiveRequestId(null);
    }
  };

  const handleDeleteBook = async (book: any) => {
    setActiveRequestId(`delete-${book.id}`);
    try {
      await libraryService.deleteBook(String(book.id));
      toast({
        title: "Book deleted",
        description: "The catalog entry was removed successfully.",
      });
      if (editingBook?.id === book.id) {
        resetBookForm();
      }
      await loadLibraryData(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: parseError(error),
      });
    } finally {
      setActiveRequestId(null);
    }
  };

  const printHtmlDocument = (title: string, html: string) => {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!popup) {
      toast({
        variant: "destructive",
        title: "Popup blocked",
        description: "Allow popups to print or save the document as PDF.",
      });
      return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => {
      popup.print();
    }, 120);
  };

  const handleDownloadRequestRecord = (request: any) => {
    const html = buildPrintableDocument("Library Request Record", [
      { label: "Book", value: request.book_title || "Unknown book" },
      { label: "Requester", value: request.requester_name || user?.name || "-" },
      { label: "Requester Role", value: request.requester_role || user?.role || "-" },
      { label: "Request Type", value: request.request_type },
      { label: "Status", value: request.status },
      { label: "Submitted", value: formatDate(request.created_at) },
      { label: "Reviewed", value: request.reviewer_name || "-" },
      { label: "Review Note", value: request.review_note || "-" },
    ]);
    downloadHtmlDocument(html, `library-request-${request.id}.html`);
  };

  const handlePrintRequestRecord = (request: any) => {
    const html = buildPrintableDocument("Library Request Record", [
      { label: "Book", value: request.book_title || "Unknown book" },
      { label: "Requester", value: request.requester_name || user?.name || "-" },
      { label: "Request Type", value: request.request_type },
      { label: "Status", value: request.status },
      { label: "Submitted", value: formatDate(request.created_at) },
      { label: "Review Note", value: request.review_note || "-" },
    ]);
    printHtmlDocument("Library Request Record", html);
  };

  const handlePrintLoanRecord = (loan: any) => {
    const html = buildPrintableDocument("Library Loan Record", [
      { label: "Book", value: getLoanBookTitle(loan) },
      { label: "Borrower", value: getLoanBorrowerName(loan) },
      { label: "Issued Date", value: formatDate(loan.issued_date) },
      { label: "Due Date", value: formatDate(loan.due_date) },
      { label: "Status", value: loan.status || "-" },
      { label: "Fine Amount", value: loan.fine_amount ? String(loan.fine_amount) : "0" },
    ]);
    printHtmlDocument("Library Loan Record", html);
  };

  if (!canAccessLibrary && !isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h2 className="text-xl font-bold text-primary">Library access is not available</h2>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Your current account is not linked to a school library yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-primary p-3 text-secondary shadow-lg">
              <Library className="h-7 w-7" />
            </div>
            <div>
              <h1 className="font-headline text-2xl font-bold uppercase tracking-tight text-primary md:text-3xl">
                Library Portal
              </h1>
              <p className="text-sm text-muted-foreground">
                Request loans, access soft-copy books, and manage your school library from one place.
              </p>
            </div>
          </div>
        </div>
        <Button variant="outline" className="gap-2 rounded-xl" onClick={() => loadLibraryData(true)} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Catalog</p>
            <p className="mt-2 text-3xl font-black text-primary">{stats?.total_books ?? books.length}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Available copies</p>
            <p className="mt-2 text-3xl font-black text-emerald-600">{availableCopies}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {isManagement ? "Pending requests" : "My requests"}
            </p>
            <p className="mt-2 text-3xl font-black text-amber-600">
              {isManagement ? pendingRequests.length : requests.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {isManagement ? "Active loans" : "My active loans"}
            </p>
            <p className="mt-2 text-3xl font-black text-blue-600">{activeLoans.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="catalog" className="w-full">
        <TabsList
          className={`grid h-auto w-full gap-1 rounded-2xl bg-white p-1.5 shadow-sm ${
            isManagement || canAddBooks ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"
          }`}
        >
          <TabsTrigger value="catalog" className="gap-2 rounded-xl py-3 text-xs font-bold sm:text-sm">
            <Book className="h-4 w-4" /> Catalog
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2 rounded-xl py-3 text-xs font-bold sm:text-sm">
            <BookMarked className="h-4 w-4" /> {isManagement ? "Request Desk" : "My Requests"}
          </TabsTrigger>
          <TabsTrigger value="loans" className="gap-2 rounded-xl py-3 text-xs font-bold sm:text-sm">
            <Clock className="h-4 w-4" /> {isManagement ? "Loan Desk" : "My Loans"}
          </TabsTrigger>
          {canAddBooks && (
            <TabsTrigger value="add-book" className="gap-2 rounded-xl py-3 text-xs font-bold sm:text-sm">
              <Plus className="h-4 w-4" /> Add Book
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="catalog" className="space-y-6 pt-6">
          <Card className="border-none shadow-sm">
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search books by title, author, or ISBN"
                    className="h-11 rounded-xl border-none bg-accent/30 pl-9"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-11 w-full rounded-xl md:w-[220px]">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoriesForFilter.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <Card className="border-none shadow-sm">
              <CardContent className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
              </CardContent>
            </Card>
          ) : filteredBooks.length === 0 ? (
            <Card className="border-none shadow-sm">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <AlertCircle className="h-10 w-10 text-primary/20" />
                <h3 className="text-lg font-bold text-primary">No books match this search</h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  Try a different title, author, or category filter.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredBooks.map((book) => (
                <Card key={book.id} className="border-none shadow-sm">
                  <CardHeader className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="secondary" className="border-none bg-secondary/20 font-bold text-primary">
                        {getBookCategoryName(book)}
                      </Badge>
                      <Badge
                        variant={Number(book.available_copies || 0) > 0 ? "outline" : "destructive"}
                        className="font-bold"
                      >
                        {Number(book.available_copies || 0)} / {Number(book.total_copies || 0)} available
                      </Badge>
                    </div>
                    <div>
                      <CardTitle className="text-xl font-black text-primary">{book.title}</CardTitle>
                      <CardDescription className="mt-1 text-sm">by {book.author || "Unknown author"}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-accent/20">
                        {book.cover_image ? (
                          <img src={resolveMediaUrl(book.cover_image)} alt={book.title} className="h-full w-full object-cover" />
                        ) : (
                          <BookOpen className="h-8 w-8 text-primary/30" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-3">
                        {book.description ? (
                          <p className="line-clamp-4 text-sm text-muted-foreground">{book.description}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">No book description has been added yet.</p>
                        )}
                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <div>ISBN: {book.isbn || "-"}</div>
                          <div>Location: {book.location || "-"}</div>
                          <div>Publisher: {book.publisher || "-"}</div>
                          <div>Year: {book.publication_year || "-"}</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      variant="outline"
                      className="w-full gap-2 rounded-xl sm:w-auto"
                      onClick={() => handleOpenRequestDialog(book, "loan")}
                    >
                      <BookMarked className="h-4 w-4" />
                      Request Loan
                    </Button>
                    {book.digital_copy_url && (
                      <>
                        <Button
                          variant="outline"
                          className="w-full gap-2 rounded-xl sm:w-auto"
                          onClick={() => handleOpenRequestDialog(book, "soft_copy")}
                        >
                          <Download className="h-4 w-4" />
                          Request Soft Copy
                        </Button>
                        <Button
                          className="w-full gap-2 rounded-xl sm:w-auto"
                          onClick={() => openExternal(book.digital_copy_url)}
                        >
                          <BookOpen className="h-4 w-4" />
                          Read Online
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {canAddBooks && (
                      <>
                        <Button
                          variant="outline"
                          className="w-full gap-2 rounded-xl sm:w-auto"
                          onClick={() => openManageDialog(book)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full gap-2 rounded-xl sm:w-auto"
                          onClick={() =>
                            libraryService
                              .updateBook(String(book.id), { is_active: !(book.is_active !== false) })
                              .then(async () => {
                                toast({
                                  title: book.is_active !== false ? "Book archived" : "Book restored",
                                  description: "The book status was updated successfully.",
                                });
                                await loadLibraryData(true);
                              })
                              .catch((error: any) =>
                                toast({
                                  variant: "destructive",
                                  title: "Status update failed",
                                  description: parseError(error),
                                })
                              )
                          }
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {book.is_active !== false ? "Archive" : "Restore"}
                        </Button>
                        <Button
                          variant="destructive"
                          className="w-full gap-2 rounded-xl sm:w-auto"
                          onClick={() => handleDeleteBook(book)}
                          disabled={activeRequestId === `delete-${book.id}`}
                        >
                          {activeRequestId === `delete-${book.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Delete
                        </Button>
                      </>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests" className="space-y-6 pt-6">
          {requests.length === 0 ? (
            <Card className="border-none shadow-sm">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <BookMarked className="h-10 w-10 text-primary/20" />
                <h3 className="text-lg font-bold text-primary">
                  {isManagement ? "No school requests yet" : "No requests yet"}
                </h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  {isManagement
                    ? "Requests from students, teachers, bursars, and school staff will appear here."
                    : "Request physical loans or soft-copy access directly from the catalog."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {requests.map((request) => (
                <Card key={request.id} className="border-none shadow-sm">
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="secondary" className="border-none bg-primary/10 font-bold text-primary">
                        {request.request_type === "loan" ? "Loan Request" : "Soft Copy Request"}
                      </Badge>
                      <Badge
                        variant={
                          request.status === "fulfilled"
                            ? "default"
                            : request.status === "rejected"
                              ? "destructive"
                              : "outline"
                        }
                        className="font-bold uppercase"
                      >
                        {request.status}
                      </Badge>
                    </div>
                    <div>
                      <CardTitle className="text-lg font-black text-primary">
                        {request.book_title || "Unknown book"}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {isManagement
                          ? `${request.requester_name || "Unknown requester"} • ${request.requester_role || "Member"}`
                          : `Submitted ${formatDate(request.created_at)}`}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid gap-2 text-muted-foreground sm:grid-cols-2">
                      <div>Requested: {formatDate(request.created_at)}</div>
                      <div>Reviewed: {request.reviewer_name || "-"}</div>
                    </div>
                    {request.note && (
                      <div className="rounded-xl bg-accent/20 p-3 text-muted-foreground">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-primary/70">Requester Note</p>
                        <p className="mt-1">{request.note}</p>
                      </div>
                    )}
                    {request.review_note && (
                      <div className="rounded-xl bg-primary/5 p-3 text-muted-foreground">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-primary/70">Review Note</p>
                        <p className="mt-1">{request.review_note}</p>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {(request.status === "fulfilled" || request.status === "approved") &&
                      request.request_type === "soft_copy" &&
                      request.digital_copy_url && (
                        <Button className="w-full gap-2 rounded-xl sm:w-auto" onClick={() => openExternal(request.digital_copy_url)}>
                          <BookOpen className="h-4 w-4" />
                          Open Soft Copy
                        </Button>
                      )}
                    <Button
                      variant="outline"
                      className="w-full gap-2 rounded-xl sm:w-auto"
                      onClick={() => handleDownloadRequestRecord(request)}
                    >
                      <FileDown className="h-4 w-4" />
                      Download Record
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-2 rounded-xl sm:w-auto"
                      onClick={() => handlePrintRequestRecord(request)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Print / Save PDF
                    </Button>

                    {isManagement && request.status === "pending" && (
                      <>
                        <Button
                          variant="outline"
                          className="w-full gap-2 rounded-xl sm:w-auto"
                          onClick={() => handleOpenReviewDialog(request, "approve")}
                          disabled={activeRequestId === String(request.id)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          className="w-full gap-2 rounded-xl sm:w-auto"
                          onClick={() => handleOpenReviewDialog(request, "fulfill")}
                          disabled={activeRequestId === String(request.id)}
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {request.request_type === "loan" ? "Issue Book" : "Share Copy"}
                        </Button>
                        <Button
                          variant="destructive"
                          className="w-full gap-2 rounded-xl sm:w-auto"
                          onClick={() => handleOpenReviewDialog(request, "reject")}
                          disabled={activeRequestId === String(request.id)}
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </Button>
                      </>
                    )}

                    {isManagement && request.status === "approved" && (
                      <Button
                        className="w-full gap-2 rounded-xl sm:w-auto"
                        onClick={() => handleOpenReviewDialog(request, "fulfill")}
                        disabled={activeRequestId === String(request.id)}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {request.request_type === "loan" ? "Issue Book" : "Share Copy"}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="loans" className="space-y-6 pt-6">
          {(isManagement ? managedLoans : myLoans).length === 0 ? (
            <Card className="border-none shadow-sm">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <Clock className="h-10 w-10 text-primary/20" />
                <h3 className="text-lg font-bold text-primary">
                  {isManagement ? "No school loans yet" : "No active loans yet"}
                </h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  {isManagement
                    ? "Issued loans will appear here as soon as requests are fulfilled."
                    : "Your active and past book loans will appear here."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {(isManagement ? managedLoans : myLoans).map((loan) => (
                <Card key={loan.id} className="border-none shadow-sm">
                  <CardHeader className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="border-none bg-primary/10 font-bold text-primary">
                        {loan.status}
                      </Badge>
                      {loan.fine_amount && Number(loan.fine_amount) > 0 && (
                        <Badge variant="destructive">Fine: {loan.fine_amount}</Badge>
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg font-black text-primary">{getLoanBookTitle(loan)}</CardTitle>
                      <CardDescription className="mt-1">
                        {isManagement ? getLoanBorrowerName(loan) : `Due ${formatDate(loan.due_date)}`}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>Issued: {formatDate(loan.issued_date)}</div>
                      <div>Due: {formatDate(loan.due_date)}</div>
                      {isManagement && <div>Borrower: {getLoanBorrowerName(loan)}</div>}
                      <div>Requester: {loan.requester_name || "-"}</div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      variant="outline"
                      className="w-full gap-2 rounded-xl sm:w-auto"
                      onClick={() => handlePrintLoanRecord(loan)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Print / Save PDF
                    </Button>
                    {isManagement && loan.status === "Active" && (
                      <Button
                        className="w-full gap-2 rounded-xl sm:w-auto"
                        onClick={() => handleReturnBook(loan)}
                        disabled={activeLoanId === String(loan.id)}
                      >
                        {activeLoanId === String(loan.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Undo2 className="h-4 w-4" />
                        )}
                        Mark Returned
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {canAddBooks && (
          <TabsContent value="add-book" className="space-y-6 pt-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-black text-primary">
                  <Plus className="h-5 w-5 text-secondary" />
                  Catalog Publisher
                </CardTitle>
                <CardDescription>
                  Register a new title with full catalog metadata, availability, and an uploaded local cover image.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">{renderBookFormFields()}</CardContent>
              <CardFooter className="justify-between gap-3">
                <Button type="button" variant="outline" className="rounded-xl" onClick={resetBookForm}>
                  Reset Form
                </Button>
                <Button onClick={handleSaveBook} className="gap-2 rounded-xl" disabled={activeRequestId === "create-book"}>
                  {activeRequestId === "create-book" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Save Book
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="max-w-lg rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-primary">
              {requestForm.requestType === "soft_copy" ? "Request Soft Copy Access" : "Request Book Loan"}
            </DialogTitle>
            <DialogDescription>
              {selectedBook ? `${selectedBook.title} by ${selectedBook.author}` : "Choose how you want to access this book."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="request-type">Request Type</Label>
              <Select
                value={requestForm.requestType}
                onValueChange={(value) =>
                  setRequestForm((prev) => ({
                    ...prev,
                    requestType: value as "loan" | "soft_copy",
                  }))
                }
              >
                <SelectTrigger id="request-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="loan">Loan</SelectItem>
                  {selectedBook?.digital_copy_url && <SelectItem value="soft_copy">Soft Copy</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-note">Note (optional)</Label>
              <Textarea
                id="request-note"
                value={requestForm.note}
                onChange={(event) => setRequestForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="Add a short note for the library team"
                className="min-h-[120px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setRequestDialogOpen(false)}
              disabled={isSubmittingRequest}
            >
              Cancel
            </Button>
            <Button className="gap-2 rounded-xl" onClick={handleSubmitRequest} disabled={isSubmittingRequest}>
              {isSubmittingRequest ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageDialogOpen} onOpenChange={(open) => (open ? setManageDialogOpen(true) : resetBookForm())}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-primary">
              {editingBook ? "Edit Published Book" : "Add Book to Catalog"}
            </DialogTitle>
            <DialogDescription>
              Update live catalog metadata, upload a new cover, archive titles, and keep the school library current.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">{renderBookFormFields()}</div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" className="rounded-xl" onClick={resetBookForm}>
              Cancel
            </Button>
            <Button onClick={handleSaveBook} className="gap-2 rounded-xl" disabled={activeRequestId === "create-book"}>
              {activeRequestId === "create-book" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingBook ? (
                <Pencil className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editingBook ? "Save Changes" : "Publish Book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-lg rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-primary">
              {reviewAction === "approve"
                ? "Approve Library Request"
                : reviewAction === "reject"
                  ? "Reject Library Request"
                  : "Fulfill Library Request"}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest
                ? `${selectedRequest.book_title || "Unknown book"} • ${selectedRequest.requester_name || "Unknown requester"}`
                : "Update the selected request."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="review-note">Review Note</Label>
              <Textarea
                id="review-note"
                value={reviewForm.review_note}
                onChange={(event) => setReviewForm((prev) => ({ ...prev, review_note: event.target.value }))}
                placeholder="Add a note for the requester"
                className="min-h-[120px]"
              />
            </div>
            {reviewAction === "fulfill" && selectedRequest?.request_type === "loan" && (
              <div className="space-y-2">
                <Label htmlFor="due-date">Due Date</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={reviewForm.due_date}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, due_date: event.target.value }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setReviewDialogOpen(false)}
              disabled={Boolean(activeRequestId)}
            >
              Cancel
            </Button>
            <Button className="gap-2 rounded-xl" onClick={handleSubmitReview} disabled={Boolean(activeRequestId)}>
              {activeRequestId ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
