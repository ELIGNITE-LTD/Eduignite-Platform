// Auth hooks
export {
  useLogin,
  useLogout,
  useMe,
  useChangePassword,
  useActivateAccount,
} from './useAuth';

// Users hooks
export {
  useUsers,
  useUser,
  useUserStats,
  useExecutives,
  useFounders,
  useUsersBySchool,
  useCreateUser,
  useCreateFounder,
  useUpdateFounder,
  useAddFounderShares,
  useDeleteFounder,
  useUpdateProfile,
  useUpdateRole,
  useToggleLicense,
} from './useUsers';

// Schools hooks
export {
  useSchools,
  useSchool,
  useMySchool,
  useSchoolStats,
  useSchoolSettings,
  useCreateSchool,
  useUpdateSchool,
  useDeleteSchool,
  useToggleSchoolStatus,
  useUpdateSchoolSettings,
} from './useSchools';

// Platform hooks
export {
  usePlatformSettings,
  usePlatformFees,
  usePublicEvents,
  usePlatformStats,
  useUpdatePlatformSettings,
  useCreatePublicEvent,
  useUpdatePublicEvent,
  useDeletePublicEvent,
} from './usePlatform';

// Students hooks
export {
  useStudents,
  useStudent,
  useHonourRoll,
  useStudentRegistrySummary,
  useMyChildren,
  useClassList,
  useCreateStudent,
  useUpdateStudent,
  useLinkParent,
  useStudentCard,
} from './useStudents';

// Assignments hooks
export {
  useAssignments,
  useAssignment,
  useAssignmentSubmissions,
  useMyAssignmentSubmissions,
  useCreateAssignment,
  useDeleteAssignment,
  useCreateAssignmentSubmission,
  useUpdateAssignmentSubmission,
  useGradeAssignmentSubmission,
} from './useAssignments';

// Grades hooks
export {
  useSubjects,
  useSequences,
  useActiveSequence,
  useGrades,
  useReportCard,
  useClassResults,
  useTermResults,
  useAnnualResults,
  useCreateGrade,
  useBulkCreateGrades,
} from './useGrades';

// Attendance hooks
export {
  useAttendanceSessions,
  useAttendanceRecords,
  useMyAttendance,
  useStudentAttendanceSummary,
  useClassAttendanceReport,
  useAbsentToday,
  useTeacherAttendance,
  useBulkRecordAttendance,
  useCreateAttendanceSession,
  useRecordTeacherAttendance,
} from './useAttendance';

// Fees hooks
export {
  useFeeStructures,
  usePayments,
  useMyPayments,
  useRevenueReport,
  useOutstandingFees,
  useReceipt,
  useCreateFeeStructure,
  useCreatePayment,
  useConfirmPayment,
  useRejectPayment,
} from './useFees';

// Library hooks
export {
  useBookCategories,
  useBooks,
  useBookSearch,
  useLowStockBooks,
  useLoans,
  useMyLoans,
  useOverdueLoans,
  useLibraryStats,
  useCreateBook,
  useUpdateBook,
  useDeleteBook,
  useIssueBook,
  useReturnBook,
} from './useLibrary';

// Announcements hooks
export {
  useAnnouncements,
  useMyAnnouncementFeed,
  usePinnedAnnouncements,
  usePlatformAnnouncements,
  useCreateAnnouncement,
  useMarkAnnouncementRead,
  useDeleteAnnouncement,
} from './useAnnouncements';

// Community hooks
export {
  useTestimonies,
  usePendingTestimonies,
  useCreateTestimony,
  useApproveTestimony,
  useRejectTestimony,
  useBlogs,
  useBlog,
  useCreateBlog,
  usePublishBlog,
  useUpdateBlog,
  useDeleteBlog,
  useBlogComments,
  useCreateBlogComment,
} from './useCommunity';

// Feedback hooks
export {
  useFeedbacks,
  useMyFeedbacks,
  useFeedbackStats,
  useCreateFeedback,
  useResolveFeedback,
  useRespondToFeedback,
} from './useFeedback';

// Orders hooks
export {
  useOrders,
  useOrderStats,
  useCreateOrder,
  useProcessOrder,
} from './useOrders';

// Support hooks
export {
  useSupportContributions,
  useCreateSupport,
  useVerifySupport,
  useRejectSupport,
  useSupportStats,
} from './useSupport';

// Staff remarks hooks
export {
  useStaffRemarks,
  useMyRemarks,
  useCreateRemark,
  useAcknowledgeRemark,
} from './useStaffRemarks';

// Chat hooks
export {
  useConversations,
  useConversation,
  useMessages,
  useGetOrCreateDirect,
  useSendMessage,
  useMarkConversationRead,
  useDeleteMessage,
} from './useChat';

// AI hooks
export {
  useAIRequests,
  useAIInsights,
  useGenerateStudyPlan,
  useAnalyzeGrades,
  useAttendanceInsight,
  useExamPrep,
  useParentReport,
  usePlatformInsights,
  useGenerateInsights,
} from './useAI';

// Live Classes hooks
export {
  useLiveClasses,
  useLiveClass,
  useMyLiveClasses,
  useEnrolledClasses,
  useLiveNow,
  useUpcomingClasses,
  useLiveClassStats,
  useCreateLiveClass,
  useUpdateLiveClass,
  useCancelLiveClass,
  useEnrollInClass,
  useUnenrollFromClass,
  useStartClass,
  useEndClass,
} from './useLiveClasses';

// Exams hooks
export {
  useExams,
  useActiveExams,
  useExam,
  useCreateExam,
  useDeleteExam,
  useExamSubmissions,
  useExamSubmission,
  useMyExamResults,
  useCreateExamSubmission,
} from './useExams';
