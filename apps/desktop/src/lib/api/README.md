# EduIgnite API Client Infrastructure

Complete TypeScript API client for the EduIgnite Next.js frontend, connecting to a Django REST backend.

## Architecture Overview

The API client is structured in layers for maintainability and type safety:

```
src/lib/api/
├── client.ts              # Axios instance + JWT token management
├── types.ts               # Complete TypeScript interfaces
├── endpoints.ts           # All API endpoint constants
├── query-client.ts        # React Query configuration
├── services/              # Typed service modules (17 apps)
│   ├── auth.service.ts
│   ├── users.service.ts
│   ├── schools.service.ts
│   ├── platform.service.ts
│   ├── students.service.ts
│   ├── grades.service.ts
│   ├── attendance.service.ts
│   ├── fees.service.ts
│   ├── library.service.ts
│   ├── announcements.service.ts
│   ├── community.service.ts
│   ├── feedback.service.ts
│   ├── orders.service.ts
│   ├── support.service.ts
│   ├── staff-remarks.service.ts
│   ├── chat.service.ts
│   ├── ai.service.ts
│   └── index.ts
├── index.ts               # Main export barrel
└── README.md
```

## Core Components

### 1. HTTP Client (`client.ts`)

- **Axios Instance**: Configured with base URL from `NEXT_PUBLIC_API_URL`
- **Request Interceptor**: Automatically attaches JWT access token from localStorage
- **Response Interceptor**: Handles 401 responses with automatic token refresh
- **Token Refresh Queue**: Manages concurrent requests during token refresh
- **localStorage Keys**:
  - `eduignite_access_token` - JWT access token (short-lived)
  - `eduignite_refresh_token` - JWT refresh token (long-lived)
  - `eduignite_user` - Cached user profile

**Key Functions:**
```typescript
setTokens(access, refresh)        // Set both tokens
clearTokens()                      // Clear all auth data
getAccessToken()                   // Get current access token
```

### 2. Type Definitions (`types.ts`)

Complete TypeScript interfaces for all backend models:

- **Auth**: `User`, `LoginResponse`, `TokenRefreshResponse`
- **Schools**: `School`, `SchoolSettings`
- **Students**: `Student`
- **Grades**: `Subject`, `Sequence`, `Grade`, `ReportCard`
- **Attendance**: `AttendanceSession`, `AttendanceRecord`, `AttendanceSummary`
- **Fees**: `FeeStructure`, `Payment`, `Invoice`
- **Library**: `Book`, `BookCategory`, `BookLoan`
- **Communications**: `Announcement`, `Message`, `Conversation`
- **Community**: `Testimony`, `CommunityBlog`, `BlogComment`
- **Admin**: `StaffRemark`, `Feedback`, `Order`, `SupportContribution`
- **AI**: `AIRequest`, `AIInsight`
- **Utilities**: `PaginatedResponse`, `ApiError`, `ListParams`

### 3. API Endpoints (`endpoints.ts`)

Organized constants for all 17 Django REST Framework apps:

```typescript
// Usage example
API.AUTH.LOGIN              // '/auth/login/'
API.USERS.BASE              // '/users/'
API.USERS.DETAIL(id)        // '/users/{id}/'
API.GRADES.REPORT_CARD(sid, seqid)  // '/grades/grades/report_card/?...'
```

### 4. React Query Configuration (`query-client.ts`)

Optimized defaults for data fetching:
- Stale time: 5 minutes
- Cache time (gcTime): 30 minutes
- Retry logic: Skip on 401/403/404, otherwise 2 retries
- No automatic refetch on window focus

## Service Modules

Each service exports typed async functions using the apiClient:

### Auth Service
```typescript
import { authService } from '@/lib/api/services';

await authService.login(matricule, password);
await authService.firebaseLogin(idToken);
await authService.getMe();
await authService.changePassword(old, new, confirm);
await authService.logout(refreshToken);
```

