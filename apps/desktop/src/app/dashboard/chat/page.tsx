"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock3,
  FileText,
  ImageIcon,
  Loader2,
  Lock,
  MessageCircle,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Smile,
  Users,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { chatService } from "@/lib/api/services/chat.service";
import { BASE_URL, getAccessToken } from "@/lib/api/client";
import { resolveMediaUrl } from "@/lib/media";
import { ChatAttachment } from "@/components/chat-attachment";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RelatedChatUser, TeacherGroupClassOption } from "@/lib/api/types";

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const parseDRFError = (err: any): string => {
  if (!err?.response) return err?.message || "Network error. Please check your connection.";
  const status = err.response.status;
  const data = err.response.data;
  if (!data) return `HTTP ${status}`;
  if (typeof data === "string") return `${status}: ${data}`;
  if (data.detail) return `${status}: ${data.detail}`;
  if (typeof data === "object") {
    return `${status}: ${Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join(" | ")}`;
  }
  return `HTTP ${status}`;
};

const getParticipantId = (participant: any) => participant.user_id ?? participant.id;
const getParticipantName = (participant: any) => participant.user_name ?? participant.name;
const getParticipantAvatar = (participant: any) => resolveMediaUrl(participant.user_avatar ?? participant.avatar);

const getMessageSenderId = (message: any) => message.sender_id ?? message.sender?.id;
const getMessageSenderName = (message: any) => message.sender_name ?? message.sender?.name;

const getConversationDisplay = (conversation: any, currentUserId: any) => {
  if (conversation.conversation_type === "direct") {
    const other =
      (conversation.participants || []).find(
        (participant: any) => String(getParticipantId(participant)) !== String(currentUserId)
      ) ?? conversation.participants?.[0];
    return {
      name: other ? getParticipantName(other) : conversation.name || "Unknown",
      avatar: other ? getParticipantAvatar(other) : "",
    };
  }

  return {
    name: conversation.name || "Group Chat",
    avatar: "",
  };
};

const isGroupAdmin = (conversation: any, currentUserId: string | undefined) => {
  if (conversation?.is_current_user_admin) return true;
  if (
    Array.isArray(conversation?.admin_participant_ids) &&
    conversation.admin_participant_ids.map(String).includes(String(currentUserId))
  )
    return true;
  // Fall back to the participant records (present on the detail payload).
  return (conversation?.participants || []).some(
    (p: any) =>
      String(p.user_id ?? p.id) === String(currentUserId) && String(p.role).toLowerCase() === "admin"
  );
};

const SENDER_COLORS = [
  "text-emerald-600",
  "text-sky-600",
  "text-rose-600",
  "text-amber-600",
  "text-violet-600",
  "text-teal-600",
];

const senderColor = (id: any) => {
  const key = String(id ?? "");
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return SENDER_COLORS[hash % SENDER_COLORS.length];
};

const timeOfDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

const listTimestamp = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (dayDiff === 0) return timeOfDay(iso);
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
};

const daySeparatorLabel = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
};

const attachmentName = (url: string) => {
  try {
    const clean = url.split("?")[0];
    return decodeURIComponent(clean.substring(clean.lastIndexOf("/") + 1)) || "Attachment";
  } catch {
    return "Attachment";
  }
};

type ListFilter = "all" | "unread" | "groups" | "teachers";

const LIST_FILTERS: { id: ListFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "groups", label: "Groups" },
  { id: "teachers", label: "Teachers" },
];

