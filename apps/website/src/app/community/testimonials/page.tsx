"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { communityService } from "@/lib/api/services/community.service";
import { resolveMediaUrl } from "@/lib/media";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CommunityHeader } from "@/components/layout/community-header";

interface TestimonialRecord {
  id: string;
  user?: { name?: string; avatar?: string; role?: string };
  author?: { name?: string; avatar?: string; role?: string };
  school_name?: string;
  role_display?: string;
  message: string;
  approved_at?: string | null;
}

export default function CommunityTestimonialsPage() {
  const [records, setRecords] = useState<TestimonialRecord[]>([]);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const totalPages = Math.max(1, Math.ceil(count / 12));

  useEffect(() => {
    setIsLoading(true);
    communityService
      .getTestimonies({ page, page_size: 12, status: "approved" } as any)
      .then((response) => {
        setRecords(response?.results ?? []);
        setCount(response?.count ?? (response?.results ?? []).length);
      })
      .finally(() => setIsLoading(false));
  }, [page]);

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <CommunityHeader />

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-12">
        <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge className="border-none bg-secondary text-primary">APPROVED TESTIMONIALS</Badge>
            <h1 className="font-headline text-4xl font-black uppercase tracking-tighter text-primary md:text-6xl">
              What Schools Say
            </h1>
            <p className="text-muted-foreground">Stories from school leaders, staff, parents, and students using EduIgnite.</p>
          </div>
        </section>

        {isLoading ? (
          <div className="rounded-[2rem] bg-white p-10 text-center font-bold text-muted-foreground shadow-sm">Loading testimonials...</div>
        ) : (
          <div className="columns-1 gap-6 space-y-6 md:columns-2 lg:columns-3">
            {records.map((record) => {
              const actor = record.user || record.author || {};
              const name = actor.name || "EduIgnite Community Member";
              const isExpanded = expanded[record.id];
              const isLong = record.message.length > 300;
              const message = isLong && !isExpanded ? `${record.message.slice(0, 300)}...` : record.message;
              return (
                <Card key={record.id} className="mb-6 break-inside-avoid rounded-[2rem] border-none bg-white shadow-xl">
                  <CardContent className="space-y-6 p-7">
                    <Quote className="h-8 w-8 text-secondary" />
                    <p className="text-base font-medium leading-7 text-primary/80">"{message}"</p>
                    {isLong && (
                      <button onClick={() => setExpanded((prev) => ({ ...prev, [record.id]: !isExpanded }))} className="text-xs font-black uppercase tracking-widest text-secondary">
                        {isExpanded ? "Show less" : "Read more"}
                      </button>
                    )}
                    <div className="flex items-center gap-4 border-t border-accent pt-5">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={resolveMediaUrl(actor.avatar)} />
                        <AvatarFallback className="bg-primary text-white font-black">{name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-black text-primary">{name}</p>
                        <p className="truncate text-xs font-bold text-muted-foreground">{record.school_name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="rounded-full text-[10px] font-black uppercase">{record.role_display || actor.role || "School Voice"}</Badge>
                          {record.approved_at && <span className="text-[10px] font-bold text-primary/40">{new Date(record.approved_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-xl">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-xl">
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </main>

    </div>
  );
}