### Users Service
```typescript
await usersService.getUsers(params);
await usersService.getMe();
await usersService.updateProfile(data);
await usersService.toggleLicense(id);
await usersService.getUsersBySchool(schoolId);
```

### Schools Service
```typescript
await schoolsService.getSchools(params);
await schoolsService.getMySchool();
await schoolsService.createSchool(data);
await schoolsService.toggleSchoolStatus(id);
await schoolsService.getSchoolSettings(id);
```

### Students Service
```typescript
await studentsService.getStudents(params);
await studentsService.getHonourRoll();
await studentsService.getMyChildren();
await studentsService.linkParent(studentId, parentId, relationship);
```

### Grades Service
```typescript
await gradesService.getSubjects(params);
await gradesService.getGrades(params);
await gradesService.bulkCreateGrades(gradesArray);
await gradesService.getReportCard(studentId, sequenceId);
await gradesService.getClassResults(className, sequenceId);
```

### Attendance Service
```typescript
await attendanceService.createSession(sessionData);
await attendanceService.bulkRecordAttendance(sessionId, records);
await attendanceService.getStudentSummary(studentId);
await attendanceService.getClassReport(className, startDate, endDate);
```

### Fees Service
```typescript
await feesService.getFeeStructures(params);
await feesService.getPayments(params);
await feesService.createPayment(paymentData);
await feesService.confirmPayment(id);
await feesService.getReceipt(id);  // Returns Blob
```

### Library Service
```typescript
await libraryService.getBooks(params);
await libraryService.searchBooks(query);
await libraryService.issueBook(bookId, borrowerId, dueDate);
await libraryService.returnBook(loanId, notes);
await libraryService.getMyLoans();
```

### Announcements Service
```typescript
await announcementsService.getAnnouncements(params);
await announcementsService.getMyAnnouncementFeed();
await announcementsService.createAnnouncement(data);
await announcementsService.markRead(id);
```

### Community Service
```typescript
await communityService.getTestimonies(params);
await communityService.createTestimony(data);
await communityService.approveTestimony(id);
await communityService.getBlogs(params);
await communityService.createBlog(data);
await communityService.publishBlog(id);
```

### Feedback Service
```typescript
await feedbackService.getFeedbacks(params);
await feedbackService.createFeedback(data);
await feedbackService.resolveFeedback(id, note);
```

### Orders Service
```typescript
// No auth required for creation
await ordersService.createOrder(data);
// Admin only
await ordersService.getOrders(params);
await ordersService.processOrder(id);
```

### Support Service
```typescript
await supportService.getSupportContributions(params);
await supportService.createSupport(data);
await supportService.verifySupport(id);
```

### Staff Remarks Service
```typescript
await staffRemarksService.getRemarks(params);
await staffRemarksService.createRemark(data);
await staffRemarksService.acknowledgeRemark(id);
await staffRemarksService.downloadReport(staffId);  // Returns Blob
```

### Chat Service
```typescript
await chatService.getConversations(params);
await chatService.getOrCreateDirect(userId);
await chatService.getMessages(conversationId, params);
await chatService.sendMessage(conversationId, { text, replyTo });
await chatService.markConversationRead(conversationId);
```

### AI Service
```typescript
await aiService.generateStudyPlan(studentId, subjects, weeks);
await aiService.analyzeGrades(studentId, sequenceId);
await aiService.getAttendanceInsight(studentId);
await aiService.getExamPrep(studentId, subjectId);
await aiService.getParentReport(studentId);
await aiService.getPlatformInsights();
```

## Usage Examples

### With React Query (Recommended)

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { gradesService, queryClient } from '@/lib/api';

// Fetching data
const { data: grades, isLoading } = useQuery({
  queryKey: ['grades', studentId],
  queryFn: () => gradesService.getGrades({ student: studentId })
});

