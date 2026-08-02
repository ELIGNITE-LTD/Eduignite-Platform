"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, BookOpen, Users, Phone, AlertCircle } from "lucide-react";
import {
  getClassLevels,
  getSubjects,
  GUARDIAN_RELATIONSHIPS,
  getTermNames,
  type Subsystem,
  type Stream,
} from "@/lib/cameroon-education-system";
import { studentsService } from "@/lib/api/services/students.service";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddStudentFormProps {
  schoolId: string;
  schoolSubsystem: Subsystem;
  schoolType: "general" | "technical" | "mixed";
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function AddStudentForm({
  schoolId,
  schoolSubsystem,
  schoolType,
  onSuccess,
  onCancel,
}: AddStudentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("student");
  const [stream, setStream] = useState<Stream>("general");
  const [selectedClass, setSelectedClass] = useState("");
  const [includeGuardian, setIncludeGuardian] = useState(true);

  const [studentData, setStudentData] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "other" as "male" | "female" | "other",
    studentClass: "",
    admissionNumber: "",
    admissionDate: new Date().toISOString().split("T")[0],
  });

  const [guardianData, setGuardianData] = useState({
    guardianName: "",
    guardianPhone: "",
    guardianWhatsApp: "",
    relationship: "father" as string,
    isPrimary: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get available class levels based on school configuration
  const classLevels = useMemo(() => {
    if (schoolType === "technical") {
      return getClassLevels(schoolSubsystem, "technical");
    } else if (schoolType === "mixed") {
      return getClassLevels(schoolSubsystem, stream);
    }
    return getClassLevels(schoolSubsystem, "general");
  }, [schoolSubsystem, schoolType, stream]);

  const createMutation = useMutation({
    mutationFn: (data: any) => studentsService.createStudent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast({
        title: "Student Admitted",
        description: "Student has been successfully registered in the system.",
      });
      onSuccess?.();
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.detail || "Failed to admit student";
      toast({ variant: "destructive", title: "Error", description: errorMsg });
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!studentData.firstName.trim()) newErrors.firstName = "First name is required";
    if (!studentData.lastName.trim()) newErrors.lastName = "Last name is required";
    if (!studentData.dateOfBirth) newErrors.dateOfBirth = "Date of birth is required";
    if (!selectedClass) newErrors.studentClass = "Class is required";
    if (!studentData.admissionNumber.trim()) newErrors.admissionNumber = "Admission number is required";

    if (includeGuardian) {
      if (!guardianData.guardianName.trim()) newErrors.guardianName = "Guardian name is required";
      if (!guardianData.guardianPhone.trim()) newErrors.guardianPhone = "Guardian phone is required";
      if (!guardianData.relationship) newErrors.relationship = "Relationship is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      const payload = {
        school: schoolId,
        user: {
          first_name: studentData.firstName,
          last_name: studentData.lastName,
          email: `${studentData.firstName.toLowerCase()}.${studentData.lastName.toLowerCase()}@student.${schoolId}.local`,
        },
        student_class: selectedClass,
        date_of_birth: studentData.dateOfBirth,
        gender: studentData.gender,
        admission_number: studentData.admissionNumber,
        admission_date: studentData.admissionDate,
        guardian: includeGuardian
          ? {
              name: guardianData.guardianName,
              phone: guardianData.guardianPhone,
              whatsapp: guardianData.guardianWhatsApp,
              relationship: guardianData.relationship,
              is_primary: guardianData.isPrimary,
            }
          : undefined,
      };

      createMutation.mutate(payload);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-lg bg-white shadow-sm border p-1">
          <TabsTrigger value="student" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">
            <User className="w-4 h-4 mr-2" />
            Student Information
          </TabsTrigger>
          <TabsTrigger value="guardian" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-2" />
            Guardian Details
          </TabsTrigger>
        </TabsList>

        {/* Student Information Tab */}
        <TabsContent value="student" className="space-y-6 mt-6">
          {/* Personal Information */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-secondary" />
                Personal Information
              </CardTitle>
              <CardDescription>Enter the student's basic details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-xs font-bold uppercase tracking-widest">
                    First Name *
                  </Label>
                  <Input
                    id="firstName"
                    value={studentData.firstName}
                    onChange={(e) => setStudentData({ ...studentData, firstName: e.target.value })}
                    placeholder="John"
                    className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                  />
                  {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-xs font-bold uppercase tracking-widest">
                    Last Name *
                  </Label>
                  <Input
                    id="lastName"
                    value={studentData.lastName}
                    onChange={(e) => setStudentData({ ...studentData, lastName: e.target.value })}
                    placeholder="Doe"
                    className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                  />
                  {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth" className="text-xs font-bold uppercase tracking-widest">
                    Date of Birth *
                  </Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={studentData.dateOfBirth}
                    onChange={(e) => setStudentData({ ...studentData, dateOfBirth: e.target.value })}
                    className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                  />
                  {errors.dateOfBirth && <p className="text-xs text-destructive">{errors.dateOfBirth}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender" className="text-xs font-bold uppercase tracking-widest">
                    Gender
                  </Label>
                  <Select value={studentData.gender} onValueChange={(value: any) => setStudentData({ ...studentData, gender: value })}>
                    <SelectTrigger className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Academic Information */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-secondary" />
                Academic Information
              </CardTitle>
              <CardDescription>Assign the student to a class and provide admission details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {schoolType === "mixed" && (
                <div className="space-y-2">
                  <Label htmlFor="stream" className="text-xs font-bold uppercase tracking-widest">
                    Stream/Track
                  </Label>
                  <Select value={stream} onValueChange={(value: any) => setStream(value)}>
                    <SelectTrigger className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Education</SelectItem>
                      <SelectItem value="technical">Technical & Vocational</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="studentClass" className="text-xs font-bold uppercase tracking-widest">
                  Class/Level *
                </Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classLevels.map((cls) => (
                      <SelectItem key={cls.value} value={cls.value}>
                        {cls.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.studentClass && <p className="text-xs text-destructive">{errors.studentClass}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="admissionNumber" className="text-xs font-bold uppercase tracking-widest">
                    Admission Number *
                  </Label>
                  <Input
                    id="admissionNumber"
                    value={studentData.admissionNumber}
                    onChange={(e) => setStudentData({ ...studentData, admissionNumber: e.target.value })}
                    placeholder="e.g., ADM-2024-001"
                    className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                  />
                  {errors.admissionNumber && <p className="text-xs text-destructive">{errors.admissionNumber}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admissionDate" className="text-xs font-bold uppercase tracking-widest">
                    Admission Date
                  </Label>
                  <Input
                    id="admissionDate"
                    type="date"
                    value={studentData.admissionDate}
                    onChange={(e) => setStudentData({ ...studentData, admissionDate: e.target.value })}
                    className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Guardian Information Tab */}
        <TabsContent value="guardian" className="space-y-6 mt-6">
          <Alert className="border-primary/20 bg-primary/5">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm text-primary">
              Guardian information is optional but recommended for parent communication and emergency contacts.
            </AlertDescription>
          </Alert>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-secondary" />
                Guardian/Parent Information
              </CardTitle>
              <CardDescription>Add a parent or guardian for this student</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/10">
                <input
                  type="checkbox"
                  id="includeGuardian"
                  checked={includeGuardian}
                  onChange={(e) => setIncludeGuardian(e.target.checked)}
                  className="w-4 h-4 rounded border-primary/20 cursor-pointer"
                />
                <Label htmlFor="includeGuardian" className="cursor-pointer flex-1 font-medium">
                  Add Guardian Information
                </Label>
              </div>

              {includeGuardian && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="guardianName" className="text-xs font-bold uppercase tracking-widest">
                      Guardian Name *
                    </Label>
                    <Input
                      id="guardianName"
                      value={guardianData.guardianName}
                      onChange={(e) => setGuardianData({ ...guardianData, guardianName: e.target.value })}
                      placeholder="Full name"
                      className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                    />
                    {errors.guardianName && <p className="text-xs text-destructive">{errors.guardianName}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="guardianPhone" className="text-xs font-bold uppercase tracking-widest">
                        Phone Number *
                      </Label>
                      <Input
                        id="guardianPhone"
                        value={guardianData.guardianPhone}
                        onChange={(e) => setGuardianData({ ...guardianData, guardianPhone: e.target.value })}
                        placeholder="+237 6XX XX XX XX"
                        className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                      />
                      {errors.guardianPhone && <p className="text-xs text-destructive">{errors.guardianPhone}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guardianWhatsApp" className="text-xs font-bold uppercase tracking-widest">
                        WhatsApp Number
                      </Label>
                      <Input
                        id="guardianWhatsApp"
                        value={guardianData.guardianWhatsApp}
                        onChange={(e) => setGuardianData({ ...guardianData, guardianWhatsApp: e.target.value })}
                        placeholder="+237 6XX XX XX XX"
                        className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="relationship" className="text-xs font-bold uppercase tracking-widest">
                      Relationship *
                    </Label>
                    <Select value={guardianData.relationship} onValueChange={(value) => setGuardianData({ ...guardianData, relationship: value })}>
                      <SelectTrigger className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GUARDIAN_RELATIONSHIPS.map((rel) => (
                          <SelectItem key={rel.value} value={rel.value}>
                            {rel.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.relationship && <p className="text-xs text-destructive">{errors.relationship}</p>}
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-secondary/5 rounded-lg border border-secondary/10">
                    <input
                      type="checkbox"
                      id="isPrimary"
                      checked={guardianData.isPrimary}
                      onChange={(e) => setGuardianData({ ...guardianData, isPrimary: e.target.checked })}
                      className="w-4 h-4 rounded border-secondary/20 cursor-pointer"
                    />
                    <Label htmlFor="isPrimary" className="cursor-pointer flex-1 font-medium text-sm">
                      Set as primary guardian for communications
                    </Label>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Form Actions */}
      <div className="flex gap-3 justify-end pt-6 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="h-11 px-8 rounded-lg font-bold">
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={createMutation.isPending}
          className="h-11 px-8 rounded-lg font-bold bg-primary text-white hover:bg-primary/90 gap-2"
        >
          {createMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Admitting Student...
            </>
          ) : (
            <>
              <User className="w-4 h-4" />
              Admit Student
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
