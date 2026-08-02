/**
 * Automated Workflows & Notification System
 * Handles school processes automation, notifications, and event triggers
 */

export type WorkflowType =
  | "admission"
  | "fee-reminder"
  | "academic-alert"
  | "attendance-alert"
  | "parent-teacher-conference"
  | "grade-release"
  | "end-of-term";

export type NotificationChannel = "email" | "sms" | "push" | "in-app";

export interface WorkflowTrigger {
  id: string;
  type: WorkflowType;
  condition: string; // e.g., "gpa < 2.0", "attendance < 80%"
  enabled: boolean;
  createdAt: Date;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  variables: string[]; // e.g., ["studentName", "gpa", "classLevel"]
  language: "en" | "fr";
}

export interface Notification {
  id: string;
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  status: "pending" | "sent" | "failed" | "read";
  sentAt?: Date;
  readAt?: Date;
  retries: number;
  errorMessage?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowType: WorkflowType;
  triggeredAt: Date;
  completedAt?: Date;
  status: "pending" | "running" | "completed" | "failed";
  affectedUsers: string[];
  notificationsSent: number;
  errorMessage?: string;
}

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    id: "academic-alert-low-gpa",
    name: "Low GPA Alert",
    channel: "email",
    subject: "Academic Performance Alert - {studentName}",
    body: `Dear {parentName},

Your child {studentName} (Matricule: {matricule}) in {classLevel} has a current GPA of {gpa}/4.0, which is below the satisfactory level of 2.5.

We recommend scheduling a meeting with the class teacher to discuss academic support options.

Best regards,
{schoolName}`,
    variables: ["studentName", "parentName", "matricule", "classLevel", "gpa", "schoolName"],
    language: "en",
  },
  {
    id: "fee-reminder-overdue",
    name: "Overdue Fee Payment Reminder",
    channel: "sms",
    body: "Dear {parentName}, your child {studentName} has an outstanding fee balance of {amount} XAF. Please settle by {dueDate}. Contact {schoolPhone}",
    variables: ["parentName", "studentName", "amount", "dueDate", "schoolPhone"],
    language: "en",
  },
  {
    id: "attendance-alert-low",
    name: "Low Attendance Alert",
    channel: "push",
    subject: "Attendance Alert - {studentName}",
    body: `{studentName}'s attendance is {attendancePercentage}%. Current target is 90%. Please ensure regular attendance.`,
    variables: ["studentName", "attendancePercentage"],
    language: "en",
  },
  {
    id: "grade-release-notification",
    name: "Grade Release Notification",
    channel: "in-app",
    subject: "Your Grades for {term} are Now Available",
    body: `Dear {studentName}, your academic results for {term} {academicYear} have been released. Your GPA is {gpa}/4.0. View your full transcript in your portal.`,
    variables: ["studentName", "term", "academicYear", "gpa"],
    language: "en",
  },
  {
    id: "parent-teacher-conference-invite",
    name: "Parent-Teacher Conference Invitation",
    channel: "email",
    subject: "Parent-Teacher Conference Invitation - {studentName}",
    body: `Dear {parentName},

You are cordially invited to a parent-teacher conference for {studentName}.

Date: {conferenceDate}
Time: {conferenceTime}
Location: {schoolName}
Teacher: {teacherName}

Please confirm your attendance by {confirmationDeadline}.

Best regards,
{schoolName}`,
    variables: ["parentName", "studentName", "conferenceDate", "conferenceTime", "schoolName", "teacherName", "confirmationDeadline"],
    language: "en",
  },
];

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