// Mutations
const { mutate: createGrade } = useMutation({
  mutationFn: (data) => gradesService.createGrade(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['grades'] });
  }
});
```

### Direct Service Usage

```typescript
import { studentsService } from '@/lib/api';

try {
  const students = await studentsService.getStudents({
    page: 1,
    limit: 20
  });
  console.log(students.results);
} catch (error) {
  console.error('Failed to fetch students:', error);
}
```

### With Error Handling

```typescript
import { AxiosError } from 'axios';
import { authService } from '@/lib/api';

try {
  const response = await authService.login(matricule, password);
  // Handle success
} catch (error) {
  if (error instanceof AxiosError) {
    if (error.response?.status === 401) {
      console.error('Invalid credentials');
    } else if (error.response?.status === 429) {
      console.error('Too many attempts');
    }
  }
}
```

## Environment Configuration

Set in `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

Or use production URL:
```bash
NEXT_PUBLIC_API_URL=https://api.eduignite.com/api/v1
```

## Authentication Flow

1. **Login**: `authService.login()` sets tokens in localStorage
2. **Requests**: Request interceptor automatically adds `Authorization: Bearer {token}` header
3. **Refresh**: On 401, response interceptor:
   - Queues failed requests
   - Calls refresh endpoint
   - Updates access token
   - Retries original request
   - Flushes queue
4. **Logout**: `authService.logout()` clears all auth data

## Error Handling

The apiClient automatically retries on network errors but not on:
- 401 Unauthorized (after refresh attempt)
- 403 Forbidden
- 404 Not Found

Handle errors in components:

```typescript
try {
  const data = await service.method();
} catch (error) {
  if (error.response?.status === 400) {
    // Validation errors in error.response.data.errors
  } else if (error.response?.status === 403) {
    // Permission denied
  }
}
```

## Pagination

All list endpoints return `PaginatedResponse<T>`:

```typescript
interface PaginatedResponse<T> {
  count: number;           // Total items
  next: string | null;     // Next page URL
  previous: string | null; // Previous page URL
  results: T[];            // Current page items
}
```

Usage:
```typescript
const response = await studentsService.getStudents({
  page: 2,
  limit: 50
});
```

## File Uploads

For endpoints accepting file uploads, pass FormData:

```typescript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('name', 'Book Title');

// Then post with apiClient
await apiClient.post('/endpoint', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
```

## Blob Responses

Some endpoints return binary data (receipts, reports):

```typescript
const blob = await feesService.getReceipt(paymentId);
const url = URL.createObjectURL(blob);
// Download or display
```

## Best Practices

1. **Always use TypeScript types** - Import from `@/lib/api`
2. **Use React Query** - For automatic caching and refetching
3. **Check localStorage** - For auth state in useEffect
4. **Handle 401s** - Auto-refresh happens, but plan for redirect to /login
5. **Validate params** - ListParams are optional but validate data before sending
6. **Cache invalidation** - Invalidate relevant queries after mutations
7. **Error messages** - Check `error.response.data.errors` for field-level validation

## Testing

Mock the apiClient in tests:

```typescript
jest.mock('@/lib/api', () => ({
  usersService: {
    getMe: jest.fn().mockResolvedValue({ id: '1', name: 'Test' })
  }
}));
```

## Performance Tips

- Use React Query's `staleTime` to minimize refetches
- Paginate large datasets
- Use `gcTime` to balance memory usage
- Leverage `useInfiniteQuery` for infinite scroll
- Batch mutations when possible with `bulkCreateGrades` style endpoints

## Troubleshooting

**401 errors in console**
- Normal behavior during token refresh
- Check `localStorage.getItem('eduignite_access_token')`

**Requests hanging**
- Check network tab for refresh endpoint response
- Verify `NEXT_PUBLIC_API_URL` is correct

**Token not persisting**
- Verify localStorage is enabled
- Check localStorage keys after login

**CORS errors**
- Ensure backend allows your frontend origin
- Check `Access-Control-Allow-Origin` header
