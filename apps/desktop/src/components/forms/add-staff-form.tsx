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
import { Loader2, User, BookOpen, Phone, Mail, AlertCircle } from "lucide-react";
import {
  getSubjects,
  STAFF_ROLES,
  TECHNICAL_SPECIALISATIONS,
  type Subsystem,
  type Stream,
} from "@/lib/cameroon-education-system";
import { usersService } from "@/lib/api/services/users.service";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddStaffFormProps {
  schoolId: string;
  schoolSubsystem: Subsystem;
  schoolType: "general" | "technical" | "mixed";
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function AddStaffForm({
  schoolId,
  schoolSubsystem,
  schoolType,
  onSuccess,
  onCancel,
}: AddStaffFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("basic");
  const [staffRole, setStaffRole] = useState("");
  const [stream, setStream] = useState<Stream>("general");
  const [specialisation, setSpecialisation] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const [staffData, setStaffData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    gender: "other" as "male" | "female" | "other",
    qualification: "",
    yearsOfExperience: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get available subjects based on school configuration
  const availableSubjects = useMemo(() => {
    if (schoolType === "technical") {
      return getSubjects(schoolSubsystem, "technical", specialisation);
    } else if (schoolType === "mixed") {
      return getSubjects(schoolSubsystem, stream, specialisation);
    }
    return getSubjects(schoolSubsystem, "general");
  }, [schoolSubsystem, schoolType, stream, specialisation]);

  const isTeacher = staffRole === "TEACHER" || staffRole === "FORM_MASTER" || staffRole === "HEAD_OF_DEPARTMENT";

  const createMutation = useMutation({
    mutationFn: (data: any) => usersService.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast({
        title: "Staff Member Added",
        description: "Staff member has been successfully registered in the system.",
      });
      onSuccess?.();
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.detail || "Failed to add staff member";
      toast({ variant: "destructive", title: "Error", description: errorMsg });
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!staffData.firstName.trim()) newErrors.firstName = "First name is required";
    if (!staffData.lastName.trim()) newErrors.lastName = "Last name is required";
    if (!staffData.email.trim()) newErrors.email = "Email is required";
    if (!staffRole) newErrors.staffRole = "Staff role is required";
    if (isTeacher && selectedSubjects.length === 0) newErrors.subjects = "At least one subject is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      const payload = {
        first_name: staffData.firstName,
        last_name: staffData.lastName,
        email: staffData.email,
        phone: staffData.phone,
        gender: staffData.gender,
        role: staffRole,
        school: schoolId,
        qualification: staffData.qualification,
        years_of_experience: staffData.yearsOfExperience ? parseInt(staffData.yearsOfExperience) : undefined,
        teaching_subjects: isTeacher ? selectedSubjects : undefined,
        specialisation: specialisation || undefined,
      };

      createMutation.mutate(payload);
    }
  };

  const toggleSubject = (subject: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-lg bg-white shadow-sm border p-1">
          <TabsTrigger value="basic" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">
            <User className="w-4 h-4 mr-2" />
            Basic Information
          </TabsTrigger>
          <TabsTrigger value="teaching" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">
            <BookOpen className="w-4 h-4 mr-2" />
            Teaching Assignment
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-6 mt-6">
          {/* Personal Information */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-secondary" />
                Personal Information
              </CardTitle>
              <CardDescription>Enter the staff member's basic details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-xs font-bold uppercase tracking-widest">
                    First Name *
                  </Label>
                  <Input
                    id="firstName"
                    value={staffData.firstName}
                    onChange={(e) => setStaffData({ ...staffData, firstName: e.target.value })}
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
                    value={staffData.lastName}
                    onChange={(e) => setStaffData({ ...staffData, lastName: e.target.value })}
                    placeholder="Doe"
                    className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                  />
                  {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest">
                    Email Address *
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={staffData.email}
                    onChange={(e) => setStaffData({ ...staffData, email: e.target.value })}
                    placeholder="john@school.com"
                    className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest">
                    Phone Number
                  </Label>
                  <Input
                    id="phone"
                    value={staffData.phone}
                    onChange={(e) => setStaffData({ ...staffData, phone: e.target.value })}
                    placeholder="+237 6XX XX XX XX"
                    className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gender" className="text-xs font-bold uppercase tracking-widest">
                    Gender
                  </Label>
                  <Select value={staffData.gender} onValueChange={(value: any) => setStaffData({ ...staffData, gender: value })}>
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
                <div className="space-y-2">
                  <Label htmlFor="staffRole" className="text-xs font-bold uppercase tracking-widest">
                    Staff Role *
                  </Label>
                  <Select value={staffRole} onValueChange={setStaffRole}>
                    <SelectTrigger className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.staffRole && <p className="text-xs text-destructive">{errors.staffRole}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Professional Information */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Professional Information</CardTitle>
              <CardDescription>Educational qualifications and experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="qualification" className="text-xs font-bold uppercase tracking-widest">
                    Highest Qualification
                  </Label>
                  <Input
                    id="qualification"
                    value={staffData.qualification}
                    onChange={(e) => setStaffData({ ...staffData, qualification: e.target.value })}
                    placeholder="e.g., Bachelor's Degree in Mathematics"
                    className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="yearsOfExperience" className="text-xs font-bold uppercase tracking-widest">
                    Years of Experience
                  </Label>
                  <Input
                    id="yearsOfExperience"
                    type="number"
                    min="0"
                    max="70"
                    value={staffData.yearsOfExperience}
                    onChange={(e) => setStaffData({ ...staffData, yearsOfExperience: e.target.value })}
                    placeholder="0"
                    className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Teaching Assignment Tab */}
        <TabsContent value="teaching" className="space-y-6 mt-6">
          {!isTeacher ? (
            <Alert className="border-primary/20 bg-primary/5">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm text-primary">
                Teaching assignments are only applicable for teachers. Select a teaching role in the Basic Information tab to configure subject assignments.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {schoolType === "mixed" && (
                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle>Stream/Track</CardTitle>
                    <CardDescription>Select which stream this teacher will teach</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Select value={stream} onValueChange={(value: any) => setStream(value)}>
                      <SelectTrigger className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General Education</SelectItem>
                        <SelectItem value="technical">Technical & Vocational</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

              {stream === "technical" && (
                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle>Technical Specialisation</CardTitle>
                    <CardDescription>Select the technical specialisation for subject assignment</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Select value={specialisation} onValueChange={setSpecialisation}>
                      <SelectTrigger className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary">
                        <SelectValue placeholder="Select specialisation" />
                      </SelectTrigger>
                      <SelectContent>
                        {TECHNICAL_SPECIALISATIONS.map((spec) => (
                          <SelectItem key={spec.value} value={spec.value}>
                            {spec.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-secondary" />
                    Subject Assignment
                  </CardTitle>
                  <CardDescription>Select all subjects this teacher will teach</CardDescription>
                </CardHeader>
                <CardContent>
                  {availableSubjects.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No subjects available for the selected configuration. Please select a specialisation for technical streams.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {availableSubjects.map((subject) => (
                        <div key={subject} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-primary/5 transition-colors cursor-pointer">
                          <input
                            type="checkbox"
                            id={subject}
                            checked={selectedSubjects.includes(subject)}
                            onChange={() => toggleSubject(subject)}
                            className="w-4 h-4 rounded border-primary/20 cursor-pointer"
                          />
                          <Label htmlFor={subject} className="flex-1 cursor-pointer font-medium text-sm">
                            {subject}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                  {errors.subjects && <p className="text-xs text-destructive mt-3">{errors.subjects}</p>}
                </CardContent>
              </Card>

              {selectedSubjects.length > 0 && (
                <Alert className="border-secondary/20 bg-secondary/5">
                  <AlertCircle className="h-4 w-4 text-secondary" />
                  <AlertDescription className="text-sm text-secondary">
                    {selectedSubjects.length} subject(s) selected: {selectedSubjects.join(", ")}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
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
              Adding Staff...
            </>
          ) : (
            <>
              <User className="w-4 h-4" />
              Add Staff Member
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
