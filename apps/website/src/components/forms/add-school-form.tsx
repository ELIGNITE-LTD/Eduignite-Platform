"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, MapPin, Mail, Phone, User } from "lucide-react";
import { CAMEROON_REGIONS } from "@/lib/cameroon-education-system";
import { schoolsService } from "@/lib/api/services/schools.service";

interface AddSchoolFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function AddSchoolForm({ onSuccess, onCancel }: AddSchoolFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    shortName: "",
    schoolType: "general" as "general" | "technical" | "mixed",
    subsystem: "francophone" as "francophone" | "anglophone" | "bilingual",
    region: "",
    division: "",
    town: "",
    address: "",
    phone: "",
    email: "",
    principal: "",
    adminEmail: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      schoolsService.createSchool({
        name: data.name,
        short_name: data.shortName,
        school_type: data.schoolType,
        subsystem: data.subsystem,
        region: data.region,
        division: data.division,
        city_village: data.town,
        address: data.address,
        phone: data.phone,
        email: data.email,
        principal: data.principal,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools"] });
      toast({
        title: "School Created",
        description: "School has been successfully registered in the system.",
      });
      onSuccess?.();
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.detail || "Failed to create school";
      toast({ variant: "destructive", title: "Error", description: errorMsg });
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "School name is required";
    if (!formData.shortName.trim()) newErrors.shortName = "Short name is required";
    if (!formData.region) newErrors.region = "Region is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!formData.phone.trim()) newErrors.phone = "Phone number is required";
    if (!formData.principal.trim()) newErrors.principal = "Principal name is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      createMutation.mutate(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information Section */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-secondary" />
            School Information
          </CardTitle>
          <CardDescription>Enter basic details about the school</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest">
                School Name *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Government Bilingual High School"
                className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="shortName" className="text-xs font-bold uppercase tracking-widest">
                Short Name *
              </Label>
              <Input
                id="shortName"
                value={formData.shortName}
                onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                placeholder="e.g., GBHS"
                className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
              />
              {errors.shortName && <p className="text-xs text-destructive">{errors.shortName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="schoolType" className="text-xs font-bold uppercase tracking-widest">
                School Type *
              </Label>
              <Select value={formData.schoolType} onValueChange={(value: any) => setFormData({ ...formData, schoolType: value })}>
                <SelectTrigger className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Education</SelectItem>
                  <SelectItem value="technical">Technical & Vocational</SelectItem>
                  <SelectItem value="mixed">Mixed (General + Technical)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subsystem" className="text-xs font-bold uppercase tracking-widest">
                Education Subsystem *
              </Label>
              <Select value={formData.subsystem} onValueChange={(value: any) => setFormData({ ...formData, subsystem: value })}>
                <SelectTrigger className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="francophone">Francophone</SelectItem>
                  <SelectItem value="anglophone">Anglophone</SelectItem>
                  <SelectItem value="bilingual">Bilingual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location Section */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-secondary" />
            Location
          </CardTitle>
          <CardDescription>Specify the school's geographic location</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="region" className="text-xs font-bold uppercase tracking-widest">
                Region *
              </Label>
              <Select value={formData.region} onValueChange={(value) => setFormData({ ...formData, region: value })}>
                <SelectTrigger className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {CAMEROON_REGIONS.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.region && <p className="text-xs text-destructive">{errors.region}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="division" className="text-xs font-bold uppercase tracking-widest">
                Division/Department
              </Label>
              <Input
                id="division"
                value={formData.division}
                onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                placeholder="e.g., Fako"
                className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="town" className="text-xs font-bold uppercase tracking-widest">
                Town/City
              </Label>
              <Input
                id="town"
                value={formData.town}
                onChange={(e) => setFormData({ ...formData, town: e.target.value })}
                placeholder="e.g., Buea"
                className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address" className="text-xs font-bold uppercase tracking-widest">
                Street Address
              </Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="e.g., P.O. Box 123"
                className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Section */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-secondary" />
            Contact Information
          </CardTitle>
          <CardDescription>School contact details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest">
                Phone Number *
              </Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+237 6XX XX XX XX"
                className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest">
                Email Address *
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="school@example.com"
                className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leadership Section */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-secondary" />
            Leadership
          </CardTitle>
          <CardDescription>School principal and administrator details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="principal" className="text-xs font-bold uppercase tracking-widest">
              Principal/Director Name *
            </Label>
            <Input
              id="principal"
              value={formData.principal}
              onChange={(e) => setFormData({ ...formData, principal: e.target.value })}
              placeholder="Full name of the principal"
              className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
            />
            {errors.principal && <p className="text-xs text-destructive">{errors.principal}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminEmail" className="text-xs font-bold uppercase tracking-widest">
              School Admin Account Email
            </Label>
            <Input
              id="adminEmail"
              type="email"
              value={formData.adminEmail}
              onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
              placeholder="admin@school.com"
              className="h-11 rounded-lg border-primary/10 focus-visible:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              This email will be used to create the school admin account and send activation link
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex gap-3 justify-end pt-6">
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
              Creating School...
            </>
          ) : (
            <>
              <Building2 className="w-4 h-4" />
              Create School
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