export const WORKFLOW_DEFINITIONS: Record<WorkflowType, any> = {
  admission: {
    name: "Student Admission Workflow",
    steps: [
      "Application received",
      "Application review",
      "Admission decision",
      "Enrollment",
      "ID card generation",
    ],
    notifications: ["admission-confirmation"],
  },
  "fee-reminder": {
    name: "Fee Payment Reminder Workflow",
    trigger: "Monthly on the 1st",
    steps: [
      "Identify students with pending fees",
      "Send first reminder",
      "Send second reminder (after 7 days)",
      "Send final notice (after 14 days)",
    ],
    notifications: ["fee-reminder-overdue"],
  },
  "academic-alert": {
    name: "Academic Alert Workflow",
    trigger: "After grade entry",
    steps: [
      "Calculate GPA",
      "Identify at-risk students (GPA < 2.5)",
      "Send alerts to parents",
      "Flag for academic support",
    ],
    notifications: ["academic-alert-low-gpa"],
  },
  "attendance-alert": {
    name: "Attendance Alert Workflow",
    trigger: "Daily at 4:00 PM",
    steps: [
      "Calculate daily attendance",
      "Identify low attendance (< 80%)",
      "Send alerts to parents",
      "Generate attendance report",
    ],
    notifications: ["attendance-alert-low"],
  },
  "parent-teacher-conference": {
    name: "Parent-Teacher Conference Workflow",
    trigger: "Manual or scheduled",
    steps: [
      "Schedule conference",
      "Send invitations",
      "Track confirmations",
      "Generate discussion notes",
    ],
    notifications: ["parent-teacher-conference-invite"],
  },
  "grade-release": {
    name: "Grade Release Workflow",
    trigger: "End of term",
    steps: [
      "Finalize all grades",
      "Calculate GPA and rankings",
      "Generate transcripts",
      "Notify students and parents",
    ],
    notifications: ["grade-release-notification"],
  },
  "end-of-term": {
    name: "End of Term Workflow",
    trigger: "Last day of term",
    steps: [
      "Close grading",
      "Generate report cards",
      "Calculate promotions",
      "Archive academic records",
      "Send end-of-term reports",
    ],
    notifications: ["grade-release-notification"],
  },
};

// ============================================================================
// WORKFLOW EXECUTION ENGINE
// ============================================================================

export class WorkflowEngine {
  private static instance: WorkflowEngine;
  private executions: Map<string, WorkflowExecution> = new Map();
  private triggers: Map<WorkflowType, WorkflowTrigger> = new Map();

  private constructor() {}