export default function ChatPage() {
  const { user } = useAuth();
  const { t, translateText } = useI18n();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messageText, setMessageText] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const typingIdleRef = useRef<any>(null);
  const lastTypingPingRef = useRef<number>(0);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingConvs, setIsLoadingConvs] = useState(true);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  const [convsErrorMsg, setConvsErrorMsg] = useState<string | null>(null);
  const [msgsErrorMsg, setMsgsErrorMsg] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [listSearch, setListSearch] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  const [composerMode, setComposerMode] = useState<"direct" | "group">("direct");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [availableUsers, setAvailableUsers] = useState<RelatedChatUser[]>([]);
  const [teacherGroupOptions, setTeacherGroupOptions] = useState<TeacherGroupClassOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingGroupOptions, setIsLoadingGroupOptions] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState<string | null>(null);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);
  const [newParticipantId, setNewParticipantId] = useState("");

  const [groupForm, setGroupForm] = useState({
    name: "",
    schoolClass: "",
    subject: "",
    onlyAdminsCanSend: false,
    participantIds: [] as string[],
  });

  const isExecutive = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"].includes(user?.role || "");
  const canCreateTeacherGroups = user?.role === "TEACHER";

  const scrollToBottom = () => {
    window.setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 80);
  };

  const loadConversations = useCallback(async () => {
    setConvsErrorMsg(null);
    try {
      const result = await chatService.getConversations();
      setConversations(normalizeList(result));
    } catch (err: any) {
      setConvsErrorMsg(parseDRFError(err));
    } finally {
      setIsLoadingConvs(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, quiet = false) => {
    if (!quiet) setIsLoadingMsgs(true);
    setMsgsErrorMsg(null);
    try {
      const result = await chatService.getMessages(conversationId);
      const loaded = normalizeList(result).reverse();
      setMessages((prev) => {
        const loadedIds = new Set(loaded.map((message: any) => String(message.id)));
        const pending = prev.filter((message: any) => message._pending && !loadedIds.has(String(message.id)));
        return [...loaded, ...pending];
      });
      scrollToBottom();
    } catch (err: any) {
      if (!quiet) setMsgsErrorMsg(parseDRFError(err));
    } finally {
      if (!quiet) setIsLoadingMsgs(false);
    }
  }, []);

  const loadComposerData = useCallback(async () => {
    setIsLoadingUsers(true);
    setIsLoadingGroupOptions(canCreateTeacherGroups);
    try {
      const [relatedUsers, groupOptions] = await Promise.all([
        chatService.getRelatedUsers(),
        canCreateTeacherGroups ? chatService.getTeacherGroupOptions() : Promise.resolve([]),
      ]);
      setAvailableUsers(
        normalizeList(relatedUsers).filter((record: any) => String(record.id) !== String(user?.id))
      );
      setTeacherGroupOptions(normalizeList(groupOptions));
    } catch (err) {
      setAvailableUsers([]);
      setTeacherGroupOptions([]);
    } finally {
      setIsLoadingUsers(false);
      setIsLoadingGroupOptions(false);
    }
  }, [canCreateTeacherGroups, user?.id]);

  useEffect(() => {
    loadConversations();
    loadComposerData();
  }, [loadConversations, loadComposerData]);

  useEffect(() => {
    if (!selectedConv) {
      setMessages([]);
      return;
    }
    loadMessages(String(selectedConv.id));
    chatService
      .markConversationRead(String(selectedConv.id))
      .then(() => loadConversations())
      .catch(() => {});
  }, [selectedConv?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedConv) return;
    const convId = String(selectedConv.id);
    const pollTyping = () => {
      chatService
        .getTyping(convId)
        .then((res) => setTypingUsers((res.typing || []).map((t) => t.user_name).filter(Boolean)))
        .catch(() => {});
    };
    pollTyping();
    const interval = window.setInterval(() => {
      loadMessages(convId, true);
      loadConversations();
      pollTyping();
    }, 5000);
    const typingInterval = window.setInterval(pollTyping, 2500);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(typingInterval);
    };
  }, [selectedConv?.id, loadMessages, loadConversations]);

  // Clear the typing list when switching conversations.
  useEffect(() => {
    setTypingUsers([]);
    setReactionPickerFor(null);
  }, [selectedConv?.id]);

  const pingTyping = useCallback(() => {
    if (!selectedConv) return;
    const convId = String(selectedConv.id);
    const now = Date.now();
    if (now - lastTypingPingRef.current > 3000) {
      lastTypingPingRef.current = now;
      chatService.setTyping(convId, true).catch(() => {});
    }
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    typingIdleRef.current = setTimeout(() => {
      chatService.setTyping(convId, false).catch(() => {});
      lastTypingPingRef.current = 0;
    }, 3500);
  }, [selectedConv]);

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    setReactionPickerFor(null);
    try {
      const updated = await chatService.reactToMessage(messageId, emoji);
      setMessages((prev) => prev.map((m) => (String(m.id) === String(messageId) ? { ...m, reactions: (updated as any).reactions } : m)));
    } catch (err: any) {
      toast({ variant: "destructive", title: "Reaction failed", description: parseDRFError(err) });
    }
  }, [toast]);

  const clearPendingFile = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  };

  const handlePickFile = (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Attachments are limited to 10 MB." });
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  };

  const handleSend = useCallback(async () => {
    if (!selectedConv) return;
    const text = messageText.trim();
    const file = pendingFile;
    if (!text && !file) return;

    const tempId = `tmp_${Date.now()}`;
    setMessageText("");

    const optimisticMessage: any = {
      id: tempId,
      sender_id: user?.id,
      sender_name: user?.name,
      sender_avatar: user?.avatar,
      text: text || (file ? (file.type.startsWith("image/") ? "ðŸ“· Photo" : `ðŸ“„ ${file.name}`) : ""),
      message_type: file ? (file.type.startsWith("image/") ? "image" : "file") : "text",
      created_at: new Date().toISOString(),
      is_official: isExecutive,
      _pending: true,
      _localPreview: file && file.type.startsWith("image/") ? pendingPreview : null,
      _localFileName: file && !file.type.startsWith("image/") ? file.name : null,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setPendingFile(null);
    setPendingPreview(null);
    scrollToBottom();
    setIsSending(true);
    // Stop broadcasting "typing" as soon as the message goes out.
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    lastTypingPingRef.current = 0;
    chatService.setTyping(String(selectedConv.id), false).catch(() => {});

    try {
      const sent = file
        ? await chatService.sendAttachmentMessage(String(selectedConv.id), file, text)
        : await chatService.sendMessage(String(selectedConv.id), {
            text,
            conversation_id: String(selectedConv.id),
          } as any);
      setMessages((prev) => prev.map((message) => (message.id === tempId ? sent : message)));
      loadConversations();
    } catch (err: any) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      setMessageText(text);
      if (file) handlePickFile(file);
      toast({ variant: "destructive", title: "Send failed", description: parseDRFError(err) });
    } finally {
      setIsSending(false);
    }
  }, [messageText, pendingFile, pendingPreview, selectedConv, user, isExecutive, toast, loadConversations]);

  const resetComposerState = () => {
    setUserSearch("");
    setComposerMode("direct");
    setGroupForm({
      name: "",
      schoolClass: "",
      subject: "",
      onlyAdminsCanSend: false,
      participantIds: [],
    });
  };

  const handleOpenNewChat = () => {
    resetComposerState();
    setNewChatOpen(true);
    loadComposerData();
  };

  const handleStartConversation = async (targetUser: RelatedChatUser) => {
    setIsStartingChat(String(targetUser.id));
    try {
      const conversation = await chatService.getOrCreateDirect(String(targetUser.id));
      await loadConversations();
      setSelectedConv(conversation);
      setNewChatOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Could not start conversation", description: parseDRFError(err) });
    } finally {
      setIsStartingChat(null);
    }
  };

  const handleCreateTeacherGroup = async () => {
    if (!groupForm.schoolClass || !groupForm.subject) {
      toast({ variant: "destructive", title: "Missing information", description: "Select a class and subject first." });
      return;
    }

    setIsSavingGroup(true);
    try {
      const conversation = await chatService.createTeacherGroup({
        name: groupForm.name,
        school_class: groupForm.schoolClass,
        subject: groupForm.subject,
        only_admins_can_send: groupForm.onlyAdminsCanSend,
        participant_ids: groupForm.participantIds,
      });
      await loadConversations();
      setSelectedConv(conversation);
      setNewChatOpen(false);
      toast({ title: "Group created", description: "Students in the selected class were added automatically." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Group creation failed", description: parseDRFError(err) });
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleToggleAdminOnly = async () => {
    if (!selectedConv) return;
    setIsUpdatingGroup(true);
    try {
      const updated = await chatService.updateConversationSettings(String(selectedConv.id), {
        only_admins_can_send: !selectedConv.only_admins_can_send,
      } as any);
      setSelectedConv(updated);
      await loadConversations();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: parseDRFError(err) });
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!selectedConv) return;
    setIsUpdatingGroup(true);
    try {
      await chatService.removeParticipant(String(selectedConv.id), userId);
      const updated = await chatService.getConversation(String(selectedConv.id));
      setSelectedConv(updated);
      await loadConversations();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Removal failed", description: parseDRFError(err) });
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleAddParticipant = async () => {
    if (!selectedConv || !newParticipantId) return;
    setIsUpdatingGroup(true);
    try {
      await chatService.addParticipant(String(selectedConv.id), newParticipantId);
      const updated = await chatService.getConversation(String(selectedConv.id));
      setSelectedConv(updated);
      setNewParticipantId("");
      await loadConversations();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Add participant failed", description: parseDRFError(err) });
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleSetRole = async (userId: string, role: "admin" | "member") => {
    if (!selectedConv) return;
    setIsUpdatingGroup(true);
    try {
      await chatService.setParticipantRole(String(selectedConv.id), userId, role);
      const updated = await chatService.getConversation(String(selectedConv.id));
      setSelectedConv(updated);
      await loadConversations();
      toast({ title: role === "admin" ? "Admin added" : "Admin dismissed", description: role === "admin" ? "This member can now manage the group." : "This member is no longer an admin." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Role update failed", description: parseDRFError(err) });
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const filteredUsers = availableUsers.filter((record: any) => {
    const query = userSearch.toLowerCase();
    return (
      !query ||
      (record.name || "").toLowerCase().includes(query) ||
      (record.email || "").toLowerCase().includes(query) ||
      (record.role || "").toLowerCase().includes(query) ||
      (record.relationship_labels || []).some((label: string) => label.toLowerCase().includes(query))
    );
  });

  const roleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of availableUsers) map.set(String(record.id), String(record.role || ""));
    return map;
  }, [availableUsers]);

  const visibleConversations = useMemo(() => {
    const query = listSearch.trim().toLowerCase();
    return conversations.filter((conversation: any) => {
      if (listFilter === "unread" && !(conversation.unread_count > 0)) return false;
      if (listFilter === "groups" && conversation.conversation_type === "direct") return false;
      if (listFilter === "teachers") {
        if (conversation.conversation_type !== "direct") return false;
        const other = (conversation.participants || []).find(
          (participant: any) => String(getParticipantId(participant)) !== String(user?.id)
        );
        if (!other || roleById.get(String(getParticipantId(other))) !== "TEACHER") return false;
      }
      if (!query) return true;
      const display = getConversationDisplay(conversation, user?.id);
      return (
        display.name.toLowerCase().includes(query) ||
        (conversation.last_message || "").toLowerCase().includes(query)
      );
    });
  }, [conversations, listFilter, listSearch, user?.id, roleById]);

  // A sent message is "seen" once another participant's last_read_at passes
  // its timestamp (WhatsApp-style double blue tick).
  const otherLastReadAt = useMemo(() => {
    const times = ((selectedConv?.participants) || [])
      .filter((p: any) => String(getParticipantId(p)) !== String(user?.id))
      .map((p: any) => (p.last_read_at ? new Date(p.last_read_at).getTime() : 0));
    return times.length ? Math.max(...times) : 0;
  }, [selectedConv, user?.id]);
  const messageSeen = (message: any) =>
    !message._pending && otherLastReadAt > 0 &&
    new Date(message.created_at || 0).getTime() <= otherLastReadAt;

  const currentConversationDisplay = selectedConv ? getConversationDisplay(selectedConv, user?.id) : null;
  const selectedClassOption = teacherGroupOptions.find((item) => item.id === groupForm.schoolClass);
  const groupCandidateUsers = filteredUsers.filter((record) => record.role !== "STUDENT");
  const participantIds = new Set((selectedConv?.participants || []).map((participant: any) => String(getParticipantId(participant))));
  const addableParticipants = availableUsers.filter((record) => !participantIds.has(String(record.id)));
  const currentUserIsGroupAdmin = selectedConv ? isGroupAdmin(selectedConv, user?.id) : false;
  const sendLocked = Boolean(selectedConv?.only_admins_can_send && !currentUserIsGroupAdmin);
  const threadSubtitle = selectedConv
    ? selectedConv.conversation_type === "direct"
      ? "Direct message"
      : `${(selectedConv.participants || []).length} participants${selectedConv.school_class_name ? ` â€¢ ${selectedConv.school_class_name}` : ""}`
    : "";

  return (
    <div className="flex h-[calc(100vh-130px)] flex-col gap-3">
      <div className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-primary">
            {isExecutive ? "Board Chat" : "Messages"}
          </h1>
          <p className="text-[13px] font-medium text-muted-foreground">
            Stay connected and never miss a thing.
          </p>
        </div>
        <Button
          onClick={handleOpenNewChat}
          className="gap-2 rounded-full bg-primary px-5 text-white shadow-lg"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        {/* ------------------------------------------------ list pane */}
        <div
          className={cn(
            "flex w-full flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/[0.04] md:w-96 md:shrink-0",
            selectedConv && "hidden md:flex"
          )}
        >
          <div className="shrink-0 space-y-2.5 border-b border-border/60 p-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search or start a new chat"
                className="h-10 rounded-2xl border-none bg-accent/40 pl-10"
                value={listSearch}
                onChange={(event) => setListSearch(event.target.value)}
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {LIST_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setListFilter(filter.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all",
                    listFilter === filter.id
                      ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                      : "bg-accent/40 text-muted-foreground"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1">
            {isLoadingConvs && (
              <div className="flex justify-center py-14">
                <Loader2 className="h-6 w-6 animate-spin text-primary/30" />
              </div>
            )}
            {convsErrorMsg && !isLoadingConvs && (
              <div className="space-y-3 p-6 text-center">
                <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
                <p className="text-xs font-bold text-destructive">{translateText("Failed to load conversations")}</p>
                <Button size="sm" variant="outline" onClick={loadConversations} className="gap-2">
                  <RefreshCw className="h-3 w-3" /> Retry
                </Button>
              </div>
            )}
            {!isLoadingConvs && !convsErrorMsg && visibleConversations.length === 0 && (
              <div className="space-y-2 py-12 text-center">
                <MessageCircle className="mx-auto h-9 w-9 text-primary/20" />
                <p className="text-sm font-semibold text-muted-foreground">
                  {listFilter === "all" ? t("noConversations") : "Nothing here yet"}
                </p>
              </div>
            )}

            <div className="space-y-0.5 p-2">
              {visibleConversations.map((conversation: any) => {
                const display = getConversationDisplay(conversation, user?.id);
                const unread = Number(conversation.unread_count || 0);
                const isGroup = conversation.conversation_type !== "direct";
                const isActive = String(selectedConv?.id) === String(conversation.id);
                return (
                  <button
                    key={conversation.id}
                    onClick={() => setSelectedConv(conversation)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                      isActive ? "bg-primary/10" : "hover:bg-accent/40"
                    )}
                  >
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={display.avatar || ""} />
                      <AvatarFallback
                        className={cn(
                          "font-black",
                          isGroup ? "bg-primary/10 text-primary" : "bg-secondary/30 text-primary"
                        )}
                      >
                        {isGroup ? <Users className="h-5 w-5" /> : display.name?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-[14px] leading-tight", unread > 0 ? "font-black" : "font-bold")}>
                          {display.name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px] font-semibold",
                            unread > 0 ? "text-primary" : "text-muted-foreground"
                          )}
                        >
                          {listTimestamp(conversation.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-[12.5px]",
                            unread > 0 ? "font-semibold text-foreground/80" : "text-muted-foreground"
                          )}
                        >
                          {conversation.last_message
                            ? translateText(conversation.last_message)
                            : isGroup
                              ? conversation.subject_name || "Group"
                              : translateText("No messages yet")}
                        </p>
                        {unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-black text-white">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* ------------------------------------------------ thread pane */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-[#ece7f6] shadow-sm ring-1 ring-black/[0.04]",
            !selectedConv && "hidden md:flex"
          )}
        >
          {selectedConv ? (
            <>
              {/* header */}
              <div className="flex shrink-0 items-center gap-2 bg-primary px-3 py-2.5 text-white shadow-md">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-white hover:bg-white/10 md:hidden"
                  onClick={() => setSelectedConv(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={currentConversationDisplay?.avatar || ""} />
                  <AvatarFallback className="bg-white/20 font-black text-white">
                    {selectedConv.conversation_type !== "direct" ? (
                      <Users className="h-4 w-4" />
                    ) : (
                      currentConversationDisplay?.name?.charAt(0) || "?"
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-black leading-tight">{currentConversationDisplay?.name}</p>
                  <p className="truncate text-[11px] text-white/70">
                    {selectedConv.only_admins_can_send ? "Admin-only â€¢ " : ""}
                    {threadSubtitle}
                  </p>
                </div>
                {selectedConv.conversation_type === "group" && currentUserIsGroupAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-white hover:bg-white/10"
                    onClick={() => {
                      setGroupSettingsOpen(true);
                      loadComposerData();
                    }}
                  >
                    <Settings2 className="h-5 w-5" />
                  </Button>
                )}
              </div>

              {/* messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
                {isLoadingMsgs && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                  </div>
                )}
                {msgsErrorMsg && !isLoadingMsgs && (
                  <div className="mx-auto max-w-sm space-y-3 rounded-2xl bg-white p-4 text-center shadow-sm">
                    <AlertCircle className="mx-auto h-6 w-6 text-destructive/50" />
                    <p className="text-xs font-bold text-destructive">{translateText("Failed to load messages")}</p>
                    <Button size="sm" variant="outline" onClick={() => loadMessages(String(selectedConv.id))} className="gap-2">
                      <RefreshCw className="h-3 w-3" /> Retry
                    </Button>
                  </div>
                )}

                <div className="mx-auto max-w-3xl space-y-1">
                  {messages.map((message: any, index: number) => {
                    const isOwn = String(getMessageSenderId(message)) === String(user?.id);
                    const senderName = getMessageSenderName(message);
                    const senderId = getMessageSenderId(message);
                    const isGroup = selectedConv.conversation_type !== "direct";
                    const previous = messages[index - 1];
                    const showDaySeparator =
                      !previous ||
                      new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                    const showSender =
                      isGroup && !isOwn && (!previous || String(getMessageSenderId(previous)) !== String(senderId) || showDaySeparator);
                    const hasRemoteAttachment = Boolean(message.has_attachment || message.attachment_data || message.attachment);
                    const attachmentUrl =
                      message._localPreview ||
                      (hasRemoteAttachment && !message._pending
                        ? `${BASE_URL}/chat/messages/${message.id}/attachment-file/?jwt=${getAccessToken() || ""}`
                        : "");
                    const isImage = message.message_type === "image" && attachmentUrl;
                    const isFile = message.message_type === "file" && (attachmentUrl || message._localFileName);
                    const captionIsAuto = (((message.text || "").codePointAt(0)) || 0) > 0xffff;
                    const isTeacherMsg = String(message.sender_role) === "TEACHER";
                    const showSenderHeader = showSender || (isGroup && !isOwn && isTeacherMsg);

                    return (
                      <div key={message.id}>
                        {showDaySeparator && message.created_at && (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-lg bg-white/80 px-3 py-1 text-[11px] font-bold text-muted-foreground shadow-sm">
                              {daySeparatorLabel(message.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={cn("group flex flex-col", isOwn ? "items-end" : "items-start")}>
                          <div className={cn("flex items-center gap-1", isOwn ? "flex-row-reverse" : "flex-row")}>
                          <div
                            className={cn(
                              "relative max-w-[78%] rounded-2xl px-3 py-2 shadow-sm",
                              isOwn ? "rounded-br-md bg-primary text-white" : "rounded-bl-md bg-white text-foreground",
                              !isOwn && isTeacherMsg && "border-l-4 border-secondary bg-secondary/[0.06]",
                              message.is_official && !isOwn && "ring-1 ring-secondary/60",
                              message._pending && "opacity-70"
                            )}
                          >
                            {showSenderHeader && (
                              <p className={cn("mb-0.5 flex items-center gap-1.5 text-[12px] font-black leading-none", isTeacherMsg ? "text-secondary" : senderColor(senderId))}>
                                {senderName}
                                {isTeacherMsg && (
                                  <span className="rounded-full bg-secondary/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-secondary">
                                    Teacher
                                  </span>
                                )}
                              </p>
                            )}

                            {(isImage || isFile) ? (
                              <ChatAttachment
                                messageId={String(message.id)}
                                isImage={Boolean(isImage)}
                                isOwn={isOwn}
                                localPreview={message._localPreview}
                                localFileName={message._localFileName}
                                remoteName={message.attachment_name}
                              />
                            ) : null}

                            {message.text && !((isImage || isFile) && captionIsAuto) ? (
                              <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.45]">
                                {translateText(message.text)}
                              </p>
                            ) : null}

                            <span
                              className={cn(
                                "mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none",
                                isOwn ? "text-white/70" : "text-muted-foreground"
                              )}
                            >
                              {timeOfDay(message.created_at)}
                              {isOwn &&
                                (message._pending ? <Clock3 className="h-3 w-3" /> : messageSeen(message) ? <CheckCheck className="h-3.5 w-3.5 text-sky-300" /> : <Check className="h-3 w-3" />)}
                            </span>
                          </div>
                          {!message._pending && !message.is_deleted && (
                            <div className="relative">
                              <button
                                type="button"
                                aria-label="React"
                                onClick={() => setReactionPickerFor((prev) => (prev === String(message.id) ? null : String(message.id)))}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                              >
                                <Smile className="h-4 w-4" />
                              </button>
                              {reactionPickerFor === String(message.id) && (
                                <div className={cn("absolute z-20 -top-10 flex gap-1 rounded-full border bg-white px-2 py-1 shadow-lg", isOwn ? "right-0" : "left-0")}>
                                  {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => handleReact(String(message.id), emoji)}
                                      className="text-lg transition-transform hover:scale-125"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          </div>
                          {Array.isArray(message.reactions) && message.reactions.length > 0 && (
                            <div className={cn("mt-0.5 flex flex-wrap gap-1", isOwn ? "justify-end" : "justify-start")}>
                              {message.reactions.map((reaction: any) => (
                                <button
                                  key={reaction.emoji}
                                  type="button"
                                  onClick={() => handleReact(String(message.id), reaction.emoji)}
                                  className={cn(
                                    "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors",
                                    reaction.reacted ? "border-primary/40 bg-primary/10 text-primary" : "border-accent bg-white text-muted-foreground"
                                  )}
                                >
                                  <span>{reaction.emoji}</span>
                                  <span className="font-bold">{reaction.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* composer */}
              <div className="shrink-0 px-3 pb-3 pt-1">
                {typingUsers.length > 0 && (
                  <div className="mx-auto mb-1.5 flex max-w-3xl items-center gap-2 px-2 text-[11px] font-medium text-muted-foreground">
                    <span className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50" />
                    </span>
                    {typingUsers.length === 1
                      ? `${typingUsers[0]} is typing…`
                      : `${typingUsers.slice(0, 2).join(", ")}${typingUsers.length > 2 ? " and others" : ""} are typing…`}
                  </div>
                )}
                {pendingFile && (
                  <div className="mx-auto mb-1.5 flex max-w-3xl items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm">
                    {pendingPreview ? (
                      <img src={pendingPreview} alt="Preview" className="h-12 w-12 rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold">{pendingFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(pendingFile.size / 1024 / 1024).toFixed(2)} MB â€¢ ready to send
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={clearPendingFile}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                <div className="mx-auto flex max-w-3xl items-end gap-1.5">
                  <div className="flex min-h-11 flex-1 items-center gap-0.5 rounded-full bg-white px-1.5 shadow-sm">
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        handlePickFile(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    <input
                      ref={docInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      onChange={(event) => {
                        handlePickFile(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
                      disabled={sendLocked || isSending}
                      onClick={() => docInputRef.current?.click()}
                      aria-label="Attach document"
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <Input
                      value={messageText}
                      onChange={(event) => { setMessageText(event.target.value); pingTyping(); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={sendLocked ? "Only admins can send messages" : "Type a message..."}
                      className="h-10 flex-1 border-none bg-transparent px-1 text-[14.5px] shadow-none focus-visible:ring-0"
                      disabled={isSending || sendLocked}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
                      disabled={sendLocked || isSending}
                      onClick={() => imageInputRef.current?.click()}
                      aria-label="Attach photo"
                    >
                      <ImageIcon className="h-5 w-5" />
                    </Button>
                  </div>
                  <Button
                    onClick={handleSend}
                    disabled={(!messageText.trim() && !pendingFile) || isSending || sendLocked}
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-full bg-primary text-white shadow-lg"
                    aria-label="Send"
                  >
                    {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </Button>
                </div>

                {sendLocked && (
                  <p className="mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground">
                    <Lock className="h-3 w-3" /> Only group admins can post here.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="rounded-full bg-white p-6 shadow-sm">
                <MessageCircle className="h-12 w-12 text-primary/20" />
              </div>
              <div>
                <h3 className="font-black text-primary">Select a Conversation</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a conversation on the left, or start a new one.
                </p>
              </div>
              <Button onClick={handleOpenNewChat} className="gap-2 rounded-xl" variant="outline">
                <Plus className="h-4 w-4" /> New Chat
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------ new chat dialog */}
      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-2xl rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black text-primary uppercase tracking-tight">
              <Users className="w-5 h-5 text-secondary" />
              Start a Conversation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Chat is scoped to the people connected to your school role, classes, and academic relationships.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={composerMode === "direct" ? "default" : "outline"}
              className="rounded-xl"
              onClick={() => setComposerMode("direct")}
            >
              Direct Chat
            </Button>
            {canCreateTeacherGroups && (
              <Button
                type="button"
                variant={composerMode === "group" ? "default" : "outline"}
                className="rounded-xl"
                onClick={() => setComposerMode("group")}
              >
                Teacher Group
              </Button>
            )}
          </div>

          {composerMode === "direct" ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search related users..."
                  className="pl-9 bg-accent/30 border-none rounded-xl text-sm h-10"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                />
              </div>
              <ScrollArea className="h-72">
                {isLoadingUsers && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
                  </div>
                )}
                {!isLoadingUsers && filteredUsers.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {userSearch ? "No related users match your search." : "No related users are available yet."}
                  </div>
                )}
                <div className="space-y-1 pr-2">
                  {filteredUsers.map((record: any) => (
                    <button
                      key={record.id}
                      onClick={() => handleStartConversation(record)}
                      disabled={isStartingChat === String(record.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent/50 transition-all text-left group"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={resolveMediaUrl(record.avatar) || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                          {(record.name || "?").charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <p className="font-bold text-sm text-primary truncate">{record.name || "Unknown"}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-[8px] h-3.5 py-0 font-black uppercase bg-secondary/20 text-primary border-none">
                            {record.role}
                          </Badge>
                          {(record.relationship_labels || []).slice(0, 2).map((label: string) => (
                            <Badge key={label} variant="outline" className="text-[8px] h-3.5 py-0 font-black uppercase">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {isStartingChat === String(record.id) ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary/40 shrink-0" />
                      ) : (
                        <MessageCircle className="w-4 h-4 text-primary/20 group-hover:text-primary/60 transition-colors shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="space-y-4">
              {isLoadingGroupOptions ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
                </div>
              ) : teacherGroupOptions.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No class-subject assignments were found for your account yet.
                </div>
              ) : (
                <>
                  <Input
                    value={groupForm.name}
                    onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Optional group name"
                    className="bg-accent/30 border-none rounded-xl text-sm h-10"
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Select
                      value={groupForm.schoolClass}
                      onValueChange={(value) =>
                        setGroupForm((prev) => ({ ...prev, schoolClass: value, subject: "" }))
                      }
                    >
                      <SelectTrigger className="rounded-xl h-10">
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {teacherGroupOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name} ({option.student_count} students)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={groupForm.subject}
                      onValueChange={(value) => setGroupForm((prev) => ({ ...prev, subject: value }))}
                      disabled={!selectedClassOption}
                    >
                      <SelectTrigger className="rounded-xl h-10">
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedClassOption?.subjects || []).map((subject) => (
                          <SelectItem key={subject.id} value={subject.id}>
                            {subject.name} ({subject.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-2xl bg-accent/20 p-4 text-xs text-muted-foreground">
                    Students in the selected class are added automatically. You can also include extra related users below and later update the group settings.
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Extra participants
                    </p>
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                      {groupCandidateUsers.map((record) => {
                        const isSelected = groupForm.participantIds.includes(String(record.id));
                        return (
                          <button
                            key={record.id}
                            type="button"
                            className={cn(
                              "w-full flex items-center justify-between rounded-xl border px-3 py-2 text-left",
                              isSelected ? "border-primary bg-primary/5" : "border-transparent bg-accent/20"
                            )}
                            onClick={() =>
                              setGroupForm((prev) => ({
                                ...prev,
                                participantIds: isSelected
                                  ? prev.participantIds.filter((id) => id !== String(record.id))
                                  : [...prev.participantIds, String(record.id)],
                              }))
                            }
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={resolveMediaUrl(record.avatar) || ""} />
                                <AvatarFallback>{record.name?.charAt(0) || "?"}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-bold text-primary">{record.name}</p>
                                <p className="text-[10px] uppercase text-muted-foreground">{record.role}</p>
                              </div>
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left text-sm",
                      groupForm.onlyAdminsCanSend ? "border-primary bg-primary/5" : "border-accent bg-white"
                    )}
                    onClick={() =>
                      setGroupForm((prev) => ({
                        ...prev,
                        onlyAdminsCanSend: !prev.onlyAdminsCanSend,
                      }))
                    }
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-primary">Only admins can send messages</p>
                        <p className="text-xs text-muted-foreground">Teachers can switch this later in group settings.</p>
                      </div>
                      <Badge className={groupForm.onlyAdminsCanSend ? "bg-primary" : "bg-muted text-foreground"}>
                        {groupForm.onlyAdminsCanSend ? "On" : "Off"}
                      </Badge>
                    </div>
                  </button>
                </>
              )}
            </div>
          )}

          {composerMode === "group" && (
            <DialogFooter>
              <Button
                onClick={handleCreateTeacherGroup}
                disabled={isSavingGroup || !groupForm.schoolClass || !groupForm.subject}
                className="gap-2 rounded-xl"
              >
                {isSavingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Create Group
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------- group settings dialog */}
      <Dialog open={groupSettingsOpen} onOpenChange={setGroupSettingsOpen}>
        <DialogContent className="max-w-xl rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary font-black uppercase">
              <Settings2 className="w-5 h-5 text-secondary" />
              Group Settings
            </DialogTitle>
            <DialogDescription>Update conversation controls and manage group members.</DialogDescription>
          </DialogHeader>
          {selectedConv && (
            <div className="space-y-4">
              <button
                type="button"
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left text-sm",
                  selectedConv.only_admins_can_send ? "border-primary bg-primary/5" : "border-accent bg-white"
                )}
                onClick={handleToggleAdminOnly}
                disabled={isUpdatingGroup}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Lock className="w-4 h-4 mt-1 text-primary/60" />
                    <div>
                      <p className="font-bold text-primary">Only admins can send messages</p>
                      <p className="text-xs text-muted-foreground">Restrict posting to the group admin team only.</p>
                    </div>
                  </div>
                  {isUpdatingGroup ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Badge className={selectedConv.only_admins_can_send ? "bg-primary" : "bg-muted text-foreground"}>
                      {selectedConv.only_admins_can_send ? "Enabled" : "Disabled"}
                    </Badge>
                  )}
                </div>
              </button>

              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Members</p>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {(selectedConv.participants || []).map((participant: any) => {
                    const participantId = String(getParticipantId(participant));
                    const participantIsAdmin = String(participant.role).toLowerCase() === "admin";
                    return (
                      <div key={participantId} className="flex items-center justify-between rounded-xl border bg-accent/10 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={getParticipantAvatar(participant) || ""} />
                            <AvatarFallback>{getParticipantName(participant)?.charAt(0) || "?"}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-bold text-primary">{getParticipantName(participant)}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[8px] uppercase">
                                {participant.role}
                              </Badge>
                              {participantId === String(user?.id) && (
                                <span className="text-[10px] text-muted-foreground">You</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {currentUserIsGroupAdmin && participantId !== String(user?.id) && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 rounded-xl"
                              onClick={() => handleSetRole(participantId, participantIsAdmin ? "member" : "admin")}
                              disabled={isUpdatingGroup}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {participantIsAdmin ? "Dismiss admin" : "Make admin"}
                            </Button>
                            {!participantIsAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 rounded-xl"
                                onClick={() => handleRemoveParticipant(participantId)}
                                disabled={isUpdatingGroup}
                              >
                                <UserX className="w-3.5 h-3.5" />
                                Remove
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Add related participant</p>
                <div className="flex gap-2">
                  <Select value={newParticipantId} onValueChange={setNewParticipantId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {addableParticipants.map((record) => (
                        <SelectItem key={record.id} value={String(record.id)}>
                          {record.name} ({record.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAddParticipant}
                    disabled={!newParticipantId || isUpdatingGroup}
                    className="gap-2 rounded-xl"
                  >
                    {isUpdatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
