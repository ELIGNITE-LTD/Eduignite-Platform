# API Client Quick Reference

## Import Everything

```typescript
import {
  apiClient,
  queryClient,
  API,
  // All services
  authService,
  usersService,
  schoolsService,
  platformService,
  studentsService,
  gradesService,
  attendanceService,
  feesService,
  libraryService,
  announcementsService,
  communityService,
  feedbackService,
  ordersService,
  supportService,
  staffRemarksService,
  chatService,
  aiService,
  // Types
  type User,
  type Student,
  type Grade,
  type Payment,
  type Announcement,
  // ... all other types
} from '@/lib/api';
```

## Service Quick Links

### Auth
```typescript
authService.login(matricule, password)
authService.firebaseLogin(idToken)
authService.getMe()
authService.changePassword(old, new, confirm)
authService.requestPasswordReset(email)
authService.confirmPasswordReset(token, newPassword)
authService.activateAccount(matricule, newPassword, confirmPassword)
authService.logout(refreshToken)
authService.refreshToken(refresh)
```

### Users
```typescript
usersService.getUsers(params?)
usersService.getUser(id)
usersService.getMe()
usersService.updateProfile(data)
usersService.updateRole(id, role)
usersService.toggleLicense(id)
usersService.getStats()
usersService.getExecutives(params?)
usersService.getUsersBySchool(schoolId, params?)
usersService.createUser(data)
usersService.deleteUser(id)
```

### Schools
```typescript
schoolsService.getSchools(params?)
schoolsService.getSchool(id)
schoolsService.getMySchool()
schoolsService.createSchool(data)
schoolsService.updateSchool(id, data)
schoolsService.deleteSchool(id)
schoolsService.toggleSchoolStatus(id)
schoolsService.getSchoolStats()
schoolsService.getSchoolSettings(id)
schoolsService.updateSchoolSettings(id, settings)
```

### Platform
```typescript
platformService.getPlatformSettings()
platformService.updatePlatformSettings(data)
platformService.getPlatformFees(params?)
platformService.updateFee(id, data)
platformService.getPublicEvents(params?)
platformService.createEvent(data)
platformService.deleteEvent(id)
platformService.getPlatformStats()
platformService.getTutorials()
```

### Students
```typescript
studentsService.getStudents(params?)
studentsService.getStudent(id)
studentsService.createStudent(data)
studentsService.updateStudent(id, data)
studentsService.getHonourRoll(params?)
studentsService.getMyChildren(params?)
studentsService.getClassList(className)
studentsService.linkParent(studentId, parentId, relationship)
studentsService.getStudentCard(id)
```

### Grades
```typescript
gradesService.getSubjects(params?)
gradesService.createSubject(data)
gradesService.updateSubject(id, data)
gradesService.deleteSubject(id)
gradesService.getSequences(params?)
gradesService.createSequence(data)
gradesService.updateSequence(id, data)
gradesService.getGrades(params?)
gradesService.createGrade(data)
gradesService.updateGrade(id, data)
gradesService.bulkCreateGrades(gradesArray)
gradesService.getReportCard(studentId, sequenceId)
gradesService.getClassResults(className, sequenceId)
gradesService.getTermResults(params?)
gradesService.getAnnualResults(params?)
```

### Attendance
```typescript
attendanceService.getAttendanceSessions(params?)
attendanceService.createSession(data)
attendanceService.updateSession(id, data)
attendanceService.getAttendanceRecords(params?)
attendanceService.createAttendanceRecord(data)
attendanceService.updateAttendanceRecord(id, data)
attendanceService.bulkRecordAttendance(sessionId, records)
attendanceService.getMyAttendance(params?)
attendanceService.getStudentSummary(studentId)
attendanceService.getClassReport(className, startDate?, endDate?)
attendanceService.getAbsentToday()
attendanceService.getTeacherAttendance(params?)
attendanceService.recordTeacherAttendance(data)
```

### Fees
```typescript
feesService.getFeeStructures(params?)
feesService.createFeeStructure(data)
feesService.updateFeeStructure(id, data)
feesService.deleteFeeStructure(id)
feesService.getPayments(params?)
feesService.getMyPayments(params?)
feesService.createPayment(data)
feesService.confirmPayment(id)
feesService.rejectPayment(id, reason?)
feesService.getRevenueReport(params?)
feesService.getOutstandingFees(params?)
feesService.getReceipt(id)  // Returns Blob
feesService.getInvoices(params?)
feesService.getInvoice(id)
```

### Library
```typescript
libraryService.getCategories(params?)
libraryService.createCategory(data)
libraryService.updateCategory(id, data)
libraryService.deleteCategory(id)
libraryService.getBooks(params?)
libraryService.getBook(id)
libraryService.searchBooks(query, params?)
libraryService.getLowStockBooks(params?)
libraryService.createBook(data)
libraryService.updateBook(id, data)
libraryService.deleteBook(id)
libraryService.getLoans(params?)
libraryService.getLoan(id)
libraryService.issueBook(bookId, borrowerId, dueDate)
libraryService.returnBook(loanId, notes?)
libraryService.getMyLoans(params?)
libraryService.getOverdueLoans(params?)
libraryService.getLibraryStats()
```

### Announcements
```typescript
announcementsService.getAnnouncements(params?)
announcementsService.getAnnouncement(id)
announcementsService.getMyAnnouncementFeed(params?)
announcementsService.getPinnedAnnouncements(params?)
announcementsService.createAnnouncement(data)
announcementsService.updateAnnouncement(id, data)
announcementsService.markRead(id)
announcementsService.deleteAnnouncement(id)
announcementsService.getPlatformWideAnnouncements(params?)
```