  public static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine();
    }
    return WorkflowEngine.instance;
  }

  /**
   * Register a workflow trigger
   */
  registerTrigger(trigger: WorkflowTrigger): void {
    this.triggers.set(trigger.type, trigger);
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowType: WorkflowType,
    context: any
  ): Promise<WorkflowExecution> {
    const executionId = `EXEC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const execution: WorkflowExecution = {
      id: executionId,
      workflowType,
      triggeredAt: new Date(),
      status: "running",
      affectedUsers: [],
      notificationsSent: 0,
    };

    try {
      // Execute workflow steps
      const definition = WORKFLOW_DEFINITIONS[workflowType];
      if (!definition) {
        throw new Error(`Workflow type "${workflowType}" not found`);
      }

      // Simulate workflow execution
      console.log(`Executing workflow: ${definition.name}`);

      // Send notifications
      const notificationsSent = await this.sendNotifications(workflowType, context);

      execution.status = "completed";
      execution.completedAt = new Date();
      execution.notificationsSent = notificationsSent;
      execution.affectedUsers = context.affectedUsers || [];
    } catch (error) {
      execution.status = "failed";
      execution.completedAt = new Date();
      execution.errorMessage = error instanceof Error ? error.message : "Unknown error";
    }

    this.executions.set(executionId, execution);
    return execution;
  }

  /**
   * Send notifications for a workflow
   */
  private async sendNotifications(workflowType: WorkflowType, context: any): Promise<number> {
    const definition = WORKFLOW_DEFINITIONS[workflowType];
    const templateIds = definition.notifications || [];

    let notificationsSent = 0;

    for (const templateId of templateIds) {
      const template = NOTIFICATION_TEMPLATES.find(t => t.id === templateId);
      if (!template) continue;

      // Create and send notifications
      const recipients = context.recipients || [];
      for (const recipient of recipients) {
        await this.sendNotification(template, recipient, context);
        notificationsSent++;
      }
    }

    return notificationsSent;
  }

  /**
   * Send a single notification
   */
  private async sendNotification(
    template: NotificationTemplate,
    recipient: any,
    context: any
  ): Promise<Notification> {
    const notification: Notification = {
      id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      recipientId: recipient.id,
      recipientEmail: recipient.email,
      recipientPhone: recipient.phone,
      channel: template.channel,
      subject: this.interpolateTemplate(template.subject || "", context),
      body: this.interpolateTemplate(template.body, context),
      status: "pending",
      retries: 0,
    };

    try {
      // Send notification based on channel
      switch (template.channel) {
        case "email":
          await this.sendEmailNotification(notification);
          break;
        case "sms":
          await this.sendSMSNotification(notification);
          break;
        case "push":
          await this.sendPushNotification(notification);
          break;
        case "in-app":
          await this.sendInAppNotification(notification);
          break;
      }

      notification.status = "sent";
      notification.sentAt = new Date();
    } catch (error) {
      notification.status = "failed";
      notification.errorMessage = error instanceof Error ? error.message : "Unknown error";
      notification.retries++;
    }

    return notification;
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: Notification): Promise<void> {
    console.log(`Sending email to ${notification.recipientEmail}`);
    console.log(`Subject: ${notification.subject}`);
    console.log(`Body: ${notification.body}`);
    // In production, use email service (SendGrid, AWS SES, etc.)
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(notification: Notification): Promise<void> {
    console.log(`Sending SMS to ${notification.recipientPhone}`);
    console.log(`Message: ${notification.body}`);
    // In production, use SMS service (Twilio, AWS SNS, etc.)
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(notification: Notification): Promise<void> {
    console.log(`Sending push notification to ${notification.recipientId}`);
    console.log(`Message: ${notification.body}`);
    // In production, use push service (Firebase Cloud Messaging, etc.)
  }

  /**
   * Send in-app notification
   */
  private async sendInAppNotification(notification: Notification): Promise<void> {
    console.log(`Sending in-app notification to ${notification.recipientId}`);
    console.log(`Message: ${notification.body}`);
    // In production, store in database and display in app
  }

  /**
   * Interpolate template variables
   */
  private interpolateTemplate(template: string, context: any): string {
    let result = template;
    for (const [key, value] of Object.entries(context)) {
      result = result.replace(new RegExp(`{${key}}`, "g"), String(value));
    }
    return result;
  }

  /**
   * Get workflow execution status
   */
  getExecutionStatus(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all executions
   */
  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }
};

// ============================================================================
// SCHEDULED WORKFLOW TRIGGERS
// ============================================================================

export interface ScheduledWorkflow {
  id: string;
  workflowType: WorkflowType;
  schedule: string; // Cron expression
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export const SCHEDULED_WORKFLOWS: ScheduledWorkflow[] = [
  {
    id: "sched-fee-reminder",
    workflowType: "fee-reminder",
    schedule: "0 0 1 * *", // 1st of every month
    enabled: true,
  },
  {
    id: "sched-attendance-alert",
    workflowType: "attendance-alert",
    schedule: "0 16 * * 1-5", // 4 PM on weekdays
    enabled: true,
  },
  {
    id: "sched-academic-alert",
    workflowType: "academic-alert",
    schedule: "0 18 * * *", // 6 PM daily
    enabled: true,
  },
];

// ============================================================================
// EXPORT WORKFLOW SYSTEM
// ============================================================================

export const workflowEngine = WorkflowEngine.getInstance();

export default {
  NOTIFICATION_TEMPLATES,
  WORKFLOW_DEFINITIONS,
  SCHEDULED_WORKFLOWS,
  WorkflowEngine,
  workflowEngine,
};
