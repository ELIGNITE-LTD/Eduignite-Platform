
"use client";

import { useState } from "react";
import { generateStudentFeedback, type GenerateStudentFeedbackInput } from "@/ai/flows/teacher-ai-feedback-generation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, User, BookOpen, Clock, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n-context";

export default function AiFeedbackPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [generatedFeedback, setGeneratedFeedback] = useState("");
  
  const [formData, setFormData] = useState<GenerateStudentFeedbackInput>({
    studentName: "",
    className: "Physics 101",
    grades: [{ assignment: "Midterm Exam", score: 85, maxScore: 100 }],
    attendancePercentage: 92,
    additionalContext: "",
  });

  const handleGradeChange = (index: number, field: string, value: any) => {
    const newGrades = [...formData.grades];
    newGrades[index] = { ...newGrades[index], [field]: value };
    setFormData({ ...formData, grades: newGrades });
  };

  const addGrade = () => {
    setFormData({
      ...formData,
      grades: [...formData.grades, { assignment: "", score: 0, maxScore: 100 }]
    });
  };

  const onGenerate = async () => {
    if (!formData.studentName) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please enter a student name." });
      return;
    }

    setLoading(true);
    try {
      const result = await generateStudentFeedback(formData);
      setGeneratedFeedback(result.feedback);
      toast({ title: "Feedback Generated", description: "AI has created a draft for you." });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to generate feedback." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-secondary fill-secondary/20" />
          {t("aiFeedback")} Assistant
        </h1>
        <p className="text-muted-foreground mt-1">Generate personalized, constructive feedback based on student data.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Student Data Input</CardTitle>
            <CardDescription>Fill in the details to help the AI understand the student's performance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><User className="w-3 h-3"/> Student Name</Label>
                <Input 
                  placeholder="e.g. John Smith" 
                  value={formData.studentName}
                  onChange={(e) => setFormData({...formData, studentName: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><BookOpen className="w-3 h-3"/> Class Name</Label>
                <Input 
                  placeholder="e.g. Science" 
                  value={formData.className}
                  onChange={(e) => setFormData({...formData, className: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base">Recent Assignments</Label>
                <Button variant="outline" size="sm" onClick={addGrade} className="h-8 gap-1">
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
              {formData.grades.map((grade, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-accent/30 p-3 rounded-lg border border-accent">
                  <div className="col-span-6 space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Assignment</Label>
                    <Input 
                      placeholder="Title" 
                      className="h-8 text-sm"
                      value={grade.assignment}
                      onChange={(e) => handleGradeChange(idx, 'assignment', e.target.value)}
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Score</Label>
                    <Input 
                      type="number" 
                      className="h-8 text-sm"
                      value={grade.score}
                      onChange={(e) => handleGradeChange(idx, 'score', parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Max</Label>
                    <Input 
                      type="number" 
                      className="h-8 text-sm"
                      value={grade.maxScore}
                      onChange={(e) => handleGradeChange(idx, 'maxScore', parseFloat(e.target.value))}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Clock className="w-3 h-3"/> Attendance (%)</Label>
              <div className="flex items-center gap-4">
                <Input 
                  type="range" 
                  min="0" max="100" 
                  className="flex-1"
                  value={formData.attendancePercentage}
                  onChange={(e) => setFormData({...formData, attendancePercentage: parseInt(e.target.value)})}
                />
                <span className="font-bold text-primary w-12 text-right">{formData.attendancePercentage}%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Additional Context</Label>
              <Textarea 
                placeholder="Mention specific observations, participation, or behavior..." 
                className="min-h-[100px]"
                value={formData.additionalContext}
                onChange={(e) => setFormData({...formData, additionalContext: e.target.value})}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full gap-2 shadow-lg h-11" onClick={onGenerate} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Personalized Feedback
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-none shadow-sm flex flex-col h-full bg-primary text-white">
          <CardHeader>
            <CardTitle className="text-white">AI Result</CardTitle>
            <CardDescription className="text-white/60">The generated draft will appear here for you to review and send.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 relative">
            {generatedFeedback ? (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="bg-white/10 rounded-xl p-6 text-lg leading-relaxed italic border border-white/20">
                  "{generatedFeedback}"
                </div>
                <p className="text-xs text-white/40">You can copy this text or send it directly to the student portal.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center space-y-4 text-white/20">
                <Sparkles className="w-16 h-16 opacity-10" />
                <p>Input student details and click generate to see AI magic.</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t border-white/10 pt-6">
            <Button variant="secondary" className="w-full gap-2" disabled={!generatedFeedback}>
              <Send className="w-4 h-4" /> Send to Student Portal
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
