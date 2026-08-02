"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { resolveMediaUrl } from "@/lib/media";

const ITEMS_PER_PAGE = 12;

export default function AllTestimonialsPage() {
  const { testimonials } = useAuth();
  const { t } = useI18n();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  // Filter and sort testimonials
  const filteredTestimonials = useMemo(() => {
    let filtered = testimonials.filter((t) => t.status === "approved");

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.author_name?.toLowerCase().includes(query) ||
          t.school_name?.toLowerCase().includes(query) ||
          t.content?.toLowerCase().includes(query)
      );
    }

    // Role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter((t) => t.author_role === roleFilter);
    }

    // Sort
    if (sortBy === "newest") {
      filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    } else if (sortBy === "oldest") {
      filtered.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    } else if (sortBy === "rating") {
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return filtered;
  }, [testimonials, searchQuery, roleFilter, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredTestimonials.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTestimonials = filteredTestimonials.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const roleOptions = [
    { value: "all", label: "All Roles" },
    { value: "STUDENT", label: "Student" },
    { value: "TEACHER", label: "Teacher" },
    { value: "PARENT", label: "Parent" },
    { value: "SCHOOL_ADMIN", label: "School Admin" },
    { value: "BURSAR", label: "Bursar" },
    { value: "LIBRARIAN", label: "Librarian" },
  ];

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      STUDENT: "bg-blue-100 text-blue-800",
      TEACHER: "bg-green-100 text-green-800",
      PARENT: "bg-purple-100 text-purple-800",
      SCHOOL_ADMIN: "bg-red-100 text-red-800",
      BURSAR: "bg-yellow-100 text-yellow-800",
      LIBRARIAN: "bg-indigo-100 text-indigo-800",
    };
    return colors[role] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-secondary rounded-xl shadow-lg">
              <Star className="w-6 h-6 text-white" />
            </div>
            All Testimonials
          </h1>
          <p className="text-muted-foreground mt-1">
            {filteredTestimonials.length} approved testimonials from our community
          </p>
        </div>
        <Button asChild variant="outline" className="h-12 px-6 rounded-xl font-bold border-primary/20">
          <Link href="/dashboard/testimonials">← Back to Featured</Link>
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-none shadow-sm bg-white">
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by name, school, or content..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 h-11 rounded-xl border-primary/10 focus-visible:ring-primary"
                />
              </div>
            </div>
            <div>
              <Select value={roleFilter} onValueChange={(value) => {
                setRoleFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="h-11 rounded-xl border-primary/10 focus-visible:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={sortBy} onValueChange={(value) => {
                setSortBy(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="h-11 rounded-xl border-primary/10 focus-visible:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="rating">Highest Rating</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Testimonials Grid */}
      {paginatedTestimonials.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground text-lg">No testimonials match your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedTestimonials.map((testimonial) => (
            <Card
              key={testimonial.id}
              className="border-none shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col bg-white"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <Avatar className="h-12 w-12 border-2 border-primary/10">
                    <AvatarImage src={resolveMediaUrl(testimonial.author_avatar)} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {(testimonial.author_name || "?").charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {testimonial.rating && (
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < testimonial.rating
                              ? "fill-secondary text-secondary"
                              : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <CardTitle className="text-lg font-bold text-primary line-clamp-2">
                  {testimonial.author_name}
                </CardTitle>
                <CardDescription className="text-xs">
                  {testimonial.school_name && (
                    <span className="text-muted-foreground">{testimonial.school_name}</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-4">
                <p className="text-sm text-muted-foreground line-clamp-4">
                  {testimonial.content}
                </p>
              </CardContent>
              <div className="px-6 pb-4 space-y-3 border-t pt-4">
                <Badge className={`${getRoleColor(testimonial.author_role)} border-none text-xs font-bold`}>
                  {testimonial.author_role}
                </Badge>
                {testimonial.created_at && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(testimonial.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-8 border-t">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredTestimonials.length)} of{" "}
            {filteredTestimonials.length} testimonials
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border-primary/20"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {[...Array(totalPages)].map((_, i) => {
              const page = i + 1;
              if (
                page === 1 ||
                page === totalPages ||
                (page >= currentPage - 1 && page <= currentPage + 1)
              ) {
                return (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className={`rounded-lg ${
                      currentPage === page
                        ? "bg-primary text-white"
                        : "border-primary/20"
                    }`}
                  >
                    {page}
                  </Button>
                );
              } else if (
                (page === 2 && currentPage > 3) ||
                (page === totalPages - 1 && currentPage < totalPages - 2)
              ) {
                return (
                  <span key={page} className="text-muted-foreground">
                    ...
                  </span>
                );
              }
              return null;
            })}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border-primary/20"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
