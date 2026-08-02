"use client";

import { useState, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useStudents } from "@/lib/hooks/useStudents";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CreditCard,
  Search,
  Printer,
  Download,
  Building2,
  User,
  MapPin,
  QrCode,
  Layers,
  GraduationCap,
  ShieldCheck,
  CheckCircle2,
  X,
  Eye,
  FileCheck,
  ChevronRight,
  Plus,
  Info,
  Phone,
  Signature,
  Network,
  Filter,
  Settings,
  Copy,
  Zap,
  Lock,
  Clock,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media";
import { DEFAULT_TEMPLATES, IDCardTemplate } from "@/lib/id-card-templates";
import { pdfGenerationService } from "@/lib/pdf-generation-service";

const CLASSES = ["6ème / Form 1", "5ème / Form 2", "4ème / Form 3", "3ème / Form 4", "2nde / Form 5", "1ère / Lower Sixth", "Terminale / Upper Sixth"];
const SECTIONS = ["Anglophone Section", "Francophone Section", "Technical Section"];

export default function EnhancedIdCardsPage() {
  const { user, platformSettings } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();

  // State Management
  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("generate");
  const [selectedTemplate, setSelectedTemplate] = useState<IDCardTemplate>(DEFAULT_TEMPLATES[0]);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isAuditDialogOpen, setIsAuditDialogOpen] = useState(false);
  const [generationHistory, setGenerationHistory] = useState<any[]>([]);

  // Fetch student data
  const { data: studentsApiData } = useStudents({ search: searchTerm || undefined });

  // Build student list
  const studentList = useMemo(() => {
    return (studentsApiData?.results || []).map((s: any) => ({
      id: s.admission_number || s.user?.matricule || s.id,
      name: s.user?.name || "Unknown",
      class: s.student_class || "Unknown",
      section: s.section || "Unknown",
      avatar: resolveMediaUrl(s.user?.avatar) || "",
      dob: s.date_of_birth || "",
      guardian: s.guardian_name || "",
      guardianPhone: s.guardian_phone || "",
      address: s.address || "",
    }));
  }, [studentsApiData]);

  const availableClasses = useMemo(
    () => Array.from(new Set(studentList.map((student: any) => student.class).filter(Boolean))).sort(),
    [studentList]
  );

  const availableSections = useMemo(
    () => Array.from(new Set(studentList.map((student: any) => student.section).filter(Boolean))).sort(),
    [studentList]
  );

  const filtered = studentList.filter((s: any) => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = classFilter === "all" || s.class === classFilter;
    const matchesSection = sectionFilter === "all" || s.section === sectionFilter;
    return matchesSearch && matchesClass && matchesSection;
  });

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedStudents.length === filtered.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filtered.map(s => s.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedStudents(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const downloadGeneratedFile = (url: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // PDF Generation handlers
  const handleGeneratePDF = async () => {
    if (selectedStudents.length === 0) {
      toast({ variant: "destructive", title: "No Students Selected", description: "Please select at least one student to generate IDs." });
      return;
    }

    setIsGenerating(true);
    try {
      const selectedStudentData = studentList.filter(s => selectedStudents.includes(s.id));

      // Call PDF generation service
      const result = await pdfGenerationService.generateBatchPDF({
        type: "id-cards",
        items: selectedStudentData.map(s => ({
          studentId: s.id,
          studentData: {
            name: s.name,
            matricule: s.id,
            class_level: s.class,
            section: s.section,
            avatar: s.avatar,
            date_of_birth: s.dob,
            guardian_name: s.guardian,
            guardian_phone: s.guardianPhone,
            address: s.address,
          },
          schoolData: {
            name: user?.school?.name || "School Name",
            logo: user?.school?.logo,
            motto: user?.school?.motto,
            principal: user?.school?.principal,
          },
          templateId: selectedTemplate.id,
        })),
        options: {
          watermark: {
            text: "MINESEC - OFFICIAL ID",
            opacity: 0.1,
          },
          digitalSignature: {
            enabled: true,
          },
          compression: true,
          quality: "high",
        },
      });

      if (result.success) {
        if (result.downloadUrl) {
          downloadGeneratedFile(result.downloadUrl, result.fileName);
        }

        // Add to generation history
        setGenerationHistory(prev => [{
          id: result.documentId,
          fileName: result.fileName,
          downloadUrl: result.downloadUrl,
          studentCount: selectedStudents.length,
          generatedAt: new Date(),
          generatedBy: user?.name || "Admin",
          status: "completed",
        }, ...prev]);

        toast({
          title: "ID Cards Generated",
          description: `Successfully generated ${selectedStudents.length} ID card(s). Ready for download.`,
        });

        // Reset selection
        setSelectedStudents([]);
      } else {
        toast({
          variant: "destructive",
          title: "Generation Failed",
          description: result.error || "Failed to generate ID cards",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
    toast({ title: "Print Command Sent", description: "Sending batch to your institutional printer." });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <CreditCard className="w-6 h-6 text-secondary" />
            </div>
            {language === "en" ? "Institutional ID Cards" : "Cartes d'Identité"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate and manage official dual-sided ID cards for the student body with advanced template management.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2 h-12 px-6 rounded-2xl"
            onClick={() => setIsTemplateDialogOpen(true)}
          >
            <Settings className="w-5 h-5" /> Templates
          </Button>
          <Button
            className="gap-2 shadow-lg h-12 px-6 rounded-2xl"
            onClick={handleGeneratePDF}
            disabled={selectedStudents.length === 0 || isGenerating}
          >
            {isGenerating ? <Zap className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {language === "en" ? "Generate PDF" : "Générer PDF"} ({selectedStudents.length})
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full md:w-[400px] bg-white shadow-sm border h-auto p-1.5 rounded-3xl grid-cols-3">
          <TabsTrigger value="generate" className="rounded-2xl">
            <CreditCard className="w-4 h-4 mr-2" /> Generate
          </TabsTrigger>
          <TabsTrigger value="templates" className="rounded-2xl">
            <Layers className="w-4 h-4 mr-2" /> Templates
          </TabsTrigger>
          <TabsTrigger value="audit" className="rounded-2xl">
            <Clock className="w-4 h-4 mr-2" /> History
          </TabsTrigger>
        </TabsList>

        {/* Generate Tab */}
        <TabsContent value="generate" className="space-y-6">
          {/* Filter Card */}
          <Card className="border-none shadow-xl overflow-hidden rounded-3xl">
            <CardHeader className="bg-white border-b p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative col-span-1 md:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Find student by name or ID..."
                    className="pl-10 h-11 bg-accent/20 border-none rounded-xl"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 col-span-1 md:col-span-2">
                  <Select value={sectionFilter} onValueChange={setSectionFilter}>
                    <SelectTrigger className="flex-1 h-11 bg-accent/20 border-none rounded-xl">
                      <div className="flex items-center gap-2">
                        <Network className="w-3.5 h-3.5 text-primary/40" />
                        <SelectValue placeholder="All Sections" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Entire Node</SelectItem>
                      {availableSections.map((section) => <SelectItem key={section} value={section}>{section}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={classFilter} onValueChange={setClassFilter}>
                    <SelectTrigger className="flex-1 h-11 bg-accent/20 border-none rounded-xl">
                      <div className="flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-primary/40" />
                        <SelectValue placeholder="All Classes" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {availableClasses.map((className) => <SelectItem key={className} value={className}>{className}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            {/* Student Table */}
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-accent/10 border-b border-accent/20">
                    <TableHead className="w-[50px] pl-8">
                      <Checkbox
                        checked={selectedStudents.length === filtered.length && filtered.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest py-4">Matricule</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest">Student Profile</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest">Academic Level</TableHead>
                    <TableHead className="text-center font-black uppercase text-[10px] tracking-widest">Card Status</TableHead>
                    <TableHead className="pr-8 text-right font-black uppercase text-[10px] tracking-widest">Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className={cn("group hover:bg-accent/5 border-b border-accent/10", selectedStudents.includes(s.id) && "bg-primary/5")}>
                      <TableCell className="pl-8">
                        <Checkbox
                          checked={selectedStudents.includes(s.id)}
                          onCheckedChange={() => toggleSelect(s.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold text-primary">{s.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-accent">
                            <AvatarImage src={s.avatar} />
                            <AvatarFallback className="bg-primary/5 text-primary text-xs">{s.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-primary">{s.name}</span>
                            <span className="text-[8px] font-black uppercase opacity-40">{s.section}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] border-primary/20 text-primary font-bold">{s.class}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-green-100 text-green-700 border-none text-[9px] font-black">VALIDATED</Badge>
                      </TableCell>
                      <TableCell className="pr-8 text-right">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedStudents([s.id]); setIsPreviewing(true); }} className="rounded-full hover:bg-accent">
                          <Eye className="w-4 h-4 text-primary" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {DEFAULT_TEMPLATES.map((template) => (
              <Card key={template.id} className={cn("border-2 cursor-pointer transition-all hover:shadow-lg", selectedTemplate.id === template.id ? "border-primary bg-primary/5" : "border-accent/20")}>
                <CardHeader>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-accent/10 rounded-lg p-4 h-32 flex items-center justify-center text-sm text-muted-foreground">
                    ID Card Preview (85.6mm × 53.98mm)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={selectedTemplate.id === template.id ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setSelectedTemplate(template)}
                    >
                      {selectedTemplate.id === template.id ? "Selected" : "Select"}
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-lg">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit" className="space-y-6">
          <Card className="border-none shadow-xl rounded-3xl">
            <CardHeader>
              <CardTitle>Generation History</CardTitle>
              <CardDescription>Track all ID card generation activities</CardDescription>
            </CardHeader>
            <CardContent>
              {generationHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No generation history yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Generated By</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {generationHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.generatedAt).toLocaleDateString()}</TableCell>
                        <TableCell>{entry.generatedBy}</TableCell>
                        <TableCell>{entry.studentCount}</TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-700">{entry.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