### Community
```typescript
communityService.getTestimonies(params?)
communityService.getTestimony(id)
communityService.getPendingTestimonies(params?)
communityService.createTestimony(data)
communityService.approveTestimony(id)
communityService.rejectTestimony(id, reason?)
communityService.getBlogs(params?)
communityService.getBlog(idOrSlug)
communityService.createBlog(data)
communityService.updateBlog(id, data)
communityService.publishBlog(id)
communityService.viewBlog(id)
communityService.deleteBlog(id)
communityService.getComments(blogId, params?)
communityService.getComment(id)
communityService.createComment(blogId, content)
communityService.deleteComment(id)
```

### Feedback
```typescript
feedbackService.getFeedbacks(params?)
feedbackService.getFeedback(id)
feedbackService.getMyFeedbacks(params?)
feedbackService.createFeedback(data)
feedbackService.updateFeedback(id, data)
feedbackService.resolveFeedback(id, note)
feedbackService.respondToFeedback(id, message)
feedbackService.getFeedbackStats()
```

### Orders
```typescript
ordersService.getOrders(params?)
ordersService.getOrder(id)
ordersService.createOrder(data)  // Public, no auth required
ordersService.processOrder(id)
ordersService.updateOrder(id, data)
ordersService.getOrderStats()
```

### Support
```typescript
supportService.getSupportContributions(params?)
supportService.getSupportContribution(id)
supportService.createSupport(data)
supportService.verifySupport(id)
supportService.rejectSupport(id, reason?)
supportService.getSupportStats()
```

### Staff Remarks
```typescript
staffRemarksService.getRemarks(params?)
staffRemarksService.getRemark(id)
staffRemarksService.getMyRemarks(params?)
staffRemarksService.createRemark(data)
staffRemarksService.updateRemark(id, data)
staffRemarksService.acknowledgeRemark(id)
staffRemarksService.downloadReport(staffId)  // Returns Blob
```

### Chat
```typescript
chatService.getConversations(params?)
chatService.getConversation(id)
chatService.getOrCreateDirect(userId)
chatService.getMessages(conversationId, params?)
chatService.sendMessage(conversationId, { text, replyTo? })
chatService.markConversationRead(conversationId)
chatService.deleteMessage(conversationId, messageId)
```

### AI
```typescript
aiService.getAIRequests(params?)
aiService.getAIRequest(id)
aiService.generateStudyPlan(studentId, subjects, weeks)
aiService.analyzeGrades(studentId, sequenceId)
aiService.getAttendanceInsight(studentId)
aiService.getExamPrep(studentId, subjectId)
aiService.getParentReport(studentId)
aiService.getPlatformInsights()
aiService.getInsights(params?)
aiService.getInsight(id)
aiService.generateInsights()
```

## Common Patterns

### React Query Hook Pattern
```typescript
import { useQuery } from '@tanstack/react-query';
import { gradesService } from '@/lib/api';

export function useStudentGrades(studentId: string) {
  return useQuery({
    queryKey: ['grades', studentId],
    queryFn: () => gradesService.getGrades({ student: studentId })
  });
}
```

### Mutation Pattern
```typescript
import { useMutation } from '@tanstack/react-query';
import { gradesService, queryClient } from '@/lib/api';

export function useCreateGrade() {
  return useMutation({
    mutationFn: gradesService.createGrade,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grades'] });
    }
  });
}
```

### Error Handling
```typescript
try {
  const user = await usersService.getUser(id);
  return user;
} catch (error) {
  if (error?.response?.status === 404) {
    console.error('User not found');
  } else if (error?.response?.data?.errors) {
    console.error('Validation errors:', error.response.data.errors);
  }
  throw error;
}
```

## Environment Setup

`.env.local`:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## File Structure
```
src/lib/api/
├── client.ts                           (100 lines)
├── types.ts                            (300+ lines)
├── endpoints.ts                        (180 lines)
├── query-client.ts                     (20 lines)
├── index.ts                            (80 lines)
├── services/
│   ├── auth.service.ts                 (50 lines)
│   ├── users.service.ts                (50 lines)
│   ├── schools.service.ts              (60 lines)
│   ├── platform.service.ts             (50 lines)
│   ├── students.service.ts             (50 lines)
│   ├── grades.service.ts               (80 lines)
│   ├── attendance.service.ts           (80 lines)
│   ├── fees.service.ts                 (80 lines)
│   ├── library.service.ts              (100 lines)
│   ├── announcements.service.ts        (50 lines)
│   ├── community.service.ts            (70 lines)
│   ├── feedback.service.ts             (50 lines)
│   ├── orders.service.ts               (40 lines)
│   ├── support.service.ts              (40 lines)
│   ├── staff-remarks.service.ts        (40 lines)
│   ├── chat.service.ts                 (50 lines)
│   ├── ai.service.ts                   (50 lines)
│   └── index.ts                        (20 lines)
├── README.md                           (Full documentation)
└── QUICK_REFERENCE.md                  (This file)

Total: 2,138 lines of TypeScript code
```

## Key Features

- **Type-Safe**: Full TypeScript interfaces for all endpoints
- **JWT Auto-Refresh**: Automatic token refresh on 401
- **Request Queuing**: Failed requests queued during refresh
- **React Query Ready**: Optimized configuration included
- **Error Handling**: Automatic retry logic
- **Pagination**: Built-in pagination support
- **Blob Support**: Receipt and report downloads
- **SSR Safe**: Client-side only auth checks
- **Modular**: 17 service modules (1 per Django app)
- **Documented**: Comprehensive README and examples

## Next Steps

1. Install dependencies: `npm install axios @tanstack/react-query`
2. Set `NEXT_PUBLIC_API_URL` in `.env.local`
3. Create custom hooks wrapping services with React Query
4. Add error boundary/toast notifications for errors
5. Implement auth state persistence with Zustand or Jotai
